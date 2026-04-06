# TikTok — Verified Procedures

Exact step-by-step procedures with working DOM selectors. Follow these precisely — do NOT improvise selectors.

Last verified: 2026-04-03

## Prerequisites
- Chrome with "Allow JavaScript from Apple Events" enabled (View > Developer)
- User logged into TikTok in Chrome

## Critical: Logged-in vs Logged-out Layout
TikTok has TWO different layouts:
- **Logged in**: Fullscreen video player with side action bar (like/comment/share). ONE video visible at a time. Feed is navigated by scrolling/swiping.
- **Logged out**: Grid of video cards. Multiple videos visible.

The procedures below are for the **logged-in fullscreen layout** which is the common case.

## Procedure: Read Feed (Current Video)

**Tools**: `social_open` → `social_read_feed`

```
Step 1: social_open(platform="tiktok", page="feed", browser="chrome")
Step 2: Wait 3 seconds for video to load
Step 3: social_read_feed(platform="tiktok", browser="chrome")
```

**What you get back**: Array with the current video's `author`, `description`, `likes`, `comments`, `shares`, `canFollow`

**Working selectors** (fullscreen layout):
- Author: `a[data-e2e="video-author-avatar"]` → extract username from `.href.split('/@')[1]`
- Description: `[data-e2e="video-desc"]` or `[data-e2e="browse-video-desc"]`
- Like count: `strong[data-e2e="like-count"]`
- Comment count: `strong[data-e2e="comment-count"]`
- Share count: `strong[data-e2e="share-count"]`
- Follow button: `[data-e2e="feed-follow"]`

**Note**: In fullscreen mode, only ONE video is visible. To see more, use `social_scroll` or navigate with arrow keys.

## Procedure: Read Post Details + Comments

**Tools**: `social_read_post`

```
Step 1: Ensure on TikTok feed or video page
Step 2: social_read_post(platform="tiktok", browser="chrome")
```

**Working selectors** (fullscreen layout):
- Author: `a[data-e2e="video-author-avatar"]` → `.href.split('/@')[1]`
- Description: `[data-e2e="video-desc"]`
- Likes: `strong[data-e2e="like-count"]`
- Comments: `strong[data-e2e="comment-count"]`
- Shares: `strong[data-e2e="share-count"]`
- Comment list items: Use `[data-e2e="comment-username-1"]` for author and `[data-e2e="comment-level-1"]` for text
- Comment reply buttons: `[data-e2e="comment-reply-1"]`
- Comment input: `[data-e2e="comment-input"]` and `[data-e2e="comment-text"]`

**Important**: The comment panel is visible on the RIGHT side in the fullscreen layout. Comments load automatically — no need to click a "show comments" button.

## Procedure: Read Profile

**Tools**: `social_open` → `social_read_profile`

```
Step 1: social_open(platform="tiktok", page="profile", username="targetuser", browser="chrome")
Step 2: Wait 3 seconds for page load
Step 3: social_read_profile(platform="tiktok", browser="chrome")
```

**Working selectors** (critical — use `strong` and `h2` tags):
- Username: `h1[data-e2e="user-title"]` or just `h1`
- Nickname/display name: `h2[data-e2e="user-subtitle"]`
- Bio: `h2[data-e2e="user-bio"]`
- Following count: `strong[data-e2e="following-count"]` ← MUST use `strong` tag
- Followers count: `strong[data-e2e="followers-count"]` ← MUST use `strong` tag
- Likes count: `strong[data-e2e="likes-count"]` ← MUST use `strong` tag
- Avatar: `[data-e2e="user-avatar"] img`

**Gotcha**: Without the `strong` prefix, `[data-e2e="followers-count"]` may match a parent container that returns empty text. Always use `strong[data-e2e="..."]` for stat counts.

## Procedure: Like a Video

**Tools**: `social_like`

```
Step 1: Ensure on feed or video page
Step 2: social_like(platform="tiktok", browser="chrome")
```

**Working selector**: `[data-e2e="like-icon"]` or `[data-e2e="browse-like-icon"]` → `.click()`

## Procedure: Follow a User

**Tools**: `social_follow`

```
Step 1: Navigate to a user's video or profile
Step 2: social_follow(platform="tiktok", browser="chrome")
```

**Working selectors** (in order of preference):
- Feed follow button: `[data-e2e="feed-follow"]`
- Profile follow button: `[data-e2e="follow-button"]`
- Checks if already following: button text includes "Following"

## Procedure: Comment on a Video

**Tools**: `social_comment`

```
Step 1: Ensure on feed (video visible with comment panel)
Step 2: social_comment(platform="tiktok", text="Your comment", browser="chrome")
```

**How it works internally (critical — TikTok uses DraftJS)**:
1. Finds comment input: `.public-DraftEditor-content[contenteditable="true"]` or `div[contenteditable="true"][role="textbox"]`
2. If not found, clicks `[data-e2e="comment-icon"]` to open comment panel, then clicks `[data-e2e="comment-input"]` or `[data-e2e="comment-text"]`
3. Focuses the DraftJS editor
4. Clears existing text: `input.innerHTML = ''`
5. Types text using `document.execCommand('insertText', false, text)` — this is the ONLY reliable way with DraftJS
6. Dispatches `input` event with `{ bubbles: true }`
7. Clicks post button: `[data-e2e="comment-post"]`

**Critical**: Do NOT use `.textContent = ` or `.value = ` with TikTok's comment input. TikTok uses DraftJS (a rich text editor), and only `document.execCommand('insertText')` properly updates the internal React state.

## Procedure: Reply to a Comment

**Tools**: `social_reply`

```
Step 1: social_read_post to see comments and their indices
Step 2: social_reply(platform="tiktok", comment_index=0, text="Your reply", browser="chrome")
```

Clicks `[data-e2e="comment-reply-1"]` on the target comment, then types using the same DraftJS method as commenting.

## Procedure: Navigate Next Video

The fullscreen feed doesn't respond to `window.scrollBy`. To advance to the next video:
```
tabs_run_js(browser="chrome", windowIndex=W, tabIndex=T, code="document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',keyCode:40,bubbles:true}))")
```
Or use `social_scroll` which attempts page scroll (works on browse/explore pages but not fullscreen feed).

## Known Issues & Gotchas
- **Fullscreen layout**: Only shows ONE video at a time. `social_read_feed` returns one item.
- **DraftJS comment input**: Standard `.value` assignment does NOT work. Must use `execCommand('insertText')`.
- **Profile stats**: Must use `strong[data-e2e="..."]` not just `[data-e2e="..."]` — parent element returns empty.
- **Follow button on feed**: `[data-e2e="feed-follow"]` — only visible when NOT already following.
- **Scroll in fullscreen**: `window.scrollBy` scrolls the page but doesn't advance to next video. Use ArrowDown keyboard event instead.
- **Login wall**: Actions like like/follow/comment require login. If not logged in, clicking triggers a login popup.
