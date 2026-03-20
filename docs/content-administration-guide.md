# Content Administration Guide

> **MVP Approach:** Supabase Studio Table Editor is the content management interface. No custom admin UI is built for MVP.

## Prerequisites

- Access to your Supabase project dashboard
- Navigate to: **Table Editor** > `content_pages`

## Content Lifecycle

```
draft → published → archived
```

| Status      | Visibility                                                 |
| ----------- | ---------------------------------------------------------- |
| `draft`     | Not visible to visitors. Use for work-in-progress.         |
| `published` | Visible when `published_at <= now()`. Set date to go live. |
| `archived`  | Hidden from visitors. Preserved in database.               |

## Creating a New Content Page

1. Go to **Table Editor** > `content_pages`
2. Click **Insert row**
3. Fill in required fields:

| Field           | Required        | Example                             |
| --------------- | --------------- | ----------------------------------- |
| `slug`          | Yes             | `best-running-shoes-2026`           |
| `title`         | Yes             | `Best Running Shoes of 2026`        |
| `type`          | Yes             | `guide`, `comparison`, or `review`  |
| `body_markdown` | Yes             | Markdown content (see syntax below) |
| `author`        | Yes             | `Maison Emile Editorial`            |
| `status`        | Yes             | Start with `draft`                  |
| `published_at`  | When publishing | `2026-03-20T12:00:00Z` (ISO 8601)   |

4. Set `status` to `draft` while editing
5. When ready: set `status` to `published` and `published_at` to the desired publication date/time
6. To schedule: set `published_at` to a future date — content appears automatically when the time comes

## Slug Format

Slugs must follow the format: **lowercase letters, numbers, and hyphens only**.

- **Valid:** `best-running-shoes-2026`, `shoe-care-101`, `top10-picks`
- **Invalid:** `Best Running Shoes` (spaces, uppercase), `-leading-hyphen` (leading hyphen), `trailing-` (trailing hyphen)

A database constraint enforces this format. Invalid slugs will be rejected.

## Markdown Syntax

The `body_markdown` field supports standard Markdown:

```markdown
## Heading 2

### Heading 3

**Bold text** and _italic text_

- Bullet list item
- Another item

1. Numbered list
2. Another item

> Blockquote for pull quotes

`inline code`

[Link text](https://example.com)
![Image alt](https://example.com/image.jpg)
```

## Embedding Products

To embed a product card within your article, use the product embed syntax:

```
{{product:VIOLET_OFFER_ID}}
```

This renders as an interactive product card showing the product image, name, price, and a "View Product" link. The product data is fetched live from the Violet.io API.

**Finding Violet Offer IDs:**

- Product IDs come from the Violet.io merchant catalog
- Each product in the database has an `external_id` field that maps to the Violet offer ID
- Contact the development team if you need help finding specific offer IDs

**Example:**

```markdown
## Our Top Pick

The CloudStride Pro delivers exceptional performance.

{{product:abc123-offer-id}}

As you can see above, the cushioning is remarkable...
```

## Internal Linking

Link to other pages on the site using relative URLs:

```markdown
<!-- Link to a product page -->

Check out the [CloudStride Pro](/products/abc123)

<!-- Link to another content page -->

Read our [shoe care guide](/content/shoe-care-101)
```

- Links to external sites automatically open in a new tab
- Internal links stay within the site

## Related Content

To show related articles at the bottom of your page, use the `related_slugs` field.

**In Supabase Studio**, enter as a Postgres array:

```
{best-value-shoes,shoe-care-guide,running-tips-2026}
```

Each slug must match an existing published content page. Invalid or unpublished slugs are silently skipped.

## Featured Content

Use the `sort_order` field to control positioning in the content listing page:

| Value  | Effect                                              |
| ------ | --------------------------------------------------- |
| `0`    | Default — sorted by publication date (newest first) |
| `100+` | Featured — appears before chronological content     |

Higher values appear first. Within the same `sort_order`, items are sorted by `published_at` descending.

## SEO Fields

| Field                | Purpose                                  | Fallback                      |
| -------------------- | ---------------------------------------- | ----------------------------- |
| `seo_title`          | Custom `<title>` for search engines      | Falls back to `title`         |
| `seo_description`    | Custom meta description                  | Falls back to first 160 chars |
| `featured_image_url` | Hero image and social preview (og:image) | No image shown                |

**Tips:**

- Keep `seo_title` under 60 characters
- Keep `seo_description` between 120-160 characters
- Use high-quality images (minimum 1200x630px for social previews)

## Tags

The `tags` field allows categorization for future use. Enter as a Postgres array:

```
{running,shoes,guide,2026}
```

Tags are not displayed on the frontend for MVP but are stored for future filtering functionality.

## Common Mistakes

| Mistake                                              | Consequence                      | Fix                                              |
| ---------------------------------------------------- | -------------------------------- | ------------------------------------------------ |
| Setting status to `published` without `published_at` | Database rejects the row         | Always set `published_at` when publishing        |
| Slug with spaces or uppercase                        | Database rejects the row         | Use only `a-z`, `0-9`, and `-`                   |
| Empty title                                          | Database rejects the row         | Title must have at least one non-space character |
| Relative image URLs                                  | Images won't load                | Use full URLs (https://...)                      |
| Missing `{{product:ID}}` closing braces              | Embed syntax shown as plain text | Ensure `{{product:EXACT_ID}}` format             |

## Future Improvements

A custom admin content editor with Markdown preview, image upload, and draft preview functionality may replace Supabase Studio in a future iteration. The current approach prioritizes shipping quickly while the database schema is designed to support a richer admin experience later.
