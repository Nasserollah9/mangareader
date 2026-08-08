// InkScroll Immersive Reader Engine - Three.js WebGL, GSAP, Parallax, Weather & Auto-Scroll
class ImmersiveReader {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.chapter = null;
    this.pages = [];
    this.panels = [];
    this.currentPanelIndex = 0;

    this.pageTextures = new Map();
    this.pageMeshes = new Map();

    // Auto-Scroll State
    this.isAutoScrolling = false;
    this.autoScrollTimer = null;
    this.autoScrollSpeed = 5; // seconds per panel

    // Motion & Effects State
    this.mousePos = { x: 0, y: 0 };
    this.targetMousePos = { x: 0, y: 0 };
    this.weatherAnimationId = null;

    // Free Pan / Scroll Mode State
    this.freePanMode = false;
    this.isPanning = false;
    this.panStartPos = { x: 0, y: 0 };
    this.cameraStartPos = { x: 0, y: 0 };

    // Gesture Tracking
    this.touchStartX = 0;
  }

  init() {
    this.canvas = document.getElementById('reader-canvas');
    if (!this.canvas) return;

    // Three.js Scene, Orthographic Camera, WebGL Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0c);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 1000);
    this.camera.position.z = 10;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Resize Event
    window.addEventListener('resize', () => this.onResize());

    // Mouse Movement Parallax Tracking
    window.addEventListener('mousemove', (e) => {
      this.targetMousePos.x = (e.clientX / window.innerWidth - 0.5) * 0.25;
      this.targetMousePos.y = (e.clientY / window.innerHeight - 0.5) * 0.25;
    });

    // Mouse Drag Panning (Free Pan / Scroll Mode)
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.freePanMode) return;
      this.isPanning = true;
      this.canvas.style.cursor = 'grabbing';
      this.panStartPos = { x: e.clientX, y: e.clientY };
      const curX = this.baseCameraPos ? this.baseCameraPos.x : this.camera.position.x;
      const curY = this.baseCameraPos ? this.baseCameraPos.y : this.camera.position.y;
      this.cameraStartPos = { x: curX, y: curY };
    });

    window.addEventListener('mousemove', (e) => {
      if (this.freePanMode && this.isPanning) {
        const zoom = this.camera.zoom || 1;
        const dx = ((e.clientX - this.panStartPos.x) / window.innerWidth) * (2 / zoom) * (window.innerWidth / window.innerHeight);
        const dy = ((e.clientY - this.panStartPos.y) / window.innerHeight) * (2 / zoom);

        const newX = this.cameraStartPos.x - dx;
        const newY = this.cameraStartPos.y + dy;

        if (!this.baseCameraPos) this.baseCameraPos = { x: newX, y: newY };
        else {
          this.baseCameraPos.x = newX;
          this.baseCameraPos.y = newY;
        }

        this.camera.position.x = newX;
        this.camera.position.y = newY;
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.freePanMode && this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = 'grab';
      }
    });

    // Scroll Wheel Zoom in Free Pan Mode
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.freePanMode) return;
      e.preventDefault();

      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      const newZoom = Math.max(0.5, Math.min(3.5, this.camera.zoom + delta));

      gsap.killTweensOf(this.camera);
      gsap.to(this.camera, {
        zoom: newZoom,
        duration: 0.2,
        ease: "power1.out",
        onUpdate: () => this.camera.updateProjectionMatrix()
      });
    }, { passive: false });

    // Touch Swipes
    this.canvas.addEventListener('touchstart', (e) => {
      this.touchStartX = e.touches[0].clientX;
    });
    this.canvas.addEventListener('touchend', (e) => {
      if (this.freePanMode) return;
      const touchEndX = e.changedTouches[0].clientX;
      const diffX = touchEndX - this.touchStartX;
      if (Math.abs(diffX) > 50) {
        if (diffX < 0) this.nextPanel();
        else this.prevPanel();
      }
    });

    // Click Navigation
    this.canvas.addEventListener('click', (e) => {
      if (this.freePanMode) return;
      if (e.target.closest('.reader-hud-top') || e.target.closest('.hud-icon-btn') || e.target.closest('.btn-ink')) return;
      if (e.clientX > window.innerWidth * 0.45) {
        this.nextPanel();
      } else {
        this.prevPanel();
      }
    });

    // Animation Loop
    this.animate();
  }

  async loadChapter(chapterData, startPanelIndex = 0) {
    this.chapter = chapterData.chapter;
    this.pages = chapterData.pages;
    this.panels = chapterData.panels;
    this.currentPanelIndex = Math.min(startPanelIndex, this.panels.length - 1);

    document.getElementById('reader-title').textContent = this.chapter.title;
    document.getElementById('view-reader').classList.add('active');

    // Build 3D meshes for all pages in scene
    await this.buildPageMeshes();

    // Start Weather Particles
    this.startWeatherParticles('rain');

    // Focus camera on starting panel
    this.navigateToPanel(this.currentPanelIndex, 0);

    // Play ambient audio
    if (window.inkAudio) {
      window.inkAudio.playAmbient(this.chapter.metadata?.mood || 'action');
    }
  }

  async buildPageMeshes() {
    // Clear old scene meshes
    for (let mesh of this.pageMeshes.values()) {
      this.scene.remove(mesh);
    }
    this.pageMeshes.clear();

    const loader = new THREE.TextureLoader();

    for (let page of this.pages) {
      const texture = await new Promise((resolve) => {
        loader.load(page.imageUrl, (tex) => resolve(tex), undefined, () => resolve(null));
      });

      if (!texture) continue;

      const aspect = page.width / page.height;
      const geometry = new THREE.PlaneGeometry(2 * aspect, 2);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geometry, material);
      // Position pages horizontally in 3D space with gap
      mesh.position.x = page.index * 3.5;
      mesh.position.y = 0;
      mesh.position.z = 0;

      this.scene.add(mesh);
      this.pageMeshes.set(page.index, mesh);
    }
  }

  navigateToPanel(index, duration = 0.6) {
    if (index < 0 || index >= this.panels.length) return;

    const previousPanel = this.panels[this.currentPanelIndex];
    this.currentPanelIndex = index;
    const targetPanel = this.panels[index];

    const page = this.pages.find(p => p.index === targetPanel.pageIndex);
    const mesh = this.pageMeshes.get(targetPanel.pageIndex);
    if (!mesh || !page) return;

    // Interrupt any active in-flight GSAP tweens so fast user clicks/taps never freeze or stack!
    if (this.camera) gsap.killTweensOf(this.camera);
    if (this.baseCameraPos) gsap.killTweensOf(this.baseCameraPos);

    const isCrossPage = previousPanel && (previousPanel.pageIndex !== targetPanel.pageIndex);
    const curtain = document.getElementById('ink-curtain-overlay');

    const performCameraSwapAndPan = () => {
      // Hide neighboring pages so zero adjacent page artwork peeks out in margins!
      for (let [pIndex, m] of this.pageMeshes.entries()) {
        m.visible = (pIndex === targetPanel.pageIndex);
      }

      // Calculate target camera position and zoom out to reveal full panel
      const pageAspect = page.width / page.height;
      const meshW = 2 * pageAspect;
      const meshH = 2;
      const screenAspect = window.innerWidth / window.innerHeight;

      // Panel center bounds mapped to world coordinates
      const targetX = mesh.position.x - meshW / 2 + (targetPanel.bounds.x + targetPanel.bounds.w / 2) * meshW;
      const targetY = mesh.position.y + meshH / 2 - (targetPanel.bounds.y + targetPanel.bounds.h / 2) * meshH;

      // Subtle zoom-in boost: scaleFactor 0.84, max zoom cap 1.28
      const zoomHeight = (1 / Math.max(0.15, targetPanel.bounds.h)) * 0.84;
      const zoomWidth = (screenAspect / (Math.max(0.15, targetPanel.bounds.w) * pageAspect)) * 0.84;

      // Subtle zoom-in cap: 1.28x provides cozy legibility while keeping full panel frame visible
      const targetZoom = Math.min(zoomHeight, zoomWidth, 1.28);

      // Play subtle transition sound
      if (window.inkAudio) window.inkAudio.playPanelTransition();

      // Direction-Aware Motion & Camera Pan
      if (!this.baseCameraPos) this.baseCameraPos = { x: targetX, y: targetY };

      // SBS "The Boat" Signature 3D Camera Z-Flight Dip Effect
      gsap.to(this.camera.position, {
        z: 9.3,
        duration: duration * 0.5,
        ease: "power2.in",
        onComplete: () => {
          gsap.to(this.camera.position, {
            z: 10,
            duration: duration * 0.5,
            ease: "power2.out"
          });
        }
      });

      gsap.to(this.baseCameraPos, {
        x: targetX,
        y: targetY,
        duration: duration,
        ease: "power2.out"
      });

      // Smooth camera zoom directly to targetZoom
      gsap.to(this.camera, {
        zoom: targetZoom,
        duration: duration,
        ease: "power2.out",
        onUpdate: () => this.camera.updateProjectionMatrix()
      });

      // 3D Volumetric Cloud Parting & Reveal Animation
      this.triggerCloudParting();

      // Trigger directional sweep vignette overlay
      if (window.inkUIFX) window.inkUIFX.triggerDirectionalSweep();

      // Update UI Progress & Panel Counter Badge
      this.updateProgressUI(index);

      // Render SFX overlay
      this.renderPanelSFX(targetPanel);
    };

    if (isCrossPage && curtain) {
      curtain.classList.add('active');
      setTimeout(() => {
        performCameraSwapAndPan();
        setTimeout(() => {
          curtain.classList.remove('active');
        }, 150);
      }, 150);
    } else {
      performCameraSwapAndPan();
    }
  }

  updateProgressUI(index) {
    const total = this.panels.length;
    const current = index + 1;
    const progress = Math.round((current / total) * 100);

    const curEl = document.getElementById('counter-current');
    const totEl = document.getElementById('counter-total');
    if (curEl && totEl) {
      curEl.textContent = current;
      totEl.textContent = total;
    } else {
      const counterText = document.getElementById('panel-counter-text');
      if (counterText) counterText.textContent = `${current} / ${total}`;
    }

    const fill = document.getElementById('reader-progress-fill');
    if (fill && typeof gsap !== 'undefined') {
      gsap.killTweensOf(fill);
      gsap.to(fill, { width: `${progress}%`, duration: 0.4, ease: 'power2.out' });
    } else if (fill) {
      fill.style.width = `${progress}%`;
    }

    if (window.inkStorage && this.chapter && this.panels[index]) {
      window.inkStorage.updateProgress(this.chapter.id, progress, this.panels[index].id);
    }
  }

  nextPanel() {
    if (this.currentPanelIndex < this.panels.length - 1) {
      this.navigateToPanel(this.currentPanelIndex + 1);
    } else {
      // Trigger Chapter Complete Flow
      this.showChapterCompleteModal();
    }
  }

  prevPanel() {
    if (this.currentPanelIndex > 0) {
      this.navigateToPanel(this.currentPanelIndex - 1);
    }
  }

  toggleFreePan() {
    this.freePanMode = !this.freePanMode;
    const icon = document.getElementById('icon-freepan');
    const btn = document.getElementById('btn-toggle-freepan');

    if (this.freePanMode) {
      if (icon) icon.setAttribute('data-lucide', 'move');
      if (btn) btn.classList.add('active');
      this.canvas.style.cursor = 'grab';

      // Zoom out to show full page frame
      gsap.killTweensOf(this.camera);
      gsap.to(this.camera, {
        zoom: 0.95,
        duration: 0.4,
        ease: "power2.out",
        onUpdate: () => this.camera.updateProjectionMatrix()
      });

      if (window.inkApp) window.inkApp.showNotification('Free Scroll / Pan Mode Active — Drag or scroll wheel to explore full page', 'info');
    } else {
      if (icon) icon.setAttribute('data-lucide', 'hand');
      if (btn) btn.classList.remove('active');
      this.canvas.style.cursor = 'pointer';

      // Re-focus camera on current panel
      this.navigateToPanel(this.currentPanelIndex);
      if (window.inkApp) window.inkApp.showNotification('Panel Focus Mode Active', 'info');
    }

    if (window.lucide) lucide.createIcons();
  }

  showChapterCompleteModal() {
    const modal = document.getElementById('modal-chapter-complete');
    if (modal) modal.classList.add('active');
  }

  hideChapterCompleteModal() {
    const modal = document.getElementById('modal-chapter-complete');
    if (modal) modal.classList.remove('active');
  }

  rereadChapter() {
    this.hideChapterCompleteModal();
    this.navigateToPanel(0, 0);
  }

  nudgeCamera(dir) {
    if (!this.camera || !this.baseCameraPos) return;
    const amount = 0.20;
    if (dir === 'left') {
      gsap.to(this.baseCameraPos, { x: this.baseCameraPos.x - amount, duration: 0.25, ease: "power1.out" });
    } else if (dir === 'right') {
      gsap.to(this.baseCameraPos, { x: this.baseCameraPos.x + amount, duration: 0.25, ease: "power1.out" });
    }
  }

  toggleAutoScroll() {
    this.isAutoScrolling = !this.isAutoScrolling;
    const btn = document.getElementById('btn-toggle-autoscroll');
    const label = document.getElementById('label-autoscroll');
    const icon = document.getElementById('icon-autoscroll');

    if (this.isAutoScrolling) {
      label.textContent = 'Pause';
      if (icon) icon.setAttribute('data-lucide', 'pause');
      this.scheduleNextAutoScroll();
    } else {
      label.textContent = 'Auto-Scroll';
      if (icon) icon.setAttribute('data-lucide', 'play');
      if (this.autoScrollTimer) clearTimeout(this.autoScrollTimer);
    }
    if (window.lucide) lucide.createIcons();
  }

  scheduleNextAutoScroll() {
    if (!this.isAutoScrolling) return;
    const panel = this.panels[this.currentPanelIndex];
    // Dynamic adaptive speed based on text presence or complexity
    const delay = (panel?.textElements?.length || 0) > 0 ? 6000 : 4500;

    this.autoScrollTimer = setTimeout(() => {
      if (this.isAutoScrolling) {
        if (this.currentPanelIndex < this.panels.length - 1) {
          this.nextPanel();
          this.scheduleNextAutoScroll();
        } else {
          this.toggleAutoScroll();
        }
      }
    }, delay);
  }

  // Display Japanese Onomatopoeia SFX and Typewriter Dialogue Overlay
  renderPanelSFX(panel) {
    const container = document.getElementById('sfx-container');
    container.innerHTML = '';

    if (panel.textElements) {
      panel.textElements.forEach(t => {
        if (t.type === 'sfx') {
          const sfxDiv = document.createElement('div');
          sfxDiv.className = 'sfx-text active';
          sfxDiv.textContent = t.text;
          sfxDiv.style.right = `${100 - (t.bounds.x * 100)}%`;
          sfxDiv.style.top = `${t.bounds.y * 100}%`;
          container.appendChild(sfxDiv);
          if (window.inkAudio) window.inkAudio.playImpactSFX();
        } else if (t.type === 'dialogue') {
          const dlg = document.createElement('div');
          dlg.className = 'dialogue-box active';
          dlg.textContent = t.text;
          dlg.style.left = `${t.bounds.x * 100}%`;
          dlg.style.top = `${t.bounds.y * 100}%`;
          container.appendChild(dlg);
        }
      });
    }
  }

  renderReadingPath(index) {
    // Red line disabled per user request
    const pathLine = document.getElementById('reading-path-line');
    if (pathLine) pathLine.setAttribute('d', '');
  }

  // Living Manga Ink Portal Engine - Crimson Energy Shards & Dynamic Focus Pulse
  startWeatherParticles() {
    const canvas = document.getElementById('weather-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    this.inkParticles = [];
    const count = 40;

    for (let i = 0; i < count; i++) {
      this.inkParticles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2.2 + 0.6,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -Math.random() * 1.2 - 0.4,
        alpha: Math.random() * 0.6 + 0.2
      });
    }

    const renderInkPortal = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Render floating crimson & sumi-e ink energy embers
      for (let p of this.inkParticles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.y < -10) {
          p.y = canvas.height + 10;
          p.x = Math.random() * canvas.width;
        }

        ctx.beginPath();
        ctx.fillStyle = `rgba(220, 38, 38, ${p.alpha})`;
        ctx.shadowColor = '#dc2626';
        ctx.shadowBlur = 8;
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      this.weatherAnimationId = requestAnimationFrame(renderInkPortal);
    };

    if (this.weatherAnimationId) cancelAnimationFrame(this.weatherAnimationId);
    renderInkPortal();
  }

  // Trigger Crimson Energy Shard Burst on Panel Advance
  triggerCloudParting() {
    const burst = document.getElementById('sumie-spotlight-ring');
    if (burst) {
      burst.classList.remove('pulse');
      void burst.offsetWidth;
      burst.classList.add('pulse');
      setTimeout(() => burst.classList.remove('pulse'), 650);
    }
  }

  triggerScreenShake() {
    // Disabled aggressive shake for comfortable viewing
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.camera && this.baseCameraPos) {
      // Steady camera base position
      this.camera.position.x = this.baseCameraPos.x;
      this.camera.position.y = this.baseCameraPos.y;

      // SBS "The Boat" Floating 3D Canvas Mouse Parallax & Tilt Effect
      const activeMesh = this.panels[this.currentPanelIndex] ? this.pageMeshes.get(this.panels[this.currentPanelIndex].pageIndex) : null;
      if (activeMesh) {
        activeMesh.rotation.y += (this.targetMousePos.x * 0.08 - activeMesh.rotation.y) * 0.05;
        activeMesh.rotation.x += (-this.targetMousePos.y * 0.08 - activeMesh.rotation.x) * 0.05;
      }

      this.renderer.render(this.scene, this.camera);
    }
  }

  onResize() {
    if (!this.renderer || !this.camera) return;
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.top = 1;
    this.camera.bottom = -1;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const wCanvas = document.getElementById('weather-canvas');
    if (wCanvas) {
      wCanvas.width = window.innerWidth;
      wCanvas.height = window.innerHeight;
    }
  }

  exitReader() {
    document.getElementById('view-reader').classList.remove('active');
    if (this.isAutoScrolling) this.toggleAutoScroll();
    if (window.inkAudio) window.inkAudio.stopAmbient();
    if (window.app) window.app.loadLibraryGrid();
  }
}

window.immersiveReader = new ImmersiveReader();
