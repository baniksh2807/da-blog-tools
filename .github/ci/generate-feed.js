import { Feed } from 'feed';
import fs from 'fs';
import path from 'path';
import { parseMetadataField } from './generate-feed-config.js';

/**
 * Normalize taxonomy value for comparison
 * @param {string} value - Taxonomy value to normalize
 * @returns {string} Normalized value
 */
function normalizeTaxonomyValue(value) {
  return value.trim().toLowerCase();
}

/**
 * Convert taxonomy value to directory slug
 * @param {string} value - Taxonomy value
 * @returns {string} URL-safe directory slug
 */
function taxonomyToSlug(value) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Check if post contains a specific taxonomy value
 * Handles both simple values and prefixed values (e.g., "content-type:industry-trends")
 * @param {Object} post - Post object
 * @param {string} taxonomyValue - Taxonomy value to search for (without prefix)
 * @param {string} fieldName - Field name to check in post
 * @param {string} feedType - Type of feed (to construct search pattern if needed)
 * @returns {boolean} True if post contains the taxonomy value
 */
function postContainsTaxonomy(post, taxonomyValue, fieldName, feedType) {
  if (!post[fieldName]) {
    return false;
  }

  const normalizedSearchValue = normalizeTaxonomyValue(taxonomyValue);
  const postFieldValue = String(post[fieldName]);

  // Split the field value by commas to get individual taxonomy items
  const taxonomyItems = postFieldValue
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);

  // Check each taxonomy item
  for (const item of taxonomyItems) {
    const normalizedItem = normalizeTaxonomyValue(item);

    // For content-type, tag, category: check for prefixed pattern
    if (feedType === 'content-type' || feedType === 'tag' || feedType === 'category') {
      // Extract the value part after the prefix (e.g., "news" from "content-type:news")
      const prefixedPattern = `${feedType}:`;
      if (normalizedItem.startsWith(prefixedPattern)) {
        const itemValue = normalizedItem.substring(prefixedPattern.length);
        if (itemValue === normalizedSearchValue) {
          return true;
        }
      }
    } else {
      // For author and other types: direct match (case-insensitive)
      if (normalizedItem === normalizedSearchValue) {
        return true;
      }
    }
  }

  return false;
}

async function main() {
  async function getConfigs() {
    let feedConfigurations = [];
    try {
      const configModule = await import('./generate-feed-config.js');
      const configs = configModule.default;
      
      if (Array.isArray(configs)) {
        feedConfigurations = configs;
      } else {
        console.error('Configs is not an array:', configs);
        feedConfigurations = [configs];
      }
    } catch (error) {
      console.error('Error importing configs:', error);
      feedConfigurations = [{
        id: 'feed-0',
        feedType: 'main',
        postFieldName: 'type',
        endpoint: "https://main--da-blog-tools--baniksh2807.aem.live/en-us/microsoft-fabric/blog/query-index.json",
        feedInfoEndpoint: "https://main--da-blog-tools--baniksh2807.aem.live/en-us/microsoft-fabric/blog/feed-info.json",
        targetDirectory: "en-us/microsoft-fabric/blog",
        limit: 1000
      }];
    }
    return feedConfigurations;
  }

  const feedConfigs = await getConfigs();
  
  if (feedConfigs.length === 0) {
    console.error('No feed configurations found');
    process.exit(1);
  }

  console.log(`\n=== Feed Generation Started ===`);
  console.log(`Processing ${feedConfigs.length} configuration(s)\n`);

  for (let i = 0; i < feedConfigs.length; i++) {
    const config = feedConfigs[i];
    console.log(`\n>>> Configuration ${i + 1}/${feedConfigs.length}`);
    console.log(`    Type: ${config.feedType}`);
    console.log(`    Target: ${config.targetDirectory}`);
    
    try {
      await generateFeedsForConfig(config);
      console.log(`✓ Successfully generated feeds`);
    } catch (error) {
      console.error(`✗ Error:`, error.message);
    }
  }
  
  console.log('\n=== Feed Generation Completed ===\n');
}

