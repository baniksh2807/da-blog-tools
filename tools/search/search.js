/* eslint-disable import/no-unresolved, no-restricted-globals, no-use-before-define, no-await-in-loop, no-plusplus, consistent-return, max-len, no-shadow, default-case, no-unused-vars, no-console */

/**
 * FindReplace Pro - Advanced Search & Replace Tool for DA Platform
 * Features: Text/Regex/HTML search, bulk operations, multi-path support
 */

import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { crawl } from 'https://da.live/nx/public/utils/tree.js';
import addAppAccessControl from '../access-control/access-control.js';

// CONFIGURATION - Easily configurable settings
const CONFIG = {
  RESULTS_PER_PAGE: 10, // Number of results to show per page
  MAX_PAGINATION_BUTTONS: 5, // Maximum number of page buttons to show
};

const app = {
  context: null,
  token: null,
  results: [],
  selectedFiles: new Set(),
  fileCache: new Map(),
  availablePaths: [],
  orgSiteCache: null, // Cache for org/site configuration
  searchPaths: [], // Array to store multiple search paths
  pagination: {
    currentPage: 1,
    totalPages: 1,
    filteredResults: null,
  },
};

// Global flag to prevent blur handler interference with autocomplete
let isSelectingFromAutocomplete = false;
let isInteractingWithTree = false;

const API = {
  LIST: 'https://admin.da.live/list',
  SOURCE: 'https://admin.da.live/source',
  VERSION_CREATE: 'https://admin.da.live/versionsource',
  VERSION_LIST: 'https://admin.da.live/versionlist',
  PREVIEW: 'https://admin.hlx.page/preview',
  LIVE: 'https://admin.hlx.page/live',
};

// Multi-Path Management Functions
/* function addSearchPath(path) {
  if (!path || path.trim() === '') return false;

  const normalizedPath = path.trim().startsWith('/') ? path.trim() : `/${path.trim()}`;

  if (app.searchPaths.includes(normalizedPath)) {
    showMessage(`Path "${normalizedPath}" is already added`, 'warning');
    return false;
  }

  // If folder structure is loaded, validate against it
  if (app.availablePaths.length > 0) {
    const pathExists = app.availablePaths.some((availablePath) => (
      availablePath === normalizedPath || availablePath.startsWith(`${normalizedPath}/`)
    ));
    if (!pathExists) {
      showMessage(`Path "${normalizedPath}" does not exist in this site. Type to browse available paths or use autocomplete.`, 'error');
      return false;
    }
  }
  // If folder structure isn't loaded yet, allow custom paths (user can enter any path)

  app.searchPaths.push(normalizedPath);
  renderPathTags();
  updatePathInfo();
  return true;
} */

function addSearchPath(path) {
  if (!path || path.trim() === '') return false;

  const normalizedPath = path.trim().startsWith('/') ? path.trim() : `/${path.trim()}`;

  if (app.searchPaths.includes(normalizedPath)) {
    showMessage(`Path "${normalizedPath}" is already added`, 'warning');
    return false;
  }

  // Allow any path without validation - user knows their folder structure
  app.searchPaths.push(normalizedPath);
  renderPathTags();
  updatePathInfo();
  showMessage(`Added path: ${normalizedPath}`, 'success');
  return true;
}

function removeSearchPath(path) {
  const index = app.searchPaths.indexOf(path);
  if (index > -1) {
    app.searchPaths.splice(index, 1);
    renderPathTags();
    updatePathInfo();
  }
}

function renderPathTags() {
  const container = document.getElementById('path-tags');
  if (!container) return;

  container.innerHTML = '';

  app.searchPaths.forEach((path) => {
    const tag = document.createElement('div');
    tag.className = 'path-tag';
    tag.setAttribute('data-path', path);

    tag.innerHTML = `
      <span class="tag-text">${path}</span>
      <button type="button" class="tag-remove" aria-label="Remove path ${path}">
        <img src="./search/icons/close.svg" alt="Remove" class="icon icon-sm">
      </button>
    `;

    // Add remove functionality
    const removeBtn = tag.querySelector('.tag-remove');
    removeBtn.addEventListener('click', () => {
      removeSearchPath(path);
    });

    container.appendChild(tag);
  });
}

function updatePathInfo() {
  const infoContainer = document.getElementById('path-info');
  if (!infoContainer) return;

  const includeSubfolders = document.getElementById('include-subfolders')?.checked || false;
  const infoText = infoContainer.querySelector('.info-text');

  if (app.searchPaths.length === 0) {
    infoText.textContent = includeSubfolders
      ? 'No paths selected - will search entire site including subfolders'
      : 'No paths selected - will search entire site (root level only)';
  } else {
    const pathCount = app.searchPaths.length;
    const subfolderText = includeSubfolders ? ' including subfolders' : '';
    if (pathCount === 1) {
      infoText.textContent = `Will search ${app.searchPaths[0]}${subfolderText}`;
    } else {
      infoText.textContent = `Will search ${pathCount} selected paths${subfolderText}`;
    }
  }
}

// Enhanced fetchFiles to handle multiple paths
async function fetchAllFiles() {
  const allFiles = [];

  // If no paths selected, search entire site (equivalent to base path = '')
  if (app.searchPaths.length === 0) {
    return fetchFiles('');
  }

  const processedPaths = new Set();

  await Promise.all(app.searchPaths.map(async (path) => {
    if (processedPaths.has(path)) return;
    processedPaths.add(path);

    try {
      const files = await fetchFiles(path);
      // Filter out duplicates based on file path
      files.forEach((file) => {
        if (!allFiles.some((existing) => existing.path === file.path)) {
          allFiles.push(file);
        }
      });
    } catch (error) {
      showMessage(`Error fetching files from ${path}: ${error.message}`, 'error');
    }
  }));

  return allFiles;
}

function parseOrgSite() {
  // Check if user has entered something in the input
  const orgSitePath = document.getElementById('org-site-path')?.value?.trim();
  if (orgSitePath) {
    // Parse /org/site format
    const cleanPath = orgSitePath.startsWith('/') ? orgSitePath.slice(1) : orgSitePath;
    const parts = cleanPath.split('/').filter((part) => part.length > 0);

    if (parts.length >= 2) {
      const result = { org: parts[0], site: parts[1] };
      // Cache the user's valid input in memory
      app.orgSiteCache = result;
      return result;
    }
  }

  // Fallback to cached value from previous valid input
  if (app.orgSiteCache) {
    return app.orgSiteCache;
  }

  // No valid input and no cache - return null to trigger error
  return null;
}

function validateOrgSite() {
  const result = parseOrgSite();
  if (!result) {
    showMessage('Please enter your organization and site in format: /org/site (e.g., /myorg/mysite)', 'error');
    return false;
  }
  return true;
}

function showMessage(text, type = 'info') {
  const toast = document.getElementById('toast');
  const message = document.querySelector('.toast-message');
  const iconImg = document.querySelector('.toast-icon img');

  if (!toast || !message || !iconImg) return;

  // Update message
  message.textContent = text;

  // Update icon based on type
  const iconPaths = {
    success: './search/icons/check.svg',
    error: './search/icons/close.svg',
    warning: './search/icons/close.svg', // Could add a warning icon if needed
    info: './search/icons/check.svg',
  };

  iconImg.src = iconPaths[type] || iconPaths.info;
  iconImg.alt = type.charAt(0).toUpperCase() + type.slice(1);

  // Update toast classes
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 5000);
}

function updateProgress(percent, text) {
  const container = document.querySelector('.progress-container');
  const fill = document.querySelector('.progress-fill');
  const textEl = document.querySelector('.progress-text');

  if (!container) return;

  if (percent === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  if (fill) fill.style.width = `${percent}%`;
  if (textEl) textEl.textContent = text;
}

async function fetchFiles(basePath = '') {
  const { context, token } = app;
  const orgSite = parseOrgSite();
  if (!orgSite) {
    throw new Error('Organization and site must be configured');
  }
  const { org, site } = orgSite;
  const url = `${API.LIST}/${org}/${site}${basePath}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    const htmlFiles = [];
    const includeSubfolders = document.getElementById('include-subfolders')?.checked || false;

    // Get filter options
    const excludePathsInput = document.getElementById('exclude-paths')?.value?.trim() || '';
    const excludePaths = excludePathsInput ? excludePathsInput.split(',').map((p) => p.trim()) : [];
    const modifiedSinceInput = document.getElementById('modified-since')?.value;
    const modifiedSince = modifiedSinceInput ? new Date(modifiedSinceInput) : null;

    data.forEach((item) => {
      if (item.ext === 'html' && item.lastModified) {
        // Check exclude paths
        const isExcluded = excludePaths.some((excludePath) => {
          if (excludePath.startsWith('/')) {
            return item.path.includes(excludePath);
          }
          return item.path.includes(`/${excludePath}`);
        });

        if (isExcluded) return;

        // Check modified since date
        if (modifiedSince) {
          const fileModified = new Date(item.lastModified * 1000); // Convert Unix timestamp
          if (fileModified < modifiedSince) return;
        }

        htmlFiles.push(item);
      }
    });

    // Handle subfolders separately if needed
    if (includeSubfolders) {
      const subfolderPromises = data
        .filter((item) => !item.ext && !item.lastModified && item.name !== '.DS_Store')
        .filter((item) => {
          // Also exclude subfolders that match exclude paths
          const isExcluded = excludePaths.some((excludePath) => {
            if (excludePath.startsWith('/')) {
              return item.path.includes(excludePath);
            }
            return item.path.includes(`/${excludePath}`);
          });
          return !isExcluded;
        })
        .map(async (item) => {
          try {
            return await fetchFiles(item.path.replace(`/${org}/${site}`, ''));
          } catch (error) {
            return [];
          }
        });
      const subfolderResults = await Promise.all(subfolderPromises);
      subfolderResults.forEach((subFiles) => htmlFiles.push(...subFiles));
    }

    return htmlFiles;
  } catch (error) {
    if (basePath === '') {
      showMessage(`Error fetching files: ${error.message}`, 'error');
    }
    return [];
  }
}

async function fetchContent(path) {
  if (app.fileCache.has(path)) {
    return app.fileCache.get(path);
  }

  const { token } = app;
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  const url = `${API.SOURCE}/${cleanPath}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const content = await response.text();
      app.fileCache.set(path, content);
      return content;
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function createVersion(path, description = 'Version created by FindReplace Pro') {
  const { token } = app;
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  const url = `${API.VERSION_CREATE}/${cleanPath}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: description,
      }),
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const result = await response.json();
          return result;
        } catch (jsonError) {
          return { success: true, status: response.status };
        }
      } else {
        return { success: true, status: response.status };
      }
    } else {
      const errorText = await response.text();
      return null;
    }
  } catch (error) {
    return null;
  }
}

async function getVersionList(path) {
  const { token } = app;
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  const url = `${API.VERSION_LIST}/${cleanPath}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const result = await response.json();

      // The API might return versions in different formats, let's handle both
      if (Array.isArray(result)) {
        return result;
      } if (result.data && Array.isArray(result.data)) {
        return result.data;
      } if (result.versions && Array.isArray(result.versions)) {
        return result.versions;
      }
      return result;
    }
    const errorText = await response.text();
    return null;
  } catch (error) {
    return null;
  }
}

async function getVersionContent(path, versionId) {
  const { token } = app;
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  const url = `${API.VERSION_CREATE}/${cleanPath}/${versionId}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const content = await response.text();
      return content;
    }
    const errorText = await response.text();
    return null;
  } catch (error) {
    return null;
  }
}

async function getVersionContentByUrl(versionUrl) {
  const { token } = app;
  // The versionUrl is a relative path like "/versionsource/kunwarsaluja/..."
  // We need to make it a full URL
  const url = `https://admin.da.live${versionUrl}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const content = await response.text();
      return content;
    }
    const errorText = await response.text();
    return null;
  } catch (error) {
    return null;
  }
}

