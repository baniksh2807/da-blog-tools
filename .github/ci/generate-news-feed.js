import { Feed } from 'feed';
import fs from 'fs';

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
      console.log(` Successfully generated feed ${i + 1}`);
    } catch (error) {
      console.error(` Error generating feed ${i + 1}:`, error);
      // Continue with next feed even if this one fails
    }
  }
  
  console.log('\n Feed generation completed!');
}

async function fetchBlogPosts(endpoint, limit) {
  let offset = 0;
  const allPosts = [];

  while (true) {
    const api = new URL(endpoint);
    api.searchParams.append('offset', JSON.stringify(offset));
    //api.searchParams.append('limit', limit);
    const response = await fetch(api, {});
    const result = await response.json();

    allPosts.push(...result.data);

    if (result.offset + result.limit < result.total) {
      // there are more pages
      offset = result.offset + result.limit;
    } else {
      break;
    }
  }
  return allPosts;
}

async function generateSingleFeed(config) {
  // Extract config values (support both formats)
  const ENDPOINT = config.endpoint || config.ENDPOINT;
  const FEED_INFO_ENDPOINT = config.feedInfoEndpoint || config.FEED_INFO_ENDPOINT;
  const TARGET_DIRECTORY = (config.targetDirectory || config.TARGET_DIRECTORY).replace(/^\//, ''); // Remove leading slash
  const LIMIT = Number(config.limit || config.LIMIT || 1000);

  const TARGET_FILE = `${TARGET_DIRECTORY}/feed.xml`;

  console.log(`Fetching posts from: ${ENDPOINT}`);
  console.log(`Fetching metadata from: ${FEED_INFO_ENDPOINT}`);
  console.log(`Target file: ${TARGET_FILE}`);
  console.log(`Post limit: ${LIMIT}`);

  // Fetch blog posts
  const allPosts = await fetchBlogPosts(ENDPOINT, LIMIT);
  console.log(`Found ${allPosts.length} posts`);

  if (allPosts.length === 0) {
    console.warn('No posts found, skipping feed generation');
    return;
  }

  // Fetch feed metadata
  const feedMetadata = await fetchBlogMetadata(FEED_INFO_ENDPOINT);
  console.log(`Feed title: ${feedMetadata.title}`);

  // Find newest post date
  const newestPost = allPosts
    .map((post) => new Date(post.publishDate * 1000))
    .reduce((maxDate, date) => (date > maxDate ? date : maxDate), new Date(0));

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

  // Add posts to feed
  allPosts.forEach((post) => {
    const link = feedMetadata['site-root'] + post.path;
    feed.addItem({
      title: post.title,
      id: link,
      link,
      content: post.description,
      date: new Date(post.publishDate * 1000),
      published: new Date(post.publishDate * 1000),
    });
  });

  // Create directory if it doesn't exist
  if (!fs.existsSync(TARGET_DIRECTORY)) {
    console.log(`Creating directory: ${TARGET_DIRECTORY}`);
    fs.mkdirSync(TARGET_DIRECTORY, { recursive: true });
  }

  // Write feed file
  fs.writeFileSync(TARGET_FILE, feed.atom1());
  console.log(`Wrote feed to: ${TARGET_FILE}`);
}

async function fetchBlogPosts(endpoint, limit) {
  let offset = 0;
  const allPosts = [];

  console.log(`Starting to fetch posts with limit: ${limit}`);

  while (true) {
    const api = new URL(endpoint);
    api.searchParams.append('offset', JSON.stringify(offset));
    
    console.log(`Fetching batch at offset: ${offset}`);
    
    try {
      const response = await fetch(api);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();

      if (!result.data || !Array.isArray(result.data)) {
        console.warn('No data array found in response');
        break;
      }

      allPosts.push(...result.data);
      console.log(`Fetched ${result.data.length} posts, total so far: ${allPosts.length}`);

      // Apply limit check
      if (allPosts.length >= limit) {
        console.log(`Reached limit of ${limit} posts`);
        return allPosts.slice(0, limit);
      }

      // Check if there are more pages
      if (result.offset + result.limit < result.total) {
        offset = result.offset + result.limit;
      } else {
        console.log('No more pages available');
        break;
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      break;
    }
  }

  return allPosts.slice(0, limit);
}

async function fetchBlogMetadata(infoEndpoint) {
  console.log(`Fetching metadata from: ${infoEndpoint}`);
  
  try {
    const infoResponse = await fetch(infoEndpoint);
    
    if (!infoResponse.ok) {
      throw new Error(`HTTP ${infoResponse.status}: ${infoResponse.statusText}`);
    }
    
    const feedInfoResult = await infoResponse.json();
    
    if (!feedInfoResult.data || !feedInfoResult.data[0]) {
      throw new Error('No metadata found in response');
    }
    
    return feedInfoResult.data[0];
    
  } catch (error) {
    console.error('Error fetching metadata, using fallback:', error);
    
    // Return fallback metadata
    return {
      title: 'Blog Feed',
      description: 'Latest blog posts',
      link: 'https://example.com',
      'site-root': 'https://main--da-blog-tools--baniksh2807.aem.live',
      lang: 'en-us'
    };
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
