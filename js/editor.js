// InkScroll Bounding Box Visual Panel Editor Module
class PanelEditor {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.currentChapter = null;
    this.currentPageIndex = 0;
    this.panels = [];
    this.selectedPanelId = null;
    this.isDragging = false;
    this.dragHandle = null;
    this.dragStartPos = { x: 0, y: 0 };
    this.bgImage = new Image();
  }

  init() {
    this.canvas = document.getElementById('editor-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // Canvas Mouse Events
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.onMouseUp());

    // Sidebar Mood Selector
    const moodSelect = document.getElementById('editor-mood-select');
    if (moodSelect) {
      moodSelect.addEventListener('change', (e) => {
        if (this.selectedPanelId) {
          const p = this.panels.find(x => x.id === this.selectedPanelId);
          if (p) p.effects.atmosphere = e.target.value;
        }
      });
    }

    const reDetectBtn = document.getElementById('btn-editor-auto-detect');
    if (reDetectBtn) {
      reDetectBtn.addEventListener('click', () => this.reDetectPagePanels());
    }
  }

  async reDetectPagePanels() {
    const page = this.currentChapter.pages[this.currentPageIndex];
    if (!page) return;
    const detected = await window.mangaDetector.detectPagePanels(page);
    const sorted = window.mangaDetector.sortMangaReadingOrder(detected);
    
    // Replace panels for this page
    this.panels = this.panels.filter(p => p.pageIndex !== this.currentPageIndex);
    this.panels.push(...sorted);

    // Re-index global reading order
    this.panels.forEach((p, idx) => p.readingOrder = idx);

    this.render();
    this.renderSidebarList();
  }

  open(chapterData, pageIndex = 0) {
    this.currentChapter = chapterData;
    this.currentPageIndex = pageIndex;
    this.panels = [...chapterData.panels];
    this.selectedPanelId = null;

    document.getElementById('modal-editor').classList.add('active');
    this.loadPageImage();
  }

  close() {
    document.getElementById('modal-editor').classList.remove('active');
  }

  loadPageImage() {
    const page = this.currentChapter.pages[this.currentPageIndex];
    if (!page) return;

    this.bgImage.crossOrigin = 'anonymous';
    this.bgImage.onload = () => {
      const wrap = document.getElementById('editor-canvas-wrap');
      const maxW = wrap.clientWidth - 40;
      const maxH = 550;

      const aspect = this.bgImage.naturalWidth / this.bgImage.naturalHeight;
      if (maxW / maxH > aspect) {
        this.canvas.height = maxH;
        this.canvas.width = maxH * aspect;
      } else {
        this.canvas.width = maxW;
        this.canvas.height = maxW / aspect;
      }

      this.render();
      this.renderSidebarList();
    };
    this.bgImage.src = page.imageUrl;
  }

  render() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw page image background
    this.ctx.drawImage(this.bgImage, 0, 0, this.canvas.width, this.canvas.height);

    // Filter panels for current page
    const pagePanels = this.panels.filter(p => p.pageIndex === this.currentPageIndex);

    // Draw panel bounding boxes
    pagePanels.forEach(panel => {
      const isSelected = panel.id === this.selectedPanelId;
      const rx = panel.bounds.x * this.canvas.width;
      const ry = panel.bounds.y * this.canvas.height;
      const rw = panel.bounds.w * this.canvas.width;
      const rh = panel.bounds.h * this.canvas.height;

      this.ctx.lineWidth = isSelected ? 3 : 2;
      this.ctx.strokeStyle = isSelected ? '#dc2626' : '#3b82f6';
      this.ctx.fillStyle = isSelected ? 'rgba(220, 38, 38, 0.15)' : 'rgba(59, 130, 246, 0.1)';
      
      this.ctx.fillRect(rx, ry, rw, rh);
      this.ctx.strokeRect(rx, ry, rw, rh);

      // Draw Reading Order Badge Number
      this.ctx.fillStyle = isSelected ? '#dc2626' : '#1e3a8a';
      this.ctx.fillRect(rx + rw - 28, ry + 4, 24, 24);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(panel.readingOrder + 1, rx + rw - 16, ry + 20);

      // If selected, draw corner resize handles
      if (isSelected) {
        this.drawHandle(rx, ry);
        this.drawHandle(rx + rw, ry);
        this.drawHandle(rx, ry + rh);
        this.drawHandle(rx + rw, ry + rh);
      }
    });
  }

  drawHandle(x, y) {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.strokeStyle = '#dc2626';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 6, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
  }

  renderSidebarList() {
    const container = document.getElementById('editor-panel-list');
    if (!container) return;

    container.innerHTML = '';
    const pagePanels = this.panels.filter(p => p.pageIndex === this.currentPageIndex);

    pagePanels.forEach(p => {
      const card = document.createElement('div');
      card.className = `panel-item-card ${p.id === this.selectedPanelId ? 'selected' : ''}`;
      card.innerHTML = `
        <div>
          <strong>Panel #${p.readingOrder + 1}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Type: ${p.type}</div>
        </div>
        <button class="btn-ink" style="padding: 4px 8px; font-size: 0.75rem;"><i data-lucide="trash-2"></i></button>
      `;

      card.addEventListener('click', () => {
        this.selectedPanelId = p.id;
        this.render();
        this.renderSidebarList();
      });

      container.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / this.canvas.width;
    const my = (e.clientY - rect.top) / this.canvas.height;

    const pagePanels = this.panels.filter(p => p.pageIndex === this.currentPageIndex);
    const clicked = pagePanels.find(p => 
      mx >= p.bounds.x && mx <= p.bounds.x + p.bounds.w &&
      my >= p.bounds.y && my <= p.bounds.y + p.bounds.h
    );

    if (clicked) {
      this.selectedPanelId = clicked.id;
      this.isDragging = true;
      this.dragStartPos = { x: mx - clicked.bounds.x, y: my - clicked.bounds.y };
    } else {
      this.selectedPanelId = null;
    }

    this.render();
    this.renderSidebarList();
  }

  onMouseMove(e) {
    if (!this.isDragging || !this.selectedPanelId) return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / this.canvas.width;
    const my = (e.clientY - rect.top) / this.canvas.height;

    const panel = this.panels.find(p => p.id === this.selectedPanelId);
    if (panel) {
      panel.bounds.x = Math.max(0, Math.min(1 - panel.bounds.w, mx - this.dragStartPos.x));
      panel.bounds.y = Math.max(0, Math.min(1 - panel.bounds.h, my - this.dragStartPos.y));
      this.render();
    }
  }

  onMouseUp() {
    this.isDragging = false;
  }
}

window.panelEditor = new PanelEditor();
