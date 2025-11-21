import { Feed } from 'feed';
import fs from 'fs';
import path from 'path';

async function main() {
  
  async function getConfigs() {
    let feedConfigurations = [];
    try {
      // Fix: Use relative import path and get default export
      const configModule = await import('./generate-news-feed-config.js');
      const configs = configModule.default; // Get the exported configs array
      
      if (Array.isArray(configs)) {
        feedConfigurations = configs;
      } else {
        console.error('Configs is not an array:', configs);
        // Fallback to single config if not array
        feedConfigurations = [configs];
      }
    } catch (error) {
      console.error('Error importing configs:', error);
      // Fallback configuration
      feedConfigurations = [{
        endpoint: "https://main--da-blog-tools--baniksh2807.aem.live/en-us/microsoft-fabric/blog/query-index.json",
        feedInfoEndpoint: "https://main--da-blog-tools--baniksh2807.aem.live/en-us/microsoft-fabric/blog/feed-info.json",
        targetDirectory: "en-us/microsoft-fabric/blog",
        limit: 1000
      }];
    }
    return feedConfigurations;
  }

  // Get all feed configurations
  const feedConfigs = await getConfigs();
  console.log(`Found ${feedConfigs.length} feed configuration(s)`);

  // Process each feed configuration
  for (let i = 0; i < feedConfigs.length; i++) {
    const config = feedConfigs[i];
    console.log(`\n=== Processing Feed ${i + 1}/${feedConfigs.length} ===`);
    console.log(`Target: ${config.targetDirectory || config.TARGET_DIRECTORY}`);
    
    try {
      await generateSingleFeed(config);
      console.log(`✅ Successfully generated feed ${i + 1}`);
    } catch (error) {
      console.error(`❌ Error generating feed ${i + 1}:`, error);
      // Continue with next feed even if this one fails
    }
  }
  
  console.log('\n🎉 Feed generation completed!');
}

