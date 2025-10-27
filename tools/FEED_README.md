# RSS Feed Generator

Client-side RSS feed generator for AEM Edge Delivery sites.

## 🚀 Usage

### Access the Feed Generator

Navigate to:
```
https://main--da-blog-tools--baniksh2807.aem.live/tools/feed
```

### Generate Feed with URL Parameters

**Basic feed (all content):**
```
https://main--da-blog-tools--baniksh2807.aem.live/tools/feed?site=opensource&locale=en-us
```

**Section-specific feed:**
```
https://main--da-blog-tools--baniksh2807.aem.live/tools/feed?site=opensource&locale=en-us&section=blog
```

**Nested section feed:**
```
https://main--da-blog-tools--baniksh2807.aem.live/tools/feed?site=opensource&locale=en-us&section=blog/news
```

## 📋 Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `site` | Yes | Site name from your content structure | `opensource` |
| `locale` | Yes | Locale/language code | `en-us` |
| `section` | No | Specific section to filter | `blog` or `blog/news` |

## 🎯 How It Works

1. **Fetches Query Index**: Retrieves `query-index.json` from your site
2. **Filters Content**: Optionally filters by section path
3. **Sorts by Date**: Orders by `lastModified` (newest first)
4. **Limits Items**: Returns up to 50 most recent items
5. **Generates RSS**: Creates valid RSS 2.0 XML
6. **Displays & Download**: Shows XML and provides download link

## 📦 Output Format

The generator produces valid RSS 2.0 XML with:

- ✅ Channel metadata (title, link, description)
- ✅ Atom self-reference link
- ✅ Items with title, link, GUID, description
- ✅ Publication dates
- ✅ Image enclosures (if available)
- ✅ Author information (if available)
- ✅ Categories (if available)

## 🔧 Requirements

Your site must have:
- A `query-index.json` file at `/{locale}/{site}/query-index.json`
- Content items with standard metadata (title, description, lastModified)

## 💡 Example Query Index Structure

```json
{
  "total": 150,
  "offset": 0,
  "limit": 500,
  "data": [
    {
      "path": "/en-us/opensource/blog/post-1",
      "title": "My Blog Post",
      "description": "A great article",
      "lastModified": 1698364800,
      "image": "/media/image.jpg",
      "author": "John Doe",
      "category": "Technology"
    }
  ]
}
```

## 🐛 Troubleshooting

### "Failed to fetch query index" Error

**Cause**: Query index doesn't exist at the expected URL

**Solution**: 
- Verify your site structure: `/{locale}/{site}/query-index.json`
- Check that the query index is published
- Ensure locale and site names are correct

### "No content found" Error

**Cause**: No items match the specified section filter

**Solution**:
- Check the section path is correct
- Try without the section parameter first
- Verify content paths in query-index.json

### "Invalid query index format" Error

**Cause**: Query index doesn't have expected structure

**Solution**:
- Ensure query index has a `data` array
- Check JSON format is valid

## 📝 Notes

- Feed is generated client-side in the browser
- Maximum 50 items per feed (most recent)
- Content is fetched from the published query-index.json
- No server-side processing required
- XML is displayed in browser and available for download

## 🔗 Related Files

- [`feed.html`](feed.html) - Main feed generator page
- [`feed.xml.js`](feed.xml.js) - Legacy Cloudflare Workers version (not used)