async function saveContent(path, content) {
  const { token } = app;
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  const url = `https://admin.da.live/source/${cleanPath}`;

  try {
    const body = new FormData();
    body.append('data', new Blob([content], { type: 'text/html' }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body,
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

async function revertToPreFindReplaceVersion(filePath) {
  try {
    // Get all versions for this file
    const versions = await getVersionList(filePath);

    if (!versions || !Array.isArray(versions)) {
      return false;
    }

    versions.forEach((version, index) => {
      const versionId = version.url ? version.url.split('/').pop() : 'auto-save';
      const label = version.label || 'auto-save';
      const timestamp = new Date(version.timestamp).toLocaleString();
    });

    // Sort versions by timestamp (most recent first) and get the latest one with a URL
    const namedVersions = versions
      .filter((version) => version.url && version.label && version.timestamp)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (namedVersions.length === 0) {
      return false;
    }

    // Get the most recent version (first in sorted array)
    const latestVersion = namedVersions[0];
    const versionUrl = latestVersion.url;
    const versionLabel = latestVersion.label;
    const versionDate = new Date(latestVersion.timestamp).toLocaleString();

    // Get content from that version using the full versionsource URL
    const previousContent = await getVersionContentByUrl(versionUrl);

    if (!previousContent) {
      return false;
    }

    // Create safety backup before reverting
    await createVersion(filePath, `Revert(${versionLabel})`);

    // Restore the previous content
    const success = await saveContent(filePath, previousContent);

    return success;
  } catch (error) {
    return false;
  }
}

async function bulkRevertLastReplacement() {
  // Get selected files from results, not from selectedFiles set
  const selectedResults = app.results.filter((result) => result.selected);
  if (selectedResults.length === 0) {
    showMessage('No files selected for revert', 'error');
    return;
  }

  // eslint-disable-next-line no-alert
  const confirmation = confirm(
    `Revert ${selectedResults.length} selected files to their most recent saved versions?\n\n`
    + 'This will restore each file to its latest saved version.',
  );

  if (!confirmation) return;

  try {
    updateProgress(0, 'Finding pre-replacement versions...');

    const revertPromises = selectedResults.map(async (result, index) => {
      const filePath = result.file.path;
      const fileName = filePath.split('/').pop();
      updateProgress(((index + 1) / selectedResults.length) * 100, `Reverting ${fileName}...`);

      const success = await revertToPreFindReplaceVersion(filePath);
      return { success, path: filePath };
    });

    const results = await Promise.all(revertPromises);
    const successCount = results.filter((r) => r.success).length;
    const failedFiles = results.filter((r) => !r.success).map((r) => r.path);

    // Clear entire cache after revert operations to ensure fresh content on next search
    app.fileCache.clear();

    updateProgress(100, 'Revert complete!');

    if (failedFiles.length > 0) {
      showMessage(
        `Reverted ${successCount}/${selectedResults.length} files. Failed: ${failedFiles.map((f) => f.split('/').pop()).join(', ')}`,
        'warning',
      );
    } else {
      showMessage(
        `Successfully reverted ${successCount} files to most recent versions`,
        'success',
      );
    }
  } catch (error) {
    showMessage(`Bulk revert failed: ${error.message}`, 'error');
    updateProgress(0, '');
  }
}

function getMatchContext(content, index, contextLength = 75) {
  const start = Math.max(0, index - contextLength);
  const end = Math.min(content.length, index + contextLength);
  return content.substring(start, end);
}

function filterContentByTarget(content, targetType, customSelector) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');

    switch (targetType) {
      case 'page-metadata': {
        // Look for metadata table/div at the top of the page
        const metadata = doc.querySelector('.metadata, table[name="metadata"], #metadata');
        return metadata ? metadata.textContent || metadata.innerText || '' : '';
      }

      case 'section-metadata': {
        // Look for section metadata (divs with specific classes or patterns)
        const sections = doc.querySelectorAll('.section-metadata, [class*="section"], [data-aue-type="section"]');
        return Array.from(sections).map((section) => section.textContent || section.innerText || '').join(' ');
      }

      case 'blocks': {
        // Look for block content (divs with specific classes that indicate blocks)
        const blocks = doc.querySelectorAll('.block, [class*="block"], .cards, .hero, .columns, .accordion, .fragment');
        return Array.from(blocks).map((block) => block.textContent || block.innerText || '').join(' ');
      }

      case 'main-content': {
        // Look for main content area, excluding headers, footers, and metadata
        const main = doc.querySelector('main');
        if (main) {
          // Remove metadata and other non-content elements from main
          const mainClone = main.cloneNode(true);
          const metadata = mainClone.querySelector('.metadata, table[name="metadata"], #metadata');
          if (metadata) metadata.remove();
          return mainClone.textContent || mainClone.innerText || '';
        }
        return '';
      }

      case 'custom': {
        if (!customSelector) return '';
        try {
          const elements = doc.querySelectorAll(customSelector);
          return Array.from(elements).map((el) => el.textContent || el.innerText || '').join(' ');
        } catch (e) {
          // Invalid selector
          return '';
        }
      }

      default:
        return content;
    }
  } catch (error) {
    // If DOM parsing fails, return original content
    return content;
  }
}

function replaceTextInElement(element, regex, replaceTerm) {
  // Walk through all text nodes and replace content
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );

  const textNodes = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node);
    node = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    if (textNode.textContent) {
      textNode.textContent = textNode.textContent.replace(regex, replaceTerm);
    }
  });
}