/**
 * Generate feeds for a single configuration
 * Generates feeds for ALL articles (no path filtering), only taxonomies are filtered
 * @param {Object} config - Feed configuration object
 */
async function generateFeedsForConfig(config) {
  const ENDPOINT = config.endpoint || config.ENDPOINT;
  const FEED_INFO_ENDPOINT = config.feedInfoEndpoint || config.FEED_INFO_ENDPOINT;
  const TARGET_DIRECTORY = (config.targetDirectory || config.TARGET_DIRECTORY).replace(/^\//, '');
  const LIMIT = Number(config.limit || config.LIMIT || 1000);
  const FEED_TYPE = config.feedType || 'main';
  const POST_FIELD_NAME = config.postFieldName || FEED_TYPE;

  const REPO_ROOT = path.resolve(process.cwd(), '../../');
  const TARGET_PATH = path.join(REPO_ROOT, TARGET_DIRECTORY);

  console.log(`   Endpoint: ${ENDPOINT}`);
  console.log(`   Target Path: ${TARGET_PATH}`);
  console.log(`   Feed Type: ${FEED_TYPE}`);

  // Fetch blog posts
  const allPosts = await fetchBlogPosts(ENDPOINT, LIMIT);
  console.log(`   Found ${allPosts.length} total posts`);

  if (allPosts.length === 0) {
    console.warn('   ⚠ No posts found');
    return;
  }

  // Filter for articles only (NO PATH FILTERING - include all articles)
  const articles = allPosts.filter(post => 
    post.type && post.type.toLowerCase() === 'article'
  );
  console.log(`   Articles (type: Article): ${articles.length}`);

  if (articles.length === 0) {
    console.warn('   ⚠ No articles found');
    return;
  }

  // Fetch feed metadata
  const feedMetadata = await fetchBlogMetadata(FEED_INFO_ENDPOINT);
  console.log(`   Feed: ${feedMetadata.title}`);

  // Validate post dates
  const validPosts = validatePostDates(articles);
  console.log(`   Valid posts: ${validPosts.length}`);

  if (validPosts.length === 0) {
    console.warn('   ⚠ No posts with valid dates');
    return;
  }

  // Sort posts by date (newest first)
  validPosts.sort((a, b) => b.validDate - a.validDate);

  // Step 1: Generate main feed (all articles)
  console.log(`\n   [1/2] Generating main feed...`);
  await generateMainFeed(validPosts, feedMetadata, TARGET_PATH);

  // Step 2: Generate specialized feeds if not main type
  if (FEED_TYPE !== 'main') {
    console.log(`   [2/2] Generating ${FEED_TYPE}-specific feeds...`);
    
    // Parse metadata to extract taxonomy values
    const metadataString = feedMetadata.metadata || '';
    const { pattern, values } = parseMetadataField(metadataString, FEED_TYPE);

    if (values.length === 0) {
      console.warn(`   ⚠ No ${FEED_TYPE} values found in metadata`);
      console.log(`   [2/2] Main feed only`);
      return;
    }

    console.log(`   Found ${values.length} ${FEED_TYPE} value(s): ${values.join(', ')}`);

    await generateTaxonomySpecificFeeds(
      validPosts,
      feedMetadata,
      TARGET_PATH,
      FEED_TYPE,
      values,
      POST_FIELD_NAME
    );
  } else {
    console.log(`   [2/2] Main feed only (no taxonomy-specific feeds)`);
  }
}

/**
 * Generate taxonomy-specific feeds
 * Filters all articles based on taxonomy/author values
 * @param {Array<Object>} validPosts - Array of valid posts
 * @param {Object} feedMetadata - Feed metadata
 * @param {string} targetPath - Target directory path
 * @param {string} feedType - Type of feed (author, content-type, tag, etc.)
 * @param {Array<string>} taxonomyValues - Taxonomy values from metadata
 * @param {string} postFieldName - Field name in post object
 */
async function generateTaxonomySpecificFeeds(
  validPosts,
  feedMetadata,
  targetPath,
  feedType,
  taxonomyValues,
  postFieldName
) {
  let successCount = 0;
  let skipCount = 0;

  for (let valueIndex = 0; valueIndex < taxonomyValues.length; valueIndex++) {
    const taxonomyValue = taxonomyValues[valueIndex];
    
    // Filter posts that contain this taxonomy value (from ALL articles, not just path)
    const relatedPosts = validPosts.filter(post => 
      postContainsTaxonomy(post, taxonomyValue, postFieldName, feedType)
    );

    if (relatedPosts.length === 0) {
      console.log(`        ⊘ ${valueIndex + 1}. ${taxonomyValue}: no articles`);
      skipCount++;
      continue;
    }

    try {
      await generateTaxonomyFeed(
        taxonomyValue,
        relatedPosts,
        feedMetadata,
        targetPath,
        feedType
      );
      console.log(`        ✓ ${valueIndex + 1}. ${taxonomyValue}: ${relatedPosts.length} article(s)`);
      successCount++;
    } catch (error) {
      console.error(`        ✗ ${valueIndex + 1}. ${taxonomyValue}: ${error.message}`);
    }
  }

  console.log(`   Summary: ${successCount} feed(s) created, ${skipCount} skipped`);
}

/**
 * Generate a feed for a specific taxonomy value
 * @param {string} taxonomyValue - Taxonomy value
 * @param {Array<Object>} taxonomyPosts - Posts with this taxonomy value
 * @param {Object} feedMetadata - Feed metadata
 * @param {string} targetPath - Target directory path
 * @param {string} feedType - Type of feed
 */
async function generateTaxonomyFeed(
  taxonomyValue,
  taxonomyPosts,
  feedMetadata,
  targetPath,
  feedType
) {
  const valueSlug = taxonomyToSlug(taxonomyValue);
  const valueDir = path.join(targetPath, valueSlug);
  const valueFeedFile = path.join(valueDir, 'feed.xml');

  const newestDate = taxonomyPosts[0].validDate;

  const feedTitle = `${feedMetadata.title} - ${taxonomyValue}`;
  const feedDescription = `${feedMetadata.description || 'Articles'} - ${taxonomyValue}`;

  const feed = new Feed({
    title: feedTitle,
    description: feedDescription,
    id: `${feedMetadata.link}/${valueSlug}`,
    link: `${feedMetadata.link}/${valueSlug}`,
    updated: newestDate,
    generator: 'EDS feed generator (GitHub action)',
    language: feedMetadata.language || feedMetadata.lang || 'en-us',
  });

  

  // Add posts to feed
  taxonomyPosts.forEach((post, index) => {
    const link = feedMetadata['site-domain'] + post.path;

    try {
      feed.addItem({
        title: post.title || `Untitled Post ${index + 1}`,
        id: link,
        link,
        content: post.content || post.description || '',
        author: post.author ? [{ name: post.author }] : undefined,
        date: post.validDate,
        published: post.validDate,
      });
    } catch (error) {
      console.error(`Error adding post "${post.title}":`, error.message);
    }
  });

  // Create directory if needed
  if (!fs.existsSync(valueDir)) {
    fs.mkdirSync(valueDir, { recursive: true });
  }

  // Write feed file
  try {
    const feedContent = feed.atom1();
    fs.writeFileSync(valueFeedFile, feedContent);
    const fileSize = fs.statSync(valueFeedFile).size;
  } catch (error) {
    console.error(`Error writing feed file:`, error.message);
    throw error;
  }
}

/**
 * Generate the main feed for all posts
 * @param {Array<Object>} posts - Array of valid post objects
 * @param {Object} feedMetadata - Feed metadata
 * @param {string} targetPath - Target directory path
 */
async function generateMainFeed(posts, feedMetadata, targetPath) {
  const TARGET_FILE = path.join(targetPath, 'feed.xml');
  const newestPost = posts[0].validDate;

  const feed = new Feed({
    title: feedMetadata.title,
    description: feedMetadata.description,
    id: feedMetadata.link,
    link: feedMetadata.link,
    updated: newestPost,
    generator: 'EDS feed generator (GitHub action)',
    language: feedMetadata.language || feedMetadata.lang || 'en-us',
  });

  posts.forEach((post, index) => {
    const link = feedMetadata['site-domain'] + post.path;

    try {
      feed.addItem({
        title: post.title || `Untitled Post ${index + 1}`,
        id: link,
        link,
        content: post.content || post.description || '',
        author: post.author ? [{ name: post.author }] : undefined,
        date: post.validDate,
        published: post.validDate,
      });
    } catch (error) {
      console.error(`Error adding post "${post.title}":`, error.message);
    }
  });

  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  try {
    const feedContent = feed.atom1();
    fs.writeFileSync(TARGET_FILE, feedContent);
    const fileSize = fs.statSync(TARGET_FILE).size;
    console.log(`       ✓ Main feed: feed.xml (${fileSize} bytes, ${posts.length} posts)`);
  } catch (error) {
    console.error(`Error writing main feed:`, error.message);
    throw error;
  }
}

/**
 * Validate and sanitize post dates
 * @param {Array<Object>} posts - Array of post objects
 * @returns {Array<Object>} Array of posts with valid dates
 */
function validatePostDates(posts) {
  return posts
    .map(post => {
      const publishDate = post.publishDate || post.lastModified || post.date;
      if (!publishDate) return null;

      const timestamp = typeof publishDate === 'string' ? parseInt(publishDate) : publishDate;
      if (!timestamp || timestamp <= 0 || timestamp > Date.now() / 1000 + 86400) return null;

      const validDate = new Date(timestamp * 1000);
      if (isNaN(validDate.getTime())) return null;

      return { ...post, validDate };
    })
    .filter(post => post !== null);
}

/**
 * Fetch blog posts with pagination
 * @param {string} endpoint - API endpoint
 * @param {number} limit - Maximum posts to fetch
 * @returns {Promise<Array<Object>>} Array of posts
 */
async function fetchBlogPosts(endpoint, limit) {
  let offset = 0;
  const allPosts = [];

  while (true) {
    const api = new URL(endpoint);
    api.searchParams.append('offset', JSON.stringify(offset));

    try {
      const response = await fetch(api);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();
      if (!result.data || !Array.isArray(result.data)) break;

      allPosts.push(...result.data);
      if (allPosts.length >= limit) return allPosts.slice(0, limit);

      if (result.offset + result.limit < result.total) {
        offset = result.offset + result.limit;
      } else {
        break;
      }
    } catch (error) {
      console.error('Error fetching posts:', error.message);
      break;
    }
  }

  return allPosts.slice(0, limit);
}

/**
 * Fetch blog metadata from feed info endpoint
 * @param {string} infoEndpoint - Feed info endpoint
 * @returns {Promise<Object>} Metadata object
 */
async function fetchBlogMetadata(infoEndpoint) {
  try {
    const response = await fetch(infoEndpoint);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();
    if (!result.data || !result.data[0]) throw new Error('No metadata');

    return result.data[0];
  } catch (error) {
    console.error('Error fetching metadata:', error.message);
    return {
      title: 'Blog Feed',
      description: 'Latest blog posts',
      link: 'https://example.com',
      'site-domain': 'https://main--da-blog-tools--baniksh2807.aem.live',
      language: 'en-us',
      metadata: '',
    };
  }
}

main().catch((e) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});