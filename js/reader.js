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

    // Touch Swipes
    this.canvas.addEventListener('touchstart', (e) => {
      this.touchStartX = e.touches[0].clientX;
    });
    this.canvas.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const diffX = touchEndX - this.touchStartX;
      if (Math.abs(diffX) > 50) {
        if (diffX < 0) this.nextPanel(); // Swipe Left -> Next (RTL)
        else this.prevPanel(); // Swipe Right -> Prev
      }
    });

    // Click Navigation (Click Right -> Next RTL, Click Left -> Prev)
    this.canvas.addEventListener('click', (e) => {
      if (e.target.closest('.reader-hud-top') || e.target.closest('.btn-ink')) return;
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
    this.currentPanelIndex = index;

    const panel = this.panels[index];
    const page = this.pages.find(p => p.index === panel.pageIndex);
    const mesh = this.pageMeshes.get(panel.pageIndex);

    // Hide neighboring pages so zero adjacent page artwork peeks out in margins!
    for (let [pIndex, m] of this.pageMeshes.entries()) {
      m.visible = (pIndex === panel.pageIndex);
    }

    // Calculate target camera position and precise orthographic zoom bounds
    const pageAspect = page.width / page.height;
    const meshW = 2 * pageAspect;
    const meshH = 2;
    const screenAspect = window.innerWidth / window.innerHeight;

    // Panel center bounds mapped to world coordinates
    const targetX = mesh.position.x - meshW / 2 + (panel.bounds.x + panel.bounds.w / 2) * meshW;
    const targetY = mesh.position.y + meshH / 2 - (panel.bounds.y + panel.bounds.h / 2) * meshH;

    // Smart margin padding (95% fill for large panels, 85% for normal panels)
    const isLargePanel = (panel.bounds.w > 0.65 || panel.bounds.h > 0.65);
    const padding = isLargePanel ? 0.95 : 0.85;
    const fitH = (1 / Math.max(0.08, panel.bounds.h)) * padding;
    const fitW = (screenAspect / (Math.max(0.08, panel.bounds.w) * pageAspect)) * padding;

    // Cap max zoom so panels never over-zoom or cut off text bubbles
    const targetZoom = Math.min(fitH, fitW, isLargePanel ? 1.40 : 1.65);

    // Play subtle transition sound
    if (window.inkAudio) window.inkAudio.playPanelTransition();

    // Animate base camera position smoothly (No dizzy rotation or infinite drift)
    if (!this.baseCameraPos) this.baseCameraPos = { x: targetX, y: targetY };

    gsap.to(this.baseCameraPos, {
      x: targetX,
      y: targetY,
      duration: duration,
      ease: "power2.out"
    });

    gsap.to(this.camera, {
      zoom: targetZoom,
      duration: duration,
      ease: "power2.out",
      onUpdate: () => this.camera.updateProjectionMatrix()
    });

    // Update Progress UI
    const progress = Math.round(((index + 1) / this.panels.length) * 100);
    document.getElementById('reader-progress-fill').style.width = `${progress}%`;
    if (window.inkStorage) {
      window.inkStorage.updateProgress(this.chapter.id, progress, panel.id);
    }

    // Render SFX and reading direction path
    this.renderPanelSFX(panel);
    this.renderReadingPath(index);
  }

  nextPanel() {
    if (this.currentPanelIndex < this.panels.length - 1) {
      this.navigateToPanel(this.currentPanelIndex + 1);
    } else {
      // Chapter finished -> Exit reader
      this.exitReader();
    }
  }

  prevPanel() {
    if (this.currentPanelIndex > 0) {
      this.navigateToPanel(this.currentPanelIndex - 1);
    }
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

  // Atmospheric Weather Particles Canvas Generator (Rain, Snow, Mist)
  startWeatherParticles(type = 'rain') {
    const canvas = document.getElementById('weather-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const count = type === 'rain' ? 100 : 50;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        len: Math.random() * 18 + 8,
        speed: Math.random() * 8 + 10,
        opacity: Math.random() * 0.3 + 0.1
      });
    }

    const renderParticles = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.0;

      for (let p of particles) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 1, p.y + p.len);
        ctx.stroke();

        p.y += p.speed;
        p.x -= 0.5;

        if (p.y > canvas.height) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      }

      this.weatherAnimationId = requestAnimationFrame(renderParticles);
    };

    if (this.weatherAnimationId) cancelAnimationFrame(this.weatherAnimationId);
    renderParticles();
  }

  triggerScreenShake() {
    // Disabled aggressive shake for comfortable viewing
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.camera && this.baseCameraPos) {
      // Rock-solid steady camera position centered on current panel (Zero drift or dizziness)
      this.camera.position.x = this.baseCameraPos.x;
      this.camera.position.y = this.baseCameraPos.y;
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
