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

  bindEvents() {
    // Brand Click -> Return to Library
    document.getElementById('nav-brand').addEventListener('click', () => this.showView('library'));
    document.getElementById('btn-exit-reader').addEventListener('click', () => window.immersiveReader.exitReader());

    // Import Buttons
    document.getElementById('btn-open-import').addEventListener('click', () => this.openImportModal());
    document.getElementById('btn-close-import').addEventListener('click', () => this.closeImportModal());
    document.getElementById('btn-cancel-import').addEventListener('click', () => this.closeImportModal());
    document.getElementById('btn-submit-import').addEventListener('click', () => this.handleModalImport());

    // Hero URL Import Bar
    document.getElementById('hero-import-btn').addEventListener('click', () => {
      const url = document.getElementById('hero-url-input').value.trim();
      if (url) this.processUrlImport(url);
    });

    // File Pickers (PDF & .inkscroll)
    document.getElementById('btn-import-file').addEventListener('click', () => {
      document.getElementById('file-input-pdf').click();
    });
    document.getElementById('file-input-pdf').addEventListener('change', (e) => this.handlePdfUpload(e));

    document.getElementById('btn-import-inkscroll').addEventListener('click', () => {
      document.getElementById('file-input-inkscroll').click();
    });
    document.getElementById('file-input-inkscroll').addEventListener('change', (e) => this.handleInkScrollImport(e));

    // Play Demo Chapter Button
    document.getElementById('btn-load-demo').addEventListener('click', async () => {
      const demoData = await window.inkStorage.getChapterFull('demo_blade_of_ink');
      if (demoData) {
        this.openChapterInReader(demoData);
      }
    });

    // Reader Top Bar Controls
    document.getElementById('btn-toggle-autoscroll').addEventListener('click', () => {
      window.immersiveReader.toggleAutoScroll();
    });

    document.getElementById('btn-toggle-audio').addEventListener('click', () => {
      const muted = window.inkAudio.toggleMute();
      const icon = document.getElementById('icon-audio');
      if (icon) icon.setAttribute('data-lucide', muted ? 'volume-x' : 'volume-2');
      if (window.lucide) lucide.createIcons();
    });

    document.getElementById('btn-open-editor').addEventListener('click', () => {
      if (window.immersiveReader.chapter) {
        const fullData = {
          chapter: window.immersiveReader.chapter,
          pages: window.immersiveReader.pages,
          panels: window.immersiveReader.panels
        };
        window.panelEditor.open(fullData, window.immersiveReader.panels[window.immersiveReader.currentPanelIndex]?.pageIndex || 0);
      }
    });

    document.getElementById('btn-toggle-fullscreen').addEventListener('click', () => this.toggleFullscreen());

    // Editor Modal Controls
    document.getElementById('btn-editor-close').addEventListener('click', () => window.panelEditor.close());
    document.getElementById('btn-editor-save').addEventListener('click', async () => {
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
    document.getElementById('btn-toggle-settings').addEventListener('click', () => {
      document.getElementById('settings-drawer').classList.toggle('open');
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => {
      document.getElementById('settings-drawer').classList.remove('open');
    });

    // Chapter Complete Modal Buttons
    const btnCompleteMain = document.getElementById('btn-complete-main');
    if (btnCompleteMain) {
      btnCompleteMain.addEventListener('click', () => window.immersiveReader.exitReader());
    }

    const btnCompleteReread = document.getElementById('btn-complete-reread');
    if (btnCompleteReread) {
      btnCompleteReread.addEventListener('click', () => window.immersiveReader.rereadChapter());
    }

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
        window.immersiveReader.nextPanel();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        window.immersiveReader.prevPanel();
      } else if (e.key === ' ') {
        e.preventDefault();
        window.immersiveReader.nextPanel();
      } else if (e.key === 'Escape') {
        window.immersiveReader.exitReader();
      } else if (e.key === 'f' || e.key === 'F') {
        this.toggleFullscreen();
      }
    });
  }

  // Load and Render Library Grid Cards
  async loadLibraryGrid() {
    const grid = document.getElementById('chapter-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const chapters = await window.inkStorage.getAllChapters();

    for (let ch of chapters) {
      const card = document.createElement('div');
      card.className = 'chapter-card';

      const fullData = await window.inkStorage.getChapterFull(ch.id);
      const coverUrl = fullData?.pages[0]?.imageUrl || '';

      card.innerHTML = `
        <div class="card-thumb" style="background-image: url('${coverUrl}')">
          <span class="card-stamp">${ch.sourceType.toUpperCase()}</span>
          <button class="card-delete-btn" title="Delete Chapter"><i data-lucide="trash-2"></i></button>
          <div class="play-overlay"><i data-lucide="play"></i></div>
        </div>
        <div class="card-body">
          <div class="card-title">${ch.title}</div>
          <div class="card-meta">
            <span>${fullData?.pages.length || 0} Pages</span>
            <span>${fullData?.panels.length || 0} Panels</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${ch.progress || 0}%"></div>
          </div>
        </div>
      `;

      const delBtn = card.querySelector('.card-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Delete chapter "${ch.title}"?`)) {
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

    // GSAP Card Grid Stagger Animation
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf('.chapter-card');
      gsap.from('.chapter-card', {
        y: 24,
        opacity: 0,
        duration: 0.5,
        ease: 'power3.out',
        stagger: { each: 0.05, from: 'start' }
      });
    }
  }

  async openChapterInReader(chapterData) {
    this.showView('reader');
    await window.immersiveReader.loadChapter(chapterData, 0);
  }

  // Process Manga Chapter URL Import
  async processUrlImport(url) {
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
    document.getElementById('modal-import').classList.add('active');
  }

  closeImportModal() {
    document.getElementById('modal-import').classList.remove('active');
  }

  async handleModalImport() {
    const url = document.getElementById('import-modal-url').value.trim();
    const rawUrls = document.getElementById('import-modal-urls').value.trim();

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
    document.querySelectorAll('.view-screen').forEach(el => el.classList.remove('active'));
    if (viewName === 'library') {
      document.getElementById('view-library').classList.add('active');
    } else if (viewName === 'reader') {
      document.getElementById('view-reader').classList.add('active');
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
});