function createSearchRegex(searchTerm, searchType, caseSensitive) {
  let pattern;
  const flags = caseSensitive ? 'g' : 'gi';

  switch (searchType) {
    case 'exact':
      pattern = `\\b${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
      break;
    case 'regex':
      pattern = searchTerm; // Use as-is for regex
      break;
    case 'contains':
    default:
      pattern = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      break;
  }

  return new RegExp(pattern, flags);
}

function replaceInTargetedContent(content, searchTerm, replaceTerm, targetType, customSelector) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');

    // Get search options
    const searchType = document.getElementById('search-type')?.value || 'contains';
    const caseSensitive = document.getElementById('case-sensitive')?.checked || false;
    const regex = createSearchRegex(searchTerm, searchType, caseSensitive);

    let targetElements = [];

    switch (targetType) {
      case 'page-metadata': {
        const metadata = doc.querySelector('.metadata, table[name="metadata"], #metadata');
        if (metadata) targetElements = [metadata];
        break;
      }

      case 'section-metadata': {
        targetElements = Array.from(doc.querySelectorAll('.section-metadata, [class*="section"], [data-aue-type="section"]'));
        break;
      }

      case 'blocks': {
        targetElements = Array.from(doc.querySelectorAll('.block, [class*="block"], .cards, .hero, .columns, .accordion, .fragment'));
        break;
      }

      case 'main-content': {
        const main = doc.querySelector('main');
        if (main) {
          targetElements = [main];
          // Remove metadata from replacement scope
          const metadata = main.querySelector('.metadata, table[name="metadata"], #metadata');
          if (metadata) {
            targetElements = Array.from(main.children).filter((child) => child !== metadata);
          }
        }
        break;
      }

      case 'custom': {
        if (customSelector) {
          try {
            targetElements = Array.from(doc.querySelectorAll(customSelector));
          } catch (e) {
            // Invalid selector, return original content
            return content;
          }
        }
        break;
      }
    }

    // Replace text content in target elements
    targetElements.forEach((element) => {
      replaceTextInElement(element, regex, replaceTerm);
    });

    return doc.documentElement.outerHTML;
  } catch (error) {
    // If DOM manipulation fails, return original content
    return content;
  }
}

function formatHTML(html) {
  let formatted = html;
  formatted = formatted.replace(/></g, '>\n<');
  formatted = formatted.replace(/<([^/][^>]*[^/])>/g, '<$1>\n');

  const lines = formatted.split('\n');
  let indentLevel = 0;
  const indentString = '  ';

  const formattedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith('</')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    const indentedLine = indentString.repeat(indentLevel) + trimmed;

    if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>')) {
      indentLevel += 1;
    }

    return indentedLine;
  });

  return formattedLines.join('\n');
}

function searchForElements(content, selector) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const elements = doc.querySelectorAll(selector);

    if (elements.length === 0) {
      return { matches: [], updatedContent: content };
    }

    // Create matches for each found element
    const matches = Array.from(elements).map((element, index) => {
      const elementText = element.textContent?.trim() || '';
      const elementHTML = element.outerHTML;

      return {
        index,
        match: `Element ${index + 1}: ${selector}`,
        context: elementText.length > 100 ? `${elementText.substring(0, 100)}...` : elementText,
        line: `Found element: ${selector}`,
        elementHTML: elementHTML.length > 200 ? `${elementHTML.substring(0, 200)}...` : elementHTML,
      };
    });

    return {
      matches,
      updatedContent: content,
      elementCount: elements.length,
      foundElements: true,
    };
  } catch (error) {
    return { matches: [], updatedContent: content };
  }
}

// HTML Mode: Search and replace entire HTML blocks - work directly with raw content
function searchAndReplaceHTML(content, searchTerm, replaceTerm = '', caseSensitive = false) {
  if (!searchTerm) return { matches: [], updatedContent: content };

  // Work directly with raw content - no formatting or normalization
  const searchContent = content;
  const cleanSearchTerm = searchTerm.trim();

  // Create search flags
  const flags = caseSensitive ? 'g' : 'gi';

  // Get search type to determine if we should escape or not
  const searchType = document.getElementById('search-type')?.value || 'contains';

  let processedSearchTerm;
  if (searchType === 'regex') {
    // For regex mode, use the search term as-is (no escaping)
    processedSearchTerm = cleanSearchTerm;
  } else {
    // For contains/exact modes, escape and add flexibility
    const escapedSearchTerm = cleanSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create a flexible regex that handles optional <p> tags and whitespace variations
    processedSearchTerm = escapedSearchTerm
      // Make <p> tags optional: <p> becomes (<p>)?
      .replace(/<p>/g, '(<p>)?')
      .replace(/<\/p>/g, '(</p>)?')
      // Allow flexible whitespace
      .replace(/>\s*</g, '>\\s*<')
      .replace(/>\s+/g, '>\\s*')
      .replace(/\s+</g, '\\s*<');
  }

  const regex = new RegExp(processedSearchTerm, flags);

  const matches = [];
  const lineMatchCounts = {};
  let match = regex.exec(searchContent);

  while (match !== null) {
    // Calculate line numbers from the same content we're searching (raw content)
    const lineNum = searchContent.substring(0, match.index).split('\n').length;

    // Track the sequence of this match on its line
    if (!lineMatchCounts[lineNum]) {
      lineMatchCounts[lineNum] = 0;
    }
    lineMatchCounts[lineNum]++;

    matches.push({
      match: match[0],
      index: match.index,
      line: lineNum,
      context: getMatchContext(searchContent, match.index, 150), // Context from raw content
      sequenceOnLine: lineMatchCounts[lineNum],
    });
    match = regex.exec(searchContent);
  }

  let updatedContent = content;
  if (replaceTerm !== undefined && matches.length > 0) {
    // Use the same processed search term for replacement
    const replacementRegex = new RegExp(processedSearchTerm, flags);
    updatedContent = content.replace(replacementRegex, replaceTerm);
  }

  return {
    matches,
    updatedContent,
  };
}

function searchInContent(content, searchTerm, replaceTerm = '') {
  const targetType = document.getElementById('target-type')?.value || 'all';
  const customSelector = document.getElementById('custom-selector')?.value?.trim();

  // Handle element-only search for custom selectors
  if (targetType === 'custom' && !searchTerm && customSelector) {
    return searchForElements(content, customSelector);
  }

  if (!searchTerm) return { matches: [], updatedContent: content };

  // Format HTML content for better line-by-line parsing
  const formattedContent = formatHTML(content);
  let contentForSearch = formattedContent;

  // Filter content based on target type
  if (targetType !== 'all') {
    contentForSearch = filterContentByTarget(formattedContent, targetType, customSelector);
  }

  // Conditionally remove URLs and attributes from search content
  const excludeUrls = document.getElementById('exclude-urls').checked;
  if (excludeUrls) {
    contentForSearch = contentForSearch
      .replace(/href="[^"]*"/gi, '')
      .replace(/src="[^"]*"/gi, '')
      .replace(/srcset="[^"]*"/gi, '')
      .replace(/data-src="[^"]*"/gi, '')
      .replace(/action="[^"]*"/gi, '')
      .replace(/media="[^"]*"/gi, '')
      .replace(/url\([^)]*\)/gi, '')
      .replace(/https?:\/\/[^\s<>"']+/gi, '')
      .replace(/<a[^>]*>[^<]*<\/a>/gi, '')
      .replace(/data-[^=]*="[^"]*"/gi, '');
  }

  // Always remove class and id attributes (not URLs)
  contentForSearch = contentForSearch
    .replace(/class="[^"]*"/gi, '')
    .replace(/id="[^"]*"/gi, '');

  // Get search options
  const searchType = document.getElementById('search-type')?.value || 'contains';
  const caseSensitive = document.getElementById('case-sensitive')?.checked || false;
  const htmlMode = document.getElementById('html-mode')?.checked || false;

  // HTML Mode: Search and replace entire HTML blocks
  if (htmlMode) {
    return searchAndReplaceHTML(content, searchTerm, replaceTerm, caseSensitive);
  }

  const regex = createSearchRegex(searchTerm, searchType, caseSensitive);

  const matches = [];
  const lineMatchCounts = {}; // Track how many matches per line
  let match = regex.exec(contentForSearch);

  while (match !== null) {
    const lineNum = contentForSearch.substring(0, match.index).split('\n').length;

    // Track the sequence of this match on its line
    if (!lineMatchCounts[lineNum]) {
      lineMatchCounts[lineNum] = 0;
    }
    lineMatchCounts[lineNum]++;

    matches.push({
      match: match[0],
      index: match.index,
      line: lineNum,
      context: getMatchContext(contentForSearch, match.index, 75),
      sequenceOnLine: lineMatchCounts[lineNum],
    });
    match = regex.exec(contentForSearch);
  }

  let updatedContent = content;
  if (replaceTerm && matches.length > 0) {
    if (targetType === 'all') {
      // For 'all' content, use the existing simple replacement approach
      const excludeUrls = document.getElementById('exclude-urls').checked;
      const urlPlaceholders = [];
      let tempContent = content;

      // Only protect URLs if exclude URLs is enabled
      if (excludeUrls) {
        tempContent = tempContent.replace(/href="[^"]*"/gi, (matchedText) => {
          const placeholder = `__HREF_${urlPlaceholders.length}__`;
          urlPlaceholders.push(matchedText);
          return placeholder;
        });

        tempContent = tempContent.replace(/src="[^"]*"/gi, (matchedText) => {
          const placeholder = `__SRC_${urlPlaceholders.length}__`;
          urlPlaceholders.push(matchedText);
          return placeholder;
        });

        tempContent = tempContent.replace(/https?:\/\/[^\s<>"']+/gi, (matchedText) => {
          const placeholder = `__URL_${urlPlaceholders.length}__`;
          urlPlaceholders.push(matchedText);
          return placeholder;
        });
      }

      updatedContent = tempContent.replace(regex, replaceTerm);

      // Only restore URLs if they were protected
      if (excludeUrls) {
        urlPlaceholders.forEach((originalUrl, index) => {
          updatedContent = updatedContent.replace(`__HREF_${index}__`, originalUrl);
          updatedContent = updatedContent.replace(`__SRC_${index}__`, originalUrl);
          updatedContent = updatedContent.replace(`__URL_${index}__`, originalUrl);
        });
      }
    } else {
      // For targeted content, use DOM-based replacement
      updatedContent = replaceInTargetedContent(content, searchTerm, replaceTerm, targetType, customSelector);
    }
  }

  return { matches, updatedContent };
}

async function scanFiles() {
  // Reset pagination for new search
  resetPagination();

  // Validate org/site configuration first
  if (!validateOrgSite()) {
    return;
  }

  const searchTerm = document.getElementById('search-term')?.value?.trim();
  const targetType = document.getElementById('target-type')?.value || 'all';
  const customSelector = document.getElementById('custom-selector')?.value?.trim();

  // For custom selector, allow element-only searches (no search term required)
  if (!searchTerm && targetType !== 'custom') {
    showMessage('Please enter a search term', 'error');
    return;
  }

  if (targetType === 'custom' && !customSelector) {
    showMessage('Please enter a CSS selector when using Custom Selector mode', 'error');
    return;
  }

  const replaceTerm = document.getElementById('replace-term')?.value || '';

  try {
    let pathsText;
    if (app.searchPaths.length === 0) {
      pathsText = 'entire site';
    } else if (app.searchPaths.length === 1) {
      [pathsText] = app.searchPaths;
    } else {
      pathsText = `${app.searchPaths.length} selected paths`;
    }
    showMessage(`Scanning files in ${pathsText}...`, 'info');
    updateProgress(10, 'Fetching file list...');

    const files = await fetchAllFiles();

    if (files.length === 0) {
      showMessage('No HTML files found', 'error');
      updateProgress(0, '');
      return;
    }

    app.results = [];
    let filesScanned = 0;
    let matchesFound = 0;

    const processFile = async (file, index) => {
      updateProgress(20 + (index / files.length) * 70, `Scanning ${file.name}...`);

      const content = await fetchContent(file.path);
      if (!content) return null;

      const result = searchInContent(content, searchTerm, replaceTerm);
      if (result.matches.length > 0) {
        return {
          file,
          matches: result.matches,
          originalContent: content,
          updatedContent: result.updatedContent,
          selected: true,
          foundElements: result.foundElements || false,
          elementCount: result.elementCount || 0,
        };
      }
      return null;
    };

    const results = await Promise.all(files.map(processFile));
    app.results = results.filter((result) => result !== null);

    // Initialize all matches as selected by default and populate selectedFiles
    app.selectedFiles.clear();
    app.results.forEach((result, index) => {
      // Set file as selected since all matches are selected by default
      app.selectedFiles.add(index);
      // Initialize all matches as selected
      result.matches.forEach((match) => {
        if (match.selected === undefined) {
          match.selected = true;
        }
      });
    });

    filesScanned = files.length;
    matchesFound = app.results.reduce((total, result) => total + result.matches.length, 0);

    updateProgress(100, 'Scan complete!');

    // Update UI
    document.getElementById('files-scanned').textContent = filesScanned;
    document.getElementById('matches-found').textContent = matchesFound;
    document.getElementById('files-affected').textContent = app.results.length;

    displayResults();

    // Show results container and auto-expand accordion
    const resultsContainer = document.querySelector('.results-container');
    resultsContainer.style.display = 'block';

    // Auto-expand the results accordion
    const resultsAccordion = document.getElementById('search-results');
    if (resultsAccordion) {
      resultsAccordion.style.display = 'block';
      const accordionCard = resultsAccordion.closest('.accordion-card');
      if (accordionCard) {
        accordionCard.classList.add('expanded');
      }
    }

    // Auto-collapse config accordion when results appear
    const configAccordion = document.getElementById('config-accordion');
    const configContent = document.getElementById('config-content');
    if (configAccordion && configContent && app.results.length > 0) {
      configAccordion.classList.remove('expanded');
      configContent.style.display = 'none';
    }

    const executeBtn = document.getElementById('execute-btn');
    const exportBtn = document.getElementById('export-btn');
    const revertBtn = document.getElementById('revert-btn');
    const bulkPublishBtn = document.getElementById('bulk-publish-btn');
    if (executeBtn) executeBtn.disabled = app.results.length === 0;
    if (exportBtn) exportBtn.disabled = app.results.length === 0;
    if (revertBtn) revertBtn.disabled = app.results.length === 0;
    if (bulkPublishBtn) bulkPublishBtn.disabled = app.results.length === 0;

    const targetType = document.getElementById('target-type')?.value || 'all';
    const targetLabel = document.querySelector(`#target-type option[value="${targetType}"]`)?.textContent || 'All Content';
    const customSelector = document.getElementById('custom-selector')?.value?.trim();

    let message;
    if (targetType === 'custom' && !searchTerm && customSelector) {
      const totalElements = app.results.reduce((total, result) => total + (result.elementCount || 0), 0);
      message = `Found ${totalElements} ${customSelector} elements in ${app.results.length} files`;
    } else {
      message = `Found ${matchesFound} matches in ${app.results.length} files (searching: ${targetLabel})`;
    }

    showMessage(message, 'success');
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'error');
    updateProgress(0, '');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateActionButtons() {
  const hasSelected = app.selectedFiles.size > 0;
  const executeBtn = document.getElementById('execute-btn');
  const exportBtn = document.getElementById('export-btn');
  const bulkPublishBtn = document.getElementById('bulk-publish-btn');

  if (executeBtn) executeBtn.disabled = !hasSelected;
  if (exportBtn) exportBtn.disabled = !hasSelected;
  if (bulkPublishBtn) bulkPublishBtn.disabled = !hasSelected;

  // Update button text with count
  updateBulkButtonText();
  updateExportButtonText();
}

function displayResults(filteredResults = null) {
  const list = document.getElementById('results-list');
  if (!list) return;

  list.innerHTML = '';

  // Don't clear selectedFiles here - preserve selection state during pagination

  // Use filtered results if provided, otherwise use all results
  const resultsToShow = filteredResults || app.results;

  // Store filtered results for pagination
  app.pagination.filteredResults = filteredResults;

  if (resultsToShow.length === 0) {
    const message = filteredResults ? 'No results match the filter' : 'No matches found';
    list.innerHTML = `<div style="padding: 20px; text-align: center;">${message}</div>`;
    hidePagination();
    return;
  }

  // Calculate pagination
  const totalResults = resultsToShow.length;
  const totalPages = Math.ceil(totalResults / CONFIG.RESULTS_PER_PAGE);
  const currentPage = Math.min(app.pagination.currentPage, totalPages);
  const startIndex = (currentPage - 1) * CONFIG.RESULTS_PER_PAGE;
  const endIndex = Math.min(startIndex + CONFIG.RESULTS_PER_PAGE, totalResults);

  // Get results for current page
  const pageResults = resultsToShow.slice(startIndex, endIndex);

  // Update pagination state
  app.pagination.currentPage = currentPage;
  app.pagination.totalPages = totalPages;

  pageResults.forEach((result, displayIndex) => {
    // Find the original index in app.results for proper event handling
    const originalIndex = app.results.indexOf(result);
    const item = document.createElement('div');
    item.className = 'result-item';

    const replaceTerm = document.getElementById('replace-term')?.value || '';
    const searchTerm = document.getElementById('search-term')?.value || '';

    const matchesHtml = result.matches.map((match, matchIndex) => {
      // Match selection is already initialized during search

      // Handle element-only searches differently
      if (result.foundElements && !searchTerm) {
        return `
          <div class="match-item">
            <input type="checkbox" class="match-checkbox" data-file-index="${originalIndex}" data-match-index="${matchIndex}" ${match.selected ? 'checked' : ''}>
            <div class="result-preview element-preview">
              <strong>${escapeHtml(match.match)}</strong>
              <br><small style="color: #666;">Content: ${escapeHtml(match.context)}</small>
              ${match.elementHTML ? `<br><small style="color: #888; font-family: monospace;">${escapeHtml(match.elementHTML)}</small>` : ''}
            </div>
          </div>
        `;
      }

      // Regular text search highlighting
      let highlightedContext = escapeHtml(match.context);
      if (searchTerm) {
        // Much simpler approach: find the match position relative to the context start
        const matchText = match.match;
        const originalContext = match.context;

        // Find where this specific match should be in the context
        // Context is created around match.index, so we need to find the relative position
        const contextStart = Math.max(0, match.index - 75); // Same as getMatchContext
        const relativeMatchStart = match.index - contextStart;

        // Only highlight if the match is within the context bounds
        if (relativeMatchStart >= 0 && relativeMatchStart < originalContext.length) {
          const beforeMatch = escapeHtml(originalContext.substring(0, relativeMatchStart));
          const highlightedMatch = escapeHtml(matchText);
          const afterMatch = escapeHtml(originalContext.substring(relativeMatchStart + matchText.length));

          highlightedContext = `${beforeMatch}<span class="highlight-old">${highlightedMatch}</span>${afterMatch}`;
        }
      }

      return `
        <div class="match-item">
          <input type="checkbox" class="match-checkbox" data-file-index="${originalIndex}" data-match-index="${matchIndex}" ${match.selected ? 'checked' : ''}>
          <div class="result-preview">
            Line ${match.line}: ...${highlightedContext}...
            ${replaceTerm ? `<br><small style="color: #007aff;">Replace with: <span class="highlight-new">${escapeHtml(replaceTerm)}</span></small>` : ''}
          </div>
        </div>
      `;
    }).join('');

    const matchCount = result.matches.length;
    const isExpanded = result.expanded === true; // Default to collapsed

    item.innerHTML = `
      <input type="checkbox" class="result-checkbox" data-index="${originalIndex}" ${result.selected ? 'checked' : ''}>
      <div class="result-content">
        <div class="result-header" data-result-index="${originalIndex}">
                      <a href="https://da.live/edit#${result.file.path.replace('.html', '')}" target="_blank" class="result-path">${result.file.path}</a>
          <div class="result-meta">
            <span class="match-count">${matchCount} match${matchCount !== 1 ? 'es' : ''}</span>
            <div class="result-toggle">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.41 8.84L12 13.42l4.59-4.58L18 10.25l-6 6-6-6z"/>
              </svg>
            </div>
          </div>
        </div>
        <div class="result-matches ${isExpanded ? 'expanded' : 'collapsed'}">
          ${matchesHtml}
        </div>
      </div>
    `;

    // Set initial state
    if (isExpanded) {
      item.classList.add('expanded');
    }

    // Initialize selectedFiles Set based on initial selection state
    if (result.selected) {
      app.selectedFiles.add(originalIndex);
    }

    const checkbox = item.querySelector('.result-checkbox');
    checkbox.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      app.results[idx].selected = e.target.checked;

      // Also update all individual match checkboxes in this file
      const matchCheckboxes = item.querySelectorAll('.match-checkbox');
      matchCheckboxes.forEach((matchCheckbox) => {
        matchCheckbox.checked = e.target.checked;
        const matchIndex = parseInt(matchCheckbox.dataset.matchIndex, 10);
        app.results[idx].matches[matchIndex].selected = e.target.checked;
      });

      // Clear indeterminate state
      e.target.indeterminate = false;

      if (e.target.checked) {
        app.selectedFiles.add(idx);
      } else {
        app.selectedFiles.delete(idx);
      }

      updateActionButtons();
    });

    // Add event listeners for individual match checkboxes
    const matchCheckboxes = item.querySelectorAll('.match-checkbox');
    matchCheckboxes.forEach((matchCheckbox) => {
      matchCheckbox.addEventListener('change', (e) => {
        const fileIndex = parseInt(e.target.dataset.fileIndex, 10);
        const matchIndex = parseInt(e.target.dataset.matchIndex, 10);

        // Update the match selection state
        app.results[fileIndex].matches[matchIndex].selected = e.target.checked;

        // Check if all matches in this file are selected/unselected
        const allMatches = app.results[fileIndex].matches;
        const selectedMatches = allMatches.filter((match) => match.selected);

        // Update file-level checkbox based on match selection
        const fileCheckbox = item.querySelector('.result-checkbox');
        if (selectedMatches.length === 0) {
          // No matches selected - uncheck file checkbox
          fileCheckbox.checked = false;
          app.results[fileIndex].selected = false;
          app.selectedFiles.delete(fileIndex);
        } else if (selectedMatches.length === allMatches.length) {
          // All matches selected - check file checkbox
          fileCheckbox.checked = true;
          app.results[fileIndex].selected = true;
          app.selectedFiles.add(fileIndex);
        } else {
          // Some matches selected - check file checkbox but mark as partial
          fileCheckbox.checked = true;
          app.results[fileIndex].selected = true;
          app.selectedFiles.add(fileIndex);
          fileCheckbox.indeterminate = true;
        }

        updateActionButtons();
      });
    });

    // Add accordion toggle functionality
    const resultContent = item.querySelector('.result-content');
    resultContent.addEventListener('click', (e) => {
      // Don't trigger if clicking on checkbox or link
      if (e.target.closest('.result-checkbox') || e.target.closest('.match-checkbox') || e.target.closest('a')) return;

      const resultHeader = item.querySelector('.result-header');
      const idx = parseInt(resultHeader.dataset.resultIndex, 10);
      const matchesContainer = item.querySelector('.result-matches');
      const isCurrentlyExpanded = item.classList.contains('expanded');

      // Toggle state
      if (isCurrentlyExpanded) {
        item.classList.remove('expanded');
        matchesContainer.classList.remove('expanded');
        matchesContainer.classList.add('collapsed');
        app.results[idx].expanded = false;
      } else {
        item.classList.add('expanded');
        matchesContainer.classList.remove('collapsed');
        matchesContainer.classList.add('expanded');
        app.results[idx].expanded = true;
      }
    });

    list.appendChild(item);
  });

  // Update pagination controls
  updatePagination(totalResults, startIndex + 1, endIndex);
}

function filterResults() {
  const filterInput = document.getElementById('filter-results');
  if (!filterInput) return;

  // Reset to first page when filtering
  app.pagination.currentPage = 1;

  const filterText = filterInput.value.toLowerCase().trim();

  if (!filterText) {
    // Show all results if filter is empty
    displayResults();
    return;
  }

  // Filter results based on file path or match content
  const filteredResults = app.results.filter((result) => {
    // Check if file path matches
    if (result.file.path.toLowerCase().includes(filterText)) {
      return true;
    }

    // Check if any match content includes the filter text
    return result.matches.some((match) => match.context.toLowerCase().includes(filterText)
             || match.match.toLowerCase().includes(filterText));
  });

  // Display filtered results
  displayResults(filteredResults);
}

function updatePagination(totalResults, startIndex, endIndex) {
  const container = document.getElementById('pagination-container');
  const infoText = document.getElementById('pagination-info-text');
  const pageNumbers = document.getElementById('page-numbers');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');

  if (!container || !infoText || !pageNumbers || !prevBtn || !nextBtn) return;

  // Show pagination if more than one page
  if (app.pagination.totalPages > 1) {
    container.style.display = 'flex';

    // Update info text
    infoText.textContent = `Showing ${startIndex}-${endIndex} of ${totalResults} results`;

    // Update prev/next buttons
    prevBtn.disabled = app.pagination.currentPage === 1;
    nextBtn.disabled = app.pagination.currentPage === app.pagination.totalPages;

    // Generate page numbers
    generatePageNumbers();
  } else {
    container.style.display = 'none';
  }
}

function hidePagination() {
  const container = document.getElementById('pagination-container');
  if (container) container.style.display = 'none';
}

