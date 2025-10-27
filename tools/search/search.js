/* eslint-disable import/no-unresolved, no-restricted-globals, no-use-before-define, no-await-in-loop, no-plusplus, consistent-return, max-len, no-shadow, default-case, no-unused-vars, no-console */

import { DA_ORIGIN } from 'https://da.live/nx/utils/constants.js';

const DA_SDK = window.hlx.da.sdk;

// API endpoints
const API = {
  LIST: `${DA_ORIGIN}/list`,
  SOURCE: `${DA_ORIGIN}/source`,
};

// App state
const app = {
  context: null,
  token: null,
  actions: null,
  results: [],
  selectedFiles: new Set(),
  fileCache: new Map(),
  htmlOps: {
    orgSite: null,
    searchPaths: [],
  },
  pagination: {
    currentPage: 1,
    totalPages: 1,
    resultsPerPage: 10,
    filteredResults: null,
  },
};

// HTML Operations Path Management Functions
function addHtmlOpsSearchPath(path) {
  if (!path || path.trim() === '') return false;

  const normalizedPath = path.trim().startsWith('/') ? path.trim() : `/${path.trim()}`;

  if (app.htmlOps.searchPaths.includes(normalizedPath)) {
    showMessage(`Path "${normalizedPath}" is already added`, 'warning');
    return false;
  }

  app.htmlOps.searchPaths.push(normalizedPath);
  renderHtmlOpsPathTags();
  showMessage(`Added path: ${normalizedPath}`, 'success');
  return true;
}

function removeHtmlOpsSearchPath(path) {
  const index = app.htmlOps.searchPaths.indexOf(path);
  if (index > -1) {
    app.htmlOps.searchPaths.splice(index, 1);
    renderHtmlOpsPathTags();
  }
}

