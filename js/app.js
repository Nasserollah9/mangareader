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

    // Compile Manga Series Button
    this.on('hero-compile-series-btn', 'click', () => {
      const input = document.getElementById('hero-url-input');
      const url = input ? input.value.trim() : '';
      if (url) this.processSeriesImport(url);
    });

    this.on('btn-close-series-modal', 'click', () => {
      document.getElementById('modal-series-chapters')?.classList.remove('active');
    });

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

    // Chapter Complete & HUD Next Chapter Buttons
    const handleNextChapterClick = async () => {
      const nextData = window.immersiveReader.nextChapterData;
      if (nextData) {
        window.immersiveReader.hideChapterCompleteModal();
        await this.compileAndOpenChapter(nextData.url, nextData.title, nextData.seriesObj, nextData.index);
      }
    };

    this.on('btn-complete-next', 'click', handleNextChapterClick);
    this.on('btn-next-chapter-hud', 'click', handleNextChapterClick);
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

    // Load Series Collection Grid
    await this.loadSeriesGrid();

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
            <div class="chapter-card-overlay">
              <div class="play-button"><i data-lucide="play"></i></div>
            </div>
          </div>
          <div class="card-body">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <div class="card-title" style="flex: 1;">${ch.title}</div>
              <button class="card-delete-btn" title="Delete Chapter" style="position: static; flex-shrink: 0; min-width: 32px; height: 32px; background: rgba(220, 38, 38, 0.2); border: 1px solid rgba(220, 38, 38, 0.4); color: #f87171; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
                <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
              </button>
            </div>
            <div class="card-meta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
              <span>${fullData?.pages.length || 0} Pages · ${fullData?.panels.length || 0} Zones</span>
              ${ch.sourceUrl && ch.sourceUrl.startsWith('http') ? `
                <button class="card-copy-btn" title="Copy Source URL" style="background: rgba(255,255,255,0.08); border: 1px solid var(--ink-border); color: var(--text-white); padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                  <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
                  <span>Copy URL</span>
                </button>
              ` : ''}
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${ch.progress || 0}%"></div>
            </div>
          </div>
        </div>
      `;

      const copyBtn = card.querySelector('.card-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
          e.preventDefault();
          if (ch.sourceUrl) {
            navigator.clipboard.writeText(ch.sourceUrl);
            const span = copyBtn.querySelector('span');
            if (span) {
              const orig = span.textContent;
              span.textContent = 'Copied!';
              setTimeout(() => { span.textContent = orig; }, 1800);
            }
          }
        });
      }

      const delBtn = card.querySelector('.card-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
          e.preventDefault();
          if (confirm(`Delete "${ch.title}"?`)) {
            await window.inkStorage.deleteChapter(ch.id);
            await this.loadLibraryGrid();
          }
        });
      }

      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-delete-btn') || e.target.closest('.card-copy-btn')) return;
        if (fullData) this.openChapterInReader(fullData);
      });

      grid.appendChild(card);
    }
    if (window.lucide) lucide.createIcons();

    // GSAP Card Grid Stagger Entrance
    if (window.inkUIFX) window.inkUIFX.animateCardGrid();
  }

  // Render Manga Series Cards
  async loadSeriesGrid() {
    const sGrid = document.getElementById('series-grid');
    if (!sGrid) return;

    const allSeries = (window.inkStorage && typeof window.inkStorage.getAllSeries === 'function') ? await window.inkStorage.getAllSeries() : [];
    sGrid.innerHTML = '';

    if (!allSeries || allSeries.length === 0) {
      sGrid.style.display = 'none';
      const sHeader = document.querySelector('.series-section-header');
      if (sHeader) sHeader.style.display = 'none';
      return;
    }

    const sHeader = document.querySelector('.series-section-header');
    if (sHeader) sHeader.style.display = 'block';
    sGrid.style.display = 'grid';

    for (let s of allSeries) {
      const card = document.createElement('div');
      card.className = 'series-card';
      card.style.cssText = 'background: var(--bg-surface); border: 1px solid var(--ink-border); border-radius: 12px; overflow: hidden; cursor: pointer; position: relative; transition: all 0.3s ease; display: flex; flex-direction: column;';

      const proxiedCover = s.coverUrl ? `/api/proxy?url=${encodeURIComponent(s.coverUrl)}` : '';

      card.innerHTML = `
        <div style="width: 100%; height: 260px; background-size: cover; background-position: center; background-image: url('${proxiedCover}'); background-color: #12121a; position: relative;">
          <span style="position: absolute; top: 10px; right: 10px; background: rgba(124, 58, 237, 0.9); color: white; padding: 4px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase;">SERIES</span>
          <button class="series-delete-btn" title="Delete Series" style="position: absolute; top: 10px; left: 10px; background: rgba(220, 38, 38, 0.9); border: none; color: white; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;">
            <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
          </button>
        </div>
        <div style="padding: 16px; display: flex; flex-direction: column; gap: 6px; flex: 1;">
          <div style="font-family: var(--font-serif); font-weight: 700; font-size: 1.05rem; color: var(--text-white); line-height: 1.3;">${s.title}</div>
          <div style="font-size: 0.8rem; color: var(--text-grey);">${s.chapters?.length || 0} Chapters</div>
        </div>
      `;

      const delBtn = card.querySelector('.series-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (confirm(`Delete series "${s.title}" and all its chapters?`)) {
            await window.inkStorage.deleteSeries(s.id);
            await this.loadLibraryGrid();
          }
        });
      }

      card.addEventListener('click', () => {
        this.openSeriesModal(s);
      });

      sGrid.appendChild(card);
    }
  }

  // Open Series Chapter Picker Modal
  async openSeriesModal(series) {
    this.activeSeries = series;
    const modal = document.getElementById('modal-series-chapters');
    const titleEl = document.getElementById('series-modal-title');
    const countEl = document.getElementById('series-modal-count');
    const coverEl = document.getElementById('series-modal-cover');
    const listEl = document.getElementById('series-modal-chapter-list');

    if (!modal || !listEl) return;

    if (titleEl) titleEl.textContent = series.title;
    if (countEl) countEl.textContent = `${series.chapters?.length || 0} Chapters Available`;
    if (coverEl && series.coverUrl) {
      coverEl.style.backgroundImage = `url('/api/proxy?url=${encodeURIComponent(series.coverUrl)}')`;
    }

    listEl.innerHTML = '';

    if (!series.chapters || series.chapters.length === 0) {
      listEl.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">No chapters found for this series.</div>';
    } else {
      // Get all compiled chapters from IndexedDB to mark already compiled items
      const compiledChapters = await window.inkStorage.getAllChapters();
      const compiledUrlMap = new Map();
      compiledChapters.forEach(c => {
        if (c.sourceUrl) compiledUrlMap.set(c.sourceUrl, c);
      });

      series.chapters.forEach((ch, idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--ink-border); border-radius: 10px; transition: background 0.2s ease; cursor: pointer;';
        
        const existingCompiled = compiledUrlMap.get(ch.url);
        const isCompiled = !!existingCompiled;

        item.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <i data-lucide="${isCompiled ? 'check-circle-2' : 'file-text'}" style="color: ${isCompiled ? '#10b981' : 'var(--text-grey)'}; width: 18px; height: 18px;"></i>
            <span style="font-weight: 500; font-size: 0.95rem; color: var(--text-white);">${ch.title}</span>
            ${isCompiled ? '<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">COMPILED</span>' : ''}
          </div>
          <button class="btn-ink ${isCompiled ? '' : 'btn-ink-primary'} btn-compile-single-ch" style="padding: 6px 14px; font-size: 0.8rem; ${isCompiled ? 'background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #10b981;' : ''}">
            <i data-lucide="${isCompiled ? 'book-open' : 'zap'}" style="width: 14px; height: 14px;"></i>
            <span>${isCompiled ? 'Read Now' : 'Compile & Read'}</span>
          </button>
        `;

        item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,0.07)'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'rgba(255,255,255,0.03)'; });

        const btn = item.querySelector('.btn-compile-single-ch');
        const triggerCompile = async (e) => {
          e.stopPropagation();
          modal.classList.remove('active');
          if (isCompiled) {
            const fullData = await window.inkStorage.getChapterFull(existingCompiled.id);
            if (fullData) this.openChapterInReader(fullData);
          } else {
            await this.compileAndOpenChapter(ch.url, ch.title, series, idx);
          }
        };

        if (btn) btn.addEventListener('click', triggerCompile);
        item.addEventListener('click', triggerCompile);

        listEl.appendChild(item);
      });
    }

    if (window.lucide) lucide.createIcons();
    modal.classList.add('active');
  }

  // Scrape Manga Series Page
  async processSeriesImport(url) {
    const loading = document.getElementById('loading-overlay');
    if (loading) loading.classList.add('active');

    try {
      this.showNotification('Scraping Manga Series & Chapter Directory...', 'info');

      let result;
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const resp = await fetch('/api/scrape-series', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || 'Series scrape request failed');
        }
        result = await resp.json();
      } else {
        throw new Error('Series scraping requires python backend server running');
      }

      if (!result.chapters || result.chapters.length === 0) {
        throw new Error('No chapters found on series page');
      }

      let seriesId = null;
      if (window.inkStorage && typeof window.inkStorage.saveSeries === 'function') {
        seriesId = await window.inkStorage.saveSeries({
          title: result.mangaTitle,
          coverUrl: result.coverUrl,
          sourceUrl: url,
          chapters: result.chapters
        });
      }

      await this.loadLibraryGrid();

      const tempSeriesObj = {
        id: seriesId || `series_${Date.now()}`,
        title: result.mangaTitle,
        coverUrl: result.coverUrl,
        sourceUrl: url,
        chapters: result.chapters
      };

      const savedSeries = (window.inkStorage && typeof window.inkStorage.getSeries === 'function' && seriesId) 
        ? await window.inkStorage.getSeries(seriesId) 
        : tempSeriesObj;

      if (savedSeries) {
        this.openSeriesModal(savedSeries);
      }
    } catch (err) {
      alert(`Series import failed: ${err.message}`);
    } finally {
      if (loading) loading.classList.remove('active');
    }
  }

  // Compile a single chapter from series on-demand & open in reader
  async compileAndOpenChapter(chUrl, chTitle, seriesObj = null, chapterIndex = -1) {
    const loading = document.getElementById('loading-overlay');
    if (loading) loading.classList.add('active');

    try {
      this.showNotification(`Compiling "${chTitle}"...`, 'info');
      const imported = await window.chapterImporter.importFromUrl(chUrl);

      const panels = await window.mangaDetector.detectChapterPanels(imported.pages);

      const chapterObj = {
        id: `ch_${Date.now()}`,
        title: imported.title || chTitle,
        seriesId: seriesObj?.id || null,
        seriesChapterIndex: chapterIndex,
        sourceType: 'scraped',
        sourceUrl: chUrl,
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

      // Set up next chapter info for reader HUD & chapter completion modal
      if (seriesObj && seriesObj.chapters && chapterIndex >= 0 && chapterIndex > 0) {
        // WeebCentral chapters are listed newest to oldest (e.g. Ch 386 -> Ch 1)
        // Next chapter chronologically is chapterIndex - 1
        const nextCh = seriesObj.chapters[chapterIndex - 1];
        if (nextCh) {
          window.immersiveReader.nextChapterData = {
            url: nextCh.url,
            title: nextCh.title,
            seriesObj: seriesObj,
            index: chapterIndex - 1
          };
        } else {
          window.immersiveReader.nextChapterData = null;
        }
      } else {
        window.immersiveReader.nextChapterData = null;
      }

      this.openChapterInReader(fullChapter);
    } catch (err) {
      alert(`Chapter compilation failed: ${err.message}`);
    } finally {
      if (loading) loading.classList.remove('active');
    }
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