function generatePageNumbers() {
  const pageNumbers = document.getElementById('page-numbers');
  if (!pageNumbers) return;

  pageNumbers.innerHTML = '';

  const { currentPage, totalPages } = app.pagination;
  const maxButtons = CONFIG.MAX_PAGINATION_BUTTONS;

  // Calculate start and end pages to display
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  const endPage = Math.min(totalPages, startPage + maxButtons - 1);

  // Adjust start if we're near the end
  if (endPage === totalPages) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  // Add first page and ellipsis if needed
  if (startPage > 1) {
    addPageButton(1);
    if (startPage > 2) {
      addEllipsis();
    }
  }

  // Add page buttons
  for (let i = startPage; i <= endPage; i++) {
    addPageButton(i, i === currentPage);
  }

  // Add ellipsis and last page if needed
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      addEllipsis();
    }
    addPageButton(totalPages);
  }
}

function addPageButton(pageNum, isActive = false) {
  const pageNumbers = document.getElementById('page-numbers');
  const button = document.createElement('button');
  button.className = `page-btn ${isActive ? 'active' : ''}`;
  button.textContent = pageNum;
  button.addEventListener('click', () => goToPage(pageNum));
  pageNumbers.appendChild(button);
}

function addEllipsis() {
  const pageNumbers = document.getElementById('page-numbers');
  const ellipsis = document.createElement('span');
  ellipsis.className = 'page-ellipsis';
  ellipsis.textContent = '...';
  pageNumbers.appendChild(ellipsis);
}

function goToPage(pageNum) {
  app.pagination.currentPage = pageNum;
  displayResults(app.pagination.filteredResults);
}

function resetPagination() {
  app.pagination.currentPage = 1;
  app.pagination.totalPages = 1;
  app.pagination.filteredResults = null;
}

// Function to replace only selected matches in content
function replaceSelectedMatches(content, matches, searchTerm, replaceTerm) {
  // Get only selected matches, sorted by index in reverse order
  // (to avoid index shifting when replacing from beginning)
  const selectedMatches = matches
    .filter((match) => match.selected)
    .sort((a, b) => b.index - a.index);

  if (selectedMatches.length === 0) {
    return content; // No matches selected, return original content
  }

  const searchType = document.getElementById('search-type')?.value || 'contains';
  const caseSensitive = document.getElementById('case-sensitive')?.checked || false;

  // Build unique identifiers for each selected match using text + line + sequence
  const selectedMatchIdentifiers = new Set();
  selectedMatches.forEach((match) => {
    const identifier = `${match.match}|${match.line}|${match.sequenceOnLine || 1}`;
    selectedMatchIdentifiers.add(identifier);
  });

  // Create the replacement regex
  const regex = createSearchRegex(searchTerm, searchType, caseSensitive);

  // We need to track which specific occurrences to replace based on their position and sequence
  // So we'll recreate the search exactly as it was done originally
  const formattedContent = formatHTML(content);

  let replacementCount = 0;
  const lineMatchCounts = {};

  // Use replace function with a callback to selectively replace only chosen matches
  const updatedFormattedContent = formattedContent.replace(regex, (matchText, ...args) => {
    // Get the offset (last argument in replace callback)
    const offset = args[args.length - 2];
    const lineNum = formattedContent.substring(0, offset).split('\n').length;

    // Track the sequence of this match on its line
    if (!lineMatchCounts[lineNum]) {
      lineMatchCounts[lineNum] = 0;
    }
    lineMatchCounts[lineNum]++;

    const identifier = `${matchText}|${lineNum}|${lineMatchCounts[lineNum]}`;

    // Only replace if this match was selected
    if (selectedMatchIdentifiers.has(identifier)) {
      replacementCount++;

      let finalReplaceTerm = replaceTerm;

      if (searchType === 'regex' && replaceTerm.includes('$')) {
        // Handle regex capture groups
        const flags = caseSensitive ? '' : 'i';
        const regexForReplacement = new RegExp(searchTerm, flags);
        finalReplaceTerm = matchText.replace(regexForReplacement, replaceTerm);
      }

      return finalReplaceTerm;
    }
    // Don't replace this match, return original
    return matchText;
  });

  // Now we need to map the changes back to the original content format
  // For now, return the formatted content with replacements
  // This maintains the same approach as the original searchInContent
  return updatedFormattedContent;
}

async function executeReplace() {
  const selected = app.results.filter((r) => r.selected);

  if (selected.length === 0) {
    showMessage('No files selected', 'error');
    return;
  }

  const searchTerm = document.getElementById('search-term')?.value?.trim();
  const replaceEmptyChecked = document.getElementById('replace-empty')?.checked || false;
  let replaceTerm = document.getElementById('replace-term')?.value?.trim() || '';

  // If replace with empty is checked, use non-breaking space to maintain HTML structure
  if (replaceEmptyChecked) {
    replaceTerm = '&nbsp;';
  }

  if (!searchTerm) {
    showMessage('Search term is required', 'error');
    return;
  }

  // For non-empty replacement, require replace term unless empty checkbox is checked
  if (!replaceEmptyChecked && !replaceTerm) {
    showMessage('Replace term is required (or check "Replace with empty" to remove text)', 'error');
    return;
  }

  // Count total selected matches across all files
  const totalSelectedMatches = selected.reduce((total, result) => total + result.matches.filter((match) => match.selected).length, 0);

  if (totalSelectedMatches === 0) {
    showMessage('No matches selected for replacement', 'error');
    return;
  }

  const replaceText = replaceEmptyChecked ? '(remove text)' : `"${replaceTerm}"`;
  // eslint-disable-next-line no-alert
  if (!confirm(`Replace ${totalSelectedMatches} selected matches with ${replaceText} in ${selected.length} files?\n\nSAFETY: Backup versions will be created first. Files will only be modified if backup creation succeeds.`)) {
    return;
  }

  try {
    let successCount = 0;
    let versionCount = 0;

    const replacePromises = selected.map(async (result, index) => {
      const fileName = result.file.path.split('/').pop();

      // Step 1: Create version before making changes (REQUIRED)
      updateProgress((index / selected.length) * 50, `Creating backup version for ${fileName}...`);

      const versionResult = await createVersion(result.file.path);

      if (!versionResult) {
        // Version creation failed - skip replacement for safety
        updateProgress(((index + 1) / selected.length) * 100, `Skipped ${fileName} - version creation failed`);
        return { success: false, versionCreated: false, skipped: true };
      }

      versionCount++;

      // Step 2: Perform the replacement (only if version was created successfully)
      updateProgress(((index + 0.5) / selected.length) * 100, `Updating ${fileName}...`);

      // Check if HTML mode is enabled
      const htmlMode = document.getElementById('html-mode')?.checked || false;

      let updatedContent;
      if (htmlMode) {
        // For HTML mode, use the same logic as searchAndReplaceHTML
        const caseSensitive = document.getElementById('case-sensitive')?.checked || false;
        const flags = caseSensitive ? 'g' : 'gi';
        const searchType = document.getElementById('search-type')?.value || 'contains';

        let processedSearchTerm;
        if (searchType === 'regex') {
          // For regex mode, use the search term as-is (no escaping)
          processedSearchTerm = searchTerm.trim();
        } else {
          // For contains/exact modes, escape and add flexibility
          const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          processedSearchTerm = escapedSearchTerm
            .replace(/<p>/g, '(<p>)?')
            .replace(/<\/p>/g, '(</p>)?')
            .replace(/>\s*</g, '>\\s*<')
            .replace(/>\s+/g, '>\\s*')
            .replace(/\s+</g, '\\s*<');
        }

        const replacementRegex = new RegExp(processedSearchTerm, flags);
        updatedContent = result.originalContent.replace(replacementRegex, replaceEmptyChecked ? '' : replaceTerm);
      } else {
        // Use granular replacement function for selected matches only
        updatedContent = replaceSelectedMatches(result.originalContent, result.matches, searchTerm, replaceTerm);
      }
      const success = await saveContent(result.file.path, updatedContent);
      return { success, versionCreated: true, skipped: false };
    });

    const results = await Promise.all(replacePromises);
    successCount = results.filter((r) => r.success).length;
    versionCount = results.filter((r) => r.versionCreated).length;
    const skippedCount = results.filter((r) => r.skipped).length;

    // Clear entire cache after replace operations to ensure fresh content on next search
    app.fileCache.clear();

    updateProgress(100, 'Complete!');

    if (skippedCount > 0) {
      showMessage(`Updated ${successCount}/${selected.length} files. Skipped ${skippedCount} files due to version creation failures. Created ${versionCount} backup versions.`, 'warning');
    } else if (versionCount === selected.length) {
      showMessage(`Updated ${successCount}/${selected.length} files successfully! Created ${versionCount} backup versions.`, 'success');
    } else {
      showMessage(`Updated ${successCount}/${selected.length} files. Warning: Some backup versions could not be created.`, 'warning');
    }
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'error');
    updateProgress(0, '');
  }
}

async function handleSingleFileOperation(operationType, path, context, org, site, token) {
  let apiUrl;
  const method = operationType === 'unpublish' ? 'DELETE' : 'POST';

  // Use 'main' for publish/unpublish operations, current branch for preview
  const branch = (operationType === 'publish' || operationType === 'unpublish') ? 'main' : (context.ref || 'main');

  if (operationType === 'preview') {
    apiUrl = `${API.PREVIEW}/${org}/${site}/${branch}${path}`;
  } else if (operationType === 'publish' || operationType === 'unpublish') {
    apiUrl = `${API.LIVE}/${org}/${site}/${branch}${path}`;
  }

  updateProgress(50, `${operationType}ing single file: ${path}`);

  const response = await fetch(apiUrl, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`${operationType} failed: ${response.status} ${response.statusText}`);
  }

  updateProgress(100, `${operationType} completed!`);
  showMessage(`Successfully ${operationType}ed: ${path}`, 'success');
}

async function handleBulkUnpublish(paths, context, site, token) {
  updateProgress(30, 'Processing unpublish requests...');

  // Use 'main' for unpublish operations
  const branch = 'main';

  const unpublishPromises = paths.map(async (path, index) => {
    const url = `${API.LIVE}/${context.org}/${site}/${branch}${path}`;
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const progress = 30 + ((60 * (index + 1)) / paths.length);
      updateProgress(progress, `Unpublished ${index + 1}/${paths.length}: ${path}`);

      return { path, success: response.ok, status: response.status };
    } catch (error) {
      return { path, success: false, error: error.message };
    }
  });

  const results = await Promise.all(unpublishPromises);
  const successful = results.filter((r) => r.success).length;

  updateProgress(100, 'Unpublish completed!');
  showMessage(`Unpublished ${successful}/${paths.length} files`, successful === paths.length ? 'success' : 'warning');
}