function renderHtmlOpsPathTags() {
  const container = document.getElementById('html-ops-path-tags');
  if (!container) return;

  container.innerHTML = '';

  app.htmlOps.searchPaths.forEach((path) => {
    const tag = document.createElement('div');
    tag.className = 'path-tag';
    tag.setAttribute('data-path', path);

    tag.innerHTML = `
      <span class="tag-text">${path}</span>
      <button type="button" class="tag-remove" aria-label="Remove path ${path}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;

    const removeBtn = tag.querySelector('.tag-remove');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event bubbling
      removeHtmlOpsSearchPath(path);
    });

    container.appendChild(tag);
  });
}

function parseHtmlOpsOrgSite() {
  const orgSitePath = document.getElementById('html-ops-org-site')?.value?.trim();
  if (orgSitePath) {
    const cleanPath = orgSitePath.startsWith('/') ? orgSitePath.slice(1) : orgSitePath;
    const parts = cleanPath.split('/').filter((part) => part.length > 0);

    if (parts.length >= 2) {
      const result = { org: parts[0], site: parts[1] };
      app.htmlOps.orgSite = result;
      return result;
    }
  }

  if (app.htmlOps.orgSite) {
    return app.htmlOps.orgSite;
  }

  return null;
}

function validateHtmlOpsConfig() {
  const orgSite = parseHtmlOpsOrgSite();
  if (!orgSite) {
    showMessage('Please enter organization/site in HTML Operations config', 'error');
    return false;
  }
  return true;
}

// Fetch content from file
async function fetchContent(filePath) {
  const cacheKey = filePath;
  if (app.fileCache.has(cacheKey)) {
    return app.fileCache.get(cacheKey);
  }

  const { token } = app;
  const orgSite = parseHtmlOpsOrgSite();
  if (!orgSite) return null;

  const { org, site } = orgSite;
  const url = `${API.SOURCE}/${org}/${site}${filePath}.html`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const content = await response.text();
    app.fileCache.set(cacheKey, content);
    return content;
  } catch (error) {
    console.error(`Error fetching ${filePath}:`, error);
    return null;
  }
}

// Save content to file
async function saveContent(filePath, content) {
  const { token } = app;
  const orgSite = parseHtmlOpsOrgSite();
  if (!orgSite) return false;

  const { org, site } = orgSite;
  const url = `${API.SOURCE}/${org}/${site}${filePath}.html`;

  try {
    const formData = new FormData();
    formData.append('data', new Blob([content], { type: 'text/html' }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    app.fileCache.set(filePath, content);
    return true;
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
    return false;
  }
}

// Create version backup
async function createVersion(filePath) {
  const { actions } = app;
  const orgSite = parseHtmlOpsOrgSite();
  if (!orgSite) return false;

  const { org, site } = orgSite;

  try {
    await actions.createVersion({
      org,
      site,
      path: filePath,
    });
    return true;
  } catch (error) {
    console.error(`Error creating version for ${filePath}:`, error);
    return false;
  }
}

// Fetch files for HTML operations
async function fetchFilesForHtmlOps(basePath = '') {
  const { token } = app;
  const orgSite = parseHtmlOpsOrgSite();
  if (!orgSite) {
    throw new Error('Organization and site must be configured in HTML Operations');
  }
  const { org, site } = orgSite;
  const url = `${API.LIST}/${org}/${site}${basePath}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    const htmlFiles = [];
    const includeSubfolders = document.getElementById('html-ops-include-subfolders')?.checked || false;

    data.forEach((item) => {
      if (item.ext === 'html' && item.lastModified) {
        htmlFiles.push(item);
      }
    });

    if (includeSubfolders) {
      const subfolderPromises = data
        .filter((item) => !item.ext && !item.lastModified && item.name !== '.DS_Store')
        .map(async (item) => {
          try {
            return await fetchFilesForHtmlOps(item.path.replace(`/${org}/${site}`, ''));
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

async function fetchAllFilesForHtmlOps() {
  const allFiles = [];

  if (app.htmlOps.searchPaths.length === 0) {
    return fetchFilesForHtmlOps('');
  }

  const processedPaths = new Set();

  await Promise.all(app.htmlOps.searchPaths.map(async (path) => {
    if (processedPaths.has(path)) return;
    processedPaths.add(path);

    try {
      const files = await fetchFilesForHtmlOps(path);
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

// Search for elements in HTML
function searchForElements(htmlContent, selector) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const elements = doc.querySelectorAll(selector);
  
  const matches = [];
  elements.forEach((el, index) => {
    matches.push({
      index,
      selector,
      outerHTML: el.outerHTML,
      textContent: el.textContent.substring(0, 100),
      selected: true,
    });
  });

  return {
    matches,
    updatedContent: doc.documentElement.outerHTML,
  };
}

// Scan for elements
async function scanForElements() {
  resetPagination();

  if (!validateHtmlOpsConfig()) {
    return;
  }

  const scanSelector = document.getElementById('scan-selector')?.value?.trim();

  if (!scanSelector) {
    showMessage('Please enter a CSS selector to scan for', 'error');
    return;
  }

  try {
    let pathsText;
    if (app.htmlOps.searchPaths.length === 0) {
      pathsText = 'entire site';
    } else if (app.htmlOps.searchPaths.length === 1) {
      [pathsText] = app.htmlOps.searchPaths;
    } else {
      pathsText = `${app.htmlOps.searchPaths.length} selected paths`;
    }
    
    showMessage(`Scanning for "${scanSelector}" in ${pathsText}...`, 'info');
    updateProgress(10, 'Fetching file list...');

    const files = await fetchAllFilesForHtmlOps();

    if (files.length === 0) {
      showMessage('No HTML files found', 'error');
      updateProgress(0, '');
      return;
    }

    app.results = [];

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
    });

    updateProgress(100, 'Scan complete!');

    const filesScanned = files.length;
    const matchesFound = app.results.reduce((total, result) => total + result.elementCount, 0);

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

    const deleteBtn = document.getElementById('delete-html-btn');
    const addHtmlBtn = document.getElementById('add-html-btn');

    if (deleteBtn) deleteBtn.disabled = app.results.length === 0;
    if (addHtmlBtn) addHtmlBtn.disabled = app.results.length === 0;

    showMessage(`Found ${matchesFound} "${scanSelector}" element(s) in ${app.results.length} files`, 'success');
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'error');
    updateProgress(0, '');
  }
}

// Add HTML node
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

      updateProgress((index / selected.length) * 50, `Creating backup for ${fileName}...`);
      const versionResult = await createVersion(result.file.path);

      if (!versionResult) {
        updateProgress(((index + 1) / selected.length) * 100, `Skipped ${fileName} - backup failed`);
        return { success: false, versionCreated: false, skipped: true };
      }

      versionCount++;

      updateProgress(((index + 0.5) / selected.length) * 100, `Adding HTML to ${fileName}...`);

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(result.originalContent, 'text/html');
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent.trim();
        const newNode = tempDiv.firstElementChild;

        if (!newNode) {
          return { success: false, versionCreated: true, skipped: true, error: 'Invalid HTML structure' };
        }

        let targetElement;

        if (targetSelector) {
          targetElement = doc.querySelector(targetSelector);
          if (!targetElement) {
            return { success: false, versionCreated: true, skipped: true, error: `Target selector "${targetSelector}" not found` };
          }
        } else {
          targetElement = doc.querySelector('main') || doc.body;
        }

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

// Delete HTML node
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
    let totalDeleted = 0;

    const deletePromises = selected.map(async (result, index) => {
      const fileName = result.file.path.split('/').pop();

      updateProgress((index / selected.length) * 50, `Creating backup for ${fileName}...`);
      const versionResult = await createVersion(result.file.path);

      if (!versionResult) {
        updateProgress(((index + 1) / selected.length) * 100, `Skipped ${fileName} - backup failed`);
        return { success: false, versionCreated: false, skipped: true, deletedCount: 0 };
      }

      updateProgress(((index + 0.5) / selected.length) * 100, `Deleting elements from ${fileName}...`);

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(result.originalContent, 'text/html');
        
        const elementsToDelete = doc.querySelectorAll(deleteSelector);
        const deletedCount = elementsToDelete.length;

        if (deletedCount === 0) {
          return { success: true, versionCreated: true, skipped: true, deletedCount: 0, noMatch: true };
        }

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

// Display results
function displayResults() {
  const listContainer = document.getElementById('results-list');
  if (!listContainer) return;

  const filteredResults = app.pagination.filteredResults || app.results;

  if (filteredResults.length === 0) {
    listContainer.innerHTML = '<div class="no-results"><p>No results found</p></div>';
    return;
  }

  const { currentPage, resultsPerPage } = app.pagination;
  const startIndex = (currentPage - 1) * resultsPerPage;
  const endIndex = Math.min(startIndex + resultsPerPage, filteredResults.length);
  const pageResults = filteredResults.slice(startIndex, endIndex);

  listContainer.innerHTML = '';

  pageResults.forEach((result) => {
    const globalIndex = app.results.indexOf(result);
    const resultItem = createResultItem(result, globalIndex);
    listContainer.appendChild(resultItem);
  });

  updatePaginationControls();
}

function createResultItem(result, index) {
  const div = document.createElement('div');
  div.className = `result-item ${result.selected ? 'selected' : ''}`;
  div.setAttribute('data-index', index);

  const filePath = result.file.path.replace(`/${result.file.org}/${result.file.repo}`, '');

  div.innerHTML = `
    <div class="result-header">
      <div class="result-checkbox">
        <input type="checkbox" ${result.selected ? 'checked' : ''} data-file-index="${index}">
      </div>
      <div class="result-info">
        <div class="result-path">${filePath}</div>
        <div class="result-stats">
          <span class="stat-badge">${result.elementCount} element(s)</span>
        </div>
      </div>
      <button class="expand-toggle" data-index="${index}" type="button">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
    </div>
    <div class="result-matches" style="display: none;">
      ${result.matches.map((match, i) => `
        <div class="match-item">
          <div class="match-header">
            <span class="match-number">Match ${i + 1}</span>
            <span class="match-selector">${match.selector}</span>
          </div>
          <div class="match-preview">
            <code>${escapeHtml(match.outerHTML.substring(0, 200))}${match.outerHTML.length > 200 ? '...' : ''}</code>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  const checkbox = div.querySelector(`input[data-file-index="${index}"]`);
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation(); // Prevent triggering accordion
    result.selected = e.target.checked;
    if (e.target.checked) {
      app.selectedFiles.add(index);
      div.classList.add('selected');
    } else {
      app.selectedFiles.delete(index);
      div.classList.remove('selected');
    }
  });

  const expandBtn = div.querySelector('.expand-toggle');
  const matchesContainer = div.querySelector('.result-matches');
  
  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering parent events
    const isExpanded = matchesContainer.style.display !== 'none';
    matchesContainer.style.display = isExpanded ? 'none' : 'block';
    expandBtn.classList.toggle('expanded', !isExpanded);
  });

  return div;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Pagination functions
function resetPagination() {
  app.pagination.currentPage = 1;
  app.pagination.filteredResults = null;
}

function updatePaginationControls() {
  const paginationContainer = document.getElementById('pagination-container');
  const filteredResults = app.pagination.filteredResults || app.results;
  
  if (filteredResults.length <= app.pagination.resultsPerPage) {
    paginationContainer.style.display = 'none';
    return;
  }

  paginationContainer.style.display = 'flex';

  const totalPages = Math.ceil(filteredResults.length / app.pagination.resultsPerPage);
  app.pagination.totalPages = totalPages;

  const startIndex = (app.pagination.currentPage - 1) * app.pagination.resultsPerPage + 1;
  const endIndex = Math.min(app.pagination.currentPage * app.pagination.resultsPerPage, filteredResults.length);

  document.getElementById('pagination-info-text').textContent = 
    `Showing ${startIndex}-${endIndex} of ${filteredResults.length} results`;

  document.getElementById('prev-page').disabled = app.pagination.currentPage === 1;
  document.getElementById('next-page').disabled = app.pagination.currentPage === totalPages;

  renderPageNumbers();
}

function renderPageNumbers() {
  const container = document.getElementById('page-numbers');
  container.innerHTML = '';

  const { currentPage, totalPages } = app.pagination;
  let startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);

  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `page-number ${i === currentPage ? 'active' : ''}`;
    pageBtn.textContent = i;
    pageBtn.type = 'button';
    pageBtn.addEventListener('click', () => {
      app.pagination.currentPage = i;
      displayResults();
    });
    container.appendChild(pageBtn);
  }
}

// Progress and message functions
function updateProgress(percent, message) {
  const container = document.querySelector('.progress-container');
  const fill = document.querySelector('.progress-fill');
  const text = document.querySelector('.progress-text');

  if (percent > 0) {
    container.style.display = 'block';
    fill.style.width = `${percent}%`;
    text.textContent = message;
  } else {
    container.style.display = 'none';
  }
}

function showMessage(message, type = 'info') {
  const toast = document.getElementById('toast');
  const messageEl = toast.querySelector('.toast-message');
  const iconEl = toast.querySelector('.toast-icon img');

  messageEl.textContent = message;
  
  toast.className = 'toast';
  toast.classList.add(type);
  toast.classList.remove('hidden');

  const icons = {
    success: './search/icons/check.svg',
    error: './search/icons/error.svg',
    warning: './search/icons/warning.svg',
    info: './search/icons/info.svg',
  };

  iconEl.src = icons[type] || icons.info;

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 5000);
}

// Setup event listeners
function setupEventListeners() {
  // Main operation buttons
  const scanElementsBtn = document.getElementById('scan-elements-btn');
  const addHtmlBtn = document.getElementById('add-html-btn');
  const deleteHtmlBtn = document.getElementById('delete-html-btn');
  
  if (scanElementsBtn) {
    scanElementsBtn.addEventListener('click', scanForElements);
  }
  if (addHtmlBtn) {
    addHtmlBtn.addEventListener('click', addHtmlNode);
  }
  if (deleteHtmlBtn) {
    deleteHtmlBtn.addEventListener('click', deleteHtmlNode);
  }

  // Results control buttons
  const toggleAll = document.getElementById('toggle-all');
  const clearSelection = document.getElementById('clear-selection');
  const expandAll = document.getElementById('expand-all');
  const collapseAll = document.getElementById('collapse-all');

  if (toggleAll) {
    toggleAll.addEventListener('click', () => {
      const allSelected = app.results.every(r => r.selected);
      app.results.forEach((r, i) => {
        r.selected = !allSelected;
        if (!allSelected) {
          app.selectedFiles.add(i);
        } else {
          app.selectedFiles.delete(i);
        }
      });
      displayResults();
    });
  }

  if (clearSelection) {
    clearSelection.addEventListener('click', () => {
      app.results.forEach((r, i) => {
        r.selected = false;
        app.selectedFiles.delete(i);
      });
      displayResults();
    });
  }

  if (expandAll) {
    expandAll.addEventListener('click', () => {
      document.querySelectorAll('.result-matches').forEach(el => {
        el.style.display = 'block';
      });
      document.querySelectorAll('.expand-toggle').forEach(btn => {
        btn.classList.add('expanded');
      });
    });
  }

  if (collapseAll) {
    collapseAll.addEventListener('click', () => {
      document.querySelectorAll('.result-matches').forEach(el => {
        el.style.display = 'none';
      });
      document.querySelectorAll('.expand-toggle').forEach(btn => {
        btn.classList.remove('expanded');
      });
    });
  }

  // HTML Operations path input
  const htmlOpsPathInput = document.getElementById('html-ops-search-path-input');
  if (htmlOpsPathInput) {
    htmlOpsPathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const path = htmlOpsPathInput.value.trim();
        if (addHtmlOpsSearchPath(path)) {
          htmlOpsPathInput.value = '';
        }
      }
    });
  }

  // HTML Operations org/site input validation
  const htmlOpsOrgSiteInput = document.getElementById('html-ops-org-site');
  if (htmlOpsOrgSiteInput) {
    htmlOpsOrgSiteInput.addEventListener('input', () => {
      const orgSite = parseHtmlOpsOrgSite();
      if (orgSite) {
        showMessage(`Configuration set: ${orgSite.org}/${orgSite.site}`, 'success');
      }
    });
  }

  // Filter results
  const filterInput = document.getElementById('filter-results');
  if (filterInput) {
    filterInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      if (!query) {
        app.pagination.filteredResults = null;
      } else {
        app.pagination.filteredResults = app.results.filter(r => 
          r.file.path.toLowerCase().includes(query)
        );
      }
      app.pagination.currentPage = 1;
      displayResults();
    });
  }

  // Pagination
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (app.pagination.currentPage > 1) {
        app.pagination.currentPage--;
        displayResults();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (app.pagination.currentPage < app.pagination.totalPages) {
        app.pagination.currentPage++;
        displayResults();
      }
    });
  }

  // Help modal
  const helpBtn = document.querySelector('.help-btn');
  const helpModal = document.getElementById('help-modal');
  const modalClose = document.querySelector('.modal-close');

  if (helpBtn && helpModal) {
    helpBtn.addEventListener('click', () => {
      helpModal.classList.remove('hidden');
    });

    if (modalClose) {
      modalClose.addEventListener('click', () => {
        helpModal.classList.add('hidden');
      });
    }

    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) {
        helpModal.classList.add('hidden');
      }
    });
  }

  // Toast close
  const toastClose = document.querySelector('.toast-close');
  if (toastClose) {
    toastClose.addEventListener('click', () => {
      document.getElementById('toast').classList.add('hidden');
    });
  }

  // Accordion functionality - FIXED
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Ignore clicks on form elements inside the accordion header
      if (e.target.closest('input, button, select, textarea, .form-control')) {
        return;
      }

      const target = header.getAttribute('data-accordion-target');
      const content = document.getElementById(target);
      const card = header.closest('.accordion-card');

      if (content && card) {
        const isCurrentlyExpanded = content.style.display !== 'none';
        
        if (isCurrentlyExpanded) {
          // Collapse
          content.style.display = 'none';
          card.classList.remove('expanded');
        } else {
          // Expand
          content.style.display = 'block';
          card.classList.add('expanded');
        }
      }
    });
  });
}

// Initialize app
async function init() {
  try {
    const { context, token, actions } = await DA_SDK;

    app.context = context;
    app.token = token;
    app.actions = actions;

    setupEventListeners();

    showMessage('HTML Operations Tool ready! Configure org/site to get started.', 'success');
  } catch (error) {
    showMessage('Failed to initialize app', 'error');
    console.error('Init error:', error);
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}