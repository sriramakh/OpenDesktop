# Twitter/X — Verified Procedures

Step-by-step procedures with working DOM selectors for Twitter/X (x.com).

Last verified: 2026-04-06

## Prerequisites
- Chrome with "Allow JavaScript from Apple Events" enabled
- User logged into X.com in Chrome

## Procedure: Read Feed

```
Step 1: social_open(platform="twitter", page="feed", browser="chrome")
Step 2: Wait 5 seconds (X.com feed loads async)
Step 3: social_read_feed(platform="twitter", browser="chrome")
```

**Working selectors** (all verified 2026-04-06):
- Tweets: `article[data-testid="tweet"]` — each article is one tweet
- Author: `div[data-testid="User-Name"]` → extract `@handle` via regex `/@(\w+)/`
- Tweet text: `div[data-testid="tweetText"]`
- Link: `a[href*="/status/"]`
- Like count: `button[data-testid="like"]` or `button[data-testid="unlike"]` → `aria-label` (e.g. "2261 Likes. Like")
- Reply count: `button[data-testid="reply"]` → `aria-label`
- Retweet count: `button[data-testid="retweet"]` → `aria-label`
- Time: `time` element → `datetime` attribute

## Procedure: Read Post + Replies

```
Step 1: Navigate to a tweet URL (or use the first tweet on feed)
Step 2: social_read_post(platform="twitter", browser="chrome")
```

- Main tweet: first `article[data-testid="tweet"]`
- Replies: subsequent `article[data-testid="tweet"]` elements (index 1+)
- Each reply has User-Name + tweetText

## Procedure: Read Profile

```
Step 1: social_open(platform="twitter", page="profile", username="elonmusk")
Step 2: Wait 3 seconds
Step 3: social_read_profile(platform="twitter", browser="chrome")
```

**Working selectors**:
- Username: from URL `x.com/username`
- Display name: `div[data-testid="UserName"] span`
- Bio: `div[data-testid="UserDescription"]`
- Followers: `a[href$="/verified_followers"]` or `a[href$="/followers"]` → first word of text
- Following: `a[href$="/following"]` → first word of text
- Avatar: `img[alt="Opens profile photo"]`

**Verified**: @elonmusk (237.8M followers), @OpenAI (4.7M followers)

## Procedure: Like a Tweet

```
social_like(platform="twitter", browser="chrome")
```

**Selector**: `button[data-testid="like"]` on the first `article[data-testid="tweet"]`
- Returns "Already liked" if `button[data-testid="unlike"]` found instead
- `aria-label` contains like count (e.g. "2261 Likes. Like")

## Procedure: Follow a User

```
social_follow(platform="twitter", browser="chrome")
```

**Selector**: `button[data-testid$="-follow"]` — the testid includes the user ID (e.g. `1260921-follow`)
- `aria-label` contains "Follow @username"

## Procedure: Comment/Reply on a Tweet

**IMPORTANT: X.com DraftJS limitation** [Learned: 2026-04-06]

X.com uses DraftJS (React rich text editor) for the reply input. Unlike TikTok's DraftJS:
- `document.execCommand('insertText')` updates the DOM but NOT DraftJS internal EditorState
- The Reply/Post button stays **disabled** because React state doesn't know text was entered
- OS-level keyboard simulation (AppleScript `keystroke`) also doesn't trigger DraftJS state updates reliably
- `pbcopy` + `Cmd+V` paste works to insert text but button may still stay disabled

**Current approach**: The tool opens the reply dialog, sets clipboard via `pbcopy`, and pastes via `Cmd+V`. If the Post button remains disabled, the text is in the editor but needs a manual click.

**Workaround for the agent**:
1. `social_comment(platform="twitter", text="...")` — attempts automated reply
2. If result says "Post button disabled", tell the user: "I've typed the reply text but X.com's anti-bot protection prevents automated submission. Please click the Reply button manually."

## Procedure: Read Notifications

```
Step 1: social_open(platform="twitter", page="notifications")
Step 2: Wait 3 seconds
Step 3: social_read_notifications(platform="twitter", browser="chrome")
```

**Selector**: `div[data-testid="cellInnerDiv"]` — filter for text 5-500 chars

## Procedure: Scroll

```
social_scroll(platform="twitter", browser="chrome")
```

Standard `window.scrollBy` works on X.com (unlike TikTok's fullscreen layout).

## Known Issues & Gotchas

### DraftJS Reply Input [Learned: 2026-04-06]
- X.com's production DraftJS strips `__reactFiber` from DOM elements
- No programmatic way to update DraftJS EditorState externally
- `execCommand('insertText')`, keyboard events, clipboard paste — all insert text into DOM but don't update React state
- The Reply button enables based on React state, not DOM content
- This is an intentional anti-bot measure by X.com

### Feed Loading
- [Learned: 2026-04-06] X.com feed needs 5 seconds to load after navigation. 3 seconds returns 0 tweets.

### Multiple X.com Tabs
- The tool prefers the active tab. If multiple X.com tabs are open, focus the right one before calling tools.

### Follow Buttons
- Follow buttons on the feed use `data-testid="USERID-follow"` format
- On profile pages, the follow button may use a different testid

### Rate Limiting
- X.com aggressively rate-limits likes and follows
- Space actions 5-10 seconds apart