async function handleBulkOperation(operationType, paths, context, org, site, token) {
  const method = 'POST';
  let apiUrl;

  // Use 'main' for publish operations, current branch for preview
  const branch = operationType === 'publish' ? 'main' : (context.ref || 'main');

  if (operationType === 'preview') {
    apiUrl = `${API.PREVIEW}/${org}/${site}/${branch}/*`;
  } else if (operationType === 'publish') {
    apiUrl = `${API.LIVE}/${org}/${site}/${branch}/*`;
  } else if (operationType === 'unpublish') {
    return handleBulkUnpublish(paths, context, org, site, token);
  }

  updateProgress(30, `Sending bulk ${operationType} request...`);

  const payload = {
    forceUpdate: true,
    paths,
    delete: false,
  };

  const response = await fetch(apiUrl, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bulk ${operationType} failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();

  updateProgress(90, 'Processing...');

  if (result.job) {
    const jobId = result?.job?.name;
    updateProgress(100, `Bulk ${operationType} job started: ${jobId}`);
    showMessage(`Bulk ${operationType} job initiated for ${paths.length} files. Job ID: ${jobId}`, 'success');
  } else {
    updateProgress(100, `Bulk ${operationType} completed!`);
    showMessage(`Bulk ${operationType} completed for ${paths.length} files`, 'success');
  }
}

async function bulkOperation() {
  const operationType = document.getElementById('bulk-operation-type')?.value || 'preview';
  const selected = app.results.filter((result) => result.selected);

  if (selected.length === 0) {
    showMessage('Please select files to process', 'error');
    return;
  }

  // Handle Copy URLs operation separately (no API calls needed)
  if (operationType === 'copy-urls') {
    await copySelectedUrlsFromBulk(selected);
    return;
  }

  // Validate org/site configuration
  if (!validateOrgSite()) {
    return;
  }

  // eslint-disable-next-line no-alert
  const confirmed = confirm(`Are you sure you want to ${operationType} ${selected.length} files?`);
  if (!confirmed) return;

  const { context, token } = app;
  const { org, site } = parseOrgSite();

  try {
    updateProgress(10, 'Starting operation...');

    // Prepare paths for API calls
    const paths = selected.map((result) => {
      // Convert from full path to relative path expected by Admin API
      let { path } = result.file;
      // Remove org/site prefix if present
      const prefix = `/${context.org}/${site}`;
      if (path.startsWith(prefix)) {
        path = path.substring(prefix.length);
      }
      // Remove .html extension for API
      if (path.endsWith('.html')) {
        path = path.substring(0, path.length - 5);
      }
      return path;
    });

    updateProgress(20, `Preparing ${operationType} operation...`);

    // Decide between single file API vs bulk API based on count
    if (selected.length === 1) {
      // Use single file API for one file
      await handleSingleFileOperation(operationType, paths[0], context, org, site, token);
    } else {
      // Use bulk API for multiple files
      await handleBulkOperation(operationType, paths, context, org, site, token);
    }

    // Hide progress after delay
    setTimeout(() => {
      updateProgress(0, '');
    }, 3000);
  } catch (error) {
    showMessage(`${operationType} failed: ${error.message}`, 'error');
    updateProgress(0, '');
  }
}

async function copySelectedUrlsFromBulk(selected) {
  try {
    // Get the organization and site from org-site-path configuration
    // This will construct URL like: https://main--site--org.aem.page
    let baseUrl = null;

    // Get org/site from configuration
    const orgSite = parseOrgSite();
    if (orgSite && orgSite.org && orgSite.site) {
      const { org, site } = orgSite;
      baseUrl = `https://main--${site}--${org}.aem.page`;
    } else if (app.orgSiteCache) {
      const { org, site } = app.orgSiteCache;
      baseUrl = `https://main--${site}--${org}.aem.page`;
    }

    // If no org/site configuration found, show error
    if (!baseUrl) {
      showMessage('Please configure the Org/Site Path to copy URLs', 'error');
      return;
    }

    // Collect URLs from selected files
    const urls = selected.map((result) => {
      let { path } = result.file;

      // Remove org/site prefix if present (using the same org/site from baseUrl)
      if (orgSite && orgSite.org && orgSite.site) {
        const { org, site } = orgSite;
        const prefixToRemove = `/${org}/${site}`;
        if (path.startsWith(prefixToRemove)) {
          path = path.substring(prefixToRemove.length);
        }
      }

      // Ensure path starts with /
      if (!path.startsWith('/')) {
        path = `/${path}`;
      }

      // Remove .html extension if present
      if (path.endsWith('.html')) {
        path = path.slice(0, -5);
      }

      return `${baseUrl}${path}`;
    });

    // Join URLs with newlines
    const urlList = urls.join('\n');

    // Copy to clipboard
    await navigator.clipboard.writeText(urlList);

    showMessage(`Copied ${urls.length} URL${urls.length === 1 ? '' : 's'} to clipboard`, 'success');
  } catch (error) {
    console.error('Error copying URLs:', error);
    showMessage('Failed to copy URLs to clipboard', 'error');
  }
}

async function exportResults() {
  const selected = app.results.filter((r) => r.selected);

  if (selected.length === 0) {
    showMessage('No files selected', 'error');
    return;
  }

  showMessage(`Downloading ${selected.length} files...`, 'info');
  updateProgress(10, 'Preparing downloads...');

  try {
    // Download individual HTML files with proper formatting
    for (let i = 0; i < selected.length; i++) {
      const result = selected[i];
      const fileName = result.file.path.split('/').pop(); // Get filename from path
      const rawContent = result.updatedContent || result.originalContent;

      // Format the HTML for better readability
      const formattedContent = formatHTML(rawContent);

      const blob = new Blob([formattedContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Update progress
      const progress = 20 + ((70 * (i + 1)) / selected.length);
      updateProgress(progress, `Downloaded ${i + 1}/${selected.length}: ${fileName}`);

      // Small delay between downloads to avoid browser blocking
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
    }

    updateProgress(100, 'Export completed!');
    showMessage(`Downloaded ${selected.length} files!`, 'success');

    // Hide progress after a delay
    setTimeout(() => {
      updateProgress(0, '');
    }, 2000);
  } catch (error) {
    showMessage(`Export failed: ${error.message}`, 'error');
  }
}

function showSearchPathsLoader() {
  const loader = document.getElementById('search-paths-loader');
  const message = document.getElementById('search-paths-message');
  const pathInput = document.getElementById('search-path-input');

  if (loader) loader.style.display = 'flex';
  if (message) message.style.display = 'none';
  // Don't disable input during loading - user can still enter custom paths
  if (pathInput) pathInput.disabled = false;
}

function hideSearchPathsLoader() {
  const loader = document.getElementById('search-paths-loader');
  const pathInput = document.getElementById('search-path-input');

  if (loader) loader.style.display = 'none';
  if (pathInput) pathInput.disabled = false;
}

function showSearchPathsMessage() {
  const loader = document.getElementById('search-paths-loader');
  const message = document.getElementById('search-paths-message');
  const pathInput = document.getElementById('search-path-input');

  if (loader) loader.style.display = 'none';
  if (message) message.style.display = 'flex';
  if (pathInput) pathInput.disabled = true;
}

function hideSearchPathsMessage() {
  const message = document.getElementById('search-paths-message');
  const pathInput = document.getElementById('search-path-input');

  if (message) message.style.display = 'none';
  if (pathInput) pathInput.disabled = false;
}

function triggerPathSuggestions() {
  const pathInput = document.getElementById('search-path-input');
  if (!pathInput) return;

  // Focus the input and trigger a synthetic input event to show suggestions
  pathInput.focus();

  // Create and dispatch an input event to trigger suggestions
  const inputEvent = new Event('input', { bubbles: true });
  pathInput.dispatchEvent(inputEvent);
}

/* async function loadFolderTree() {
  try {
    const { token } = app;
    if (!token) {
      showSearchPathsMessage();
      return;
    }

    // Use user's org/site configuration instead of DA context
    const orgSite = parseOrgSite();
    if (!orgSite) {
      showSearchPathsMessage();
      return;
    }

    // Show loader while loading
    showSearchPathsLoader();

    const folders = new Set();
    const { org, site } = orgSite;
    const path = `/${org}/${site}`;

    const { results } = crawl({
      path,
      callback: (file) => {
        // Extract folder path from file path
        const filePath = file.path.replace(`/${org}/${site}`, '');
        const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
        if (folderPath && folderPath !== '/') {
          folders.add(folderPath);

          // Also add parent paths
          const parts = folderPath.split('/').filter(Boolean);
          for (let i = 1; i < parts.length; i++) {
            const parentPath = `/${parts.slice(0, i).join('/')}`;
            folders.add(parentPath);
          }
        }
      },
      throttle: 10,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    // Add timeout protection
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Folder tree load timeout')), 30000);
    });

    await Promise.race([results, timeoutPromise]);

    app.availablePaths = Array.from(folders)
      .sort();

    // Hide loader and show autocomplete
    hideSearchPathsLoader();
    setupPathAutocomplete();

    // Automatically show suggestions after loading completes
    triggerPathSuggestions();
  } catch (error) {
    hideSearchPathsLoader();
    showMessage('Could not load folder structure for autocomplete', 'error');
    app.availablePaths = [];
  }
} */

/* async function loadFolderTree() {
  try {
    const orgSite = parseOrgSite();
    if (!orgSite) {
      showSearchPathsMessage();
      return;
    }

    const { org, site } = orgSite;
    
    // Check if we have cached folder structure
    const cacheKey = `folderTree_${org}_${site}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        app.availablePaths = JSON.parse(cached);
        hideSearchPathsLoader();
        setupPathAutocomplete();
        return;
      } catch (e) {
        // Invalid cache, continue with fetch
      }
    }

    showSearchPathsLoader();

    const folders = new Set();
    let fileCount = 0;
    const MAX_FILES = 10000; // Limit to prevent overwhelming the browser
    let completed = false;

    try {
      // Use a more efficient approach - fetch query-index.json if available
      const queryIndexUrl = `https://${org}--${site}.aem.live/query-index.json`;
      const response = await fetch(queryIndexUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.data) {
          data.data.forEach(item => {
            if (item.path) {
              const folderPath = item.path.substring(0, item.path.lastIndexOf('/'));
              if (folderPath && folderPath !== '/') {
                folders.add(folderPath);
                // Add parent paths
                const parts = folderPath.split('/').filter(Boolean);
                for (let i = 1; i < parts.length; i++) {
                  folders.add(`/${parts.slice(0, i).join('/')}`);
                }
              }
            }
          });
          completed = true;
        }
      }
    } catch (e) {
      console.warn('Could not load from query-index, falling back to crawl:', e);
    }

    // Fallback to crawl if query-index failed
    if (!completed) {
      const { results } = crawl({
        origin: `https://${org}--${site}.aem.live`,
        callback: (file) => {
          fileCount++;
          
          // Stop if we've processed too many files
          if (fileCount > MAX_FILES) {
            return;
          }

          const filePath = file.path || '';
          const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
          
          if (folderPath && folderPath !== '/') {
            folders.add(folderPath);

            // Add parent paths
            const parts = folderPath.split('/').filter(Boolean);
            for (let i = 1; i < parts.length; i++) {
              folders.add(`/${parts.slice(0, i).join('/')}`);
            }
          }

          // Show progress for large structures
          if (fileCount % 100 === 0) {
            showMessage(`Loading folder structure... (${fileCount} files processed)`, 'info');
          }
        },
        throttle: 5, // Reduce throttle to speed up
        method: 'GET',
      });

      // Add timeout with warning instead of hard failure
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          showMessage('Large folder structure - using partial results', 'warning');
          resolve();
        }, 15000); // Reduced timeout
      });

      await Promise.race([results, timeoutPromise]);
    }

    // Convert to sorted array
    app.availablePaths = Array.from(folders).sort();

    // Cache the results
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(app.availablePaths));
    } catch (e) {
      // Storage quota exceeded, ignore
    }

    hideSearchPathsLoader();
    setupPathAutocomplete();
    
    showMessage(`Loaded ${app.availablePaths.length} folders`, 'success');

  } catch (error) {
    console.error('Error loading folder tree:', error);
    hideSearchPathsLoader();
    
    // Provide fallback common paths
    app.availablePaths = [
      '/',
      '/blog',
      '/articles',
      '/news',
      '/docs',
      '/products',
      '/resources'
    ];
    
    showMessage('Using default folder suggestions. Enter a custom path or wait and try again.', 'warning');
    setupPathAutocomplete();
  }
} */

  async function loadFolderTree() {
  try {
    const orgSite = parseOrgSite();
    if (!orgSite) {
      return; // Silently fail if no org/site configured
    }

    const { org, site } = orgSite;
    
    // Check cache first
    const cacheKey = `folderTree_${org}_${site}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        app.availablePaths = JSON.parse(cached);
        setupPathAutocomplete();
        showMessage('Loaded folder structure from cache', 'success');
        return;
      } catch (e) {
        // Invalid cache, continue
      }
    }

    // Show non-blocking message
    showMessage('Loading folder structure in background...', 'info');

    const folders = new Set();
    let fileCount = 0;
    const MAX_FILES = 5000; // Reduced limit for faster loading
    let completed = false;

    try {
      // Try query-index first (fastest)
      const queryIndexUrl = `https://${org}--${site}.aem.live/query-index.json`;
      const response = await fetch(queryIndexUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.data) {
          data.data.forEach(item => {
            if (item.path) {
              const folderPath = item.path.substring(0, item.path.lastIndexOf('/'));
              if (folderPath && folderPath !== '/') {
                folders.add(folderPath);
                const parts = folderPath.split('/').filter(Boolean);
                for (let i = 1; i < parts.length; i++) {
                  folders.add(`/${parts.slice(0, i).join('/')}`);
                }
              }
            }
          });
          completed = true;
        }
      }
    } catch (e) {
      console.warn('Query index not available, will use manual path entry');
    }

    // Only use crawl as fallback if query-index failed AND user explicitly wants it
    if (!completed) {
      // Don't automatically crawl - let user enter paths manually
      showMessage('Autocomplete not available. Enter paths manually (e.g., /blog, /drafts)', 'info');
      return;
    }

    // Convert to sorted array
    app.availablePaths = Array.from(folders).sort();

    // Cache the results
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(app.availablePaths));
    } catch (e) {
      // Storage quota exceeded, ignore
    }

    setupPathAutocomplete();
    showMessage(`Autocomplete ready with ${app.availablePaths.length} folders`, 'success');

  } catch (error) {
    console.warn('Folder tree loading failed, manual entry still works:', error);
    // Don't show error - manual entry still works
  }
}

function clearFolderTreeCache() {
  const orgSite = parseOrgSite();
  if (orgSite) {
    const { org, site } = orgSite;
    const cacheKey = `folderTree_${org}_${site}`;
    sessionStorage.removeItem(cacheKey);
  }
}

