# Twitter/X — Procedures

Step-by-step procedures with DOM selectors for Twitter/X (x.com).

Last verified: 2026-04-03 (selectors from code, not yet live-tested)

## Prerequisites
- Chrome with "Allow JavaScript from Apple Events" enabled
- User logged into Twitter/X in Chrome

## Procedure: Read Feed

```
Step 1: social_open(platform="twitter", page="feed", browser="chrome")
Step 2: social_read_feed(platform="twitter", browser="chrome")
```

**Working selectors**:
- Tweets: `article[data-testid="tweet"]`
- Author: `div[data-testid="User-Name"] a`
- Tweet text: `div[data-testid="tweetText"]`
- Tweet link: `a[href*="/status/"]`
- Stats (reply/retweet/like): `div[data-testid="reply"]`, `div[data-testid="retweet"]`, `div[data-testid="like"]` — use `aria-label` for counts

## Procedure: Read Post/Tweet + Replies

```
Step 1: Navigate to a tweet URL
Step 2: social_read_post(platform="twitter", browser="chrome")
```

- Main tweet: First `article[data-testid="tweet"]`
- Replies: Subsequent `article[data-testid="tweet"]` elements in `div[data-testid="cellInnerDiv"]`

## Procedure: Read Profile

```
Step 1: social_open(platform="twitter", page="profile", username="targetuser")
Step 2: social_read_profile(platform="twitter", browser="chrome")
```

**Working selectors**:
- Name: `div[data-testid="UserName"] span`
- Bio: `div[data-testid="UserDescription"]`
- Followers/Following: `a[href*="/followers"] span`, `a[href*="/following"] span`

## Procedure: Like a Tweet

```
social_like(platform="twitter", browser="chrome")
```

**Selector**: `article[data-testid="tweet"] button[data-testid="like"]`

## Procedure: Follow

```
social_follow(platform="twitter", browser="chrome")
```

**Selector**: `div[data-testid$="-follow"]`

## Procedure: Reply to a Tweet

```
social_comment(platform="twitter", text="Your reply", browser="chrome")
```

**How it works**:
1. Clicks `div[data-testid="tweetTextarea_0"]` or `div[data-testid="reply"]`
2. Finds `[contenteditable]` inside the textarea
3. Types with `document.execCommand('insertText')`
4. Clicks `div[data-testid="tweetButtonInline"]` or `button[data-testid="tweetButton"]`

## Known Issues
- Twitter uses `data-testid` attributes extensively — these are stable
- Rate limiting: Twitter aggressively rate-limits automated actions
- Some features require Twitter Blue/Premium

[Status: Selectors defined but need live verification. Update this file after first successful test.]
