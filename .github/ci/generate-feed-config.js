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
          }
        ]
      }
    };
  }
  return constants;
}

const formatValues = (configs) => {
  if (!configs || !Array.isArray(configs)) {
    console.error('Invalid configs format:', configs);
    return [];
  }
  
  return configs.map((config, index) => ({
    id: `feed-${index}`,
    endpoint: config.ENDPOINT,
    feedInfoEndpoint: config.FEED_INFO_ENDPOINT,
    targetDirectory: config.TARGET_DIRECTORY,
    limit: parseInt(config.LIMIT) || 1000,
    // Keep original format for compatibility
    ENDPOINT: config.ENDPOINT,
    FEED_INFO_ENDPOINT: config.FEED_INFO_ENDPOINT,
    TARGET_DIRECTORY: config.TARGET_DIRECTORY,
    LIMIT: config.LIMIT
  }));
};

const constantsResponse = await getConstantValues();
const NEWS_FEED_CONFIGS = formatValues(constantsResponse?.blogsFeedConfig?.data);

export default NEWS_FEED_CONFIGS;