function buildFolderTree(paths, query = '') {
  // Create a tree structure from flat paths
  const tree = {};

  // If no query, show all paths
  if (!query.trim()) {
    const filteredPaths = paths;

    // Build the tree structure
    filteredPaths.forEach((path) => {
      const parts = path.split('/').filter(Boolean);
      let current = tree;

      parts.forEach((part, index) => {
        if (!current[part]) {
          const nodePath = `/${parts.slice(0, index + 1).join('/')}`;
          current[part] = {
            name: part,
            path: nodePath,
            level: index,
            children: {},
            hasChildren: false,
            expanded: false,
            id: `folder_${parts.slice(0, index + 1).join('_')}`,
          };
        }
        current = current[part].children;
      });
    });
  } else {
    // Advanced search: find paths that contain matching folder names
    let queryLower = query.toLowerCase();

    // Handle leading slash - remove it for matching purposes
    if (queryLower.startsWith('/')) {
      queryLower = queryLower.slice(1);
    }

    // Check if query ends with slash (indicating user wants to expand + exact matching)
    const shouldExpandMatches = queryLower.endsWith('/');
    const useExactMatching = queryLower.endsWith('/');

    // Handle trailing slash - remove it for matching
    if (queryLower.endsWith('/')) {
      queryLower = queryLower.slice(0, -1);
    }

    const relevantPaths = new Set();
    const pathsToExpand = new Set();
    const foldersToExpand = new Set(); // Track folders that should be expanded due to trailing slash

    // Find all paths that have any folder matching the search query
    paths.forEach((path) => {
      const parts = path.split('/').filter(Boolean);
      let hasMatch = false;

      // Determine if this path matches based on exact vs partial matching rules
      let pathMatches = false;

      if (queryLower.includes('/')) {
        // Multi-segment query like "drafts/piyush"
        const queryParts = queryLower.split('/').filter(Boolean);
        const pathString = parts.join('/').toLowerCase();

        if (useExactMatching) {
          // For trailing slash, check exact sequence matching
          const pathParts = parts.map((p) => p.toLowerCase());
          for (let i = 0; i <= pathParts.length - queryParts.length; i++) {
            let exactMatch = true;
            for (let j = 0; j < queryParts.length; j++) {
              if (pathParts[i + j] !== queryParts[j]) {
                exactMatch = false;
                break;
              }
            }
            if (exactMatch) {
              pathMatches = true;

              // Mark for expansion
              const lastMatchedIndex = i + queryParts.length - 1;
              const lastMatchedPath = `/${parts.slice(0, lastMatchedIndex + 1).join('/')}`;
              foldersToExpand.add(lastMatchedPath);

              // Mark parent paths for expansion
              for (let k = 0; k < lastMatchedIndex; k++) {
                const parentPath = `/${parts.slice(0, k + 1).join('/')}`;
                pathsToExpand.add(parentPath);
              }
              break;
            }
          }
        } else {
          // For non-trailing slash, use partial matching - check if query sequence matches at folder boundaries
          const pathParts = parts.map((p) => p.toLowerCase());
          for (let i = 0; i <= pathParts.length - queryParts.length; i++) {
            let partialMatch = true;
            for (let j = 0; j < queryParts.length; j++) {
              if (!pathParts[i + j].startsWith(queryParts[j])) {
                partialMatch = false;
                break;
              }
            }
            if (partialMatch) {
              pathMatches = true;

              // Mark parent paths for expansion (but don't expand the matched folders)
              for (let k = 0; k < i + queryParts.length - 1; k++) {
                if (k < parts.length) {
                  const parentPath = `/${parts.slice(0, k + 1).join('/')}`;
                  pathsToExpand.add(parentPath);
                }
              }
              break;
            }
          }
        }
      } else {
        // Single segment query like "drafts"
        parts.forEach((part, index) => {
          let matches = false;

          if (useExactMatching) {
            // Exact matching for trailing slash
            matches = part.toLowerCase() === queryLower;
          } else {
            // Partial matching for non-trailing slash - use startsWith for more precise matching
            matches = part.toLowerCase().startsWith(queryLower);
          }

          if (matches) {
            pathMatches = true;

            // Mark parent paths for expansion up to (but not including) the matching folder
            for (let i = 0; i < index; i++) {
              const parentPath = `/${parts.slice(0, i + 1).join('/')}`;
              pathsToExpand.add(parentPath);
            }

            // If trailing slash, mark the matching folder itself for expansion
            if (useExactMatching) {
              const matchingFolderPath = `/${parts.slice(0, index + 1).join('/')}`;
              foldersToExpand.add(matchingFolderPath);
            }
          }
        });
      }

      if (pathMatches) {
        hasMatch = true;
        relevantPaths.add(path);
      }
    });

    // If we're expanding folders (trailing slash), include their direct children
    if (shouldExpandMatches && foldersToExpand.size > 0) {
      foldersToExpand.forEach((folderToExpand) => {
        paths.forEach((path) => {
          // Check if this path is a child of the folder we want to expand
          if (path.toLowerCase().startsWith(`${folderToExpand.toLowerCase()}/`)) {
            relevantPaths.add(path);
          }
        });
      });
    }

    // Build the tree structure with only relevant paths
    relevantPaths.forEach((path) => {
      const parts = path.split('/').filter(Boolean);
      let current = tree;

      parts.forEach((part, index) => {
        if (!current[part]) {
          const nodePath = `/${parts.slice(0, index + 1).join('/')}`;

          // Determine if this specific folder should be highlighted
          let isMatch = false;

          if (queryLower.includes('/')) {
            // For path queries like "drafts/anu", find the matching sequence in the path
            const queryParts = queryLower.split('/').filter(Boolean);
            const fullPath = parts.join('/').toLowerCase();
            const queryString = queryParts.join('/');

            // Find where the query sequence starts in the full path
            const matchStartIndex = fullPath.indexOf(queryString);
            if (matchStartIndex !== -1) {
              // Calculate which parts of the path are before the match
              const beforeMatch = fullPath.substring(0, matchStartIndex);
              const beforeParts = beforeMatch ? beforeMatch.split('/').filter(Boolean) : [];
              const queryStartIndex = beforeParts.length;

              // Check if this current folder is part of the matched sequence
              queryParts.forEach((queryPart, queryPartIndex) => {
                const absoluteIndex = queryStartIndex + queryPartIndex;
                if (index === absoluteIndex && part.toLowerCase().startsWith(queryPart)) {
                  isMatch = true;
                }
              });
            }
          } else if (useExactMatching) {
            // Exact matching for trailing slash queries
            isMatch = part.toLowerCase() === queryLower;
          } else {
            // Partial matching for regular queries - use startsWith for consistency
            isMatch = part.toLowerCase().startsWith(queryLower);
          }

          current[part] = {
            name: part,
            path: nodePath,
            level: index,
            children: {},
            hasChildren: false,
            expanded: pathsToExpand.has(nodePath) || foldersToExpand.has(nodePath),
            id: `folder_${parts.slice(0, index + 1).join('_')}`,
            isMatch,
          };
        } else {
          // Update expansion state if this path should be expanded
          if (pathsToExpand.has(current[part].path) || foldersToExpand.has(current[part].path)) {
            current[part].expanded = true;
          }

          // Update match status
          let isMatch = false;

          if (queryLower.includes('/')) {
            const queryParts = queryLower.split('/').filter(Boolean);
            const fullPath = parts.join('/').toLowerCase();
            const queryString = queryParts.join('/');

            const matchStartIndex = fullPath.indexOf(queryString);
            if (matchStartIndex !== -1) {
              const beforeMatch = fullPath.substring(0, matchStartIndex);
              const beforeParts = beforeMatch ? beforeMatch.split('/').filter(Boolean) : [];
              const queryStartIndex = beforeParts.length;

              queryParts.forEach((queryPart, queryPartIndex) => {
                const absoluteIndex = queryStartIndex + queryPartIndex;
                if (index === absoluteIndex && part.toLowerCase().startsWith(queryPart)) {
                  isMatch = true;
                }
              });
            }
          } else if (useExactMatching) {
            // Exact matching for trailing slash queries
            isMatch = part.toLowerCase() === queryLower;
          } else {
            // Partial matching for regular queries - use startsWith for consistency
            isMatch = part.toLowerCase().startsWith(queryLower);
          }

          if (isMatch) {
            current[part].isMatch = true;
          }
        }
        current = current[part].children;
      });
    });
  }

  // Mark nodes that have children
  const markHasChildren = (node) => {
    Object.keys(node).forEach((key) => {
      const item = node[key];
      const childrenKeys = Object.keys(item.children);
      if (childrenKeys.length > 0) {
        item.hasChildren = true;
        markHasChildren(item.children);
      }
    });
  };
  markHasChildren(tree);

  return tree;
}

function renderTreeNodes(tree, parentElement, suggestionsList, pathInput) {
  Object.keys(tree).sort().forEach((key) => {
    const folder = tree[key];
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.setAttribute('data-level', folder.level.toString());
    item.setAttribute('data-path', folder.path);
    item.setAttribute('data-id', folder.id);

    if (folder.hasChildren) {
      item.classList.add('has-children');
    } else {
      item.classList.add('leaf-node');
    }

    // Create expand indicator
    const expandIndicator = document.createElement('span');
    expandIndicator.className = 'expand-indicator';
    if (folder.hasChildren) {
      // Set initial state based on folder.expanded
      if (folder.expanded) {
        expandIndicator.classList.add('expanded');
        expandIndicator.innerHTML = '▼';
      } else {
        expandIndicator.innerHTML = '▶';
      }
      expandIndicator.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent input from losing focus
      });

      expandIndicator.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isInteractingWithTree = true;
        toggleFolder(folder.id, suggestionsList);
        // Keep focus on the input
        pathInput.focus();
        // Reset the flag after a short delay
        setTimeout(() => {
          isInteractingWithTree = false;
        }, 100);
      });
    } else {
      expandIndicator.classList.add('no-children');
    }

    // Create folder icon using text symbol
    const icon = document.createElement('span');
    icon.className = 'folder-icon';
    icon.innerHTML = '📁';
    icon.setAttribute('aria-label', 'Folder');

    // Create folder name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'folder-name';
    if (folder.isMatch) {
      nameSpan.classList.add('search-match');
    }
    nameSpan.textContent = folder.name;

    // Create folder path (for reference)
    const pathSpan = document.createElement('span');
    pathSpan.className = 'folder-path';
    pathSpan.textContent = folder.path;

    item.appendChild(expandIndicator);
    item.appendChild(icon);
    item.appendChild(nameSpan);
    item.appendChild(pathSpan);

    // Prevent item from causing input blur
    item.addEventListener('mousedown', (e) => {
      // Don't prevent default if clicking on expand indicator (it has its own handler)
      if (!e.target.classList.contains('expand-indicator')) {
        e.preventDefault(); // Prevent input from losing focus
      }
    });

    // Add click handler for path selection (not expand/collapse)
    item.addEventListener('click', (e) => {
      // Only trigger expand/collapse if clicking specifically on the expand indicator
      if (e.target.classList.contains('expand-indicator')) {
        // This is handled by the expand indicator's click event
        return;
      }

      // For any other click on the item, select the path
      e.preventDefault();
      e.stopPropagation();
      isSelectingFromAutocomplete = true;
      if (addSearchPath(folder.path)) {
        pathInput.value = '';
      }
      suggestionsList.style.display = 'none';
      pathInput.focus();
      setTimeout(() => {
        isSelectingFromAutocomplete = false;
      }, 100);
    });

    // Add mouse hover handler
    item.addEventListener('mouseenter', () => {
      // Remove previous selection
      suggestionsList.querySelectorAll('.suggestion-item').forEach((i) => {
        i.classList.remove('selected');
      });
      item.classList.add('selected');
    });

    parentElement.appendChild(item);

    // Recursively add children (initially collapsed unless folder is expanded)
    if (folder.hasChildren) {
      const childContainer = document.createElement('div');
      childContainer.className = folder.expanded ? 'child-container' : 'child-container collapsed';
      childContainer.setAttribute('data-parent-id', folder.id);
      renderTreeNodes(folder.children, childContainer, suggestionsList, pathInput);
      parentElement.appendChild(childContainer);
    }
  });
}

function toggleFolder(folderId, suggestionsList) {
  const expandIndicator = suggestionsList.querySelector(`[data-id="${folderId}"] .expand-indicator`);
  const childContainer = suggestionsList.querySelector(`[data-parent-id="${folderId}"]`);

  if (!expandIndicator || !childContainer) return;

  const isExpanded = expandIndicator.classList.contains('expanded');

  if (isExpanded) {
    // Collapse
    expandIndicator.classList.remove('expanded');
    expandIndicator.innerHTML = '▶';
    childContainer.classList.add('collapsed');
    // Hide all child items
    childContainer.querySelectorAll('.suggestion-item').forEach((item) => {
      item.classList.add('collapsed');
    });
  } else {
    // Expand
    expandIndicator.classList.add('expanded');
    expandIndicator.innerHTML = '▼';
    childContainer.classList.remove('collapsed');
    // Show immediate child items only
    const immediateChildren = Array.from(childContainer.children).filter((child) => child.classList.contains('suggestion-item') && child.getAttribute('data-level') === (parseInt(childContainer.querySelector('.suggestion-item')?.getAttribute('data-level') || '0', 10)).toString());
    immediateChildren.forEach((item) => {
      item.classList.remove('collapsed');
    });
  }
}

