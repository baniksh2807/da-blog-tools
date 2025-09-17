// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
// eslint-disable-next-line import/no-unresolved
import { DA_ORIGIN } from 'https://da.live/nx/public/utils/constants.js';

const REPLACE_CONTENT = 'CONTENT';

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  const value = urlParams.get(param);
  return value ? decodeURIComponent(value) : value;
}

function formatData(data, format, type = '') {
  const dataArr = data.data || data;
  const result = dataArr.reduce((acc, item) => {
    if (item.key) {
      let content = item.key;
      if (type != null && type !== '' && type === 'label' && item.value) {
        content = item.value;
      }
      const toParse = format ? format.replace(REPLACE_CONTENT, content) : content;
      const parsed = { text: toParse };
      acc.push({ ...item, parsed });
    }
    return acc;
  }, []);
  return result;
}

function renderItems(items, listName, iconType = '', customClickHandler = null) {
  return `
    <ul class="da-library-type-list da-library-type-list-${listName}">
      ${items.map((item) => {
        const name = item.value || item.name || item.key;
        if (!name) return '';
        // Use custom click handler if provided, else default to handleItemClick
        const clickHandler = customClickHandler
          ? `${customClickHandler}(${JSON.stringify(item).replace(/"/g, '&quot;')})`
          : `handleItemClick(${JSON.stringify(item).replace(/"/g, '&quot;')})`;
        return `
          <li class="da-library-type-item">
            <button class="da-library-type-item-btn ${iconType}"
              onclick="${clickHandler}">
              <div class="da-library-type-item-detail">
                ${item.icon && !item.url ? `<span class="icon-placeholder">${item.icon}</span>` : ''}
                <span>${name}</span>
                <svg class="icon">
                  <use href="#spectrum-AddCircle"/>
                </svg>
              </div>
            </button>
          </li>`;
      }).join('')}
    </ul>`;
}

async function handleItemClick(item) {
  try {
    const { actions } = await DA_SDK;
    if (item.parsed && item.parsed.text) {
      await actions.sendText(item.parsed.text);
    } else if (item.key) {
      await actions.sendText(item.key);
    }
    await actions.closeLibrary();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error sending text:', error);
  }
}

window.handleItemClick = handleItemClick;
window.insertAuthorToPage = insertAuthorToPage;

/**
 * Utility to insert author info into the article header, article summary, and metadata.
 * @param {Object} item - The author item (expects { key, value })
 */
async function insertAuthorToPage(item) {
  try {
    const { context, token, actions } = await DA_SDK;

    // 1. Download the page source
    const sourceUrl = `${DA_ORIGIN}/source/${context.org}/${context.repo}${context.path}.html`;
    const response = await actions.daFetch(sourceUrl);
    if (!response.ok) throw new Error(`Failed to fetch page source: ${response.statusText}`);
    const sourceContent = await response.text();

    // 2. Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(sourceContent, 'text/html');

    // --- METADATA BLOCK ---
    let metadata = doc.querySelector('.metadata');
    if (!metadata) {
      metadata = doc.createElement('div');
      metadata.className = 'metadata';
      const main = doc.querySelector('main') || doc.body;
      main.insertBefore(metadata, main.firstChild);
    }
    // Look for existing author row
    let authorRow = Array.from(metadata.children).find(row => {
      const keyDiv = row.children[0];
      const keyElement = keyDiv.querySelector('p');
      const keyText = keyElement
        ? keyElement.textContent.trim().toLowerCase()
        : keyDiv.textContent.trim().toLowerCase();
      return keyText === 'author';
    });
    let newValue;
    if (!authorRow) {
      // Create new row
      authorRow = doc.createElement('div');
      authorRow.innerHTML = `<div><p>author</p></div><div><p>${item.value}</p></div>`;
      metadata.appendChild(authorRow);
      newValue = item.value;
    } else {
      // Update value in the second column (second div) with comma separated values
      const valueDiv = authorRow.children[1];
      const valueP = valueDiv.querySelector('p');
      let currentValue = valueP ? valueP.textContent.trim() : valueDiv.textContent.trim();
      const values = currentValue ? currentValue.split(',').map(v => v.trim()) : [];
      if (!values.includes(item.value)) {
        values.push(item.value);
      }
      newValue = values.filter(Boolean).join(', ');
      if (valueP) valueP.textContent = newValue;
      else valueDiv.textContent = newValue;
    }

    // 3. Serialize and save
    let updatedHtml = doc.documentElement.outerHTML;
    updatedHtml = updatedHtml.replace(/<!--[\s\S]*?-->/g, ''); // Remove comments

    const body = new FormData();
    body.append('data', new Blob([updatedHtml], { type: 'text/html' }));

    // 4. Update document and then send text
    const updateResponse = await actions.daFetch(sourceUrl, {
      method: 'POST',
      body,
    });
    if (!updateResponse.ok) throw new Error(`Failed to update page: ${updateResponse.statusText}`);

    // Only after update, send text to editor and close library
    if (item.parsed && item.parsed.text) {
      await actions.sendText(item.parsed.text);
    } else if (item.key) {
      await actions.sendText(item.key);
    }
    await actions.closeLibrary();

  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error inserting author info:', error);
    // Optionally, show an error message
    // alert('Failed to add author info: ' + error.message);
  }
}

async function displayListValue() {
  const contentPath = getQueryParam('content');
  const format = getQueryParam('format');
  const typeJson = getQueryParam('type');
  const resultDiv = document.getElementById('result');

  if (contentPath) {
    try {
      resultDiv.innerHTML = `
        <div class="result">
          <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      `;
      const { context, actions } = await DA_SDK;

      // Check if contentPath is a full URL or relative path
      const isFullUrl = contentPath.startsWith('http://') || contentPath.startsWith('https://');
      let adminApiUrl = isFullUrl ? contentPath : `${DA_ORIGIN}/source/${context.org}/${context.repo}${contentPath}`;

      // Fetch the main JSON (multi-sheet or regular)
      const response = isFullUrl ? await fetch(adminApiUrl) : await actions.daFetch(adminApiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const jsonData = await response.json();

      // Detect multi-sheet format
      const isMultiSheet = jsonData[':type'] === 'multi-sheet' && Array.isArray(jsonData[':names']);
      if (isMultiSheet) {
        // Render dropdown for sheets (sites)
        const sheetNames = jsonData[':names'];
        resultDiv.innerHTML = `
          <div class="result">
            <label for="siteDropdown"><strong>Select Site:</strong></label>
            <select id="siteDropdown">
              <option value="">-- Select a Site --</option>
              ${sheetNames.map(site => `<option value="${site}">${site}</option>`).join('')}
            </select>
            <div id="sheetDataList"></div>
          </div>
        `;
        const dropdown = document.getElementById('siteDropdown');
        const sheetDataListDiv = document.getElementById('sheetDataList');

        dropdown.addEventListener('change', () => {
          const selectedSheet = dropdown.value;
          if (!selectedSheet) {
            sheetDataListDiv.innerHTML = '';
            return;
          }
          // Instead of fetching, use the data from the loaded JSON
          const sheetObj = jsonData[selectedSheet];
          const rawItems = Array.isArray(sheetObj) ? sheetObj : (sheetObj.items || sheetObj.data || []);
          if (typeJson === 'authors') {
            if (rawItems && rawItems.length > 0) {
              sheetDataListDiv.innerHTML = renderItems(rawItems, 'authors', '', 'insertAuthorToPage');
            } else {
              sheetDataListDiv.innerHTML = `<div class="no-value"><p>No data found for "${selectedSheet}"</p></div>`;
            }
          } else {
            if (rawItems && rawItems.length > 0) {
              sheetDataListDiv.innerHTML = renderItems(rawItems, 'sheet');
            } else {
              sheetDataListDiv.innerHTML = `<div class="no-value"><p>No data found for "${selectedSheet}"</p></div>`;
            }
          }
        });
      } else {
        // Fallback to original logic for single-sheet/regular JSON
        const rawItems = Array.isArray(jsonData) ? jsonData : (jsonData.items || jsonData.data || []);
        if (rawItems && rawItems.length > 0) {
          const rawUrl = window.location.href;
          const hasComma = rawUrl.includes('CONTENT%2C') || rawUrl.includes('CONTENT,');
          const effectiveFormat = format || 'CONTENT';
          // Only add comma if the format doesn't already end with one
          const finalFormat = hasComma && !effectiveFormat.endsWith(',') ? `${effectiveFormat},` : effectiveFormat;
          const items = finalFormat ? formatData(jsonData, finalFormat) : rawItems;

          // Build unique site list from sitegroup
          const sites = [...new Set(items.map((item) => item.sitegroup).filter(Boolean))];
          if (typeJson === 'authors' && sites.length > 0) {
            // Render dropdown for sites only (no type dropdown)
            resultDiv.innerHTML = `
              <div class="result">
                <label for="siteDropdown"><strong>Select Site:</strong></label>
                <select id="siteDropdown">
                  <option value="">-- Select a Site --</option>
                  ${sites.map(site => `<option value="${site}">${site}</option>`).join('')}
                </select>
                <div id="authorsList"></div>
              </div>
            `;
            const dropdown = document.getElementById('siteDropdown');
            const authorsListDiv = document.getElementById('authorsList');

            // Helper to render authors based on dropdown
            function renderAuthorsList() {
              const selectedSite = dropdown.value;
              if (selectedSite) {
                let filteredAuthors = items.filter(item => item.sitegroup === selectedSite);
                authorsListDiv.innerHTML = renderItems(filteredAuthors, 'authors', '', 'insertAuthorToPage');
              } else {
                authorsListDiv.innerHTML = '<p>Please select a site to view authors.</p>';
              }
            }

            dropdown.addEventListener('change', renderAuthorsList);
          } else {
            resultDiv.innerHTML = `
              <div class="result">
                ${renderItems(items, 'default')}
              </div>
            `;
          }
        } else {
          resultDiv.innerHTML = `
            <div class="result">
              <pre>${JSON.stringify(jsonData, null, 2)}</pre>
            </div>
          `;
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
  } else {
    resultDiv.innerHTML = `
      <div class="no-value">
        <h3>No Content Path Found</h3>
        <p>No "content" parameter found in the URL query string.</p>
        <p>Try adding <code>?content=/docs/library/authors.json</code> to the URL.</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  displayListValue();
});