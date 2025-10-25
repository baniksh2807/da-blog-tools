const { writeFileSync, mkdirSync } = require('fs');
const path = require('path');

// Repo root (one level up from tools/)
const REPO_ROOT = path.resolve(__dirname, '..');

// Configuration
const SITE_ORIGIN = 'https://opensource.microsoft.com';
const INDEX_URL = 'https://main--msoc-adobe-eds--marketing-and-consumer-business.aem.live/en-us/opensource/blog/query-index.json';
const DEST_FILE = path.join(REPO_ROOT, 'en-us/opensource/blog/sitemap.xml');

// Ensure the destination directory exists
mkdirSync(path.dirname(DEST_FILE), { recursive: true });

// Normalize blog paths: /en-us/opensource/blog/... → /blog/...
function normalizePath(p) {
  return p.replace(/^\/en-us\/opensource\/blog/, '/blog');
}

// Convert UNIX timestamp to YYYY-MM-DD
function formatLastMod(timestamp) {
  return timestamp ? new Date(timestamp * 1000).toISOString().split('T')[0] : '';
}

// Build sitemap XML
function buildSitemap(entries) {
  const xmlItems = entries
    .map((entry) => {
      const loc = `${SITE_ORIGIN}${normalizePath(entry.path)}`;
      const lastmod = entry.lastModified ? `\n    <lastmod>${formatLastMod(entry.lastModified)}</lastmod>` : '';
      return `  <url>\n    <loc>${loc}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmlItems}\n</urlset>\n`;
}

// Main generator
async function generateSitemap() {
  console.log('Fetching query index...');
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`Failed to fetch ${INDEX_URL}: ${res.status}`);

  const dataJson = await res.json();
  if (!dataJson.data) return console.warn('⚠️ query-index.json does not contain "data" array');

  console.log(`Fetched ${dataJson.data.length} entries`);

  const xml = buildSitemap(dataJson.data);
  writeFileSync(DEST_FILE, xml, 'utf-8');
  console.log(`✅ Sitemap generated at ${DEST_FILE}`);
}

generateSitemap().catch((err) => console.error('❌ Error generating sitemap:', err));