async function generateSingleFeed(config) {
  // Extract config values (support both formats)
  const ENDPOINT = config.endpoint || config.ENDPOINT;
  const FEED_INFO_ENDPOINT = config.feedInfoEndpoint || config.FEED_INFO_ENDPOINT;
  const TARGET_DIRECTORY = (config.targetDirectory || config.TARGET_DIRECTORY).replace(/^\//, ''); // Remove leading slash
  const LIMIT = Number(config.limit || config.LIMIT || 1000);

  // Fix: Create path relative to repository root (go up 2 levels from .github/ci/)
  const REPO_ROOT = path.resolve(process.cwd(), '../../');
  const TARGET_PATH = path.join(REPO_ROOT, TARGET_DIRECTORY);
  const TARGET_FILE = path.join(TARGET_PATH, 'feed.xml');

  console.log(`📡 Fetching posts from: ${ENDPOINT}`);
  console.log(`ℹ️ Fetching metadata from: ${FEED_INFO_ENDPOINT}`);
  console.log(`📁 Target directory: ${TARGET_PATH}`);
  console.log(`📄 Target file: ${TARGET_FILE}`);
  console.log(`🔢 Post limit: ${LIMIT}`);

  // Fetch blog posts
  const allPosts = await fetchBlogPosts(ENDPOINT, LIMIT);
  console.log(`📊 Found ${allPosts.length} posts from endpoint`);

  if (allPosts.length === 0) {
    console.warn('⚠️ No posts found, skipping feed generation');
    return;
  }

  // NEW: Filter posts by target directory path
  const pathFilteredPosts = filterPostsByPath(allPosts, TARGET_DIRECTORY);
  console.log(`🔍 Posts after path filtering: ${pathFilteredPosts.length}`);

  if (pathFilteredPosts.length === 0) {
    console.warn(`⚠️ No posts found matching path "${TARGET_DIRECTORY}", skipping feed generation`);
    return;
  }

  // Fetch feed metadata
  const feedMetadata = await fetchBlogMetadata(FEED_INFO_ENDPOINT);
  console.log(`📰 Feed title: ${feedMetadata.title}`);

  // Fix: Validate and sanitize post dates
  const validPosts = pathFilteredPosts.filter(post => {
    const publishDate = post.publishDate || post.lastModified || post.date;
    
    if (!publishDate) {
      console.warn(`⚠️ Post "${post.title}" has no date, skipping`);
      return false;
    }
    
    // Convert to number if it's a string
    const timestamp = typeof publishDate === 'string' ? parseInt(publishDate) : publishDate;
    
    // Check if it's a valid timestamp (should be > 0 and reasonable)
    if (!timestamp || timestamp <= 0 || timestamp > Date.now() / 1000 + 86400) {
      console.warn(`⚠️ Post "${post.title}" has invalid date: ${publishDate}, skipping`);
      return false;
    }
    
    // Add sanitized date back to post
    post.validDate = new Date(timestamp * 1000);
    
    // Verify the date is valid
    if (isNaN(post.validDate.getTime())) {
      console.warn(`⚠️ Post "${post.title}" date conversion failed: ${publishDate}, skipping`);
      return false;
    }
    
    return true;
  });

  console.log(`✅ Valid posts after date filtering: ${validPosts.length}`);

  if (validPosts.length === 0) {
    console.warn('⚠️ No posts with valid dates found, skipping feed generation');
    return;
  }

  // Sort posts by date (newest first)
  validPosts.sort((a, b) => b.validDate - a.validDate);
  console.log(`📅 Posts sorted by date, newest: ${validPosts[0].title} (${validPosts[0].validDate.toISOString()})`);

  // Find newest post date from valid posts
  const newestPost = validPosts[0].validDate;

  // Create feed
  const feed = new Feed({
    title: feedMetadata.title,
    description: feedMetadata.description,
    id: feedMetadata.link,
    link: feedMetadata.link,
    updated: newestPost,
    generator: 'AEM News feed generator (GitHub action)',
    language: feedMetadata.lang || 'en-us',
  });

  // Add valid posts to feed
  console.log(`📝 Adding ${validPosts.length} posts to feed...`);
  validPosts.forEach((post, index) => {
    const link = feedMetadata['site-domain'] + post.path;
    
    try {
      feed.addItem({
        title: post.title || `Untitled Post ${index + 1}`,
        id: link,
        link,
        content: post.content || '',
        date: post.validDate,
        published: post.validDate,
      });
      
      if (index < 3) { // Log first 3 posts for debugging
        console.log(`   📄 Added post: ${post.title} (${post.validDate.toISOString()})`);
      }
    } catch (error) {
      console.error(`❌ Error adding post "${post.title}":`, error.message);
    }
  });

  // Create directory if it doesn't exist (in repository root)
  if (!fs.existsSync(TARGET_PATH)) {
    console.log(`📁 Creating directory: ${TARGET_PATH}`);
    fs.mkdirSync(TARGET_PATH, { recursive: true });
  }

  // Write feed file
  try {
    console.log(`💾 Writing feed to: ${TARGET_FILE}`);
    const feedContent = feed.atom1();
    fs.writeFileSync(TARGET_FILE, feedContent);
    
    const fileSize = fs.statSync(TARGET_FILE).size;
    console.log(`✅ Feed written successfully (${fileSize} bytes)`);
  } catch (error) {
    console.error(`❌ Error writing feed file:`, error.message);
    throw error;
  }
}

// NEW: Function to filter posts by target directory path
function filterPostsByPath(posts, targetDirectory) {
  if (!posts || !Array.isArray(posts)) {
    console.warn('⚠️ Invalid posts array for path filtering');
    return [];
  }

  // Normalize target directory for comparison
  const normalizedTargetDir = targetDirectory.toLowerCase().replace(/^\/+|\/+$/g, '');
  
  console.log(`🔍 Filtering posts for target directory: "${normalizedTargetDir}"`);
  
  const filteredPosts = posts.filter(post => {
    if (!post.path) {
      console.warn(`⚠️ Post "${post.title}" has no path, skipping`);
      return false;
    }

    // Normalize post path for comparison
    const normalizedPostPath = post.path.toLowerCase().replace(/^\/+/, '');
    
    // Check if post path starts with target directory
    const pathMatches = normalizedPostPath.startsWith(normalizedTargetDir);
    
    if (pathMatches) {
      console.log(`   ✅ Including: ${post.path} (matches ${normalizedTargetDir})`);
    } else {
      console.log(`   ❌ Excluding: ${post.path} (doesn't match ${normalizedTargetDir})`);
    }
    
    return pathMatches;
  });

  console.log(`🎯 Path filtering results: ${filteredPosts.length}/${posts.length} posts match`);
  
  if (filteredPosts.length > 0) {
    console.log('📋 Sample matched paths:');
    filteredPosts.slice(0, 5).forEach((post, index) => {
      console.log(`   ${index + 1}. ${post.path}`);
    });
  }
  
  return filteredPosts;
}

async function fetchBlogPosts(endpoint, limit) {
  let offset = 0;
  const allPosts = [];

  console.log(`📡 Starting to fetch posts with limit: ${limit}`);

  while (true) {
    const api = new URL(endpoint);
    api.searchParams.append('offset', JSON.stringify(offset));
    
    console.log(`🔄 Fetching batch at offset: ${offset}`);
    
    try {
      const response = await fetch(api);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();

      if (!result.data || !Array.isArray(result.data)) {
        console.warn('⚠️ No data array found in response');
        break;
      }

      // Log sample post structure for debugging
      if (result.data.length > 0 && allPosts.length === 0) {
        console.log('📋 Sample post structure:', JSON.stringify(result.data[0], null, 2));
      }

      allPosts.push(...result.data);
      console.log(`✅ Fetched ${result.data.length} posts, total so far: ${allPosts.length}`);

      // Apply limit check
      if (allPosts.length >= limit) {
        console.log(`🔢 Reached limit of ${limit} posts`);
        return allPosts.slice(0, limit);
      }

      // Check if there are more pages
      if (result.offset + result.limit < result.total) {
        offset = result.offset + result.limit;
      } else {
        console.log('✅ No more pages available');
        break;
      }
    } catch (error) {
      console.error('❌ Error fetching posts:', error);
      break;
    }
  }

  return allPosts.slice(0, limit);
}

async function fetchBlogMetadata(infoEndpoint) {
  console.log(`ℹ️ Fetching metadata from: ${infoEndpoint}`);
  
  try {
    const infoResponse = await fetch(infoEndpoint);
    
    if (!infoResponse.ok) {
      throw new Error(`HTTP ${infoResponse.status}: ${infoResponse.statusText}`);
    }
    
    const feedInfoResult = await infoResponse.json();
    
    if (!feedInfoResult.data || !feedInfoResult.data[0]) {
      throw new Error('No metadata found in response');
    }
    
    const metadata = feedInfoResult.data[0];
    console.log(`✅ Metadata loaded: ${metadata.title}`);
    return metadata;
    
  } catch (error) {
    console.error('❌ Error fetching metadata, using fallback:', error);
    
    // Return fallback metadata
    const fallbackMetadata = {
      title: 'Blog Feed',
      description: 'Latest blog posts',
      link: 'https://example.com',
      'site-root': 'https://main--da-blog-tools--baniksh2807.aem.live',
      lang: 'en-us'
    };
    
    console.log('🔄 Using fallback metadata:', fallbackMetadata);
    return fallbackMetadata;
  }
}

main().catch((e) => {
  console.error('💥 Fatal error:', e);
  process.exit(1);
});