// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
// eslint-disable-next-line import/no-unresolved
import { DA_ORIGIN } from 'https://da.live/nx/public/utils/constants.js';

const REPLACE_CONTENT = 'CONTENT';
const multiSelectState = { enabled: false };

// Utility functions
const getQueryParam = (param) => {
  const value = new URLSearchParams(window.location.search).get(param);
  return value ? decodeURIComponent(value) : value;
};

const formatData = (data, format, type = '') => {
  const dataArr = data.data || data;
  return dataArr
    .filter(item => item.key)
    .map(item => {
      const content = (type === 'label' && item.value) ? item.value : item.key;
      const text = format ? format.replace(REPLACE_CONTENT, content) : content;
      return { ...item, parsed: { text } };
    });
};

const renderItems = (items, listName, iconType = '', customClickHandler = null) => {
  if (!items?.length) return '<div class="no-value"><p>No items available</p></div>';

  const itemsHtml = items
    .filter(item => item.value || item.name || item.key)
    .map(item => {
      const name = item.value || item.name || item.key;
      const clickHandler = customClickHandler || 'handleItemClick';
      const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');
      
      return `
        <li class="da-library-type-item">
          <button class="da-library-type-item-btn ${iconType}"
            onclick="${clickHandler}(${itemJson})">
            <div class="da-library-type-item-detail">
              ${item.icon && !item.url ? `<span class="icon-placeholder">${item.icon}</span>` : ''}
              <span>${name}</span>
              <svg class="icon">
                <use href="#spectrum-AddCircle"/>
              </svg>
            </div>
          </button>
        </li>`;
    })
    .join('');

  return `<ul class="da-library-type-list da-library-type-list-${listName}">${itemsHtml}</ul>`;
};

// Event handlers
async function handleItemClick(item) {
  try {
    const { actions } = await DA_SDK;
    const text = item.parsed?.text || item.key;
    
    if (text) {
      await actions.sendText(text);
      if (!multiSelectState.enabled) {
        await actions.closeLibrary();
      }
    }
  } catch (error) {
    console.error('Error sending text:', error);
  }
}

async function insertAuthorToPage(item) {
  try {
    const { context, actions } = await DA_SDK;
    const resultDiv = document.getElementById('sheetDataList');

    // Send text first
    const text = item.parsed?.text || item.key;
    if (text) await actions.sendText(text);

    // Show loading state
    if (resultDiv) {
      resultDiv.innerHTML = `
        <div class="loading-spinner">
          <div class="spinner"></div>
          <p>Updating author information...</p>
        </div>`;
    }

    // Add delay for processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Update document metadata
    await updateAuthorMetadata(item, context, actions);
    await actions.closeLibrary();

  } catch (error) {
    console.error('Error inserting author info:', error);
  }
}

