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
      if (type!= null && type !== '' && type === 'label' && item.value) {
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

function renderItems(items, listName, iconType = '') {
  return `
    <ul class="da-library-type-list da-library-type-list-${listName}">
      ${items.map((item) => {
    const name = item.value || item.name || item.key; // Display name
    if (!name) return '';
    return `
          <li class="da-library-type-item">
            <button class="da-library-type-item-btn ${iconType}"
              onclick="handleItemClick(${JSON.stringify(item).replace(/"/g, '&quot;')})">
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

/*async function displayListValue() {
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
      const adminApiUrl = isFullUrl ? contentPath : `${DA_ORIGIN}/source/${context.org}/${context.repo}${contentPath}`;

      // Use regular fetch for full URLs, daFetch for relative paths
      const response = isFullUrl ? await fetch(adminApiUrl) : await actions.daFetch(adminApiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const jsonData = await response.json();
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
          // Render dropdown for sites and type
          resultDiv.innerHTML = `
            <div class="result">
              <label for="siteDropdown"><strong>Select Site:</strong></label>
              <select id="siteDropdown">
                <option value="">-- Select a Site --</option>
                ${sites.map(site => `<option value="${site}">${site}</option>`).join('')}
              </select>
              <select id="typeDropdown">
                <option value="">-- Select Type --</option>
                <option value="label">Author Title</option>
                <option value="link">Author Link</option>
              </select>
              <div id="authorsList"></div>
            </div>
          `;
          const dropdown = document.getElementById('siteDropdown');
          const typeDropdown = document.getElementById('typeDropdown');
          const authorsListDiv = document.getElementById('authorsList');

          // Helper to render authors based on dropdowns
          function renderAuthorsList() {
            const selectedSite = dropdown.value;
            const selectedType = typeDropdown.value;
            if (selectedSite) {
              let filteredAuthors = items.filter(item => item.sitegroup === selectedSite);
              // Adjust format only for authors.json and when a type is selected
              let customFormat = format || 'CONTENT';
              if (selectedType === 'label') {
                // For label, add a comma at the end if not present
                if (!customFormat.endsWith(',')) customFormat += ',';
              } else if (selectedType === 'link') {
                // For link, remove any trailing comma
                customFormat = customFormat.replace(/,+$/, '');
              }
              // Re-format the filtered authors if type is selected
              if (selectedType) {
                filteredAuthors = formatData({ data: filteredAuthors }, customFormat, selectedType);
              }
              authorsListDiv.innerHTML = renderItems(filteredAuthors, 'authors');
            } else {
              authorsListDiv.innerHTML = '<p>Please select a site to view authors.</p>';
            }
          }

          dropdown.addEventListener('change', renderAuthorsList);
          typeDropdown.addEventListener('change', renderAuthorsList);
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
}*/

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

        dropdown.addEventListener('change', async () => {
          const selectedSheet = dropdown.value;
          if (!selectedSheet) {
            sheetDataListDiv.innerHTML = '';
            return;
          }
          // Fetch the selected sheet using ?sheet=
          let sheetUrl = adminApiUrl;
          // Add or replace ?sheet= param
          if (sheetUrl.includes('?')) {
            sheetUrl = sheetUrl.replace(/([?&])sheet=[^&]*/, `$1sheet=${encodeURIComponent(selectedSheet)}`);
            if (!sheetUrl.includes('sheet=')) {
              sheetUrl += `&sheet=${encodeURIComponent(selectedSheet)}`;
            }
          } else {
            sheetUrl += `?sheet=${encodeURIComponent(selectedSheet)}`;
          }
          const sheetResp = isFullUrl ? await fetch(sheetUrl) : await actions.daFetch(sheetUrl);
          if (!sheetResp.ok) {
            sheetDataListDiv.innerHTML = `<div class="no-value"><p>Error loading sheet: ${selectedSheet}</p></div>`;
            return;
          }
          const sheetJson = await sheetResp.json();
          const rawItems = Array.isArray(sheetJson) ? sheetJson : (sheetJson.items || sheetJson.data || []);
          if (rawItems && rawItems.length > 0) {
            // Use formatData and renderItems as usual
            const items = format ? formatData(sheetJson, format) : rawItems;
            sheetDataListDiv.innerHTML = renderItems(items, 'sheet');
          } else {
            sheetDataListDiv.innerHTML = `<div class="no-value"><p>No data found for "${selectedSheet}"</p></div>`;
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
            // Render dropdown for sites and type
            resultDiv.innerHTML = `
              <div class="result">
                <label for="siteDropdown"><strong>Select Site:</strong></label>
                <select id="siteDropdown">
                  <option value="">-- Select a Site --</option>
                  ${sites.map(site => `<option value="${site}">${site}</option>`).join('')}
                </select>
                <select id="typeDropdown">
                  <option value="">-- Select Type --</option>
                  <option value="label">Author Title</option>
                  <option value="link">Author Link</option>
                </select>
                <div id="authorsList"></div>
              </div>
            `;
            const dropdown = document.getElementById('siteDropdown');
            const typeDropdown = document.getElementById('typeDropdown');
            const authorsListDiv = document.getElementById('authorsList');

            // Helper to render authors based on dropdowns
            function renderAuthorsList() {
              const selectedSite = dropdown.value;
              const selectedType = typeDropdown.value;
              if (selectedSite) {
                let filteredAuthors = items.filter(item => item.sitegroup === selectedSite);
                // Adjust format only for authors.json and when a type is selected
                let customFormat = format || 'CONTENT';
                if (selectedType === 'label') {
                  // For label, add a comma at the end if not present
                  if (!customFormat.endsWith(',')) customFormat += ',';
                } else if (selectedType === 'link') {
                  // For link, remove any trailing comma
                  customFormat = customFormat.replace(/,+$/, '');
                }
                // Re-format the filtered authors if type is selected
                if (selectedType) {
                  filteredAuthors = formatData({ data: filteredAuthors }, customFormat, selectedType);
                }
                authorsListDiv.innerHTML = renderItems(filteredAuthors, 'authors');
              } else {
                authorsListDiv.innerHTML = '<p>Please select a site to view authors.</p>';
              }
            }

            dropdown.addEventListener('change', renderAuthorsList);
            typeDropdown.addEventListener('change', renderAuthorsList);
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
