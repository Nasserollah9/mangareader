// InkScroll Main Application Controller & View Orchestrator
class InkScrollApp {
  constructor() {
    this.currentView = 'library';
  }

  async init() {
    // Initialize IndexedDB Storage
    await window.inkStorage.init();

    // Initialize Audio Context on first click
    document.body.addEventListener('click', () => {
      if (window.inkAudio) window.inkAudio.init();
    }, { once: true });

    // Setup Navigation & Button Listeners
    this.bindEvents();

    // Load Demo Chapter into library if empty
    await window.demoChapterBuilder.ensureDemoChapterLoaded();

    // Load Library Grid
    await this.loadLibraryGrid();

    // Initialize Reader Module
    window.immersiveReader.init();
    window.panelEditor.init();

    if (window.lucide) lucide.createIcons();
  }

  on(id, event, callback) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, callback);
  }

  bindEvents() {
    // Brand Click -> Return to Library (if in reader, clean up first)
    this.on('nav-brand', 'click', () => {
      const readerActive = document.getElementById('view-reader')?.classList.contains('active');
      if (readerActive && window.immersiveReader) {
        window.immersiveReader.exitReader();
      } else {
        this.showView('library');
        this.loadLibraryGrid();
      }
    });
    this.on('btn-exit-reader', 'click', () => window.immersiveReader.exitReader());

    // Import Buttons & Modal Controls
    this.on('btn-open-import', 'click', () => this.openImportModal());
    this.on('btn-close-import', 'click', () => this.closeImportModal());
    this.on('btn-cancel-import', 'click', () => this.closeImportModal());
    this.on('btn-submit-import', 'click', () => this.handleModalImport());

    // Hero URL Import Bar
    this.on('hero-import-btn', 'click', () => {
      const input = document.getElementById('hero-url-input');
      const url = input ? input.value.trim() : '';
      if (url) this.processUrlImport(url);
    });

    // File Pickers (PDF & .inkscroll)
    this.on('btn-import-file', 'click', () => {
      document.getElementById('file-input-pdf')?.click();
    });
    this.on('file-input-pdf', 'change', (e) => this.handlePdfUpload(e));

    this.on('btn-import-inkscroll', 'click', () => {
      document.getElementById('file-input-inkscroll')?.click();
    });
    this.on('file-input-inkscroll', 'change', (e) => this.handleInkScrollImport(e));

    // Play Demo Chapter Button
    this.on('btn-load-demo', 'click', async () => {
      const demoData = await window.inkStorage.getChapterFull('demo_blade_of_ink');
      if (demoData) {
        this.openChapterInReader(demoData);
      }
    });

    // Reader Top Bar Controls
    this.on('btn-toggle-autoscroll', 'click', () => {
      window.immersiveReader.toggleAutoScroll();
    });

    this.on('btn-toggle-audio', 'click', () => {
      const muted = window.inkAudio.toggleMute();
      const icon = document.getElementById('icon-audio');
      if (icon) icon.setAttribute('data-lucide', muted ? 'volume-x' : 'volume-2');
      if (window.lucide) lucide.createIcons();
    });

    this.on('btn-open-editor', 'click', () => {
      if (window.immersiveReader.chapter) {
        const fullData = {
          chapter: window.immersiveReader.chapter,
          pages: window.immersiveReader.pages,
          panels: window.immersiveReader.panels
        };
        window.panelEditor.open(fullData, window.immersiveReader.panels[window.immersiveReader.currentPanelIndex]?.pageIndex || 0);
      }
    });

    this.on('btn-toggle-fullscreen', 'click', () => this.toggleFullscreen());

    // Free Pan / Scroll Mode Toggle
    this.on('btn-toggle-freepan', 'click', () => {
      if (window.immersiveReader) window.immersiveReader.toggleFreePan();
    });

    // Editor Modal Controls
    this.on('btn-close-editor', 'click', () => window.panelEditor.close());
    this.on('btn-editor-close', 'click', () => window.panelEditor.close());
    this.on('btn-editor-save', 'click', async () => {
      const ed = window.panelEditor;
      if (ed.currentChapter) {
        await window.inkStorage.saveChapter({
          chapter: ed.currentChapter.chapter,
          pages: ed.currentChapter.pages,
          panels: ed.panels
        });
        ed.close();
        // Reload chapter in reader
        const updated = await window.inkStorage.getChapterFull(ed.currentChapter.chapter.id);
        window.immersiveReader.loadChapter(updated, ed.panels[0]?.readingOrder || 0);
      }
    });

    // Settings Drawer
    this.on('btn-toggle-settings', 'click', () => {
      document.getElementById('settings-drawer')?.classList.toggle('open');
    });
    this.on('btn-close-settings', 'click', () => {
      document.getElementById('settings-drawer')?.classList.remove('open');
    });

    // Chapter Complete Modal Buttons
    this.on('btn-complete-main', 'click', () => window.immersiveReader.exitReader());
    this.on('btn-complete-reread', 'click', () => window.immersiveReader.rereadChapter());

    // Reader Top Bar Auto-Hide on Pointer Idle
    let hudHideTimer = null;
    const topHud = document.getElementById('reader-hud');

    window.addEventListener('pointermove', () => {
      const readerActive = document.getElementById('view-reader').classList.contains('active');
      if (!readerActive || !topHud) return;

      if (typeof gsap !== 'undefined') {
        gsap.killTweensOf(topHud);
        gsap.to(topHud, { autoAlpha: 1, y: 0, duration: 0.25 });
      } else {
        topHud.style.opacity = '1';
      }

      if (hudHideTimer) clearTimeout(hudHideTimer);
      hudHideTimer = setTimeout(() => {
        if (typeof gsap !== 'undefined') {
          gsap.killTweensOf(topHud);
          gsap.to(topHud, { autoAlpha: 0, y: -12, duration: 0.4 });
        } else {
          topHud.style.opacity = '0';
        }
      }, 2500);
    });

    // Global Keybindings (Arrow Keys, ESC, F, Space)
    window.addEventListener('keydown', (e) => {
      const readerActive = document.getElementById('view-reader').classList.contains('active');
      if (!readerActive) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        if (!window.immersiveReader.freePanMode) window.immersiveReader.nextPanel();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        if (!window.immersiveReader.freePanMode) window.immersiveReader.prevPanel();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (!window.immersiveReader.freePanMode) window.immersiveReader.nextPanel();
      } else if (e.key === 'Escape') {
        window.immersiveReader.exitReader();
      } else if (e.key === 'f' || e.key === 'F') {
        this.toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        window.immersiveReader.toggleFreePan();
      }
    });
  }

  // Load and Render Library Grid Cards
  async loadLibraryGrid() {
    const grid = document.getElementById('chapter-grid');
    if (!grid) return;

    // Show loading state
    grid.innerHTML = '<div style="color:#666;text-align:center;padding:40px;width:100%">Loading library...</div>';

    // Ensure demo chapter always exists
    await window.demoChapterBuilder.ensureDemoChapterLoaded();

    const chapters = await window.inkStorage.getAllChapters();
    grid.innerHTML = '';

    if (chapters.length === 0) {
      grid.innerHTML = '<div style="color:#666;text-align:center;padding:40px;width:100%">No chapters found. Import a chapter above!</div>';
      return;
    }

    for (let ch of chapters) {
      const card = document.createElement('div');
      card.className = 'chapter-card';

      const fullData = await window.inkStorage.getChapterFull(ch.id);
      const coverUrl = fullData?.pages[0]?.imageUrl || '';
      const badgeClass = ch.sourceType === 'pdf' ? 'badge-pdf' : ch.sourceType === 'inkscroll' ? 'badge-inkscroll' : 'badge-scraped';

      card.innerHTML = `
        <div class="chapter-card-inner">
          <div class="card-thumb-wrapper">
            <div class="card-thumb" style="background-image: url('${coverUrl}')"></div>
            <span class="card-stamp ${badgeClass}">${ch.sourceType.toUpperCase()}</span>
            <button class="card-delete-btn" title="Delete Chapter"><i data-lucide="trash-2"></i></button>
            <div class="chapter-card-overlay">
              <div class="play-button"><i data-lucide="play"></i></div>
            </div>
          </div>
          <div class="card-body">
            <div class="card-title">${ch.title}</div>
            <div class="card-meta">
              <span>${fullData?.pages.length || 0} Pages</span>
              <span>${fullData?.panels.length || 0} Zones</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${ch.progress || 0}%"></div>
            </div>
          </div>
        </div>
      `;

      const delBtn = card.querySelector('.card-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (confirm(`Delete "${ch.title}"?`)) {
            await window.inkStorage.deleteChapter(ch.id);
            await this.loadLibraryGrid();
          }
        });
      }

      card.addEventListener('click', () => {
        if (fullData) this.openChapterInReader(fullData);
      });

      grid.appendChild(card);
    }
    if (window.lucide) lucide.createIcons();

    // GSAP Card Grid Stagger Entrance
    if (window.inkUIFX) window.inkUIFX.animateCardGrid();
  }

  async openChapterInReader(chapterData) {
    // Always regenerate the 12-zone reading grid to ensure correct RTL/TTB sequence
    if (window.mangaDetector && chapterData.pages && chapterData.pages.length > 0) {
      try {
        const freshZones = await window.mangaDetector.detectChapterPanels(chapterData.pages);
        if (freshZones && freshZones.length > 0) {
          chapterData.panels = freshZones;
        }
      } catch (err) {
        console.warn('Zone generation error on open:', err);
      }
    }

    if (window.inkUIFX) {
      window.inkUIFX.transitionToReader(async () => {
        await window.immersiveReader.loadChapter(chapterData, 0);
      });
    } else {
      this.showView('reader');
      await window.immersiveReader.loadChapter(chapterData, 0);
    }
  }

  // Process Manga Chapter URL Import
  async processUrlImport(url) {
    const loading = document.getElementById('loading-overlay');
    if (loading) loading.classList.add('active');

    try {
      this.showNotification('Scraping & Processing Manga URL...', 'info');
      const imported = await window.chapterImporter.importFromUrl(url);

      // Automated Panel Detection & Reading Order Sorting
      const panels = await window.mangaDetector.detectChapterPanels(imported.pages);

      const chapterObj = {
        id: `ch_${Date.now()}`,
        title: imported.title,
        sourceType: 'scraped',
        sourceUrl: url,
        importedAt: new Date().toISOString(),
        progress: 0
      };

      const fullChapter = {
        chapter: chapterObj,
        pages: imported.pages.map((p, idx) => ({ id: `pg_${chapterObj.id}_${idx}`, chapterId: chapterObj.id, ...p })),
        panels: panels.map(p => ({ ...p, chapterId: chapterObj.id }))
      };

      await window.inkStorage.saveChapter(fullChapter);
      await this.loadLibraryGrid();
      this.openChapterInReader(fullChapter);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      if (loading) loading.classList.remove('active');
    }
  }

  // Handle PDF File Upload
  async handlePdfUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      this.showNotification('Parsing PDF Pages & Detecting Panels...', 'info');
      const imported = await window.chapterImporter.importFromPDF(file);
      const panels = await window.mangaDetector.detectChapterPanels(imported.pages);

      const chapterObj = {
        id: `pdf_${Date.now()}`,
        title: imported.title,
        sourceType: 'pdf',
        importedAt: new Date().toISOString(),
        progress: 0
      };

      const fullChapter = {
        chapter: chapterObj,
        pages: imported.pages.map((p, idx) => ({ id: `pg_${chapterObj.id}_${idx}`, chapterId: chapterObj.id, ...p })),
        panels: panels.map(p => ({ ...p, chapterId: chapterObj.id }))
      };

      await window.inkStorage.saveChapter(fullChapter);
      await this.loadLibraryGrid();
      this.openChapterInReader(fullChapter);
    } catch (err) {
      alert(`PDF Import failed: ${err.message}`);
    }
  }

  // Handle .inkscroll File Import
  async handleInkScrollImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const chapterId = await window.inkStorage.importInkScrollFile(file);
      const fullData = await window.inkStorage.getChapterFull(chapterId);
      await this.loadLibraryGrid();
      this.openChapterInReader(fullData);
    } catch (err) {
      alert(`.inkscroll import failed: ${err.message}`);
    }
  }

  openImportModal() {
    document.getElementById('modal-import')?.classList.add('active');
  }

  closeImportModal() {
    document.getElementById('modal-import')?.classList.remove('active');
  }

  async handleModalImport() {
    const input = document.getElementById('modal-url-input') || document.getElementById('import-modal-url');
    const url = input ? input.value.trim() : '';
    const rawInput = document.getElementById('import-modal-urls');
    const rawUrls = rawInput ? rawInput.value.trim() : '';

    this.closeImportModal();

    if (url) {
      await this.processUrlImport(url);
    } else if (rawUrls) {
      const list = rawUrls.split(/\n|,/).map(u => u.trim()).filter(Boolean);
      if (list.length > 0) {
        const imported = await window.chapterImporter.importFromDirectUrls(list);
        const panels = await window.mangaDetector.detectChapterPanels(imported.pages);

        const chapterObj = {
          id: `raw_${Date.now()}`,
          title: 'Direct Images Chapter',
          sourceType: 'images',
          importedAt: new Date().toISOString(),
          progress: 0
        };

        const fullChapter = {
          chapter: chapterObj,
          pages: imported.pages.map((p, idx) => ({ id: `pg_${chapterObj.id}_${idx}`, chapterId: chapterObj.id, ...p })),
          panels: panels.map(p => ({ ...p, chapterId: chapterObj.id }))
        };

        await window.inkStorage.saveChapter(fullChapter);
        await this.loadLibraryGrid();
        this.openChapterInReader(fullChapter);
      }
    }
  }

  showView(viewName) {
    const libView = document.getElementById('view-library');
    const rdrView = document.getElementById('view-reader');
    const modalComplete = document.getElementById('modal-chapter-complete');

    if (modalComplete) modalComplete.classList.remove('active');

    if (viewName === 'library' || viewName === 'main') {
      if (rdrView) {
        rdrView.classList.remove('active');
        rdrView.classList.add('hidden');
        rdrView.style.display = 'none';
        rdrView.style.opacity = '0';
      }
      if (libView) {
        libView.classList.remove('hidden');
        libView.classList.add('active');
        libView.style.display = 'flex';
        libView.style.opacity = '1';
        libView.style.transform = 'none';
      }
      if (window.inkUIFX) {
        window.inkUIFX.startCanvases();
      }
      this.loadLibraryGrid();
      this.currentView = 'library';
    } else if (viewName === 'reader') {
      if (libView) {
        libView.classList.remove('active');
        libView.classList.add('hidden');
        libView.style.display = 'none';
        libView.style.opacity = '0';
      }
      if (rdrView) {
        rdrView.classList.remove('hidden');
        rdrView.classList.add('active');
        rdrView.style.display = 'flex';
        rdrView.style.opacity = '1';
        rdrView.style.transform = 'none';
      }
      this.currentView = 'reader';
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }

  showNotification(msg, type = 'info') {
    console.log(`[InkScroll] ${msg}`);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new InkScrollApp();
  window.app.init();

  // Route listener for browser Back/Forward navigation
  window.addEventListener('popstate', () => {
    const hash = window.location.hash;
    if (hash === '#reader' && window.immersiveReader && window.immersiveReader.chapter) {
      window.app.showView('reader');
    } else {
      if (window.immersiveReader) window.immersiveReader.exitReader();
      window.app.showView('library');
    }
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash === '#reader' && window.immersiveReader && window.immersiveReader.chapter) {
      window.app.showView('reader');
    } else {
      if (window.immersiveReader) window.immersiveReader.exitReader();
      window.app.showView('library');
    }
  });
});
