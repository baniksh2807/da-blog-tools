/**
 * DA Content Modifier Application
 * A comprehensive tool for bulk content modification in DA pages
 */

// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { crawl } from 'https://da.live/nx/public/utils/tree.js';

class ContentModifier {
  constructor() {
    this.currentUser = null;
    this.pages = [];
    this.filteredPages = [];
    this.selectedPages = new Set();
    this.currentPage = 1;
    this.pageSize = 25;
    this.isScanning = false;
    this.isProcessing = false;
    this.modificationHistory = [];
    this.pathFilters = [];
    this.app = {
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
    // Configuration
    this.config = {
      baseUrl: 'https://admin.da.live',
      previewUrl: 'https://main--da-blog-tools--baniksh.hlx.page',
      liveUrl: 'https://main--da-blog-tools--baniksh.hlx.live'
    };
    
    this.init();
  }

  async init() {
    try {
      // Initialize DA SDK
      //await this.initializeDA();
      const { context, token, actions } = await DA_SDK;
      this.app.context = context;
      this.app.token = token;
      this.app.actions = actions;
      // Set up event listeners
      this.setupEventListeners();
      
      // Initialize UI state
      this.updateUI();
      //alert("Content Modifier initialized successfully")
      console.log('Content Modifier initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Content Modifier:', error);
      this.showToast('Failed to initialize application', 'error');
    }
  }

  async initializeDA() {
    try {
      
        try {
          this.daSDK = await DA_SDK;
        } catch (error) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      
      
      if (!this.daSDK) {
        throw new Error('DA SDK failed to load after multiple attempts');
      }
      
      // Get current user - if this fails, user might not be authenticated
      this.currentUser = await this.getCurrentUser();
      if (!this.currentUser) {
        // Check if we're in the DA environment
        if (!window.location.hostname.includes('da.live') && !window.location.hostname.includes('localhost')) {
          throw new Error('Please access this tool from within the DA environment');
        } else {
          throw new Error('User not authenticated. Please log in to DA first.');
        }
      }
      
      console.log('DA initialized for user:', this.currentUser);
    } catch (error) {
      console.error('DA initialization error:', error);
      throw error;
    }
  }

  async getCurrentUser() {
    try {
      const response = await this.daSDK('/profile');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to get current user:', error);
    }
    return null;
  }

  setupEventListeners() {
    // Accordion toggles
    document.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', (e) => {
        this.toggleAccordion(e.currentTarget);
      });
    });

    // Path management
    document.getElementById('add-path-btn').addEventListener('click', () => {
      this.addPath();
    });

    document.getElementById('scan-btn').addEventListener('click', () => {
      this.scanPages();
    });

    // Search and filter
    document.getElementById('filter-pages').addEventListener('input', (e) => {
      this.filterPages(e.target.value);
    });

    document.getElementById('select-all-pages').addEventListener('change', (e) => {
      this.toggleSelectAll(e.target.checked);
    });

    // Page size change
    document.getElementById('page-size-select').addEventListener('change', (e) => {
      this.changePageSize(parseInt(e.target.value));
    });

    // Action buttons
    document.getElementById('preview-selected-btn').addEventListener('click', () => {
      this.previewSelected();
    });

    document.getElementById('apply-modifications-btn').addEventListener('click', () => {
      this.applyModifications();
    });

    document.getElementById('bulk-preview-btn').addEventListener('click', () => {
      this.bulkPreview();
    });

    document.getElementById('bulk-publish-btn').addEventListener('click', () => {
      this.bulkPublish();
    });

    // Modal controls
    document.getElementById('modal-close').addEventListener('click', () => {
      this.hideModal();
    });

    document.getElementById('modal-background').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.hideModal();
      }
    });

    // Toast close
    document.getElementById('toast-close').addEventListener('click', () => {
      this.hideToast();
    });

    // Preview tabs
    document.querySelectorAll('.preview-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchPreviewTab(e.target.dataset.tab);
      });
    });
  }

  toggleAccordion(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.accordion-icon');
    const isOpen = content.style.display === 'block';
    
    // Close all accordions first
    document.querySelectorAll('.accordion-content').forEach(content => {
      content.style.display = 'none';
    });
    
    document.querySelectorAll('.accordion-icon').forEach(icon => {
      icon.style.transform = 'rotate(0deg)';
    });
    
    // Open clicked accordion if it was closed
    if (!isOpen) {
      content.style.display = 'block';
      icon.style.transform = 'rotate(180deg)';
    }
  }

  addPath() {
    const input = document.getElementById('search-path-input');
    const path = input.value.trim();
    
    if (!path) {
      this.showToast('Please enter a path', 'warning');
      return;
    }
    
    if (this.pathFilters.includes(path)) {
      this.showToast('Path already added', 'warning');
      return;
    }
    
    this.pathFilters.push(path);
    input.value = '';
    this.updatePathTags();
    this.updatePathInfo();
  }

  removePath(path) {
    this.pathFilters = this.pathFilters.filter(p => p !== path);
    this.updatePathTags();
    this.updatePathInfo();
  }

  updatePathTags() {
    const container = document.getElementById('path-tags');
    container.innerHTML = '';
    
    this.pathFilters.forEach(path => {
      const tag = document.createElement('div');
      tag.className = 'path-tag';
      tag.innerHTML = `
        <span>${path}</span>
        <button class="tag-remove" onclick="contentModifier.removePath('${path}')">&times;</button>
      `;
      container.appendChild(tag);
    });
  }

  updatePathInfo() {
    const info = document.getElementById('path-info');
    const count = this.pathFilters.length;
    
    if (count === 0) {
      info.innerHTML = '<div class="info-text">No paths configured. Add paths to scan for pages.</div>';
    } else {
      info.innerHTML = `<div class="info-text">Will scan ${count} path${count > 1 ? 's' : ''} for DA pages.</div>`;
    }
  }

  async scanPages() {
    if (this.isScanning) return;
    
    if (this.pathFilters.length === 0) {
      this.showToast('Please add at least one path to scan', 'warning');
      return;
    }
    
    this.isScanning = true;
    this.updateScanButton();
    this.showProgress('Scanning pages...', 0);
    
    try {
      this.pages = [];
      const totalPaths = this.pathFilters.length;
      
      for (let i = 0; i < totalPaths; i++) {
        const path = this.pathFilters[i];
        this.updateProgress(`Scanning ${path}...`, (i / totalPaths) * 100);
        
        const pathPages = await this.scanPath(path);
        this.pages.push(...pathPages);
        
        // Small delay to prevent overwhelming the API
        await this.delay(100);
      }
      
      this.filteredPages = [...this.pages];
      this.selectedPages.clear();
      this.currentPage = 1;
      
      this.hideProgress();
      this.updateResultsSummary();
      this.renderPages();
      
      this.showToast(`Found ${this.pages.length} pages`, 'success');
      
    } catch (error) {
      console.error('Scan failed:', error);
      this.showToast('Scan failed: ' + error.message, 'error');
      this.hideProgress();
    } finally {
      this.isScanning = false;
      this.updateScanButton();
    }
  }

  async scanPath(path) {
    try {
      // Clean path - ensure it starts with /
      const cleanPath = path.startsWith('/') ? path : '/' + path;
      
      // Get pages from DA API
      const response = await this.daSDK(`/list${cleanPath}`);
      if (!response.ok) {
        throw new Error(`Failed to scan path ${path}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const pages = [];
      
      // Process the response to extract page information
      if (data && Array.isArray(data)) {
        for (const item of data) {
          if (item.type === 'file' && item.ext === 'html') {
            pages.push({
              path: item.path,
              name: item.name,
              modified: item.lastModified || item.modified,
              size: item.size,
              url: `${this.config.previewUrl}${item.path}`
            });
          }
        }
      }
      
      return pages;
    } catch (error) {
      console.error(`Error scanning path ${path}:`, error);
      throw error;
    }
  }

  filterPages(searchTerm) {
    const term = searchTerm.toLowerCase();
    
    if (!term) {
      this.filteredPages = [...this.pages];
    } else {
      this.filteredPages = this.pages.filter(page =>
        page.path.toLowerCase().includes(term) ||
        page.name.toLowerCase().includes(term)
      );
    }
    
    this.currentPage = 1;
    this.selectedPages.clear();
    this.updateResultsSummary();
    this.renderPages();
  }

  toggleSelectAll(checked) {
    const visiblePages = this.getCurrentPageItems();
    
    if (checked) {
      visiblePages.forEach(page => this.selectedPages.add(page.path));
    } else {
      visiblePages.forEach(page => this.selectedPages.delete(page.path));
    }
    
    this.renderPages();
    this.updateUI();
  }

  togglePageSelection(path, checked) {
    if (checked) {
      this.selectedPages.add(path);
    } else {
      this.selectedPages.delete(path);
    }
    
    this.updateUI();
  }

  changePageSize(size) {
    this.pageSize = size;
    this.currentPage = 1;
    this.renderPages();
  }

  getCurrentPageItems() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredPages.slice(start, end);
  }

  renderPages() {
    const container = document.getElementById('pages-list');
    const pageItems = this.getCurrentPageItems();
    
    if (pageItems.length === 0) {
      container.innerHTML = '<div class="no-results">No pages found matching the current filters.</div>';
      this.renderPagination();
      return;
    }
    
    container.innerHTML = pageItems.map(page => `
      <div class="page-item">
        <div class="page-checkbox-container">
          <input type="checkbox" class="page-checkbox" 
                 data-path="${page.path}"
                 ${this.selectedPages.has(page.path) ? 'checked' : ''}
                 onchange="contentModifier.togglePageSelection('${page.path}', this.checked)">
        </div>
        <div class="page-info">
          <div class="page-path">${page.path}</div>
          <div class="page-meta">
            <span>Modified: ${this.formatDate(page.modified)}</span>
            <span>Size: ${this.formatSize(page.size)}</span>
          </div>
        </div>
        <div class="page-actions">
          <button class="btn btn-small btn-secondary" onclick="contentModifier.previewPage('${page.path}')">
            <img src="./icons/preview.svg" alt="" class="icon"> Preview
          </button>
          <button class="btn btn-small btn-primary" onclick="contentModifier.editPage('${page.path}')">
            <img src="./icons/edit.svg" alt="" class="icon"> Edit
          </button>
        </div>
      </div>
    `).join('');
    
    this.renderPagination();
  }

  renderPagination() {
    const container = document.getElementById('pagination-container');
    const totalPages = Math.ceil(this.filteredPages.length / this.pageSize);
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(start + this.pageSize - 1, this.filteredPages.length);
    
    if (totalPages <= 1) {
      container.style.display = 'none';
      return;
    }
    
    container.style.display = 'flex';
    
    document.getElementById('pagination-info').textContent = 
      `Showing ${start}-${end} of ${this.filteredPages.length} pages`;
    
    const numbersContainer = document.getElementById('page-numbers');
    numbersContainer.innerHTML = '';
    
    // Previous button
    if (this.currentPage > 1) {
      const prevBtn = this.createPageButton(this.currentPage - 1, '‹ Previous');
      numbersContainer.appendChild(prevBtn);
    }
    
    // Page numbers
    const maxVisible = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const btn = this.createPageButton(i, i.toString());
      if (i === this.currentPage) btn.classList.add('active');
      numbersContainer.appendChild(btn);
    }
    
    // Next button
    if (this.currentPage < totalPages) {
      const nextBtn = this.createPageButton(this.currentPage + 1, 'Next ›');
      numbersContainer.appendChild(nextBtn);
    }
  }

  createPageButton(page, text) {
    const btn = document.createElement('button');
    btn.className = 'page-btn';
    btn.textContent = text;
    btn.onclick = () => this.goToPage(page);
    return btn;
  }

  goToPage(page) {
    this.currentPage = page;
    this.renderPages();
  }

  updateResultsSummary() {
    document.getElementById('total-pages').textContent = this.pages.length;
    document.getElementById('filtered-pages').textContent = this.filteredPages.length;
    document.getElementById('selected-pages').textContent = this.selectedPages.size;
  }

  updateScanButton() {
    const btn = document.getElementById('scan-pages-btn');
    btn.disabled = this.isScanning;
    btn.textContent = this.isScanning ? 'Scanning...' : 'Scan Pages';
  }

  updateUI() {
    this.updateResultsSummary();
    
    // Update select all checkbox
    const selectAllBtn = document.getElementById('select-all-pages');
    const visiblePages = this.getCurrentPageItems();
    const selectedVisible = visiblePages.filter(page => this.selectedPages.has(page.path)).length;
    
    selectAllBtn.checked = visiblePages.length > 0 && selectedVisible === visiblePages.length;
    selectAllBtn.indeterminate = selectedVisible > 0 && selectedVisible < visiblePages.length;
    
    // Update action buttons
    const hasSelection = this.selectedPages.size > 0;
    document.getElementById('preview-selected-btn').disabled = !hasSelection;
    document.getElementById('apply-modifications-btn').disabled = !hasSelection;
    document.getElementById('bulk-preview-btn').disabled = !hasSelection;
    document.getElementById('bulk-publish-btn').disabled = !hasSelection;
  }

  async previewSelected() {
    if (this.selectedPages.size === 0) return;
    
    const paths = Array.from(this.selectedPages);
    if (paths.length === 1) {
      await this.previewPage(paths[0]);
    } else {
      this.showToast(`Opening ${paths.length} pages in new tabs`, 'info');
      paths.forEach(path => {
        const url = `${this.config.previewUrl}${path}`;
        window.open(url, '_blank');
      });
    }
  }

  async previewPage(path) {
    try {
      // Fetch page content for preview
      const response = await this.daSDK(`/source${path}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch page: ${response.statusText}`);
      }
      
      const content = await response.text();
      
      // Show in modal
      this.showModal('Page Preview', this.renderPreviewContent(path, content));
      
    } catch (error) {
      console.error('Preview failed:', error);
      this.showToast('Failed to preview page: ' + error.message, 'error');
    }
  }

  async editPage(path) {
    const url = `${this.config.baseUrl}/edit${path}`;
    window.open(url, '_blank');
  }

  renderPreviewContent(path, content) {
    return `
      <div class="preview-section">
        <h4>Page: ${path}</h4>
        <div class="preview-tabs">
          <button class="preview-tab active" data-tab="content">Content</button>
          <button class="preview-tab" data-tab="source">Source</button>
        </div>
        <div class="preview-content-area">
          <div class="preview-pane active" id="preview-content">
            <iframe src="${this.config.previewUrl}${path}" 
                    style="width: 100%; height: 400px; border: 1px solid #ddd; border-radius: 4px;">
            </iframe>
          </div>
          <div class="preview-pane" id="preview-source">
            <pre><code>${this.escapeHtml(content)}</code></pre>
          </div>
        </div>
      </div>
    `;
  }

  switchPreviewTab(tab) {
    document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.preview-pane').forEach(p => p.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`preview-${tab}`).classList.add('active');
  }

  async applyModifications() {
    if (this.selectedPages.size === 0) return;
    
    const modifications = this.getModificationConfig();
    if (!this.validateModifications(modifications)) return;
    
    if (!confirm(`Apply modifications to ${this.selectedPages.size} pages? This action cannot be undone.`)) {
      return;
    }
    
    this.isProcessing = true;
    this.showProgress('Applying modifications...', 0);
    
    try {
      const pages = Array.from(this.selectedPages);
      const results = { success: 0, failed: 0, errors: [] };
      
      for (let i = 0; i < pages.length; i++) {
        const path = pages[i];
        this.updateProgress(`Modifying ${path}...`, ((i + 1) / pages.length) * 100);
        
        try {
          await this.modifyPage(path, modifications);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({ path, error: error.message });
        }
        
        // Small delay to prevent overwhelming the API
        await this.delay(200);
      }
      
      this.hideProgress();
      this.showModificationResults(results);
      
    } catch (error) {
      console.error('Modification failed:', error);
      this.showToast('Modification failed: ' + error.message, 'error');
      this.hideProgress();
    } finally {
      this.isProcessing = false;
    }
  }

  getModificationConfig() {
    return {
      action: document.querySelector('input[name="modification-action"]:checked')?.value,
      findText: document.getElementById('find-text').value,
      replaceText: document.getElementById('replace-text').value,
      addContent: document.getElementById('add-content').value,
      removeContent: document.getElementById('remove-content').value,
      position: document.getElementById('content-position').value,
      useRegex: document.getElementById('use-regex').checked,
      caseSensitive: document.getElementById('case-sensitive').checked,
      wholeWords: document.getElementById('whole-words').checked
    };
  }

  validateModifications(config) {
    if (!config.action) {
      this.showToast('Please select a modification action', 'warning');
      return false;
    }
    
    switch (config.action) {
      case 'replace':
        if (!config.findText) {
          this.showToast('Please enter text to find for replacement', 'warning');
          return false;
        }
        break;
      case 'add':
        if (!config.addContent) {
          this.showToast('Please enter content to add', 'warning');
          return false;
        }
        break;
      case 'remove':
        if (!config.removeContent && !config.findText) {
          this.showToast('Please enter content to remove', 'warning');
          return false;
        }
        break;
    }
    
    return true;
  }

  async modifyPage(path, config) {
    // Fetch current content
    const response = await this.daSDK(`/source${path}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.statusText}`);
    }
    
    let content = await response.text();
    const originalContent = content;
    
    // Apply modifications based on action
    switch (config.action) {
      case 'replace':
        content = this.replaceContent(content, config);
        break;
      case 'add':
        content = this.addContent(content, config);
        break;
      case 'remove':
        content = this.removeContent(content, config);
        break;
    }
    
    // Only update if content changed
    if (content !== originalContent) {
      await this.savePage(path, content);
      
      // Store modification in history
      this.modificationHistory.push({
        path,
        timestamp: new Date().toISOString(),
        action: config.action,
        originalContent,
        modifiedContent: content
      });
    }
  }

  replaceContent(content, config) {
    const findText = config.findText;
    const replaceText = config.replaceText || '';
    
    if (config.useRegex) {
      const flags = config.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(findText, flags);
      return content.replace(regex, replaceText);
    } else {
      const flags = config.caseSensitive ? 'g' : 'gi';
      if (config.wholeWords) {
        const regex = new RegExp(`\\b${this.escapeRegex(findText)}\\b`, flags);
        return content.replace(regex, replaceText);
      } else {
        const regex = new RegExp(this.escapeRegex(findText), flags);
        return content.replace(regex, replaceText);
      }
    }
  }

  addContent(content, config) {
    const addContent = config.addContent;
    
    switch (config.position) {
      case 'beginning':
        return addContent + '\n' + content;
      case 'end':
        return content + '\n' + addContent;
      case 'after-head':
        return content.replace('</head>', addContent + '\n</head>');
      case 'before-body':
        return content.replace('<body>', '<body>\n' + addContent);
      case 'after-body':
        return content.replace('</body>', addContent + '\n</body>');
      default:
        return content + '\n' + addContent;
    }
  }

  removeContent(content, config) {
    const removeText = config.removeContent || config.findText;
    
    if (config.useRegex) {
      const flags = config.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(removeText, flags);
      return content.replace(regex, '');
    } else {
      const flags = config.caseSensitive ? 'g' : 'gi';
      if (config.wholeWords) {
        const regex = new RegExp(`\\b${this.escapeRegex(removeText)}\\b`, flags);
        return content.replace(regex, '');
      } else {
        const regex = new RegExp(this.escapeRegex(removeText), flags);
        return content.replace(regex, '');
      }
    }
  }

  async savePage(path, content) {
    const response = await this.daSDK(`/source${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/html'
      },
      body: content
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save page: ${response.statusText}`);
    }
  }

  async bulkPreview() {
    if (this.selectedPages.size === 0) return;
    
    const pages = Array.from(this.selectedPages);
    this.showProgress('Triggering preview...', 0);
    
    try {
      for (let i = 0; i < pages.length; i++) {
        const path = pages[i];
        this.updateProgress(`Previewing ${path}...`, ((i + 1) / pages.length) * 100);
        
        await this.previewPageAPI(path);
        await this.delay(100);
      }
      
      this.hideProgress();
      this.showToast(`Preview triggered for ${pages.length} pages`, 'success');
      
    } catch (error) {
      console.error('Bulk preview failed:', error);
      this.showToast('Bulk preview failed: ' + error.message, 'error');
      this.hideProgress();
    }
  }

  async bulkPublish() {
    if (this.selectedPages.size === 0) return;
    
    if (!confirm(`Publish ${this.selectedPages.size} pages? This will make them live.`)) {
      return;
    }
    
    const pages = Array.from(this.selectedPages);
    this.showProgress('Publishing pages...', 0);
    
    try {
      for (let i = 0; i < pages.length; i++) {
        const path = pages[i];
        this.updateProgress(`Publishing ${path}...`, ((i + 1) / pages.length) * 100);
        
        await this.publishPageAPI(path);
        await this.delay(100);
      }
      
      this.hideProgress();
      this.showToast(`Published ${pages.length} pages`, 'success');
      
    } catch (error) {
      console.error('Bulk publish failed:', error);
      this.showToast('Bulk publish failed: ' + error.message, 'error');
      this.hideProgress();
    }
  }

  async previewPageAPI(path) {
    const response = await fetch(`${this.config.previewUrl}/tools/preview/preview.js`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path })
    });
    
    if (!response.ok) {
      throw new Error(`Preview failed for ${path}: ${response.statusText}`);
    }
  }

  async publishPageAPI(path) {
    const response = await fetch(`${this.config.liveUrl}/tools/preview/preview.js`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path })
    });
    
    if (!response.ok) {
      throw new Error(`Publish failed for ${path}: ${response.statusText}`);
    }
  }

  showModificationResults(results) {
    const message = `
      <div>
        <h4>Modification Results</h4>
        <p><strong>Successful:</strong> ${results.success}</p>
        <p><strong>Failed:</strong> ${results.failed}</p>
        ${results.errors.length > 0 ? `
          <details>
            <summary>Error Details</summary>
            <ul>
              ${results.errors.map(e => `<li><strong>${e.path}:</strong> ${e.error}</li>`).join('')}
            </ul>
          </details>
        ` : ''}
      </div>
    `;
    
    this.showModal('Modification Complete', message);
  }

  // UI Helper Methods
  showProgress(text, percentage) {
    const container = document.getElementById('progress-container');
    const fill = document.getElementById('progress-fill');
    const textEl = document.getElementById('progress-text');
    
    container.classList.remove('hidden');
    fill.style.width = `${percentage}%`;
    textEl.textContent = text;
    document.body.style.paddingTop = '80px';
  }

  updateProgress(text, percentage) {
    const fill = document.getElementById('progress-fill');
    const textEl = document.getElementById('progress-text');
    
    fill.style.width = `${percentage}%`;
    textEl.textContent = text;
  }

  hideProgress() {
    document.getElementById('progress-container').classList.add('hidden');
    document.body.style.paddingTop = '0';
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const messageEl = document.getElementById('toast-message');
    
    toast.className = `toast ${type}`;
    messageEl.textContent = message;
    toast.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => this.hideToast(), 5000);
  }

  hideToast() {
    document.getElementById('toast').classList.add('hidden');
  }

  showModal(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body-content').innerHTML = content;
    document.getElementById('modal-background').classList.remove('hidden');
  }

  hideModal() {
    document.getElementById('modal-background').classList.add('hidden');
  }

  // Utility Methods
  formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString();
  }

  formatSize(bytes) {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize the application when the page loads
let contentModifier;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Show loading state
    document.body.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
        <div style="text-align: center;">
          <div style="margin-bottom: 20px;">Loading DA Content Modifier...</div>
          <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0066cc; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
        </div>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
    
    // Wait a bit for DA SDK to be available
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Restore original content
    const response = await fetch(window.location.href);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    document.body.innerHTML = doc.body.innerHTML;
    
    // Initialize the content modifier
    contentModifier = new ContentModifier();
    
  } catch (error) {
    console.error('Failed to initialize application:', error);
    document.body.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif; color: #dc3545;">
        <div style="text-align: center; max-width: 500px; padding: 20px;">
          <h2>Failed to Load DA Content Modifier</h2>
          <p>Error: ${error.message}</p>
          <p>Please make sure you are logged into DA and try refreshing the page.</p>
          <button onclick="window.location.reload()" style="padding: 10px 20px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Reload Page
          </button>
        </div>
      </div>
    `;
  }
});

// Global functions for event handlers
window.contentModifier = {
  removePath: (path) => contentModifier.removePath(path),
  togglePageSelection: (path, checked) => contentModifier.togglePageSelection(path, checked),
  previewPage: (path) => contentModifier.previewPage(path),
  editPage: (path) => contentModifier.editPage(path)
};