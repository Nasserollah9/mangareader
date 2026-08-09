/**
 * InkScroll "Ink & Focus" Reader Controller
 * Exposes window.initInkFocusReader(containerSelector)
 */

(function () {
  'use strict';

  class InkFocusReader {
    constructor() {
      this.isAnimating = false;
      this.container = null;
      this.focusTimer = null;
      
      // Reusable offscreen canvas for color sampling
      this.samplerCanvas = document.createElement('canvas');
      this.samplerCanvas.width = 50;
      this.samplerCanvas.height = 50;
      this.samplerCtx = this.samplerCanvas.getContext('2d');

      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    init(containerSelector = '#view-reader') {
      this.container = document.querySelector(containerSelector) || document.getElementById('view-reader');
      if (!this.container) return;

      this.container.classList.add('ink-focus-stage');

      // 1. Setup Background Layers & Ambient Orb
      this.setupBackgroundLayers();

      // 2. Setup Recessive UI Auto-Hide Focus Mode
      this.setupFocusAutoHide();

      // 3. Setup Quiet Navigation Hints
      this.setupQuietHints();

      // 4. Wrap Existing Navigation Logic
      this.wrapNavigationLogic();

      // 5. Initial Color Sampling
      setTimeout(() => this.samplePageAmbientColor(), 600);
    }

    /* ==========================================================================
       1. Background Layers: Inkwell Ambience & Vignette
       ========================================================================== */
    setupBackgroundLayers() {
      if (document.getElementById('ink-ambient-orb')) return;

      // Ambient Glow Orb (-1 layer)
      const orb = document.createElement('div');
      orb.id = 'ink-ambient-orb';
      orb.className = 'ink-ambient-orb';
      this.container.insertBefore(orb, this.container.firstChild);

      // Static Vignette Overlay
      const vignette = document.createElement('div');
      vignette.id = 'ink-vignette-overlay';
      vignette.className = 'ink-vignette-overlay';
      this.container.insertBefore(vignette, this.container.firstChild);

      // Minimal Progress Track at bottom
      if (!document.getElementById('ink-minimal-progress-track')) {
        const track = document.createElement('div');
        track.id = 'ink-minimal-progress-track';
        track.className = 'ink-minimal-progress-track';
        track.innerHTML = '<div id="ink-minimal-progress-fill" class="ink-minimal-progress-fill"></div>';
        document.body.appendChild(track);
      }
    }

    /* ==========================================================================
       2. Asynchronous Ambient Color Sampler
       ========================================================================== */
    samplePageAmbientColor() {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => this.doColorSampling());
      } else {
        setTimeout(() => this.doColorSampling(), 0);
      }
    }

    doColorSampling() {
      try {
        const readerCanvas = document.getElementById('reader-canvas');
        if (!readerCanvas || !this.samplerCtx) return;

        this.samplerCtx.drawImage(readerCanvas, 0, 0, 50, 50);
        const imgData = this.samplerCtx.getImageData(0, 0, 50, 50).data;

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < imgData.length; i += 16) {
          rSum += imgData[i];
          gSum += imgData[i + 1];
          bSum += imgData[i + 2];
          count++;
        }

        if (count === 0) return;

        let r = rSum / count;
        let g = gSum / count;
        let b = bSum / count;

        // Desaturate to 15% and darken to 8% brightness for calm mood lighting
        const avg = (r + g + b) / 3;
        r = Math.round(r * 0.15 + avg * 0.85) * 0.18;
        g = Math.round(g * 0.15 + avg * 0.85) * 0.18;
        b = Math.round(b * 0.15 + avg * 0.85) * 0.18;

        const sampledStr = `rgba(${Math.round(r + 20)}, ${Math.round(g + 20)}, ${Math.round(b + 30)}, 0.45)`;
        
        const orb = document.getElementById('ink-ambient-orb');
        if (orb) orb.style.setProperty('--ink-ambient-color', sampledStr);
      } catch (err) {
        // Fallback tone
        const orb = document.getElementById('ink-ambient-orb');
        if (orb) orb.style.setProperty('--ink-ambient-color', 'rgba(30, 30, 45, 0.4)');
      }
    }

    /* ==========================================================================
       3. Gentle Horizontal Slide + Crossfade Click Interceptor
       ========================================================================== */
    wrapNavigationLogic() {
      if (!window.immersiveReader) return;

      const originalNext = window.immersiveReader.nextPanel.bind(window.immersiveReader);
      const originalPrev = window.immersiveReader.prevPanel.bind(window.immersiveReader);
      const originalNavigate = window.immersiveReader.navigateToPanel.bind(window.immersiveReader);

      window.immersiveReader.nextPanel = () => {
        if (this.isAnimating) return;
        this.triggerGentleSlide('next', originalNext);
      };

      window.immersiveReader.prevPanel = () => {
        if (this.isAnimating) return;
        this.triggerGentleSlide('prev', originalPrev);
      };

      window.immersiveReader.navigateToPanel = (index, duration) => {
        originalNavigate(index, duration);
        this.updateMinimalProgress(index);
        this.samplePageAmbientColor();
      };
    }

    triggerGentleSlide(direction, actionCallback) {
      if (this.isAnimating) return;
      this.isAnimating = true;

      const stage = document.getElementById('reader-canvas') || this.container;
      const exitClass = direction === 'next' ? 'ink-exit-next' : 'ink-exit-prev';
      const enterClass = direction === 'next' ? 'ink-enter-next' : 'ink-enter-prev';

      // 1. Trigger exit animation
      stage.classList.add(exitClass);

      // 2. At 50% point (~200ms), execute original page swap
      setTimeout(() => {
        if (actionCallback) actionCallback();

        stage.classList.remove(exitClass);
        stage.classList.add(enterClass);

        // 3. Complete entrance animation and restore lock
        setTimeout(() => {
          stage.classList.remove(enterClass);
          this.isAnimating = false;
          this.samplePageAmbientColor();
        }, 220);

      }, 200);
    }

    /* ==========================================================================
       4. Focus Mode (Auto-Hide Recessive UI Chrome)
       ========================================================================== */
    setupFocusAutoHide() {
      const uiElements = [
        document.getElementById('reader-hud'),
        document.querySelector('.reader-hud-top'),
        document.querySelector('.reader-hud-bottom'),
        document.getElementById('panel-counter-badge')
      ].filter(Boolean);

      uiElements.forEach(el => el.classList.add('ink-recessive-ui'));

      const resetFocusTimer = () => {
        uiElements.forEach(el => el.classList.remove('focus-receded'));

        if (this.focusTimer) clearTimeout(this.focusTimer);
        this.focusTimer = setTimeout(() => {
          const isReaderActive = this.container.classList.contains('active') && !this.container.classList.contains('hidden');
          if (isReaderActive) {
            uiElements.forEach(el => el.classList.add('focus-receded'));
          }
        }, 3000);
      };

      window.addEventListener('pointermove', resetFocusTimer, { passive: true });
      window.addEventListener('touchstart', resetFocusTimer, { passive: true });
      resetFocusTimer();
    }

    /* ==========================================================================
       5. Minimal Progress Line Sync
       ========================================================================== */
    updateMinimalProgress(index) {
      if (!window.immersiveReader || !window.immersiveReader.panels) return;
      const total = window.immersiveReader.panels.length;
      if (total === 0) return;

      const progress = Math.round(((index + 1) / total) * 100);
      const fill = document.getElementById('ink-minimal-progress-fill');
      if (fill) fill.style.width = `${progress}%`;
    }

    /* ==========================================================================
       6. Quiet Navigation Hints (Desktop Left/Right 10%)
       ========================================================================== */
    setupQuietHints() {
      if (document.getElementById('ink-hint-left')) return;

      const leftHint = document.createElement('div');
      leftHint.id = 'ink-hint-left';
      leftHint.className = 'ink-hint-chevron ink-hint-left';
      leftHint.innerHTML = '<i data-lucide="chevron-left"></i>';

      const rightHint = document.createElement('div');
      rightHint.id = 'ink-hint-right';
      rightHint.className = 'ink-hint-chevron ink-hint-right';
      rightHint.innerHTML = '<i data-lucide="chevron-right"></i>';

      this.container.appendChild(leftHint);
      this.container.appendChild(rightHint);
      if (window.lucide) lucide.createIcons();

      window.addEventListener('mousemove', (e) => {
        const isReaderActive = this.container.classList.contains('active') && !this.container.classList.contains('hidden');
        if (!isReaderActive) {
          leftHint.classList.remove('hint-visible');
          rightHint.classList.remove('hint-visible');
          return;
        }

        const width = window.innerWidth;
        if (e.clientX < width * 0.10) {
          leftHint.classList.add('hint-visible');
          rightHint.classList.remove('hint-visible');
        } else if (e.clientX > width * 0.90) {
          rightHint.classList.add('hint-visible');
          leftHint.classList.remove('hint-visible');
        } else {
          leftHint.classList.remove('hint-visible');
          rightHint.classList.remove('hint-visible');
        }
      }, { passive: true });
    }
  }

  window.inkFocusReader = new InkFocusReader();
  window.initInkFocusReader = (selector) => {
    window.inkFocusReader.init(selector);
  };

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      window.initInkFocusReader('#view-reader');
    }, 300);
  });
})();
