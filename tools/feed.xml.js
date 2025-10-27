// tools/feed.xml.js
// Enhanced: Supports both path-based and query-parameter-based RSS generation

export async function onRequest(context) {
  const siteUrl = 'https://main--msoc-adobe-eds--marketing-and-consumer-business.aem.live'; // replace <repo>/<org> accordingly
  const requestUrl = new URL(context.request.url);
  const pathname = requestUrl.pathname;

  // --- Extract query parameters (if provided)
  const siteParam = requestUrl.searchParams.get('site');
  const localeParam = requestUrl.searchParams.get('locale');
  const sectionParam = requestUrl.searchParams.get('section'); // e.g., blog/content-type/news

  // --- Extract from URL path (if no params provided)
  const pathParts = pathname.split('/').filter(Boolean); // e.g. ['en-us', 'microsoft-fabric', 'blog', 'content-type', 'news', 'tools', 'feed.xml']

  // Determine locale and site
  const locale = localeParam || pathParts[0] || 'en-us';
  const site = siteParam || pathParts[1] || 'opensource';

  // Determine section/content path
  let contentPath = sectionParam || '';
  if (!sectionParam) {
    const toolsIndex = pathParts.indexOf('tools');
    if (toolsIndex > 2) {
      contentPath = pathParts.slice(2, toolsIndex).join('/');
    }
  }

  // Construct the query index URL for this site
  const queryIndexUrl = `${siteUrl}/${locale}/${site}/query-index.json`;

  console.log(`[Feed] Generating RSS for: ${locale}/${site}/${contentPath || '(root)'}`);

  try {
    const res = await fetch(queryIndexUrl);
    if (!res.ok) {
      return new Response(
        `Failed to fetch index for ${site}: ${res.status} ${res.statusText}`,
        { status: 500 }
      );
    }

    const { data } = await res.json();

    // --- Filter data based on content path (if specified)
    const matchingItems = contentPath
      ? data.filter(item => item.path.includes(`/${site}/${contentPath}/`))
      : data;

    if (matchingItems.length === 0) {
      return new Response(`No matching content found for ${site}/${contentPath}`, { status: 404 });
    }

    // Sort by lastModified (descending)
    matchingItems.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    // --- Build RSS items
    const items = matchingItems.map(item => `
      <item>
        <title><![CDATA[${item.title || 'Untitled'}]]></title>
        <link>${siteUrl}${item.path}</link>
        <description><![CDATA[${item.description || ''}]]></description>
        <pubDate>${new Date(item.lastModified).toUTCString()}</pubDate>
      </item>
    `).join('');

    // --- Build RSS XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${site.replace('-', ' ').toUpperCase()} Feed - ${contentPath || 'All Posts'}</title>
    <link>${siteUrl}/${locale}/${site}/${contentPath}</link>
    <description>Latest posts from ${site}/${contentPath || ''}</description>
    <language>${locale}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

    // --- Return response
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'max-age=3600, stale-while-revalidate=300'
      }
    });

  } catch (err) {
    return new Response(`Error generating feed: ${err.message}`, { status: 500 });
  }
}
