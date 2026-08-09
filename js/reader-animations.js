/**
 * InkScroll Reader Animations & 3D Visual Effects Controller
 * Exposes window.initReaderEffects(containerSelector)
 */

(function () {
  'use strict';

  class ReaderAnimationEngine {
    constructor() {
      this.isAnimating = false;
      this.currentDirection = 'next';
      this.container = null;

      // 3D Three.js Background Scene State
      this.bgScene = null;
      this.bgCamera = null;
      this.bgRenderer = null;
      this.bgIcosahedrons = [];
      this.bgAnimId = null;

      // Parallax Mouse Coordinates
      this.mouseX = 0;
      this.mouseY = 0;
      this.targetMouseX = 0;
      this.targetMouseY = 0;

      // Off-screen canvas for color sampling
      this.colorCanvas = document.createElement('canvas');
      this.colorCanvas.width = 50;
      this.colorCanvas.height = 50;
      this.colorCtx = this.colorCanvas.getContext('2d');

      // Accessibility
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    init(containerSelector = '#view-reader') {
      this.container = document.querySelector(containerSelector) || document.getElementById('view-reader');
      if (!this.container) return;

      this.container.classList.add('cinematic-reader-stage');

      // 1. Initialize 3D Immersive Background Layers
      this.setupBackgroundLayers();

      // 2. Setup Edge Hover Chevrons
      this.setupEdgeChevrons();

      // 3. Setup Pointer Tracking for Parallax
      this.setupPointerParallax();

      // 4. Wrap Existing Navigation & Page Counter Logic
      this.wrapNavigationLogic();

      // 5. Setup IntersectionObserver to pause Three.js render loop when offscreen
      this.setupViewportObserver();

      // 6. Initial Theme Color Sampling
      setTimeout(() => this.sampleCurrentPanelColor(), 800);
    }

    /* ==========================================================================
       1. 3D Immersive Background System (Three.js WebGL & CSS Layers)
       ========================================================================== */
    setupBackgroundLayers() {
      if (document.getElementById('reader-bg-deep')) return;

      // Layer -3: WebGL Deep Particle / Mesh Canvas
      const deepLayer = document.createElement('canvas');
      deepLayer.id = 'reader-bg-deep';
      deepLayer.className = 'bg-layer-deep';
      this.container.insertBefore(deepLayer, this.container.firstChild);

      // Layer -2: Mid Layer Mood Lighting Glow
      const moodGlow = document.createElement('div');
      moodGlow.id = 'reader-bg-mood';
      moodGlow.className = 'bg-mood-glow';
      this.container.insertBefore(moodGlow, this.container.firstChild);

      // Layer -1: Vignette Spotlight
      const vignette = document.createElement('div');
      vignette.id = 'reader-bg-vignette';
      vignette.className = 'bg-layer-vignette';
      this.container.insertBefore(vignette, this.container.firstChild);

      // Initialize Three.js Deep Scene
      if (typeof THREE !== 'undefined' && !this.reducedMotion) {
        this.initThreeBgScene(deepLayer);
      }
    }

    initThreeBgScene(canvas) {
      try {
        this.bgScene = new THREE.Scene();
        this.bgCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.bgCamera.position.z = 15;

        this.bgRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        this.bgRenderer.setSize(window.innerWidth, window.innerHeight);
        this.bgRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

        // Floating Wireframe Low-Poly Icosahedrons
        const geometry = new THREE.IcosahedronGeometry(1.2, 0);
        const material = new THREE.MeshBasicMaterial({
          color: 0x3b82f6,
          wireframe: true,
          transparent: true,
          opacity: 0.12
        });

        for (let i = 0; i < 18; i++) {
          const mesh = new THREE.Mesh(geometry, material.clone());
          mesh.position.set(
            (Math.random() - 0.5) * 30,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 15
          );
          mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
          mesh.scale.setScalar(Math.random() * 0.8 + 0.4);

          this.bgScene.add(mesh);
          this.bgIcosahedrons.push({
            mesh: mesh,
            rotSpeedX: (Math.random() - 0.5) * 0.008,
            rotSpeedY: (Math.random() - 0.5) * 0.008
          });
        }

        // Render Loop
        const animateBg = () => {
          this.bgAnimId = requestAnimationFrame(animateBg);

          // Parallax Camera Motion
          this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
          this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;

          this.bgCamera.position.x = this.mouseX * 2.5;
          this.bgCamera.position.y = -this.mouseY * 2.5;
          this.bgCamera.lookAt(this.bgScene.position);

          for (let item of this.bgIcosahedrons) {
            item.mesh.rotation.x += item.rotSpeedX;
            item.mesh.rotation.y += item.rotSpeedY;
          }

          this.bgRenderer.render(this.bgScene, this.bgCamera);
        };

        animateBg();

        // Handle Resize
        window.addEventListener('resize', () => {
          if (!this.bgRenderer || !this.bgCamera) return;
          this.bgCamera.aspect = window.innerWidth / window.innerHeight;
          this.bgCamera.updateProjectionMatrix();
          this.bgRenderer.setSize(window.innerWidth, window.innerHeight);
        });
      } catch (err) {
        console.warn('Three.js background initialization fallback:', err);
      }
    }

    setupPointerParallax() {
      window.addEventListener('pointermove', (e) => {
        this.targetMouseX = (e.clientX / window.innerWidth) - 0.5;
        this.targetMouseY = (e.clientY / window.innerHeight) - 0.5;
      });
    }

    /* ==========================================================================
       2. Dynamic Theme Mood Color Sampling
       ========================================================================== */
    sampleCurrentPanelColor() {
      try {
        const readerCanvas = document.getElementById('reader-canvas');
        if (!readerCanvas || !this.colorCtx) return;

        this.colorCtx.drawImage(readerCanvas, 0, 0, 50, 50);
        const imgData = this.colorCtx.getImageData(0, 0, 50, 50).data;

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < imgData.length; i += 16) {
          rSum += imgData[i];
          gSum += imgData[i + 1];
          bSum += imgData[i + 2];
          count++;
        }

        if (count === 0) return;

        let r = Math.round(rSum / count);
        let g = Math.round(gSum / count);
        let b = Math.round(bSum / count);

        // Boost saturation for mood accent
        r = Math.min(255, Math.max(40, r));
        g = Math.min(255, Math.max(40, g));
        b = Math.min(255, Math.max(40, b));

        const colorStr = `rgb(${r}, ${g}, ${b})`;
        document.documentElement.style.setProperty('--theme-accent-sampled', colorStr);

        // Update glowing progress bar box shadow & background
        const fill = document.getElementById('reader-progress-fill');
        if (fill) {
          fill.classList.add('glow-progress-fill');
          fill.style.backgroundColor = colorStr;
        }
      } catch (err) {
        // Cross-origin image fallback
        document.documentElement.style.setProperty('--theme-accent-sampled', '#dc2626');
      }
    }

    /* ==========================================================================
       3. Click Interception & Direction-Aware 3D Panel Transitions
       ========================================================================== */
    wrapNavigationLogic() {
      if (!window.immersiveReader) return;

      const originalNavigate = window.immersiveReader.navigateToPanel.bind(window.immersiveReader);

      window.immersiveReader.navigateToPanel = (index, duration) => {
        originalNavigate(index, duration);
        this.updateSlotMachineCounter(index + 1);
        this.triggerPageFlicker();
        this.applyMoodVignette();
        setTimeout(() => this.sampleCurrentPanelColor(), 300);
      };
    }

    // Phase 2b: Mood Vignette Intensity
    applyMoodVignette() {
      const vignette = document.getElementById('reader-bg-vignette') || document.getElementById('ink-vignette-overlay');
      if (!vignette || typeof gsap === 'undefined') return;

      const reader = window.immersiveReader;
      const currentPanel = reader?.panels?.[reader.currentPanelIndex];
      const mood = currentPanel?.effects?.atmosphere || reader?.chapter?.metadata?.mood || 'neutral';

      const moodVignetteStrength = {
        tense: 0.55,
        dark: 0.50,
        rain: 0.45,
        dust: 0.35,
        calm: 0.15,
        neutral: 0.25
      };

      const strength = moodVignetteStrength[mood] ?? moodVignetteStrength.neutral;
      gsap.to(vignette, { opacity: strength, duration: 1.5, ease: 'sine.inOut' });
    }

    // Phase 2c: Page-Turn Light Flicker
    triggerPageFlicker() {
      const overlay = document.getElementById('flicker-overlay');
      if (!overlay || typeof gsap === 'undefined' || this.reducedMotion) return;

      gsap.timeline()
        .to(overlay, { opacity: 0.08, duration: 0.04, ease: 'none' })
        .to(overlay, { opacity: 0, duration: 0.06, ease: 'none' });
    }

    triggerCinematicTransition(direction, actionCallback) {
      if (this.isAnimating) return;
      this.isAnimating = true;

      const stage = document.getElementById('reader-canvas') || this.container;
      const paperCurl = document.createElement('div');
      paperCurl.className = 'paper-curl-overlay paper-curl-sweep';
      this.container.appendChild(paperCurl);

      // Play paper sweep sound if audio engine ready
      if (window.inkAudio && window.inkAudio.playPanelTransition) {
        window.inkAudio.playPanelTransition();
      }

      if (typeof gsap !== 'undefined') {
        const exitRotation = direction === 'next' ? -18 : 18;
        const exitX = direction === 'next' ? -110 : 110;
        const enterX = direction === 'next' ? 110 : -110;

        // GSAP 3D Exit Animation
        gsap.to(stage, {
          rotateY: exitRotation,
          xPercent: exitX,
          opacity: 0,
          scale: 0.92,
          duration: 0.32,
          ease: 'power2.in',
          onComplete: () => {
            // Execute page swap at ~40% progress
            if (actionCallback) actionCallback();

            // GSAP 3D Entrance Animation
            gsap.fromTo(stage,
              { rotateY: -exitRotation, xPercent: enterX, opacity: 0, scale: 0.92 },
              {
                rotateY: 0,
                xPercent: 0,
                opacity: 1,
                scale: 1,
                duration: 0.42,
                ease: 'power3.out',
                onComplete: () => {
                  this.isAnimating = false;
                  if (paperCurl.parentNode) paperCurl.parentNode.removeChild(paperCurl);
                  this.sampleCurrentPanelColor();
                }
              }
            );
          }
        });
      } else {
        // Fallback without GSAP
        stage.classList.add(direction === 'next' ? 'panel-3d-exit-next' : 'panel-3d-exit-prev');
        setTimeout(() => {
          if (actionCallback) actionCallback();
          stage.classList.remove('panel-3d-exit-next', 'panel-3d-exit-prev');
          stage.classList.add(direction === 'next' ? 'panel-3d-enter-next' : 'panel-3d-enter-prev');

          setTimeout(() => {
            stage.classList.remove('panel-3d-enter-next', 'panel-3d-enter-prev');
            this.isAnimating = false;
            if (paperCurl.parentNode) paperCurl.parentNode.removeChild(paperCurl);
            this.sampleCurrentPanelColor();
          }, 450);
        }, 300);
      }
    }

    /* ==========================================================================
       4. Slot Machine Page Counter Animation
       ========================================================================== */
    updateSlotMachineCounter(currentNum) {
      const curEl = document.getElementById('counter-current');
      if (!curEl) return;

      if (!curEl.parentNode.classList.contains('slot-counter-box')) {
        const wrapper = document.createElement('span');
        wrapper.className = 'slot-counter-box';
        curEl.parentNode.insertBefore(wrapper, curEl);
        wrapper.appendChild(curEl);
      }

      curEl.classList.add('slot-counter-num');
      const oldVal = curEl.textContent;
      if (oldVal === String(currentNum)) return;

      curEl.classList.add('slot-num-up-out');
      setTimeout(() => {
        curEl.textContent = currentNum;
        curEl.classList.remove('slot-num-up-out');
        curEl.classList.add('slot-num-up-in');
        setTimeout(() => curEl.classList.remove('slot-num-up-in'), 450);
      }, 200);
    }

    /* ==========================================================================
       5. Edge Hover Pulsing Chevrons (Desktop)
       ========================================================================== */
    setupEdgeChevrons() {
      if (document.getElementById('edge-chevron-left')) return;

      const leftZone = document.createElement('div');
      leftZone.id = 'edge-chevron-left';
      leftZone.className = 'edge-chevron-zone edge-chevron-left';
      leftZone.innerHTML = '<div class="edge-chevron-icon"><i data-lucide="chevron-left"></i></div>';

      const rightZone = document.createElement('div');
      rightZone.id = 'edge-chevron-right';
      rightZone.className = 'edge-chevron-zone edge-chevron-right';
      rightZone.innerHTML = '<div class="edge-chevron-icon"><i data-lucide="chevron-right"></i></div>';

      this.container.appendChild(leftZone);
      this.container.appendChild(rightZone);
      if (window.lucide) lucide.createIcons();

      window.addEventListener('mousemove', (e) => {
        const isReaderActive = this.container.classList.contains('active') && !this.container.classList.contains('hidden');
        if (!isReaderActive) {
          leftZone.classList.remove('visible');
          rightZone.classList.remove('visible');
          return;
        }

        const width = window.innerWidth;
        if (e.clientX < width * 0.12) {
          leftZone.classList.add('visible');
          rightZone.classList.remove('visible');
        } else if (e.clientX > width * 0.88) {
          rightZone.classList.add('visible');
          leftZone.classList.remove('visible');
        } else {
          leftZone.classList.remove('visible');
          rightZone.classList.remove('visible');
        }
      });
    }

    /* ==========================================================================
       6. Viewport Observer for Three.js Resource Management
       ========================================================================== */
    setupViewportObserver() {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !this.bgAnimId && this.bgRenderer) {
            // Resume background loop
          } else if (!entry.isIntersecting && this.bgAnimId) {
            cancelAnimationFrame(this.bgAnimId);
            this.bgAnimId = null;
          }
        });
      }, { threshold: 0.1 });

      observer.observe(this.container);
    }
  }

  window.readerAnimEngine = new ReaderAnimationEngine();
  window.initReaderEffects = (selector) => {
    window.readerAnimEngine.init(selector);
  };

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      window.initReaderEffects('#view-reader');
    }, 400);
  });
})();