/* function setupPathAutocomplete() {
  const pathInput = document.getElementById('search-path-input');
  if (!pathInput) return; // Exit if input not found
  const pathContainer = pathInput.parentElement;

  // Create autocomplete container
  let autocompleteContainer = document.getElementById('autocomplete-container');
  if (!autocompleteContainer) {
    autocompleteContainer = document.createElement('div');
    autocompleteContainer.id = 'autocomplete-container';

    // Create suggestions list
    const suggestionsList = document.createElement('div');
    suggestionsList.id = 'suggestions-list';

    // Wrap input in autocomplete container
    pathInput.parentNode.insertBefore(autocompleteContainer, pathInput);
    autocompleteContainer.appendChild(pathInput);
    autocompleteContainer.appendChild(suggestionsList);
  }

  const suggestionsList = document.getElementById('suggestions-list');
  let selectedIndex = -1;

  // Update placeholder
  pathInput.placeholder = 'Type folder paths or search available folders (e.g., /drafts, /fragments)';

  function showSuggestions(query) {
    // Check if org/site is configured
    const orgSite = parseOrgSite();
    if (!orgSite) {
      suggestionsList.style.display = 'none';
      showSearchPathsMessage();
      return;
    }

    // Don't show suggestions if folder structure isn't loaded
    if (!app.availablePaths || app.availablePaths.length === 0) {
      suggestionsList.style.display = 'none';
      return;
    }

    // Hide any messages since we have data
    hideSearchPathsMessage();

    // Build nested folder structure
    const folderTree = buildFolderTree(app.availablePaths, query);
    if (Object.keys(folderTree).length === 0) {
      suggestionsList.style.display = 'none';
      return;
    }

    suggestionsList.innerHTML = '';
    selectedIndex = -1;

    // Render the tree structure (only top level initially visible)
    renderTreeNodes(folderTree, suggestionsList, suggestionsList, pathInput);

    suggestionsList.style.display = 'block';
  }

  function hideSuggestions() {
    setTimeout(() => {
      // Don't hide if we're interacting with the tree (expanding/collapsing)
      if (isInteractingWithTree) {
        return;
      }
      suggestionsList.style.display = 'none';
    }, 150);
  }

  // Input event handler - filter suggestions as user types
  pathInput.addEventListener('input', (e) => {
    showSuggestions(e.target.value);
  });

  // Focus handler - show suggestions based on current input
  pathInput.addEventListener('focus', () => {
    showSuggestions(pathInput.value);
  });

  // Blur handler
  pathInput.addEventListener('blur', hideSuggestions);

  // Keyboard navigation
  pathInput.addEventListener('keydown', (e) => {
    const items = suggestionsList.querySelectorAll('.suggestion-item:not(.collapsed)');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
      updateSelection(items);
    } else if (e.key === 'ArrowRight' && selectedIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[selectedIndex];
      if (selectedItem && selectedItem.classList.contains('has-children')) {
        const folderId = selectedItem.getAttribute('data-id');
        const expandIndicator = selectedItem.querySelector('.expand-indicator');
        if (!expandIndicator.classList.contains('expanded')) {
          toggleFolder(folderId, suggestionsList);
        }
      }
    } else if (e.key === 'ArrowLeft' && selectedIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[selectedIndex];
      if (selectedItem && selectedItem.classList.contains('has-children')) {
        const folderId = selectedItem.getAttribute('data-id');
        const expandIndicator = selectedItem.querySelector('.expand-indicator');
        if (expandIndicator.classList.contains('expanded')) {
          toggleFolder(folderId, suggestionsList);
        }
      }
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      isSelectingFromAutocomplete = true;
      const selectedItem = items[selectedIndex];
      if (selectedItem) {
        const folderPath = selectedItem.getAttribute('data-path');
        if (addSearchPath(folderPath)) {
          pathInput.value = '';
        }
        suggestionsList.style.display = 'none';
      }
      setTimeout(() => {
        isSelectingFromAutocomplete = false;
      }, 100);
    } else if (e.key === 'Escape') {
      suggestionsList.style.display = 'none';
      pathInput.blur();
    }
  });

  function updateSelection(items) {
    items.forEach((item, index) => {
      if (index === selectedIndex) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
  }
} */

  function setupPathAutocomplete() {
  const pathInput = document.getElementById('search-path-input');
  if (!pathInput) return;

  // Update placeholder to encourage manual entry
  pathInput.placeholder = 'Type or paste folder paths (e.g., /drafts, /blog) - Press Enter to add';

  const pathContainer = pathInput.parentElement;

  // Create autocomplete container
  let autocompleteContainer = document.getElementById('autocomplete-container');
  if (!autocompleteContainer) {
    autocompleteContainer = document.createElement('div');
    autocompleteContainer.id = 'autocomplete-container';

    const suggestionsList = document.createElement('div');
    suggestionsList.id = 'suggestions-list';

    pathInput.parentNode.insertBefore(autocompleteContainer, pathInput);
    autocompleteContainer.appendChild(pathInput);
    autocompleteContainer.appendChild(suggestionsList);
  }

  const suggestionsList = document.getElementById('suggestions-list');
  let selectedIndex = -1;

  function showSuggestions(query) {
    // Only show autocomplete if folder structure is loaded
    if (!app.availablePaths || app.availablePaths.length === 0) {
      suggestionsList.style.display = 'none';
      return;
    }

    const orgSite = parseOrgSite();
    if (!orgSite) {
      suggestionsList.style.display = 'none';
      return;
    }

    hideSearchPathsMessage();

    const folderTree = buildFolderTree(app.availablePaths, query);
    if (Object.keys(folderTree).length === 0) {
      suggestionsList.style.display = 'none';
      return;
    }

    suggestionsList.innerHTML = '';
    selectedIndex = -1;

    renderTreeNodes(folderTree, suggestionsList, suggestionsList, pathInput);
    suggestionsList.style.display = 'block';
  }

  function hideSuggestions() {
    setTimeout(() => {
      if (isInteractingWithTree) {
        return;
      }
      suggestionsList.style.display = 'none';
    }, 150);
  }

  pathInput.addEventListener('input', (e) => {
    // Only show autocomplete if we have folder data
    if (app.availablePaths && app.availablePaths.length > 0) {
      showSuggestions(e.target.value);
    }
  });

  pathInput.addEventListener('focus', () => {
    if (app.availablePaths && app.availablePaths.length > 0) {
      showSuggestions(pathInput.value);
    }
  });

  pathInput.addEventListener('blur', hideSuggestions);

  // Keyboard navigation (same as before)
  pathInput.addEventListener('keydown', (e) => {
    const items = suggestionsList.querySelectorAll('.suggestion-item:not(.collapsed)');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
      updateSelection(items);
    } else if (e.key === 'ArrowRight' && selectedIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[selectedIndex];
      if (selectedItem && selectedItem.classList.contains('has-children')) {
        const folderId = selectedItem.getAttribute('data-id');
        const expandIndicator = selectedItem.querySelector('.expand-indicator');
        if (!expandIndicator.classList.contains('expanded')) {
          toggleFolder(folderId, suggestionsList);
        }
      }
    } else if (e.key === 'ArrowLeft' && selectedIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[selectedIndex];
      if (selectedItem && selectedItem.classList.contains('has-children')) {
        const folderId = selectedItem.getAttribute('data-id');
        const expandIndicator = selectedItem.querySelector('.expand-indicator');
        if (expandIndicator.classList.contains('expanded')) {
          toggleFolder(folderId, suggestionsList);
        }
      }
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      isSelectingFromAutocomplete = true;
      const selectedItem = items[selectedIndex];
      if (selectedItem) {
        const folderPath = selectedItem.getAttribute('data-path');
        if (addSearchPath(folderPath)) {
          pathInput.value = '';
        }
        suggestionsList.style.display = 'none';
      }
      setTimeout(() => {
        isSelectingFromAutocomplete = false;
      }, 100);
    } else if (e.key === 'Escape') {
      suggestionsList.style.display = 'none';
      pathInput.blur();
    }
  });

  function updateSelection(items) {
    items.forEach((item, index) => {
      if (index === selectedIndex) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
  }
}

function updateBulkButtonText() {
  const select = document.getElementById('bulk-operation-type');
  const buttonText = document.getElementById('bulk-btn-text');

  if (select && buttonText) {
    const operation = select.value;
    let operationText;

    // Handle special case for copy-urls
    if (operation === 'copy-urls') {
      operationText = 'Copy URLs';
    } else {
      operationText = operation.charAt(0).toUpperCase() + operation.slice(1);
    }

    // Count selected files
    const selectedCount = app.results.filter((result) => result.selected).length;

    if (selectedCount > 0) {
      buttonText.textContent = `${operationText} (${selectedCount})`;
    } else {
      buttonText.textContent = operationText;
    }
  }
}

function updateExportButtonText() {
  const buttonText = document.getElementById('export-btn-text');

  if (buttonText) {
    // Count selected files
    const selectedCount = app.results.filter((result) => result.selected).length;

    if (selectedCount > 0) {
      buttonText.textContent = `Export Files (${selectedCount})`;
    } else {
      buttonText.textContent = 'Export Files';
    }
  }
}

function updateRevertButtonText() {
  const buttonText = document.getElementById('revert-btn-text');

  if (buttonText) {
    // Count selected files
    const selectedCount = app.results.filter((result) => result.selected).length;

    if (selectedCount > 0) {
      buttonText.textContent = `Revert Selected (${selectedCount})`;
    } else {
      buttonText.textContent = 'Revert Selected';
    }
  }
}

function toggleAccordion(contentId) {
  const content = document.getElementById(contentId);
  const card = content.closest('.accordion-card');

  if (content && card) {
    const isExpanded = card.classList.contains('expanded');
    const accordionIcon = card.querySelector('.accordion-icon');

    if (isExpanded) {
      // Collapse
      card.classList.remove('expanded');
      content.style.display = 'none';
      if (accordionIcon) {
        accordionIcon.src = '/tools/search/icons/chevron-down.svg';
      }
    } else {
      // Expand
      card.classList.add('expanded');
      content.style.display = 'block';
      if (accordionIcon) {
        accordionIcon.src = '/tools/search/icons/chevron-up.svg';
      }
    }
  }
}

function setupEventListeners() {
   const scanBtn = document.getElementById('scan-btn');
  const executeBtn = document.getElementById('execute-btn');
  const exportBtn = document.getElementById('export-btn');
  const revertBtn = document.getElementById('revert-btn');
  const bulkPublishBtn = document.getElementById('bulk-publish-btn');
  const toggleAll = document.getElementById('toggle-all');
  const clearSelection = document.getElementById('clear-selection');
  const expandAll = document.getElementById('expand-all');
  const collapseAll = document.getElementById('collapse-all');

  // New buttons for HTML operations
  const addHtmlBtn = document.getElementById('add-html-btn');
  const deleteHtmlBtn = document.getElementById('delete-html-btn');
  const scanElementsBtn = document.getElementById('scan-elements-btn');

  if (scanBtn) scanBtn.addEventListener('click', scanFiles);
  if (executeBtn) executeBtn.addEventListener('click', executeReplace);
  if (exportBtn) exportBtn.addEventListener('click', exportResults);
  if (revertBtn) revertBtn.addEventListener('click', bulkRevertLastReplacement);
  if (bulkPublishBtn) bulkPublishBtn.addEventListener('click', bulkOperation);

  // Add event listeners for new HTML operation buttons
  if (addHtmlBtn) addHtmlBtn.addEventListener('click', addHtmlNode);
  if (deleteHtmlBtn) deleteHtmlBtn.addEventListener('click', deleteHtmlNode);
  if (scanElementsBtn) scanElementsBtn.addEventListener('click', scanForElements);

  const bulkOperationSelect = document.getElementById('bulk-operation-type');
  if (bulkOperationSelect) {
    bulkOperationSelect.addEventListener('change', updateBulkButtonText);
    updateBulkButtonText();
  }

  updateExportButtonText();

  // Enhanced path input functionality - always allow manual entry
  const pathInput = document.getElementById('search-path-input');
  if (pathInput) {
    // Enable input immediately
    pathInput.disabled = false;
    
    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const suggestionsList = document.getElementById('suggestions-list');
        const isAutocompleteActive = suggestionsList && suggestionsList.style.display !== 'none';

        if (!isAutocompleteActive) {
          e.preventDefault();
          const path = pathInput.value.trim();
          if (addSearchPath(path)) {
            pathInput.value = '';
          }
        }
      }
    });

    pathInput.addEventListener('blur', () => {
      if (isSelectingFromAutocomplete) {
        return;
      }
      const path = pathInput.value.trim();
      if (path && addSearchPath(path)) {
        pathInput.value = '';
      }
    });

    // Optional: Try to load folder tree in background on first focus
    let folderTreeAttempted = false;
    pathInput.addEventListener('focus', () => {
      if (!folderTreeAttempted) {
        folderTreeAttempted = true;
        // Non-blocking background load
        loadFolderTree().catch(() => {
          // Silently fail - manual entry still works
        });
      }
    });
  }

  const includeSubfoldersCheckbox = document.getElementById('include-subfolders');
  if (includeSubfoldersCheckbox) {
    includeSubfoldersCheckbox.addEventListener('change', updatePathInfo);
  }

  // HTML mode functionality
  const htmlModeCheckbox = document.getElementById('html-mode');
  const htmlModeHelp = document.getElementById('html-mode-help');
  const searchTermTextarea = document.getElementById('search-term');
  const replaceTermTextarea = document.getElementById('replace-term');

  if (htmlModeCheckbox && htmlModeHelp) {
    htmlModeCheckbox.addEventListener('change', () => {
      if (htmlModeCheckbox.checked) {
        htmlModeHelp.style.display = 'block';
        if (searchTermTextarea) {
          searchTermTextarea.placeholder = 'Enter HTML to find (e.g., <div class="hero">...</div>)';
        }
        if (replaceTermTextarea) {
          replaceTermTextarea.placeholder = 'Enter replacement HTML (or leave empty to remove)';
        }
      } else {
        htmlModeHelp.style.display = 'none';
        if (searchTermTextarea) {
          searchTermTextarea.placeholder = 'Enter search term or regex pattern';
        }
        if (replaceTermTextarea) {
          replaceTermTextarea.placeholder = 'Enter replacement text (use $1, $2 for regex groups when using Regular Expression)';
        }
      }
    });
  }

  // Filter results functionality
  const filterInput = document.getElementById('filter-results');
  if (filterInput) {
    filterInput.addEventListener('input', filterResults);
    filterInput.addEventListener('keyup', filterResults);
  }

  // Pagination functionality
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (app.pagination.currentPage > 1) {
        goToPage(app.pagination.currentPage - 1);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (app.pagination.currentPage < app.pagination.totalPages) {
        goToPage(app.pagination.currentPage + 1);
      }
    });
  }

  // Accordion functionality
  const accordionHeaders = document.querySelectorAll('.accordion-header[data-accordion-target]');
  accordionHeaders.forEach((header) => {
    header.addEventListener('click', () => {
      const targetId = header.getAttribute('data-accordion-target');
      toggleAccordion(targetId);
    });
  });

  // Help modal functionality
  const helpBtn = document.querySelector('.help-btn');
  const helpModal = document.getElementById('help-modal');
  const modalClose = document.querySelector('.modal-close');

  if (helpBtn && helpModal) {
    helpBtn.addEventListener('click', () => {
      helpModal.classList.remove('hidden');
    });
  }

  if (modalClose && helpModal) {
    modalClose.addEventListener('click', () => {
      helpModal.classList.add('hidden');
    });
  }

  // Close modal on overlay click
  if (helpModal) {
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) {
        helpModal.classList.add('hidden');
      }
    });
  }

  // Load folder tree on-demand when user focuses on base path field
  const searchPathInput = document.getElementById('search-path-input');
  if (searchPathInput) {
    let folderTreeLoaded = false;
    searchPathInput.addEventListener('focus', () => {
      if (!folderTreeLoaded) {
        folderTreeLoaded = true;
        loadFolderTree().catch(() => {
          // Silently fail, autocomplete just won't be available
        });
      }
    });

    // Also reload folder tree when org/site changes
    const orgSiteInput = document.getElementById('org-site-path');
    if (orgSiteInput) {
      orgSiteInput.addEventListener('blur', () => {
        const orgSite = parseOrgSite();
        const pathInput = document.getElementById('search-path-input');
        
        if (!orgSite) {
          showMessage('Please enter org/site in format: /org/site', 'warning');
          if (pathInput) pathInput.disabled = true;
        } else {
          // Enable manual path entry immediately
          if (pathInput) {
            pathInput.disabled = false;
            pathInput.focus();
          }
          showMessage('You can now enter search paths manually', 'success');
        }
      });

      orgSiteInput.addEventListener('input', () => {
        const orgSite = parseOrgSite();
        const pathInput = document.getElementById('search-path-input');
        
        if (orgSite) {
          // Enable path input as soon as valid org/site is entered
          if (pathInput) pathInput.disabled = false;
        }
      });
    }
  }

  if (toggleAll) {
    toggleAll.addEventListener('click', () => {
      // Work directly with app.results data instead of DOM elements
      const allSelected = app.results.every((result) => result.selected);
      const newSelectionState = !allSelected;

      // Update all results data
      app.results.forEach((result, index) => {
        result.selected = newSelectionState;

        // Also update all matches within each result
        result.matches.forEach((match) => {
          match.selected = newSelectionState;
        });

        if (newSelectionState) {
          app.selectedFiles.add(index);
        } else {
          app.selectedFiles.delete(index);
        }
      });

      // Update visible DOM elements
      document.querySelectorAll('.result-checkbox').forEach((cb) => {
        cb.checked = newSelectionState;
        cb.indeterminate = false;
      });

      // Update visible match checkboxes
      document.querySelectorAll('.match-checkbox').forEach((matchCb) => {
        matchCb.checked = newSelectionState;
      });

      updateActionButtons();
    });
  }

  if (clearSelection) {
    clearSelection.addEventListener('click', () => {
      // Clear all results data
      app.results.forEach((result) => {
        result.selected = false;
        // Also clear all matches within each result
        result.matches.forEach((match) => {
          match.selected = false;
        });
      });

      // Clear selected files set
      app.selectedFiles.clear();

      // Update visible DOM elements
      document.querySelectorAll('.result-checkbox').forEach((cb) => {
        cb.checked = false;
        cb.indeterminate = false;
      });

      // Update visible match checkboxes
      document.querySelectorAll('.match-checkbox').forEach((matchCb) => {
        matchCb.checked = false;
      });

      updateActionButtons();
    });
  }

  if (expandAll) {
    expandAll.addEventListener('click', () => {
      document.querySelectorAll('.result-item').forEach((item) => {
        const matchesContainer = item.querySelector('.result-matches');
        const resultHeader = item.querySelector('.result-header');
        const idx = parseInt(resultHeader.dataset.resultIndex, 10);

        item.classList.add('expanded');
        matchesContainer.classList.remove('collapsed');
        matchesContainer.classList.add('expanded');
        if (app.results[idx]) {
          app.results[idx].expanded = true;
        }
      });
    });
  }

  if (collapseAll) {
    collapseAll.addEventListener('click', () => {
      document.querySelectorAll('.result-item').forEach((item) => {
        const matchesContainer = item.querySelector('.result-matches');
        const resultHeader = item.querySelector('.result-header');
        const idx = parseInt(resultHeader.dataset.resultIndex, 10);

        item.classList.remove('expanded');
        matchesContainer.classList.remove('expanded');
        matchesContainer.classList.add('collapsed');
        if (app.results[idx]) {
          app.results[idx].expanded = false;
        }
      });
    });
  }

  const targetType = document.getElementById('target-type');
  if (targetType) {
    targetType.addEventListener('change', (e) => {
      const customSelector = document.querySelector('.custom-selector');
      const searchTermHelp = document.getElementById('search-term-help');
      const searchTermTextarea = document.getElementById('search-term');

      if (customSelector) {
        customSelector.style.display = e.target.value === 'custom' ? 'block' : 'none';
      }

      if (searchTermHelp) {
        searchTermHelp.style.display = e.target.value === 'custom' ? 'block' : 'none';
      }

      if (searchTermTextarea) {
        if (e.target.value === 'custom') {
          searchTermTextarea.placeholder = 'Optional: Enter text to find within elements, or leave empty to find all pages with these elements';
        } else {
          searchTermTextarea.placeholder = 'Enter text to find (supports regex when search type is set to Regular Expression)';
        }
      }
    });
  }

  const toastCloseBtn = document.querySelector('.toast-close');
  if (toastCloseBtn) {
    toastCloseBtn.addEventListener('click', () => {
      document.getElementById('toast').classList.add('hidden');
    });
  }

  // Replace with empty checkbox functionality
  const replaceEmptyCheckbox = document.getElementById('replace-empty');

  if (replaceEmptyCheckbox && replaceTermTextarea) {
    // When checkbox is checked, disable textarea
    replaceEmptyCheckbox.addEventListener('change', () => {
      if (replaceEmptyCheckbox.checked) {
        replaceTermTextarea.disabled = true;
        replaceTermTextarea.value = '';
        replaceTermTextarea.placeholder = 'Text will be removed (replaced with empty)';
      } else {
        replaceTermTextarea.disabled = false;
        replaceTermTextarea.placeholder = 'Enter replacement text (use $1, $2 for regex groups when using Regular Expression)';
      }
    });

    // When user types in textarea, uncheck the checkbox
    replaceTermTextarea.addEventListener('input', () => {
      if (replaceEmptyCheckbox.checked && replaceTermTextarea.value.length > 0) {
        replaceEmptyCheckbox.checked = false;
        replaceTermTextarea.disabled = false;
        replaceTermTextarea.placeholder = 'Enter replacement text (use $1, $2 for regex groups when using Regular Expression)';
      }
    });
  }
}
/**
 * Add HTML node to pages at specified location
 */
