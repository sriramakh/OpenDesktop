# Social Media Controller Skill Guide

Browser-based social media automation using active sessions. The user is already logged in — these tools interact with the web interface via JavaScript injection.

## Supported Platforms
- **TikTok** (tiktok.com)
- **Instagram** (instagram.com)
- **Twitter/X** (x.com)

## Prerequisites
- Chrome (or Safari/Brave) must be running
- User must be logged into the social media account in the browser
- Chrome: enable "Allow JavaScript from Apple Events" (View > Developer menu, one-time)

## 15 Tools

### Context (set once, used for all AI generation)
| Tool | Purpose |
|------|---------|
| `social_set_context` | Define your brand — business type, tone, topics, audience, hashtags |
| `social_get_context` | Read current brand context |

### Navigation
| Tool | Purpose |
|------|---------|
| `social_open` | Open feed, profile, notifications, or upload page |

### Reading (safe, no approval needed)
| Tool | Purpose |
|------|---------|
| `social_read_feed` | Read visible feed — posts with author, description, stats, links |
| `social_read_post` | Read current post details + comments |
| `social_read_profile` | Read user profile — bio, followers, following |
| `social_read_notifications` | Read notifications |
| `social_scroll` | Scroll to load more content |

### Engagement (sensitive, needs approval)
| Tool | Purpose |
|------|---------|
| `social_like` | Like/heart the current post |
| `social_follow` | Follow the current user |
| `social_comment` | Post a comment (auto-generates if text omitted) |
| `social_reply` | Reply to a specific comment by index |

### Content Creation
| Tool | Purpose |
|------|---------|
| `social_create_post` | Open upload page, pre-fill caption |
| `social_generate_content` | AI-generate captions, comments, hashtags, post ideas, bios |

### Logging
| Tool | Purpose |
|------|---------|
| `social_activity_log` | View activity history — filter by platform, action |

## Workflows

### 1. Initial Setup
```
social_set_context(business_type="storybook_company", brand_name="StoryMagic",
  description="AI-generated storybooks for children",
  tone="warm, creative, educational",
  topics=["children's stories", "AI art", "creativity"],
  hashtags=["#AIStories", "#KidsBooks", "#StoryMagic"],
  target_audience="parents, educators, kids 3-12",
  content_style="imaginative, colorful, engaging")
```

### 2. Feed Engagement Loop
```
social_open(platform="tiktok", page="feed")
social_read_feed(platform="tiktok")        -> see what's trending
social_scroll(platform="tiktok", times=2)  -> load more
social_read_post(platform="tiktok")        -> read a specific post
social_like(platform="tiktok")             -> like it
social_comment(platform="tiktok")          -> auto-generate + post comment
```

### 3. Profile Engagement
```
social_open(platform="tiktok", page="profile", username="targetuser")
social_read_profile(platform="tiktok")     -> check their content
social_follow(platform="tiktok")           -> follow
```

### 4. Respond to Comments on Your Post
```
social_open(platform="tiktok", page="profile", username="yourusername")
-> navigate to your video
social_read_post(platform="tiktok")        -> read comments
social_reply(platform="tiktok", comment_index=0)  -> auto-reply to first comment
social_reply(platform="tiktok", comment_index=1, text="Thanks!")  -> manual reply
```

### 5. Create a Post
```
social_generate_content(platform="tiktok", content_type="caption",
  topic="new AI storybook about a dragon")
social_generate_content(platform="tiktok", content_type="hashtags",
  topic="children's AI storybook")
social_create_post(platform="tiktok", caption="<generated caption + hashtags>")
-> user manually uploads video/image, then publishes
```

### 6. Check Activity
```
social_activity_log()                       -> all recent activity
social_activity_log(platform="tiktok")      -> TikTok only
social_activity_log(action="comment")       -> comments only
```

## Business Context Examples

### Storybook Company
```json
{
  "business_type": "storybook_company",
  "brand_name": "StoryMagic",
  "tone": "warm, creative, educational, whimsical",
  "topics": ["children's stories", "AI art", "bedtime stories", "imagination"],
  "content_style": "story-driven, visual, behind-the-scenes of creation"
}
```

### Social Media Agency
```json
{
  "business_type": "smm_agency",
  "brand_name": "ViralForge",
  "tone": "professional, data-driven, trendy",
  "topics": ["social media strategy", "content creation", "SEO", "analytics"],
  "content_style": "tips, case studies, before/after, educational"
}
```

### E-commerce / Product Seller
```json
{
  "business_type": "ecommerce_store",
  "brand_name": "CraftedGoods",
  "tone": "friendly, authentic, value-focused",
  "topics": ["handmade products", "small business", "crafts"],
  "content_style": "product showcases, customer reviews, process videos"
}
```

## Content Generation Types
| Type | Output | Use Case |
|------|--------|----------|
| `caption` | Post caption with hashtags | New posts |
| `comment` | Short authentic comment (1-2 sentences) | Engaging with others' posts |
| `reply` | Friendly 1-sentence reply | Responding to comments |
| `hashtags` | 15-20 mixed popular/niche tags | Any post |
| `post_idea` | 5 content concepts with format suggestions | Content planning |
| `bio` | Compelling bio under 150 chars | Profile optimization |
| `product_listing` | Product description with features + CTA | Amazon, Etsy, shop pages |

## Rate Limiting
- Space actions naturally — the agent adds delays between tool calls
- Don't rapid-fire likes/follows/comments (platforms may flag this)
- Read operations are unlimited and safe
