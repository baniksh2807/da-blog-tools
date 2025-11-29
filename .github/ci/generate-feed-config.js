async function getConstantValues() {
  const baseUrl = process.env.SITE_URL || 'https://main--da-blog-tools--baniksh2807.aem.live';
  const url = `${baseUrl}/msonecloudblog/constants.json`;
  
  let constants;
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    constants = await response.json();
    
  } catch (error) {
    console.error('Error fetching constants file:', error);
    return {
      blogsFeedConfig: {
        data: [
          {
            "ENDPOINT": "https://main--da-blog-tools--baniksh2807.aem.live/en-us/microsoft-fabric/blog/query-index.json",
            "FEED_INFO_ENDPOINT": "https://main--da-blog-tools--baniksh2807.aem.live/en-us/microsoft-fabric/blog/feed-info.json",
            "TARGET_DIRECTORY": "en-us/microsoft-fabric/blog",
            "LIMIT": "1000"
          },
          {
            "ENDPOINT": "https://main--da-blog-tools--baniksh2807.aem.live/en-us/microsoft-fabric/blog/query-index.json",
            "FEED_INFO_ENDPOINT": "https://main--da-blog-tools--baniksh2807.aem.live/en-us/microsoft-fabric/blog/author/feed-info.json",
            "TARGET_DIRECTORY": "en-us/microsoft-fabric/blog/author",
            "LIMIT": "1000"
          },
          {
            "ENDPOINT": "https://main--da-blog-tools--baniksh2807.aem.live/en-us/microsoft-fabric/blog/query-index.json",
            "FEED_INFO_ENDPOINT": "https://main--da-blog-tools--baniksh2807.aem.live/en-us/microsoft-fabric/blog/content-type/feed-info.json",
            "TARGET_DIRECTORY": "en-us/microsoft-fabric/blog/content-type",
            "LIMIT": "1000"
          }
        ]
      }
    };
  }
  return constants;
}

/**
 * Detect feed type from FEED_INFO_ENDPOINT URL
 * Extracts the segment between /blog/ and /feed-info.json
 * Examples:
 *   /blog/feed-info.json -> 'main'
 *   /blog/author/feed-info.json -> 'author'
 *   /blog/content-type/feed-info.json -> 'content-type'
 *   /blog/tag/feed-info.json -> 'tag'
 *   /blog/custom-type/feed-info.json -> 'custom-type'
 * @param {string} feedInfoEndpoint - Feed info endpoint URL
 * @returns {string} Feed type extracted from URL
 */
function detectFeedType(feedInfoEndpoint) {
  if (!feedInfoEndpoint) return 'main';
  
  try {
    const urlObj = new URL(feedInfoEndpoint);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const blogIndex = pathParts.findIndex(part => part === 'blog');
    
    if (blogIndex !== -1 && blogIndex < pathParts.length - 1) {
      const typeSegment = pathParts[blogIndex + 1];
      if (typeSegment && typeSegment !== 'feed-info.json') {
        return typeSegment;
      }
    }
    
    return 'main';
  } catch (error) {
    console.warn('Error detecting feed type from URL:', error.message);
    return 'main';
  }
}

/**
 * Parse metadata field to extract taxonomy pattern and values
 * Handles multiple formats:
 * - "taxonomy=value1,value2,value3"
 * - "content-type:industry-trends,content-type:announcements"
 * - "author=name1,name2"
 * @param {string} metadataString - Raw metadata string
 * @param {string} feedType - Type of feed (content-type, author, tag, etc.)
 * @returns {Object} { pattern: string, values: Array<string> }
 */
function parseMetadataField(metadataString, feedType) {
  if (!metadataString) {
    return { pattern: null, values: [] };
  }

  // Try to match pattern: "taxonomy=value1,value2" or similar
  const simplePattern = new RegExp(`${feedType}\\s*=\\s*([^\\n]+)`, 'i');
  const simpleMatch = metadataString.match(simplePattern);
  
  if (simpleMatch) {
    const values = simpleMatch[1]
      .split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0);
    return { pattern: feedType, values };
  }

  // Try to match pattern with prefix: "content-type:value1,content-type:value2"
  const prefixedPattern = new RegExp(`${feedType}:([\\w\\-]+)`, 'g');
  const prefixedMatches = [...metadataString.matchAll(prefixedPattern)];
  
  if (prefixedMatches.length > 0) {
    const values = prefixedMatches
      .map(match => match[1])
      .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates
    return { pattern: `${feedType}:value`, values };
  }

  // Fallback: split by comma and assume all are values
  const values = metadataString
    .split(',')
    .map(v => v.trim())
    .filter(v => v.length > 0 && !v.includes('='));
  
  return { pattern: feedType, values };
}

/**
 * Extract field name to check in post objects
 * Maps feed type to post field name
 * Supports custom types automatically
 * @param {string} feedType - Type of feed
 * @returns {string} Field name to check in posts
 */
function getPostFieldName(feedType) {
  const fieldMappings = {
    'author': 'author',
    'content-type': 'taxonomy',
    'tag': 'tags',
    'category': 'category',
    'skill': 'skills',
    'topic': 'topics',
    'product': 'products',
    'level': 'level',
    'industry': 'industry',
  };
  
  // Return mapped field name or use feedType as fallback
  return fieldMappings[feedType] || feedType;
}

/**
 * Format and validate feed configuration
 * @param {Array<Object>} configs - Raw configuration array
 * @returns {Array<Object>} Formatted configuration objects
 */
const formatValues = (configs) => {
  if (!configs || !Array.isArray(configs)) {
    console.error('Invalid configs format:', configs);
    return [];
  }
  
  return configs.map((config, index) => {
    const feedInfoEndpoint = config.FEED_INFO_ENDPOINT || '';
    const feedType = detectFeedType(feedInfoEndpoint);
    const postFieldName = getPostFieldName(feedType);
    
    return {
      id: `feed-${index}`,
      feedType,
      postFieldName,
      endpoint: config.ENDPOINT,
      feedInfoEndpoint,
      targetDirectory: config.TARGET_DIRECTORY,
      limit: parseInt(config.LIMIT) || 1000,
      ENDPOINT: config.ENDPOINT,
      FEED_INFO_ENDPOINT: config.FEED_INFO_ENDPOINT,
      TARGET_DIRECTORY: config.TARGET_DIRECTORY,
      LIMIT: config.LIMIT
    };
  });
};

const constantsResponse = await getConstantValues();
const NEWS_FEED_CONFIGS = formatValues(constantsResponse?.blogsFeedConfig?.data);

console.log(`\n=== Feed Configurations Loaded ===`);
console.log(`Total: ${NEWS_FEED_CONFIGS.length} configuration(s)\n`);
NEWS_FEED_CONFIGS.forEach((config, index) => {
  console.log(`${index + 1}. [${config.feedType}] ${config.targetDirectory}`);
  console.log(`   Post Field: ${config.postFieldName}`);
  console.log(`   Limit: ${config.limit}`);
  console.log(`   Feed Info: ${config.feedInfoEndpoint}\n`);
});

export default NEWS_FEED_CONFIGS;
export { detectFeedType, parseMetadataField, getPostFieldName };