async function addHtmlNode() {
  const selected = app.results.filter((r) => r.selected);

  if (selected.length === 0) {
    showMessage('No files selected', 'error');
    return;
  }

  const htmlContent = document.getElementById('html-content')?.value?.trim();
  const insertPosition = document.getElementById('insert-position')?.value || 'append';
  const targetSelector = document.getElementById('target-selector')?.value?.trim();

  if (!htmlContent) {
    showMessage('Please enter HTML content to add', 'error');
    return;
  }

  // Validate HTML
  try {
    const parser = new DOMParser();
    const testDoc = parser.parseFromString(htmlContent, 'text/html');
    if (testDoc.querySelector('parsererror')) {
      showMessage('Invalid HTML content. Please check your HTML syntax.', 'error');
      return;
    }
  } catch (e) {
    showMessage('Invalid HTML content', 'error');
    return;
  }

  const confirmMessage = targetSelector
    ? `Add HTML node to ${insertPosition} of "${targetSelector}" in ${selected.length} files?`
    : `Add HTML node to ${insertPosition} of document in ${selected.length} files?`;

  if (!confirm(`${confirmMessage}\n\nSAFETY: Backup versions will be created first.`)) {
    return;
  }

  try {
    let successCount = 0;
    let versionCount = 0;

    const addPromises = selected.map(async (result, index) => {
      const fileName = result.file.path.split('/').pop();

      // Create version backup
      updateProgress((index / selected.length) * 50, `Creating backup for ${fileName}...`);
      const versionResult = await createVersion(result.file.path);

      if (!versionResult) {
        updateProgress(((index + 1) / selected.length) * 100, `Skipped ${fileName} - backup failed`);
        return { success: false, versionCreated: false, skipped: true };
      }

      versionCount++;

      // Add HTML node
      updateProgress(((index + 0.5) / selected.length) * 100, `Adding HTML to ${fileName}...`);

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(result.originalContent, 'text/html');
        
        // Create the new node from HTML string
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent.trim();
        const newNode = tempDiv.firstElementChild;

        if (!newNode) {
          return { success: false, versionCreated: true, skipped: true, error: 'Invalid HTML structure' };
        }

        let targetElement;

        // Find target element based on selector or default to body
        if (targetSelector) {
          targetElement = doc.querySelector(targetSelector);
          if (!targetElement) {
            return { success: false, versionCreated: true, skipped: true, error: `Target selector "${targetSelector}" not found` };
          }
        } else {
          targetElement = doc.querySelector('main') || doc.body;
        }

        // Insert based on position
        switch (insertPosition) {
          case 'prepend':
            targetElement.insertBefore(newNode, targetElement.firstChild);
            break;
          case 'append':
            targetElement.appendChild(newNode);
            break;
          case 'before':
            targetElement.parentNode.insertBefore(newNode, targetElement);
            break;
          case 'after':
            targetElement.parentNode.insertBefore(newNode, targetElement.nextSibling);
            break;
          default:
            targetElement.appendChild(newNode);
        }

        const updatedContent = doc.documentElement.outerHTML;
        const success = await saveContent(result.file.path, updatedContent);
        
        return { success, versionCreated: true, skipped: false };
      } catch (error) {
        return { success: false, versionCreated: true, skipped: true, error: error.message };
      }
    });

    const results = await Promise.all(addPromises);
    successCount = results.filter((r) => r.success).length;
    const skippedCount = results.filter((r) => r.skipped).length;

    app.fileCache.clear();
    updateProgress(100, 'Complete!');

    if (skippedCount > 0) {
      const errors = results.filter((r) => r.error).map((r) => r.error).join(', ');
      showMessage(
        `Added HTML to ${successCount}/${selected.length} files. Skipped ${skippedCount} files. ${errors ? `Errors: ${errors}` : ''}`,
        'warning'
      );
    } else {
      showMessage(`Successfully added HTML to ${successCount}/${selected.length} files!`, 'success');
    }
  } catch (error) {
    showMessage(`Add HTML failed: ${error.message}`, 'error');
    updateProgress(0, '');
  }
}

/**
 * Delete HTML nodes by class name from pages
 */
async function deleteHtmlNode() {
  const selected = app.results.filter((r) => r.selected);

  if (selected.length === 0) {
    showMessage('No files selected', 'error');
    return;
  }

  const deleteSelector = document.getElementById('delete-selector')?.value?.trim();

  if (!deleteSelector) {
    showMessage('Please enter a CSS selector (e.g., .header-article-pro)', 'error');
    return;
  }

  if (!confirm(`Delete all elements matching "${deleteSelector}" from ${selected.length} files?\n\nSAFETY: Backup versions will be created first.`)) {
    return;
  }

  try {
    let successCount = 0;
    let versionCount = 0;
    let totalDeleted = 0;

    const deletePromises = selected.map(async (result, index) => {
      const fileName = result.file.path.split('/').pop();

      // Create version backup
      updateProgress((index / selected.length) * 50, `Creating backup for ${fileName}...`);
      const versionResult = await createVersion(result.file.path);

      if (!versionResult) {
        updateProgress(((index + 1) / selected.length) * 100, `Skipped ${fileName} - backup failed`);
        return { success: false, versionCreated: false, skipped: true, deletedCount: 0 };
      }

      versionCount++;

      // Delete HTML nodes
      updateProgress(((index + 0.5) / selected.length) * 100, `Deleting elements from ${fileName}...`);

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(result.originalContent, 'text/html');
        
        // Find all matching elements
        const elementsToDelete = doc.querySelectorAll(deleteSelector);
        const deletedCount = elementsToDelete.length;

        if (deletedCount === 0) {
          return { success: true, versionCreated: true, skipped: true, deletedCount: 0, noMatch: true };
        }

        // Remove all matching elements
        elementsToDelete.forEach((element) => {
          element.parentNode.removeChild(element);
        });

        const updatedContent = doc.documentElement.outerHTML;
        const success = await saveContent(result.file.path, updatedContent);
        
        return { success, versionCreated: true, skipped: false, deletedCount };
      } catch (error) {
        return { success: false, versionCreated: true, skipped: true, deletedCount: 0, error: error.message };
      }
    });

    const results = await Promise.all(deletePromises);
    successCount = results.filter((r) => r.success).length;
    const skippedCount = results.filter((r) => r.skipped && !r.noMatch).length;
    const noMatchCount = results.filter((r) => r.noMatch).length;
    totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);

    app.fileCache.clear();
    updateProgress(100, 'Complete!');

    let message = `Deleted ${totalDeleted} element(s) from ${successCount} files.`;
    if (noMatchCount > 0) {
      message += ` ${noMatchCount} files had no matching elements.`;
    }
    if (skippedCount > 0) {
      message += ` Skipped ${skippedCount} files due to errors.`;
    }

    showMessage(message, skippedCount > 0 ? 'warning' : 'success');
  } catch (error) {
    showMessage(`Delete HTML failed: ${error.message}`, 'error');
    updateProgress(0, '');
  }
}

/**
 * Scan pages to find elements matching a selector
 */
async function scanForElements() {
  resetPagination();

  if (!validateOrgSite()) {
    return;
  }

  const scanSelector = document.getElementById('scan-selector')?.value?.trim();

  if (!scanSelector) {
    showMessage('Please enter a CSS selector to scan for', 'error');
    return;
  }

  try {
    const pathsText = app.searchPaths.length === 0 ? 'entire site' : 
                      app.searchPaths.length === 1 ? app.searchPaths[0] : 
                      `${app.searchPaths.length} selected paths`;
    
    showMessage(`Scanning for "${scanSelector}" in ${pathsText}...`, 'info');
    updateProgress(10, 'Fetching file list...');

    const files = await fetchAllFiles();

    if (files.length === 0) {
      showMessage('No HTML files found', 'error');
      updateProgress(0, '');
      return;
    }

    app.results = [];
    let filesScanned = 0;
    let matchesFound = 0;

    const processFile = async (file, index) => {
      updateProgress(20 + (index / files.length) * 70, `Scanning ${file.name}...`);

      const content = await fetchContent(file.path);
      if (!content) return null;

      const result = searchForElements(content, scanSelector);
      if (result.matches.length > 0) {
        return {
          file,
          matches: result.matches,
          originalContent: content,
          updatedContent: result.updatedContent,
          selected: true,
          foundElements: true,
          elementCount: result.matches.length,
        };
      }
      return null;
    };

    const results = await Promise.all(files.map(processFile));
    app.results = results.filter((result) => result !== null);

    app.selectedFiles.clear();
    app.results.forEach((result, index) => {
      app.selectedFiles.add(index);
      result.matches.forEach((match) => {
        if (match.selected === undefined) {
          match.selected = true;
        }
      });
    });

    updateProgress(100, 'Scan complete!');

    filesScanned = files.length;
    matchesFound = app.results.reduce((total, result) => total + result.elementCount, 0);

    document.getElementById('files-scanned').textContent = filesScanned;
    document.getElementById('matches-found').textContent = matchesFound;
    document.getElementById('files-affected').textContent = app.results.length;

    displayResults();

    const resultsContainer = document.querySelector('.results-container');
    resultsContainer.style.display = 'block';

    const resultsAccordion = document.getElementById('search-results');
    if (resultsAccordion) {
      resultsAccordion.style.display = 'block';
      const accordionCard = resultsAccordion.closest('.accordion-card');
      if (accordionCard) {
        accordionCard.classList.add('expanded');
      }
    }

    const configAccordion = document.getElementById('config-accordion');
    const configContent = document.getElementById('config-content');
    if (configAccordion && configContent && app.results.length > 0) {
      configAccordion.classList.remove('expanded');
      configContent.style.display = 'none';
    }

    const executeBtn = document.getElementById('execute-btn');
    const exportBtn = document.getElementById('export-btn');
    const deleteBtn = document.getElementById('delete-html-btn');
    const addHtmlBtn = document.getElementById('add-html-btn');

    if (executeBtn) executeBtn.disabled = app.results.length === 0;
    if (exportBtn) exportBtn.disabled = app.results.length === 0;
    if (deleteBtn) deleteBtn.disabled = app.results.length === 0;
    if (addHtmlBtn) addHtmlBtn.disabled = app.results.length === 0;

    showMessage(`Found ${matchesFound} "${scanSelector}" element(s) in ${app.results.length} files`, 'success');
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'error');
    updateProgress(0, '');
  }
}

/* async function init() {
  try {
    const { context, token, actions } = await DA_SDK;

    app.context = context;
    app.token = token;
    app.actions = actions;

    setupEventListeners();

    // Initialize path tags and info
    renderPathTags();
    updatePathInfo();

    // Show message for search paths since org/site won't be configured initially
    showSearchPathsMessage();

    // Show ready message
    showMessage('FindReplace Pro is ready! Enter your org/site to get started.', 'success');

    // Folder tree will be loaded on-demand when user focuses on base path field
  } catch (error) {
    showMessage('Failed to initialize app', 'error');
  }
} */

async function init() {
  try {
    const { context, token, actions } = await DA_SDK;

    app.context = context;
    app.token = token;
    app.actions = actions;

    setupEventListeners();
    renderPathTags();
    updatePathInfo();

    // Always setup autocomplete structure (even if folder tree isn't loaded)
    setupPathAutocomplete();

    showMessage('FindReplace Pro ready! Enter org/site and search paths to get started.', 'success');

    // Don't wait for folder tree - let users work immediately
  } catch (error) {
    showMessage('Failed to initialize app', 'error');
  }
}

async function startApp() {
  //const hasAccess = await addAppAccessControl();
  //if (hasAccess) {
    init();
  //}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
