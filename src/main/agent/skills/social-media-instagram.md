# Instagram — Verified Procedures

Exact step-by-step procedures with working DOM selectors. Follow these precisely — do NOT improvise selectors.

Last verified: 2026-04-03

## Prerequisites
- Chrome with "Allow JavaScript from Apple Events" enabled (View > Developer)
- User logged into Instagram in Chrome

## Procedure: Read Feed

**Tools**: `social_open` → `social_read_feed`

```
Step 1: social_open(platform="instagram", page="feed", browser="chrome")
Step 2: social_read_feed(platform="instagram", browser="chrome")
```

**What you get back**: Array of posts with `author`, `description`, `link`, `likes`, `comments`, `time`

**Working selectors** (if you need to use `tabs_run_js` directly):
- Posts: `document.querySelectorAll('article')` — each article is one post
- Author: Parse from first `<a href>` matching `instagram.com/username` (exclude `/p/`, `/reel/`, `/explore/`)
- Caption: Longest `<span>` text > 15 chars, < 2200 chars, not starting with Like/Comment/Share
- Like count: Parse from `section` text — matches pattern `Like(\d[\d,.KMB]*)`
- Comment count: Parse from section text — matches `Comment(\d[\d,.KMB]*)`
- Post link: `article.querySelector('a[href*="/p/"], a[href*="/reel/"]')`
- Timestamp: `article.querySelector('time').getAttribute('datetime')`

## Procedure: Read Post Details + Comments

**Tools**: `social_open` → navigate to post → `social_read_post`

```
Step 1: social_open(platform="instagram") — ensure IG is open
Step 2: Navigate to a specific post URL if needed
Step 3: social_read_post(platform="instagram", browser="chrome")
```

**Working selectors for post page**:
- Author: First `<a href>` matching `instagram.com/username` pattern
- Caption: Longest `span[dir="auto"]` or `span` text (> 15 chars)
- Like state: `article.querySelector('svg[aria-label="Like"]')` — returns "Like" (not liked) or "Unlike" (already liked)
- Comments: `document.querySelectorAll('ul > li, div[role="button"] span')` — filter for text 5-500 chars, not starting with Like/Reply/See/View/Add/Hide

## Procedure: Read Profile

**Tools**: `social_open` → `social_read_profile`

```
Step 1: social_open(platform="instagram", page="profile", username="targetuser", browser="chrome")
Step 2: Wait 3 seconds for page load
Step 3: social_read_profile(platform="instagram", browser="chrome")
```

**Working selectors**:
- Username: From URL — `window.location.href.match(/instagram.com\/([^/]+)/)[1]`
- Display name: `document.querySelector('header h1, header h2, section h1')`
- Bio: `document.querySelector('header section > div > span, header section span[dir="auto"]')`
- Stats (posts/followers/following): `document.querySelectorAll('header li span span')` — filter for numeric text matching `[\d,.KMB]+`
- Avatar: `document.querySelector('header img[alt*="profile"]')`

## Procedure: Like a Post

**Tools**: `social_like`

```
Step 1: Ensure you're on the feed or a post page
Step 2: social_like(platform="instagram", browser="chrome")
```

**Working selector**: `article.querySelector('svg[aria-label="Like"]')` → `.closest('button').click()`
- Returns "Already liked" if `svg[aria-label="Unlike"]` is found instead

## Procedure: Follow a User

**Tools**: `social_open` → `social_follow`

```
Step 1: social_open(platform="instagram", page="profile", username="targetuser")
Step 2: Wait 3 seconds
Step 3: social_follow(platform="instagram", browser="chrome")
```

**Working selector**: `button[aria-label="Follow"]` or any `<button>` with exact text "Follow"

## Procedure: Comment on a Post

**Tools**: `social_comment`

```
Step 1: Ensure on feed page (social_open if needed)
Step 2: social_comment(platform="instagram", text="Your comment here", browser="chrome")
```

**How it works internally**:
1. First checks for existing textarea: `textarea[aria-label*="comment"], textarea[placeholder*="comment"]`
2. If not found, clicks the Comment SVG icon: `article.querySelector('svg[aria-label="Comment"]')` — this navigates to the post page
3. Waits 2.5 seconds for post page to load
4. Re-queries for textarea (now available on post page)
5. Types text using React-compatible `nativeInputValueSetter` + `input` event dispatch
6. Clicks post button: finds `<button>` or `div[role="button"]` with exact text "Post"

**Critical**: Instagram's Comment button on the feed NAVIGATES to the post page. The textarea only appears on the post page. The tool handles this automatically.

## Procedure: Create Post

```
Step 1: social_generate_content(platform="instagram", content_type="caption", topic="your topic")
Step 2: social_generate_content(platform="instagram", content_type="hashtags", topic="your topic")
Step 3: social_create_post(platform="instagram", caption="<caption + hashtags>")
```

This opens the upload page. Media upload requires manual interaction.

## Procedure: Read Comments on YOUR Posts

To read comments people left on your own posts:
```
Step 1: social_open(platform="instagram", page="profile", username="YOUR_USERNAME")
Step 2: Wait 3 seconds
Step 3: Click on the specific post (manually or via tabs_run_js to click the post link)
Step 4: social_read_post(platform="instagram") — make sure the post tab is the ACTIVE tab
```

**Critical**: If you have multiple Instagram tabs open, the tool uses the ACTIVE tab. Make sure the tab with the post page is focused.

## Known Issues & Gotchas

### Profile stats
- **Primary source**: `<meta name="description">` tag — contains "275M Followers, 194 Following, 32K Posts - Name (@user)..." 
- This is the most reliable source. DOM spans are fallback only.
- [Learned: 2026-04-06] DOM `header li span span` selectors no longer work. Meta description parsing now handles all cases.

### Comments
- **Feed view**: Only shows the currently visible post's caption. Few or no comments visible.
- **Post page** (`/p/XXXXX/`): Full comments visible. Use this for reading comments.
- **Comment structure** [Learned: 2026-04-06]: Instagram uses `span[dir="auto"]` for ALL text. Comments follow this pattern:
  1. Username appears TWICE (display text + link text) — deduplicate
  2. Timestamp (`1w`, `3d`, `2h`) — skip
  3. Comment text — capture
  4. Like count (`6 likes`) — skip
  5. Reply link — skip
- **No `<article>` on post pages** [Learned: 2026-04-06]: Post pages use `<main>` as root, NOT `<article>`. The tool falls back to `main` automatically.

### Multiple tabs
- [Learned: 2026-04-06] If multiple Instagram tabs are open, the tool prefers the ACTIVE tab. If the active tab isn't Instagram, it picks the last-opened Instagram tab.
- To ensure the right tab is used, focus it before calling the tool.

### Comment textarea
- NOT visible on the feed — must navigate to post page first
- Clicking the Comment SVG on feed navigates to the post page (2.5s wait needed)

### Other
- **Like count**: Parsed from section text blob (e.g. "Like643Comment24") — no separate element
- **Reels**: May use a different layout — selectors may need adjustment
- **Rate limiting**: Space actions 3-5 seconds apart to avoid temporary blocks