async function updateAuthorMetadata(item, context, actions) {
  const sourceUrl = `${DA_ORIGIN}/source/${context.org}/${context.repo}${context.path}.html`;
  
  // Fetch and parse document
  const response = await actions.daFetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to fetch page source: ${response.statusText}`);
  
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  
  // Update metadata
  let metadata = doc.querySelector('.metadata');
  if (!metadata) {
    metadata = doc.createElement('div');
    metadata.className = 'metadata';
    const main = doc.querySelector('main') || doc.body;
    main.insertBefore(metadata, main.firstChild);
  }

  // Find or create author row
  let authorRow = Array.from(metadata.children).find(row => {
    const keyDiv = row.children[0];
    const keyText = (keyDiv.querySelector('p')?.textContent || keyDiv.textContent).trim().toLowerCase();
    return keyText === 'author';
  });

  if (!authorRow) {
    authorRow = doc.createElement('div');
    authorRow.innerHTML = `<div><p>author</p></div><div><p>${item.value}</p></div>`;
    metadata.appendChild(authorRow);
  } else {
    // Update existing author with comma-separated values
    const valueDiv = authorRow.children[1];
    const valueP = valueDiv.querySelector('p');
    const currentValue = (valueP?.textContent || valueDiv.textContent).trim();
    const values = currentValue ? currentValue.split(',').map(v => v.trim()) : [];
    
    if (!values.includes(item.value)) {
      values.push(item.value);
      const newValue = values.filter(Boolean).join(', ');
      if (valueP) valueP.textContent = newValue;
      else valueDiv.textContent = newValue;
    }
  }

  // Save document
  const body = new FormData();
  body.append('data', new Blob([doc.documentElement.outerHTML], { type: 'text/html' }));
  
  const updateResponse = await actions.daFetch(sourceUrl, { method: 'POST', body });
  if (!updateResponse.ok) throw new Error(`Failed to update page: ${updateResponse.statusText}`);
}

// Multi-sheet functionality
const getUniqueTaxonomies = (data) => {
  const taxonomies = new Set();
  data.forEach(item => item.taxonomy && taxonomies.add(item.taxonomy));
  return Array.from(taxonomies).sort();
};

const hasTaxonomyData = (jsonData, selectedSite) => {
  const sheetObj = jsonData[selectedSite];
  const rawItems = Array.isArray(sheetObj) ? sheetObj : (sheetObj?.items || sheetObj?.data || []);
  return rawItems.some(item => item.taxonomy);
};

const filterItemsBySiteAndTaxonomy = (jsonData, selectedSite, selectedTaxonomy) => {
  const sheetObj = jsonData[selectedSite];
  const rawItems = Array.isArray(sheetObj) ? sheetObj : (sheetObj?.items || sheetObj?.data || []);
  
  return selectedTaxonomy 
    ? rawItems.filter(item => item.taxonomy === selectedTaxonomy)
    : rawItems;
};

const createMultiSheetInterface = (sheetNames, jsonData) => {
  // Check if any site has taxonomy data
  const hasTaxonomy = sheetNames.some(site => hasTaxonomyData(jsonData, site));
  
  const categoryDropdown = hasTaxonomy ? `
    <div class="filter-group">
      <label for="taxonomyDropdown"><strong>Filter by Category:</strong></label>
      <select id="taxonomyDropdown" disabled>
        <option value="">-- Select a Category --</option>
      </select>
    </div>
  ` : '';

  return `
    <div class="result">
      <div class="filter-controls">
        <div class="filter-group">
          <label for="siteDropdown"><strong>Select Site:</strong></label>
          <select id="siteDropdown">
            <option value="">-- Select a Site --</option>
            ${sheetNames.map(site => `<option value="${site}">${site}</option>`).join('')}
          </select>
        </div>
        ${categoryDropdown}
      </div>
      <div id="sheetDataList"></div>
    </div>
  `;
};

const updateTaxonomyDropdown = (jsonData, selectedSite) => {
  const taxonomyDropdown = document.getElementById('taxonomyDropdown');
  
  // Return early if no taxonomy dropdown exists
  if (!taxonomyDropdown) return;
  
  if (!selectedSite || !hasTaxonomyData(jsonData, selectedSite)) {
    taxonomyDropdown.innerHTML = '<option value="">-- Select a Category --</option>';
    taxonomyDropdown.disabled = true;
    return;
  }
  
  const sheetObj = jsonData[selectedSite];
  const rawItems = Array.isArray(sheetObj) ? sheetObj : (sheetObj?.items || sheetObj?.data || []);
  const taxonomies = getUniqueTaxonomies(rawItems);
  
  taxonomyDropdown.innerHTML = `
    <option value="">-- All Categories --</option>
    ${taxonomies.map(taxonomy => `<option value="${taxonomy}">${taxonomy}</option>`).join('')}
  `;
  taxonomyDropdown.disabled = false;
};

const renderFilteredItems = (jsonData, selectedSite, selectedTaxonomy, typeJson, format) => {
  const sheetDataListDiv = document.getElementById('sheetDataList');
  
  if (!selectedSite) {
    sheetDataListDiv.innerHTML = '<p>Please select a site to view items.</p>';
    return;
  }
  
  const filteredItems = filterItemsBySiteAndTaxonomy(jsonData, selectedSite, selectedTaxonomy);
  
  if (!filteredItems?.length) {
    const noDataText = selectedTaxonomy 
      ? `No items found in "${selectedTaxonomy}" category for "${selectedSite}"`
      : `No data found for "${selectedSite}"`;
    sheetDataListDiv.innerHTML = `<div class="no-value"><p>${noDataText}</p></div>`;
    return;
  }

  // Render items based on type
  let itemsHtml;
  if (typeJson === 'authors') {
    itemsHtml = renderItems(filteredItems, 'authors', '', 'insertAuthorToPage');
    // For authors: no item count, just show the items
    sheetDataListDiv.innerHTML = itemsHtml;
  } else {
    const finalFormat = getEffectiveFormat(format);
    const formattedItems = finalFormat ? formatData({ data: filteredItems }, finalFormat) : filteredItems;
    itemsHtml = renderItems(formattedItems, 'sheet');
    
    // Only show item count if taxonomy data exists and it's not authors
    const showItemCount = hasTaxonomyData(jsonData, selectedSite);
    
    if (showItemCount) {
      const countText = selectedTaxonomy 
        ? `Showing ${filteredItems.length} items in "${selectedTaxonomy}" category`
        : `Showing ${filteredItems.length} items (all categories)`;
      
      sheetDataListDiv.innerHTML = `
        <div class="item-count"><p><em>${countText}</em></p></div>
        ${itemsHtml}
      `;
    } else {
      // No taxonomy data, just show items without count
      sheetDataListDiv.innerHTML = itemsHtml;
    }
  }
};

const getEffectiveFormat = (format) => {
  const rawUrl = window.location.href;
  const hasComma = rawUrl.includes('CONTENT%2C') || rawUrl.includes('CONTENT,');
  const effectiveFormat = format || 'CONTENT';
  return hasComma && !effectiveFormat.endsWith(',') ? `${effectiveFormat},` : effectiveFormat;
};

const setupMultiSheetEventListeners = (jsonData, typeJson, format) => {
  const siteDropdown = document.getElementById('siteDropdown');
  const taxonomyDropdown = document.getElementById('taxonomyDropdown');

  siteDropdown.addEventListener('change', () => {
    const selectedSite = siteDropdown.value;
    updateTaxonomyDropdown(jsonData, selectedSite);
    
    // Reset taxonomy selection if dropdown exists
    if (taxonomyDropdown) {
      taxonomyDropdown.value = '';
    }
    
    renderFilteredItems(jsonData, selectedSite, '', typeJson, format);
  });

  // Only add taxonomy dropdown listener if it exists
  if (taxonomyDropdown) {
    taxonomyDropdown.addEventListener('change', () => {
      const selectedSite = siteDropdown.value;
      const selectedTaxonomy = taxonomyDropdown.value;
      renderFilteredItems(jsonData, selectedSite, selectedTaxonomy, typeJson, format);
    });
  }
};

const renderSingleSheetWithSiteFilter = (items, typeJson, sites) => {
  return `
    <div class="result">
      <label for="siteDropdown"><strong>Select Site:</strong></label>
      <select id="siteDropdown">
        <option value="">-- Select a Site --</option>
        ${sites.map(site => `<option value="${site}">${site}</option>`).join('')}
      </select>
      <div id="authorsList"></div>
    </div>
  `;
};

// Main display function
async function displayListValue() {
  const contentPath = getQueryParam('content');
  const format = getQueryParam('format');
  const typeJson = getQueryParam('type');
  const multiSelect = getQueryParam('multiSelect');
  const resultDiv = document.getElementById('result');

  multiSelectState.enabled = multiSelect === 'true';
  
  if (!contentPath) {
    resultDiv.innerHTML = `
      <div class="no-value">
        <h3>No Content Path Found</h3>
        <p>No "content" parameter found in the URL query string.</p>
        <p>Try adding <code>?content=/docs/library/authors.json</code> to the URL.</p>
      </div>
    `;
    return;
  }

  try {
    // Show loading state
    resultDiv.innerHTML = `
      <div class="result">
        <div class="loading-spinner">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    `;

    const { context, actions } = await DA_SDK;
    const isFullUrl = contentPath.startsWith('http://') || contentPath.startsWith('https://');
    const adminApiUrl = isFullUrl ? contentPath : `${DA_ORIGIN}/source/${context.org}/${context.repo}${contentPath}`;

    // Fetch JSON data
    const response = isFullUrl ? await fetch(adminApiUrl) : await actions.daFetch(adminApiUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const jsonData = await response.json();

    // Handle multi-sheet format
    const isMultiSheet = jsonData[':type'] === 'multi-sheet' && Array.isArray(jsonData[':names']);
    
    if (isMultiSheet) {
      resultDiv.innerHTML = createMultiSheetInterface(jsonData[':names'], jsonData);
      setupMultiSheetEventListeners(jsonData, typeJson, format);
    } else {
      // Handle single-sheet format
      const rawItems = Array.isArray(jsonData) ? jsonData : (jsonData.items || jsonData.data || []);
      
      if (!rawItems?.length) {
        resultDiv.innerHTML = `<div class="result"><pre>${JSON.stringify(jsonData, null, 2)}</pre></div>`;
        return;
      }

      const finalFormat = getEffectiveFormat(format);
      const items = finalFormat ? formatData(jsonData, finalFormat) : rawItems;
      const sites = [...new Set(items.map(item => item.sitegroup).filter(Boolean))];

      if (typeJson === 'authors' && sites.length > 0) {
        resultDiv.innerHTML = renderSingleSheetWithSiteFilter(items, typeJson, sites);
        
        const dropdown = document.getElementById('siteDropdown');
        const authorsListDiv = document.getElementById('authorsList');

        dropdown.addEventListener('change', () => {
          const selectedSite = dropdown.value;
          if (selectedSite) {
            const filteredAuthors = items.filter(item => item.sitegroup === selectedSite);
            authorsListDiv.innerHTML = renderItems(filteredAuthors, 'authors', '', 'insertAuthorToPage');
          } else {
            authorsListDiv.innerHTML = '<p>Please select a site to view authors.</p>';
          }
        });
      } else {
        resultDiv.innerHTML = `<div class="result">${renderItems(items, 'default')}</div>`;
      }
    }

  } catch (error) {
    resultDiv.innerHTML = `
      <div class="no-value">
        <h3>Error Fetching JSON:</h3>
        <p><strong>Path: "${contentPath}"</strong></p>
        <p>Error: ${error.message}</p>
      </div>
    `;
  }
}

// Global function assignments
window.handleItemClick = handleItemClick;
window.insertAuthorToPage = insertAuthorToPage;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', displayListValue);