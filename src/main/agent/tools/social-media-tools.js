/**
 * Social Media Controller Tools
 *
 * Browser-based social media automation using active sessions.
 * Uses AppleScript + CDP (Chrome DevTools Protocol) to interact with
 * social media web interfaces in the user's existing browser.
 *
 * Currently supported: TikTok
 * Planned: Instagram, Twitter/X, LinkedIn, Facebook
 *
 * Architecture:
 *  - Reads/writes via JavaScript injection into browser tabs
 *  - Activity logging to {userData}/social-activity.json
 *  - Business context profiles in {userData}/social-context.json
 *  - AI content generation via callLLM (context-aware)
 */

'use strict';

const { exec }      = require('child_process');
const { promisify } = require('util');
const fsp           = require('fs/promises');
const fsSync        = require('fs');
const os            = require('os');
const path          = require('path');

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _userDataPath = null;
let _callLLM      = null;

function initSocialMedia(userDataPath, callLLMFn) {
  _userDataPath = userDataPath;
  _callLLM      = callLLMFn;
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

function contextFilePath() {
  return path.join(_userDataPath || os.tmpdir(), 'social-context.json');
}
function activityFilePath() {
  return path.join(_userDataPath || os.tmpdir(), 'social-activity.json');
}

// ---------------------------------------------------------------------------
// Context persistence
// ---------------------------------------------------------------------------

function readContext() {
  try {
    return JSON.parse(fsSync.readFileSync(contextFilePath(), 'utf-8'));
  } catch {
    return null;
  }
}

function writeContext(ctx) {
  const fp = contextFilePath();
  fsSync.mkdirSync(path.dirname(fp), { recursive: true });
  fsSync.writeFileSync(fp, JSON.stringify(ctx, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

function readActivityLog() {
  try {
    return JSON.parse(fsSync.readFileSync(activityFilePath(), 'utf-8'));
  } catch {
    return [];
  }
}

function appendActivity(entry) {
  const log = readActivityLog();
  log.push({
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  // Keep last 1000 entries
  const trimmed = log.slice(-1000);
  const fp = activityFilePath();
  fsSync.mkdirSync(path.dirname(fp), { recursive: true });
  fsSync.writeFileSync(fp, JSON.stringify(trimmed, null, 2), 'utf-8');
  return trimmed[trimmed.length - 1];
}

// ---------------------------------------------------------------------------
// Browser helpers (mirrored from browser-tabs.js patterns)
// ---------------------------------------------------------------------------

const BROWSER_APP_NAMES = {
  chrome: 'Google Chrome', safari: 'Safari', brave: 'Brave Browser',
  edge: 'Microsoft Edge', arc: 'Arc', opera: 'Opera',
};
const CHROME_LIKE = new Set(['chrome', 'brave', 'edge', 'arc', 'opera']);

async function runAppleScript(script, timeoutMs = 15000) {
  const tmp = path.join(os.tmpdir(), `od_social_${Date.now()}_${Math.random().toString(36).slice(2)}.applescript`);
  await fsp.writeFile(tmp, script, 'utf-8');
  try {
    const { stdout } = await execAsync(`osascript "${tmp}"`, { timeout: timeoutMs });
    return stdout.trim();
  } finally {
    await fsp.unlink(tmp).catch(() => {});
  }
}

function resolveBrowser(browser) {
  const b = (browser || 'chrome').toLowerCase().replace(/\s+/g, '');
  const appName = BROWSER_APP_NAMES[b] || browser;
  return { key: b, appName };
}

/**
 * Execute JavaScript in a browser tab via AppleScript.
 * Chrome: "execute tab T of window W javascript ..."
 * Safari: "do JavaScript ... in tab T of window W"
 */
async function execJS(browser, windowIndex, tabIndex, code, timeoutMs = 20000) {
  const { key, appName } = resolveBrowser(browser);
  // Wrap code so it always returns a string
  const wrapped = `(function(){try{var _r=(function(){${code}})();return typeof _r==='object'&&_r!==null?JSON.stringify(_r,null,2):String(_r===undefined?'':_r);}catch(e){return 'JS_ERROR: '+e.message;}})()`;
  const jsStr = JSON.stringify(wrapped);

  let script;
  if (key === 'safari') {
    script = `tell application "Safari"\n  do JavaScript ${jsStr} in tab ${tabIndex} of window ${windowIndex}\nend tell`;
  } else if (CHROME_LIKE.has(key)) {
    script = `tell application "${appName}"\n  execute tab ${tabIndex} of window ${windowIndex} javascript ${jsStr}\nend tell`;
  } else {
    throw new Error(`Unsupported browser: ${browser}. Use chrome, safari, brave, edge, or arc.`);
  }
  const result = await runAppleScript(script, timeoutMs);
  if (result.startsWith('JS_ERROR: ')) throw new Error(result.slice(10));
  return result;
}

/**
 * Find a tab matching a URL pattern. Returns { windowIndex, tabIndex, url, title } or null.
 */
async function findTab(browser, urlPattern) {
  const { key, appName } = resolveBrowser(browser);
  const nl = '(ASCII character 10)';

  let script;
  if (key === 'safari') {
    script = `tell application "Safari"
  set out to ""
  set wIdx to 1
  repeat with w in windows
    set tIdx to 1
    repeat with t in tabs of w
      set out to out & (wIdx as text) & "|" & (tIdx as text) & "|" & (URL of t) & "|" & (name of t) & ${nl}
      set tIdx to tIdx + 1
    end repeat
    set wIdx to wIdx + 1
  end repeat
  return out
end tell`;
  } else if (CHROME_LIKE.has(key)) {
    script = `tell application "${appName}"
  set out to ""
  set wIdx to 1
  repeat with w in windows
    set tIdx to 1
    repeat with i from 1 to count of tabs of w
      set t to tab i of w
      set out to out & (wIdx as text) & "|" & (i as text) & "|" & (URL of t) & "|" & (title of t) & ${nl}
    end repeat
    set wIdx to wIdx + 1
  end repeat
  return out
end tell`;
  } else {
    return null;
  }

  const raw = await runAppleScript(script, 10000);
  const pattern = urlPattern.toLowerCase();
  const matches = [];
  for (const line of raw.split('\n')) {
    const parts = line.split('|');
    if (parts.length >= 3 && parts[2].toLowerCase().includes(pattern)) {
      matches.push({
        windowIndex: parseInt(parts[0], 10),
        tabIndex:    parseInt(parts[1], 10),
        url:         parts[2],
        title:       parts.slice(3).join('|'),
      });
    }
  }
  if (matches.length === 0) return null;
  // Prefer the active tab if it matches, otherwise return last match (most recently opened)
  try {
    const activeIdx = await runAppleScript(
      key === 'safari'
        ? `tell application "Safari" to return (index of current tab of front window) as text`
        : `tell application "${appName}" to return (active tab index of front window) as text`,
      3000
    );
    const activeMatch = matches.find(m => m.windowIndex === 1 && m.tabIndex === parseInt(activeIdx, 10));
    if (activeMatch) return activeMatch;
  } catch {}
  return matches[matches.length - 1];
}

/**
 * Navigate to a URL in a new tab or existing tab.
 */
async function navigateTo(browser, url) {
  const { key, appName } = resolveBrowser(browser);
  let script;
  if (key === 'safari') {
    script = `tell application "Safari"
  activate
  tell front window
    set current tab to (make new tab with properties {URL:"${url}"})
  end tell
end tell`;
  } else if (CHROME_LIKE.has(key)) {
    script = `tell application "${appName}"
  activate
  tell front window
    make new tab with properties {URL:"${url}"}
  end tell
end tell`;
  } else {
    throw new Error(`Unsupported browser: ${browser}`);
  }
  await runAppleScript(script, 10000);
}

// ---------------------------------------------------------------------------
// Platform config — selectors, URLs, JS snippets
// ---------------------------------------------------------------------------

const PLATFORMS = {
  tiktok: {
    name: 'TikTok',
    baseUrl: 'https://www.tiktok.com',
    urlPattern: 'tiktok.com',
    pages: {
      feed:          'https://www.tiktok.com/foryou',
      following:     'https://www.tiktok.com/following',
      profile:       (u) => `https://www.tiktok.com/@${u.replace(/^@/, '')}`,
      upload:        'https://www.tiktok.com/creator-center/upload',
      notifications: 'https://www.tiktok.com/notifications',
      video:         (user, id) => `https://www.tiktok.com/@${user}/video/${id}`,
    },
    js: {
      readFeed: `
        /* Logged-in fullscreen layout: read the CURRENT video + peek at feed items */
        var authorEl = document.querySelector('a[data-e2e="video-author-avatar"]');
        if (!authorEl) {
          /* Fallback: find user links but skip nav/profile sidebar links */
          var allUserLinks = document.querySelectorAll('a[href*="/@"]');
          for (var a = 0; a < allUserLinks.length; a++) {
            var parent = allUserLinks[a].closest('nav, header, [class*="SideNav"], [class*="BottomNav"]');
            if (!parent && allUserLinks[a].textContent.trim().length > 0) { authorEl = allUserLinks[a]; break; }
          }
        }
        var descEl = document.querySelector('[data-e2e="video-desc"], [data-e2e="browse-video-desc"]');
        var likeEl = document.querySelector('strong[data-e2e="like-count"]');
        var commentEl = document.querySelector('strong[data-e2e="comment-count"]');
        var shareEl = document.querySelector('strong[data-e2e="share-count"]');
        var followBtn = document.querySelector('[data-e2e="feed-follow"]');
        var authorHref = authorEl ? (authorEl.href || '') : '';
        var authorName = authorHref ? authorHref.split('/@')[1] || '' : '';
        /* Also check for grid/browse layout (not-logged-in or explore) */
        var items = document.querySelectorAll('[data-e2e="recommend-list-item-container"]');
        var gridResults = [];
        for (var i = 0; i < Math.min(items.length, 10); i++) {
          var el = items[i];
          var gAuthorEl = el.querySelector('a[data-e2e="video-author-avatar"], a[href*="/@"]');
          var gHref = gAuthorEl ? (gAuthorEl.href || '') : '';
          var gAuthor = gHref ? gHref.split('/@')[1] || '' : '';
          var gDesc = el.querySelector('[data-e2e="video-desc"]');
          var gStats = el.querySelectorAll('strong[data-e2e="like-count"], strong[data-e2e="comment-count"], strong[data-e2e="share-count"]');
          gridResults.push({ index: i, author: gAuthor || (gAuthorEl ? gAuthorEl.textContent.trim() : ''), description: gDesc ? gDesc.textContent.trim().slice(0, 200) : '', stats: Array.from(gStats).map(function(s){return s.textContent.trim();}) });
        }
        var currentVideo = {
          index: 0,
          author: authorName || (authorEl ? authorEl.textContent.trim() : ''),
          description: descEl ? descEl.textContent.trim().slice(0, 300) : '',
          likes: likeEl ? likeEl.textContent.trim() : '',
          comments: commentEl ? commentEl.textContent.trim() : '',
          shares: shareEl ? shareEl.textContent.trim() : '',
          canFollow: !!followBtn,
        };
        if (gridResults.length > 2) return gridResults;
        return [currentVideo];
      `,
      readPost: `
        /* Works for both fullscreen (logged-in) and browse layouts */
        var desc = document.querySelector('[data-e2e="video-desc"], [data-e2e="browse-video-desc"]');
        var authorEl = document.querySelector('a[data-e2e="video-author-avatar"], [data-e2e="browse-user-uniqueid"], [data-e2e="video-author-uniqueid"]');
        var authorHref = authorEl ? (authorEl.href || '') : '';
        var authorName = authorHref ? authorHref.split('/@')[1] || '' : (authorEl ? authorEl.textContent.trim() : '');
        var nickname = document.querySelector('[data-e2e="browse-user-nickname"]');
        var likes = document.querySelector('strong[data-e2e="like-count"], [data-e2e="like-count"]');
        var comments = document.querySelector('strong[data-e2e="comment-count"], [data-e2e="comment-count"]');
        var shares = document.querySelector('strong[data-e2e="share-count"], [data-e2e="share-count"]');
        var commentItems = document.querySelectorAll('[data-e2e="comment-list-item"], [class*="DivCommentItemContainer"], [class*="CommentItem"]');
        var commentList = [];
        for (var i = 0; i < Math.min(commentItems.length, 20); i++) {
          var c = commentItems[i];
          var cAuthor = c.querySelector('[data-e2e="comment-username-1"], a[href*="/@"]');
          var cText = c.querySelector('[data-e2e="comment-level-1"], [class*="PCommentText"], p');
          var cLikes = c.querySelector('[data-e2e="comment-like-count"], [class*="SpanCount"]');
          commentList.push({
            index: i,
            author: cAuthor ? cAuthor.textContent.trim() : '',
            text: cText ? cText.textContent.trim() : '',
            likes: cLikes ? cLikes.textContent.trim() : '0',
          });
        }
        return {
          author: authorName,
          nickname: nickname ? nickname.textContent.trim() : '',
          description: desc ? desc.textContent.trim() : '',
          likes: likes ? likes.textContent.trim() : '',
          commentCount: comments ? comments.textContent.trim() : '',
          shares: shares ? shares.textContent.trim() : '',
          comments: commentList,
          url: window.location.href,
        };
      `,
      readProfile: `
        var username = document.querySelector('h1[data-e2e="user-title"], h1, [data-e2e="user-title"]');
        var nickname = document.querySelector('h2[data-e2e="user-subtitle"], [data-e2e="user-subtitle"]');
        var bio = document.querySelector('h2[data-e2e="user-bio"], [data-e2e="user-bio"]');
        var following = document.querySelector('strong[data-e2e="following-count"], [data-e2e="following-count"]');
        var followers = document.querySelector('strong[data-e2e="followers-count"], [data-e2e="followers-count"]');
        var likesCount = document.querySelector('strong[data-e2e="likes-count"], [data-e2e="likes-count"]');
        var avatar = document.querySelector('[data-e2e="user-avatar"] img, [class*="ImgAvatar"]');
        return {
          username: username ? username.textContent.trim() : '',
          nickname: nickname ? nickname.textContent.trim() : '',
          bio: bio ? bio.textContent.trim() : '',
          following: following ? following.textContent.trim() : '',
          followers: followers ? followers.textContent.trim() : '',
          likes: likesCount ? likesCount.textContent.trim() : '',
          avatar: avatar ? avatar.src : '',
          url: window.location.href,
        };
      `,
      readNotifications: `
        var items = document.querySelectorAll('[class*="DivNotificationItem"], [class*="notification-item"], [class*="NotificationContainer"] > div');
        var results = [];
        for (var i = 0; i < Math.min(items.length, 20); i++) {
          var el = items[i];
          results.push({
            index: i,
            text: el.textContent.trim().slice(0, 200),
          });
        }
        return { count: results.length, notifications: results };
      `,
      scroll: `
        window.scrollBy(0, window.innerHeight * 2);
        return 'Scrolled down ' + (window.innerHeight * 2) + 'px. New scroll position: ' + window.scrollY;
      `,
      like: `
        var btn = document.querySelector('[data-e2e="like-icon"], [data-e2e="browse-like-icon"], [class*="ButtonActionItem"]:first-child');
        if (!btn) return 'Like button not found — make sure a video is visible on screen.';
        btn.click();
        return 'Liked the current video.';
      `,
      follow: `
        var btn = document.querySelector('[data-e2e="follow-button"], button[class*="FollowButton"], [class*="ButtonFollow"]');
        if (!btn) return 'Follow button not found — navigate to a user profile or video page first.';
        if (btn.textContent.toLowerCase().includes('following')) return 'Already following this user.';
        btn.click();
        return 'Follow button clicked for the current profile/video author.';
      `,
      clickCommentBox: `
        /* Fullscreen layout: comment panel may already be open; click icon if not */
        var input = document.querySelector('.public-DraftEditor-content[contenteditable="true"], [data-e2e="comment-input"] [contenteditable], div[contenteditable="true"][role="textbox"]');
        if (input) { input.focus(); return 'COMMENT_INPUT_READY'; }
        /* Click the comment icon to open the panel */
        var commentIcon = document.querySelector('[data-e2e="comment-icon"], [data-e2e="browse-comment-icon"]');
        if (commentIcon) {
          commentIcon.click();
          /* Also click the placeholder text area if visible */
          var placeholder = document.querySelector('[data-e2e="comment-input"], [data-e2e="comment-text"]');
          if (placeholder) placeholder.click();
          return 'COMMENT_PANEL_OPENING';
        }
        return 'COMMENT_INPUT_NOT_FOUND';
      `,
      typeComment: (text) => `
        var input = document.querySelector('.public-DraftEditor-content[contenteditable="true"], div[contenteditable="true"][role="textbox"]');
        if (!input) return 'Comment input not found.';
        input.focus();
        /* Clear existing text */
        input.innerHTML = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        /* Use execCommand for DraftJS compatibility */
        document.execCommand('insertText', false, ${JSON.stringify(text)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 'Typed comment text.';
      `,
      submitComment: `
        var postBtn = document.querySelector('[data-e2e="comment-post"], button[class*="ButtonPost"]');
        if (postBtn) {
          /* Wait a tick for DraftJS state to sync */
          setTimeout(function(){ postBtn.click(); }, 100);
          return 'Comment posted.';
        }
        /* Fallback: Enter key */
        var input = document.querySelector('.public-DraftEditor-content[contenteditable="true"], div[contenteditable="true"][role="textbox"]');
        if (input) {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          return 'Submitted comment via Enter key.';
        }
        return 'Post button not found.';
      `,
    },
  },

  instagram: {
    name: 'Instagram',
    baseUrl: 'https://www.instagram.com',
    urlPattern: 'instagram.com',
    pages: {
      feed:     'https://www.instagram.com/',
      profile:  (u) => `https://www.instagram.com/${u.replace(/^@/, '')}/`,
      explore:  'https://www.instagram.com/explore/',
      reels:    'https://www.instagram.com/reels/',
      notifications: 'https://www.instagram.com/',
    },
    js: {
      readFeed: `
        var articles = document.querySelectorAll('article');
        var results = [];
        for (var i = 0; i < Math.min(articles.length, 10); i++) {
          var el = articles[i];
          /* Author: first link matching /@username */
          var allLinks = el.querySelectorAll('a[href]');
          var author = '';
          for (var j = 0; j < allLinks.length; j++) {
            var m = allLinks[j].href.match(/instagram\\.com\\/([^/]+)\\/?$/);
            if (m && !['p','reel','explore','reels','stories','direct'].includes(m[1])) { author = m[1]; break; }
          }
          /* Caption: longest span with real text */
          var spans = el.querySelectorAll('span');
          var caption = '';
          for (var k = 0; k < spans.length; k++) {
            var t = spans[k].textContent.trim();
            if (t.length > caption.length && t.length > 10 && t.length < 1000 && !t.match(/^(Like|Comment|Share|Save|Repost|Follow)/)) caption = t;
          }
          /* Stats from section text */
          var section = el.querySelector('section');
          var sectionText = section ? section.textContent.trim() : '';
          var likeMatch = sectionText.match(/(Like|Unlike)(\\d[\\d,.KMB]*)/);
          var commentMatch = sectionText.match(/Comment(\\d[\\d,.KMB]*)/);
          /* Post link */
          var postLink = el.querySelector('a[href*="/p/"], a[href*="/reel/"]');
          /* Time */
          var timeEl = el.querySelector('time');
          results.push({
            index: i,
            author: author,
            description: caption.slice(0, 200),
            link: postLink ? postLink.href : '',
            likes: likeMatch ? likeMatch[2] : '',
            comments: commentMatch ? commentMatch[1] : '',
            time: timeEl ? timeEl.getAttribute('datetime') : '',
          });
        }
        return results;
      `,
      readPost: `
        /* Works on both feed (article) and post page (no article) */
        var root = document.querySelector('article') || document.querySelector('main');
        if (!root) return { error: 'No content found.' };
        /* Author */
        var allLinks = root.querySelectorAll('a[href]');
        var author = '';
        for (var j = 0; j < allLinks.length; j++) {
          var m = allLinks[j].href.match(/instagram\\.com\\/([^/]+)\\/?$/);
          if (m && !['p','reel','explore','reels','stories','direct','accounts'].includes(m[1])) { author = m[1]; break; }
        }
        /* Caption + comments: parse span[dir="auto"] sequence */
        var spans = root.querySelectorAll('span[dir="auto"]');
        var caption = '';
        var commentList = [];
        var navItems = new Set(['Home','Reels','Messages','Search','Explore','Notifications','Create','Profile','More','Also from Meta','Threads','Meta Verified','Meta AI']);
        var seenUsers = {};
        var pendingUser = '';
        for (var k = 0; k < spans.length; k++) {
          var t = spans[k].textContent.trim();
          if (!t || t.length < 2 || navItems.has(t)) continue;
          if (t === 'Verified' || t.match(/^(Reply|View all|Log in|Sign up)$/)) continue;
          if (t.match(/^\\d+[wdhms]$/)) continue; /* timestamps like 1w, 3d, 2h */
          if (t.match(/^\\d+ likes?$/)) continue;
          /* First long text containing the caption (often prefixed with "usernameVerified 1w...") */
          if (!caption && t.length > 30) {
            caption = t.replace(/^[a-zA-Z0-9_.]+Verified\\s*\\d+[wdhms]\\s*/, '');
            continue;
          }
          /* Username pattern: short alphanumeric with dots/underscores */
          if (t.match(/^[a-zA-Z0-9_.]{2,30}$/) && t !== author) {
            /* Instagram shows usernames twice (display + link) — skip duplicates */
            if (seenUsers[t]) { seenUsers[t]++; continue; }
            seenUsers[t] = 1;
            pendingUser = t;
            continue;
          }
          /* Text after a pending username = comment text */
          if (pendingUser && t.length > 1 && !t.match(/^[a-zA-Z0-9_.]{2,30}$/)) {
            commentList.push({ index: commentList.length, author: pendingUser, text: t.slice(0, 200) });
            pendingUser = '';
            seenUsers = {};
          }
        }
        /* Like state */
        var likeSvg = root.querySelector('svg[aria-label="Like"], svg[aria-label="Unlike"]');
        var likeState = likeSvg ? likeSvg.getAttribute('aria-label') : '';
        return {
          author: author,
          description: caption.slice(0, 500),
          likeState: likeState,
          comments: commentList.slice(0, 20),
          url: window.location.href,
        };
      `,
      readProfile: `
        /* Instagram profile — extract from meta description + DOM spans */
        var usernameMatch = window.location.href.match(/instagram\\.com\\/([^/]+)/);
        var username = usernameMatch ? usernameMatch[1] : '';
        /* Meta description has reliable stats: "275M Followers, 193 Following, 31.5K Posts - Name (@user)..." */
        var metaDesc = document.querySelector('meta[name="description"]');
        var metaText = metaDesc ? metaDesc.content : '';
        var followersMatch = metaText.match(/([\\d,.]+[KMB]?)\\s*Follower/i);
        var followingMatch = metaText.match(/([\\d,.]+[KMB]?)\\s*Following/i);
        var postsMatch = metaText.match(/([\\d,.]+[KMB]?)\\s*Post/i);
        var nameMatch = metaText.match(/-\\s*(.+?)\\s*\\(@/);
        /* Bio from meta after the quote */
        var bioMatch = metaText.match(/@[^)]+\\)\\s*(?:on Instagram:\\s*)?["\u201C]?(.+?)["\\u201D]?\\s*$/);
        /* DOM fallbacks for bio */
        var bioEl = document.querySelector('header section > div > span, span[dir="auto"]');
        /* DOM spans for stats (fallback) */
        var allSpans = document.querySelectorAll('span');
        var statTexts = [];
        for (var i = 0; i < allSpans.length; i++) {
          var t = allSpans[i].textContent.trim();
          if (t.match(/^[\\d,.]+[KMB]?\\s*(posts|followers|following)$/i)) statTexts.push(t);
        }
        var avatar = document.querySelector('img[alt*="profile photo"], header img');
        return {
          username: username,
          displayName: nameMatch ? nameMatch[1].trim() : username,
          bio: bioMatch ? bioMatch[1].trim() : '',
          posts: postsMatch ? postsMatch[1] : (statTexts.find(function(s){return s.match(/post/i);})||'').replace(/\\s*posts?/i,''),
          followers: followersMatch ? followersMatch[1] : (statTexts.find(function(s){return s.match(/follower/i);})||'').replace(/\\s*followers?/i,''),
          following: followingMatch ? followingMatch[1] : (statTexts.find(function(s){return s.match(/following/i);})||'').replace(/\\s*following/i,''),
          avatar: avatar ? avatar.src : '',
          url: window.location.href,
        };
      `,
      readNotifications: `return { count: 0, notifications: [{text: 'Instagram shows notifications in a popup. Click the heart icon in the nav bar to view them.'}] };`,
      scroll: `window.scrollBy(0, window.innerHeight * 2); return 'Scrolled down ' + (window.innerHeight * 2) + 'px.';`,
      like: `
        var article = document.querySelector('article');
        if (!article) return 'No article found.';
        var svg = article.querySelector('svg[aria-label="Like"]');
        if (!svg) return 'Already liked or like button not found.';
        var btn = svg.closest('button') || svg.parentElement;
        btn.click();
        return 'Liked the post.';
      `,
      follow: `
        var buttons = document.querySelectorAll('button[aria-label="Follow"]');
        if (buttons.length === 0) {
          /* Fallback: find button with text "Follow" */
          var allBtns = document.querySelectorAll('button');
          for (var i = 0; i < allBtns.length; i++) {
            if (allBtns[i].textContent.trim() === 'Follow') { allBtns[i].click(); return 'Followed user.'; }
          }
          return 'Follow button not found or already following.';
        }
        buttons[0].click();
        return 'Followed user.';
      `,
      clickCommentBox: `
        /* On feed: click the Comment SVG icon to navigate to post page with textarea */
        var ta = document.querySelector('textarea[aria-label*="comment"], textarea[placeholder*="comment"], form textarea');
        if (ta) { ta.focus(); ta.click(); return 'COMMENT_INPUT_READY'; }
        var article = document.querySelector('article');
        if (article) {
          var commentSvg = article.querySelector('svg[aria-label="Comment"]');
          if (commentSvg) {
            var btn = commentSvg.closest('button') || commentSvg.closest('a') || commentSvg.parentElement;
            btn.click();
            /* Wait for navigation + textarea to appear */
            return 'COMMENT_NAVIGATING';
          }
        }
        return 'COMMENT_INPUT_NOT_FOUND';
      `,
      typeComment: (text) => `
        var ta = document.querySelector('textarea[aria-label*="comment"], textarea[placeholder*="comment"], form textarea');
        if (!ta) return 'Comment textarea not found.';
        var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(ta, ${JSON.stringify(text)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        return 'Typed comment text.';
      `,
      submitComment: `
        var postBtn = document.querySelector('form button[type="submit"], div[role="button"][tabindex="0"]');
        if (!postBtn) {
          /* Find the "Post" text button */
          var allBtns = document.querySelectorAll('button, div[role="button"]');
          for (var i = 0; i < allBtns.length; i++) {
            if (allBtns[i].textContent.trim() === 'Post') { postBtn = allBtns[i]; break; }
          }
        }
        if (postBtn && !postBtn.disabled) { postBtn.click(); return 'Comment posted.'; }
        return 'Post button not found or disabled.';
      `,
    },
  },

  twitter: {
    name: 'Twitter/X',
    baseUrl: 'https://x.com',
    urlPattern: 'x.com',
    pages: {
      feed:     'https://x.com/home',
      profile:  (u) => `https://x.com/${u.replace(/^@/, '')}`,
      explore:  'https://x.com/explore',
      notifications: 'https://x.com/notifications',
      compose:  'https://x.com/compose/tweet',
    },
    js: {
      readFeed: `
        var tweets = document.querySelectorAll('article[data-testid="tweet"]');
        var results = [];
        for (var i = 0; i < Math.min(tweets.length, 10); i++) {
          var el = tweets[i];
          var authorEl = el.querySelector('div[data-testid="User-Name"] a');
          var textEl = el.querySelector('div[data-testid="tweetText"]');
          var linkEl = el.querySelector('a[href*="/status/"]');
          var statsEls = el.querySelectorAll('div[data-testid="reply"], div[data-testid="retweet"], div[data-testid="like"]');
          results.push({
            index: i,
            author: authorEl ? authorEl.textContent.trim() : '',
            description: textEl ? textEl.textContent.trim().slice(0, 280) : '',
            link: linkEl ? linkEl.href : '',
            stats: Array.from(statsEls).map(function(s){ return s.getAttribute('aria-label') || s.textContent.trim(); }),
          });
        }
        return results;
      `,
      readPost: `
        var tweet = document.querySelector('article[data-testid="tweet"]');
        if (!tweet) return { error: 'No tweet found on page.' };
        var author = tweet.querySelector('div[data-testid="User-Name"]');
        var text = tweet.querySelector('div[data-testid="tweetText"]');
        var replies = document.querySelectorAll('div[data-testid="cellInnerDiv"] article[data-testid="tweet"]');
        var commentList = [];
        for (var i = 1; i < Math.min(replies.length, 20); i++) {
          var r = replies[i];
          var rAuthor = r.querySelector('div[data-testid="User-Name"]');
          var rText = r.querySelector('div[data-testid="tweetText"]');
          commentList.push({
            index: i - 1,
            author: rAuthor ? rAuthor.textContent.trim() : '',
            text: rText ? rText.textContent.trim() : '',
          });
        }
        return {
          author: author ? author.textContent.trim() : '',
          description: text ? text.textContent.trim() : '',
          comments: commentList,
          url: window.location.href,
        };
      `,
      readProfile: `
        var name = document.querySelector('div[data-testid="UserName"] span');
        var bio = document.querySelector('div[data-testid="UserDescription"]');
        var stats = document.querySelectorAll('a[href*="/followers"] span, a[href*="/following"] span');
        return {
          username: name ? name.textContent.trim() : '',
          bio: bio ? bio.textContent.trim() : '',
          followers: stats.length > 0 ? stats[0].textContent.trim() : '',
          following: stats.length > 1 ? stats[1].textContent.trim() : '',
          url: window.location.href,
        };
      `,
      readNotifications: `
        var items = document.querySelectorAll('div[data-testid="cellInnerDiv"]');
        var results = [];
        for (var i = 0; i < Math.min(items.length, 20); i++) {
          results.push({ index: i, text: items[i].textContent.trim().slice(0, 200) });
        }
        return { count: results.length, notifications: results };
      `,
      scroll: `window.scrollBy(0, window.innerHeight * 2); return 'Scrolled down.';`,
      like: `
        var btn = document.querySelector('article[data-testid="tweet"] button[data-testid="like"]');
        if (!btn) return 'Like button not found.';
        btn.click();
        return 'Liked the tweet.';
      `,
      follow: `
        var btns = document.querySelectorAll('div[data-testid$="-follow"]');
        if (btns.length === 0) return 'Follow button not found.';
        btns[0].click();
        return 'Followed user.';
      `,
      clickCommentBox: `
        var reply = document.querySelector('div[data-testid="tweetTextarea_0"], div[data-testid="reply"]');
        if (reply) { reply.click(); return 'COMMENT_INPUT_READY'; }
        return 'COMMENT_INPUT_NOT_FOUND';
      `,
      typeComment: (text) => `
        var input = document.querySelector('div[data-testid="tweetTextarea_0"] [contenteditable]');
        if (!input) return 'Reply input not found.';
        input.focus();
        document.execCommand('insertText', false, ${JSON.stringify(text)});
        return 'Typed reply text.';
      `,
      submitComment: `
        var btn = document.querySelector('div[data-testid="tweetButtonInline"], button[data-testid="tweetButton"]');
        if (btn) { btn.click(); return 'Reply posted.'; }
        return 'Reply button not found.';
      `,
    },
  },
};

// ---------------------------------------------------------------------------
// Resolve platform + tab
// ---------------------------------------------------------------------------

function getPlatform(name) {
  const key = (name || '').toLowerCase().replace(/[^a-z]/g, '');
  if (key === 'x') return PLATFORMS.twitter;
  return PLATFORMS[key] || null;
}

async function ensureTab(browser, platform) {
  const { key: bKey } = resolveBrowser(browser);
  // Try to find an existing tab
  const tab = await findTab(bKey, platform.urlPattern);
  if (tab) return tab;
  // Open a new tab
  await navigateTo(bKey, platform.baseUrl);
  // Wait a moment for the page to start loading
  await new Promise(r => setTimeout(r, 1500));
  const newTab = await findTab(bKey, platform.urlPattern);
  if (!newTab) throw new Error(`Could not open ${platform.name} tab. Make sure ${BROWSER_APP_NAMES[bKey] || browser} is running.`);
  return newTab;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const SOCIAL_MEDIA_TOOLS = [

  // ── Context ──────────────────────────────────────────────────────────────

  {
    name: 'social_set_context',
    description: 'Set the business/page context for AI-driven social media content generation. Defines your brand, tone, topics, target audience, and content style.',
    category: 'social-media',
    permissionLevel: 'safe',
    params: ['business_type', 'description', 'tone', 'topics', 'hashtags', 'target_audience', 'content_style', 'brand_name'],
    async execute({ business_type, description, tone, topics, hashtags, target_audience, content_style, brand_name }) {
      if (!business_type) throw new Error('business_type is required (e.g. "storybook_company", "smm_agency", "ecommerce_store")');
      const ctx = {
        business_type,
        brand_name:      brand_name || '',
        description:     description || '',
        tone:            tone || 'professional, engaging',
        topics:          topics || [],
        hashtags:        hashtags || [],
        target_audience: target_audience || '',
        content_style:   content_style || '',
        updated_at:      new Date().toISOString(),
      };
      writeContext(ctx);
      appendActivity({ platform: 'system', action: 'set_context', detail: business_type });
      return JSON.stringify({ ok: true, context: ctx });
    },
  },

  {
    name: 'social_get_context',
    description: 'Read the current business context profile used for AI content generation.',
    category: 'social-media',
    permissionLevel: 'safe',
    params: [],
    async execute() {
      const ctx = readContext();
      if (!ctx) return 'No business context set yet. Use social_set_context to define your brand/page identity.';
      return JSON.stringify(ctx, null, 2);
    },
  },

  // ── Navigation ───────────────────────────────────────────────────────────

  {
    name: 'social_open',
    description: 'Open a social media platform page in the browser. Can navigate to feed, profile, notifications, or a specific URL.',
    category: 'social-media',
    permissionLevel: 'safe',
    params: ['platform', 'page', 'username', 'browser'],
    async execute({ platform, page, username, browser = 'chrome' }) {
      const p = getPlatform(platform);
      if (!p) throw new Error(`Unknown platform: ${platform}. Supported: tiktok, instagram, twitter`);

      let url;
      if (page === 'profile' && username) {
        url = p.pages.profile(username);
      } else if (page === 'notifications') {
        url = p.pages.notifications;
      } else if (page === 'upload' || page === 'compose') {
        url = p.pages.upload || p.pages.compose || p.baseUrl;
      } else if (page === 'explore') {
        url = p.pages.explore || p.pages.feed;
      } else if (page === 'following') {
        url = p.pages.following || p.pages.feed;
      } else {
        url = p.pages.feed;
      }

      // Check for existing tab first
      const { key: bKey } = resolveBrowser(browser);
      const existing = await findTab(bKey, p.urlPattern);
      if (existing) {
        // Navigate existing tab
        const { appName } = resolveBrowser(browser);
        if (bKey === 'safari') {
          await runAppleScript(`tell application "Safari"\n  activate\n  set URL of tab ${existing.tabIndex} of window ${existing.windowIndex} to "${url}"\n  set current tab of window ${existing.windowIndex} to tab ${existing.tabIndex} of window ${existing.windowIndex}\nend tell`);
        } else {
          await runAppleScript(`tell application "${appName}"\n  activate\n  set URL of tab ${existing.tabIndex} of window ${existing.windowIndex} to "${url}"\n  set active tab index of window ${existing.windowIndex} to ${existing.tabIndex}\nend tell`);
        }
      } else {
        await navigateTo(bKey, url);
      }

      appendActivity({ platform: platform.toLowerCase(), action: 'open', detail: url });
      return JSON.stringify({ ok: true, platform: p.name, url, message: `Opened ${p.name} — ${page || 'feed'}` });
    },
  },

  // ── Reading ──────────────────────────────────────────────────────────────

  {
    name: 'social_read_feed',
    description: 'Read the visible feed/timeline content from a social media platform. Returns posts/videos with author, description, stats, and links.',
    category: 'social-media',
    permissionLevel: 'safe',
    params: ['platform', 'browser'],
    async execute({ platform, browser = 'chrome' }) {
      const p = getPlatform(platform);
      if (!p) throw new Error(`Unknown platform: ${platform}`);
      const tab = await ensureTab(browser, p);
      const raw = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.readFeed);
      appendActivity({ platform: platform.toLowerCase(), action: 'read_feed', detail: `${tab.url}` });
      try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
    },
  },

  {
    name: 'social_read_post',
    description: 'Read details of the currently visible post/video including description, stats, and comments.',
    category: 'social-media',
    permissionLevel: 'safe',
    params: ['platform', 'browser'],
    async execute({ platform, browser = 'chrome' }) {
      const p = getPlatform(platform);
      if (!p) throw new Error(`Unknown platform: ${platform}`);
      const tab = await ensureTab(browser, p);
      const raw = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.readPost);
      appendActivity({ platform: platform.toLowerCase(), action: 'read_post', detail: tab.url });
      try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
    },
  },

  {
    name: 'social_read_profile',
    description: 'Read a user profile (username, bio, follower/following counts). Navigate to a profile page first with social_open.',
    category: 'social-media',
    permissionLevel: 'safe',
    params: ['platform', 'browser'],
    async execute({ platform, browser = 'chrome' }) {
      const p = getPlatform(platform);
      if (!p) throw new Error(`Unknown platform: ${platform}`);
      const tab = await ensureTab(browser, p);
      const raw = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.readProfile);
      appendActivity({ platform: platform.toLowerCase(), action: 'read_profile', detail: tab.url });
      try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
    },
  },

  {
    name: 'social_read_notifications',
    description: 'Read notifications/alerts from a social media platform.',
    category: 'social-media',
    permissionLevel: 'safe',
    params: ['platform', 'browser'],
    async execute({ platform, browser = 'chrome' }) {
      const p = getPlatform(platform);
      if (!p) throw new Error(`Unknown platform: ${platform}`);
      const tab = await ensureTab(browser, p);
      const raw = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.readNotifications);
      appendActivity({ platform: platform.toLowerCase(), action: 'read_notifications' });
      try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
    },
  },

  // ── Interactions ─────────────────────────────────────────────────────────

  {
    name: 'social_scroll',
    description: 'Scroll down on the current social media page to load more content.',
    category: 'social-media',
    permissionLevel: 'safe',
    params: ['platform', 'browser', 'times'],
    async execute({ platform, browser = 'chrome', times = 1 }) {
      const p = getPlatform(platform);
      if (!p) throw new Error(`Unknown platform: ${platform}`);
      const tab = await ensureTab(browser, p);
      let result = '';
      for (let i = 0; i < Math.min(times, 5); i++) {
        result = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.scroll);
        if (i < times - 1) await new Promise(r => setTimeout(r, 800));
      }
      return result;
    },
  },

  {
    name: 'social_like',
    description: 'Like/heart the currently visible post or video.',
    category: 'social-media',
    permissionLevel: 'sensitive',
    params: ['platform', 'browser'],
    async execute({ platform, browser = 'chrome' }) {
      const p = getPlatform(platform);
      if (!p) throw new Error(`Unknown platform: ${platform}`);
      const tab = await ensureTab(browser, p);
      const result = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.like);
      appendActivity({ platform: platform.toLowerCase(), action: 'like', detail: tab.url, result });
      return result;
    },
  },

  {
    name: 'social_follow',
    description: 'Follow the user on the currently visible profile or video page.',
    category: 'social-media',
    permissionLevel: 'sensitive',
    params: ['platform', 'browser'],
    async execute({ platform, browser = 'chrome' }) {
      const p = getPlatform(platform);
      if (!p) throw new Error(`Unknown platform: ${platform}`);
      const tab = await ensureTab(browser, p);
      const result = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.follow);
      appendActivity({ platform: platform.toLowerCase(), action: 'follow', detail: tab.url, result });
      return result;
    },
  },

  {
    name: 'social_comment',
    description: 'Post a comment on the currently visible post/video. If text is not provided, uses social_generate_content to create a context-aware comment.',
    category: 'social-media',
    permissionLevel: 'sensitive',
    params: ['platform', 'text', 'browser'],
    async execute({ platform, text, browser = 'chrome' }) {
      const p = getPlatform(platform);
      if (!p) throw new Error(`Unknown platform: ${platform}`);
      let tab = await ensureTab(browser, p);

      // If no text provided, generate it from context
      let commentText = text;
      if (!commentText && _callLLM) {
        const postData = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.readPost);
        const ctx = readContext();
        commentText = await _callLLM(
          `You are a social media manager. Generate a short, authentic comment (1-2 sentences, no hashtags) for a ${platform} post. ${ctx ? `Brand context: ${ctx.business_type} — ${ctx.description}. Tone: ${ctx.tone}.` : ''} Be genuine, add value, and match the platform's culture.`,
          `Post content: ${postData}\n\nGenerate a comment:`
        );
        commentText = commentText.replace(/^["']|["']$/g, '').trim();
      }
      if (!commentText) throw new Error('text is required (or set a business context for auto-generation)');

      // Click comment area — may need to wait for panel to open
      let readyCheck = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.clickCommentBox);
      if (readyCheck.includes('NAVIGATING') || readyCheck.includes('PANEL_OPENING')) {
        // Wait for comment panel/page to load, then retry
        await new Promise(r => setTimeout(r, 2500));
        const newTab = await ensureTab(browser, p);
        tab = newTab;
        readyCheck = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.clickCommentBox);
      }
      if (readyCheck.includes('NOT_FOUND') || readyCheck.includes('PANEL_OPENING')) {
        // One more retry with longer wait
        await new Promise(r => setTimeout(r, 2000));
        readyCheck = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.clickCommentBox);
      }
      if (readyCheck.includes('NOT_FOUND')) {
        return `Could not find the comment input. Make sure you're on a post/video page and the comment section is visible.`;
      }
      await new Promise(r => setTimeout(r, 500));

      // Type the comment
      const typeJS = typeof p.js.typeComment === 'function' ? p.js.typeComment(commentText) : p.js.typeComment;
      await execJS(browser, tab.windowIndex, tab.tabIndex, typeJS);
      await new Promise(r => setTimeout(r, 300));

      // Submit
      const submitResult = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.submitComment);

      appendActivity({
        platform: platform.toLowerCase(),
        action: 'comment',
        detail: tab.url,
        content: commentText,
        result: submitResult,
      });
      return JSON.stringify({ ok: true, comment: commentText, result: submitResult });
    },
  },

  {
    name: 'social_reply',
    description: 'Reply to a specific comment on a post. Requires the comment to be visible on the page.',
    category: 'social-media',
    permissionLevel: 'sensitive',
    params: ['platform', 'comment_index', 'text', 'browser'],
    async execute({ platform, comment_index = 0, text, browser = 'chrome' }) {
      const p = getPlatform(platform);
      if (!p) throw new Error(`Unknown platform: ${platform}`);
      const tab = await ensureTab(browser, p);

      // Click the reply button on the specific comment
      const clickReply = `
        var comments = document.querySelectorAll('[data-e2e="comment-list-item"], [class*="CommentItem"], article[data-testid="tweet"]');
        var target = comments[${comment_index}];
        if (!target) return 'Comment at index ${comment_index} not found.';
        var replyBtn = target.querySelector('[data-e2e="comment-reply"], button[class*="Reply"], [data-testid="reply"]');
        if (replyBtn) { replyBtn.click(); return 'REPLY_READY'; }
        return 'Reply button not found on comment ${comment_index}.';
      `;
      const readyCheck = await execJS(browser, tab.windowIndex, tab.tabIndex, clickReply);
      if (!readyCheck.includes('READY')) return readyCheck;
      await new Promise(r => setTimeout(r, 500));

      // Generate reply text if not provided
      let replyText = text;
      if (!replyText && _callLLM) {
        const postData = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.readPost);
        const ctx = readContext();
        replyText = await _callLLM(
          `You are a social media manager. Generate a short, friendly reply (1 sentence) to a comment on ${platform}. ${ctx ? `Brand: ${ctx.business_type}. Tone: ${ctx.tone}.` : ''} Be conversational and authentic.`,
          `Post + comments: ${postData}\n\nReply to comment index ${comment_index}:`
        );
        replyText = replyText.replace(/^["']|["']$/g, '').trim();
      }
      if (!replyText) throw new Error('text is required for reply');

      // Type and submit
      const typeJS = typeof p.js.typeComment === 'function' ? p.js.typeComment(replyText) : p.js.typeComment;
      await execJS(browser, tab.windowIndex, tab.tabIndex, typeJS);
      await new Promise(r => setTimeout(r, 300));
      const submitResult = await execJS(browser, tab.windowIndex, tab.tabIndex, p.js.submitComment);

      appendActivity({
        platform: platform.toLowerCase(),
        action: 'reply',
        detail: `comment_${comment_index}`,
        content: replyText,
        result: submitResult,
      });
      return JSON.stringify({ ok: true, reply: replyText, result: submitResult });
    },
  },

  // ── Content Creation ─────────────────────────────────────────────────────

  {
    name: 'social_create_post',
    description: 'Navigate to the post creation page. For TikTok/Instagram this opens the upload page. The actual upload of media files requires manual interaction. Use social_generate_content to prepare captions and hashtags first.',
    category: 'social-media',
    permissionLevel: 'sensitive',
    params: ['platform', 'caption', 'browser'],
    async execute({ platform, caption, browser = 'chrome' }) {
      const p = getPlatform(platform);
      if (!p) throw new Error(`Unknown platform: ${platform}`);

      const uploadUrl = p.pages.upload || p.pages.compose || p.baseUrl;
      const { key: bKey } = resolveBrowser(browser);
      await navigateTo(bKey, uploadUrl);
      await new Promise(r => setTimeout(r, 2000));

      let result = `Opened ${p.name} post creation page: ${uploadUrl}`;

      // If caption provided, try to paste it into the caption field
      if (caption) {
        const tab = await findTab(bKey, p.urlPattern);
        if (tab) {
          try {
            const pasteJS = `
              var inputs = document.querySelectorAll('[contenteditable="true"], textarea[placeholder*="caption"], textarea[placeholder*="description"], div[data-testid="tweetTextarea_0"] [contenteditable]');
              if (inputs.length === 0) return 'Caption input not found — paste manually.';
              var input = inputs[inputs.length - 1];
              input.focus();
              document.execCommand('insertText', false, ${JSON.stringify(caption)});
              input.dispatchEvent(new Event('input', { bubbles: true }));
              return 'Caption inserted.';
            `;
            const pasteResult = await execJS(browser, tab.windowIndex, tab.tabIndex, pasteJS);
            result += `\n${pasteResult}`;
          } catch { /* non-critical */ }
        }
      }

      appendActivity({ platform: platform.toLowerCase(), action: 'create_post', detail: uploadUrl, content: caption || '' });
      return result + '\n\nUpload your media file, then publish. The caption has been pre-filled if possible.';
    },
  },

  {
    name: 'social_generate_content',
    description: 'AI-generate context-aware social media content. Uses the business context (from social_set_context) to produce on-brand captions, comments, replies, hashtags, or post ideas.',
    category: 'social-media',
    permissionLevel: 'safe',
    params: ['platform', 'content_type', 'topic', 'reference_post', 'additional_instructions'],
    async execute({ platform, content_type = 'caption', topic, reference_post, additional_instructions }) {
      if (!_callLLM) throw new Error('LLM not available for content generation.');
      const ctx = readContext();
      if (!ctx) throw new Error('No business context set. Call social_set_context first to define your brand identity.');
      const p = getPlatform(platform || 'tiktok');
      const pName = p ? p.name : platform || 'social media';

      const charLimits = { tiktok: 2200, instagram: 2200, twitter: 280, linkedin: 3000, facebook: 63206 };
      const limit = charLimits[(platform || '').toLowerCase()] || 2200;

      const prompts = {
        caption: `Generate a ${pName} post caption (max ${limit} chars). Include relevant hashtags at the end. Make it engaging and on-brand.`,
        comment: `Generate a short, authentic comment (1-2 sentences, no hashtags) suitable for ${pName}. Be genuine and conversational.`,
        reply: `Generate a friendly reply (1 sentence) to a comment on ${pName}. Be conversational and helpful.`,
        hashtags: `Generate 15-20 relevant hashtags for a ${pName} post. Mix popular and niche tags. Return as a space-separated list starting with #.`,
        post_idea: `Generate 5 creative post/content ideas for ${pName}. Each should be a brief concept (1-2 sentences) with suggested format (video/image/carousel/text).`,
        bio: `Generate a compelling ${pName} bio/description (max 150 chars). Include key value proposition and call-to-action.`,
        product_listing: `Generate a product listing description for ${pName} or e-commerce. Include key features, benefits, and a call-to-action.`,
      };

      const systemPrompt = `You are an expert social media content creator and strategist.
Brand: ${ctx.brand_name || ctx.business_type}
Business type: ${ctx.business_type}
Description: ${ctx.description}
Tone: ${ctx.tone}
Topics: ${(ctx.topics || []).join(', ')}
Target audience: ${ctx.target_audience}
Content style: ${ctx.content_style}
Preferred hashtags: ${(ctx.hashtags || []).join(' ')}

${prompts[content_type] || prompts.caption}
${additional_instructions ? `\nAdditional instructions: ${additional_instructions}` : ''}
Output ONLY the generated content, no explanations or labels.`;

      const userMsg = topic
        ? `Topic/subject: ${topic}${reference_post ? `\n\nReference post for context: ${reference_post}` : ''}`
        : reference_post
          ? `Reference post: ${reference_post}`
          : `Generate ${content_type} content based on the brand context.`;

      const generated = await _callLLM(systemPrompt, userMsg);

      appendActivity({
        platform: (platform || 'general').toLowerCase(),
        action: 'generate_content',
        detail: content_type,
        content: generated.slice(0, 200),
      });

      return JSON.stringify({
        content_type,
        platform: pName,
        generated: generated.trim(),
        context: ctx.business_type,
      }, null, 2);
    },
  },

  // ── Activity Log ─────────────────────────────────────────────────────────

  {
    name: 'social_activity_log',
    description: 'View the social media activity log. Shows recent actions (likes, comments, follows, posts) with timestamps.',
    category: 'social-media',
    permissionLevel: 'safe',
    params: ['platform', 'action', 'limit'],
    async execute({ platform, action, limit = 50 }) {
      let log = readActivityLog();

      // Filter
      if (platform) {
        const pKey = platform.toLowerCase();
        log = log.filter(e => e.platform === pKey);
      }
      if (action) {
        log = log.filter(e => e.action === action);
      }

      // Most recent first, limited
      const recent = log.slice(-Math.min(limit, 200)).reverse();

      if (recent.length === 0) {
        return 'No social media activity logged yet.';
      }

      const summary = recent.map(e =>
        `[${e.timestamp}] ${e.platform}/${e.action}${e.detail ? ': ' + e.detail : ''}${e.content ? ' — "' + e.content.slice(0, 80) + '"' : ''}`
      ).join('\n');

      return `Social Media Activity Log (${recent.length} entries):\n\n${summary}`;
    },
  },
];

module.exports = { SOCIAL_MEDIA_TOOLS, initSocialMedia };
