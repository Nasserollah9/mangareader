// InkScroll UI FX Engine — Cinematic Sumi-e Edition
class InkUIFX {
  constructor() {
    this.inkCanvas = null;
    this.inkCtx = null;
    this.inkParticles = [];
    this.inkRipples = [];
    this.inkAnimId = null;

    this.emberCanvas = null;
    this.emberCtx = null;
    this.emberParticles = [];
    this.emberAnimId = null;

    this.mouseX = -1000;
    this.mouseY = -1000;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  init() {
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.reducedMotion = e.matches;
      if (this.reducedMotion) {
        this.stopCanvases();
      } else {
        this.startCanvases();
      }
    });

    this.setupCanvases();
    this.setupPointerTracking();
    this.setupCardTilt();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopCanvases();
      } else if (!this.reducedMotion && this.isLibraryActive()) {
        this.startCanvases();
      }
    });
  }

  isLibraryActive() {
    const libView = document.getElementById('view-library');
    return libView && libView.classList.contains('active') && !libView.classList.contains('hidden');
  }

  setupCanvases() {
    this.inkCanvas = document.getElementById('hero-ink-canvas');
    this.emberCanvas = document.getElementById('hero-ember-canvas');

    if (this.inkCanvas) this.inkCtx = this.inkCanvas.getContext('2d');
    if (this.emberCanvas) this.emberCtx = this.emberCanvas.getContext('2d');

    this.resizeCanvases();
    window.addEventListener('resize', () => this.resizeCanvases());

    if (!this.reducedMotion) {
      this.initInkParticles();
      this.initEmberParticles();
      this.startCanvases();
    }
  }

  resizeCanvases() {
    const heroBanner = document.querySelector('.hero-banner');
    if (!heroBanner) return;
    const r = heroBanner.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    if (this.inkCanvas) {
      this.inkCanvas.width = r.width * dpr;
      this.inkCanvas.height = r.height * dpr;
      if (this.inkCtx) this.inkCtx.scale(dpr, dpr);
    }

    if (this.emberCanvas) {
      this.emberCanvas.width = r.width * dpr;
      this.emberCanvas.height = r.height * dpr;
      if (this.emberCtx) this.emberCtx.scale(dpr, dpr);
    }
  }

  // 1. Living Ink Hero Canvas (Procedural Dark Ink Blobs & Ripples)
  initInkParticles() {
    this.inkParticles = [];
    const count = 24; // Max 30
    const heroBanner = document.querySelector('.hero-banner');
    const w = heroBanner ? heroBanner.clientWidth : 800;
    const h = heroBanner ? heroBanner.clientHeight : 400;

    const colors = ['rgba(10, 10, 15,', 'rgba(26, 26, 46,', 'rgba(22, 33, 62,'];

    for (let i = 0; i < count; i++) {
      this.inkParticles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        radius: Math.random() * 110 + 60,
        vx: Math.random() * 0.3 + 0.1, // Drifts right
        vy: -Math.random() * 0.4 - 0.1, // Drifts upward
        opacity: Math.random() * 0.12 + 0.03,
        color: colors[i % colors.length]
      });
    }
  }

  startInkCanvas() {
    if (this.reducedMotion || !this.inkCtx || !this.inkCanvas) return;
    const heroBanner = document.querySelector('.hero-banner');

    const renderInk = () => {
      if (!this.isLibraryActive()) return;
      const w = heroBanner ? heroBanner.clientWidth : this.inkCanvas.width;
      const h = heroBanner ? heroBanner.clientHeight : this.inkCanvas.height;

      this.inkCtx.clearRect(0, 0, w, h);

      // Randomly spawn occasional ink drop ripple
      if (Math.random() < 0.015 && this.inkRipples.length < 5) {
        this.inkRipples.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: 4,
          maxRadius: Math.random() * 80 + 40,
          opacity: 0.25
        });
      }

      // Render expanding ink drop ripples
      for (let i = this.inkRipples.length - 1; i >= 0; i--) {
        const r = this.inkRipples[i];
        r.radius += 0.8;
        r.opacity -= 0.003;

        this.inkCtx.beginPath();
        this.inkCtx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        this.inkCtx.fillStyle = `rgba(10, 10, 15, ${Math.max(0, r.opacity)})`;
        this.inkCtx.fill();

        if (r.opacity <= 0 || r.radius >= r.maxRadius) {
          this.inkRipples.splice(i, 1);
        }
      }

      // Render procedural ink wash particles
      for (let p of this.inkParticles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x > w + p.radius) p.x = -p.radius;
        if (p.y < -p.radius) p.y = h + p.radius;

        const grad = this.inkCtx.createRadialGradient(p.x, p.y, p.radius * 0.1, p.x, p.y, p.radius);
        grad.addColorStop(0, `${p.color} ${p.opacity})`);
        grad.addColorStop(0.7, `${p.color} ${p.opacity * 0.4})`);
        grad.addColorStop(1, `${p.color} 0)`);

        this.inkCtx.beginPath();
        this.inkCtx.fillStyle = grad;
        this.inkCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        this.inkCtx.fill();
      }

      this.inkAnimId = requestAnimationFrame(renderInk);
    };

    if (this.inkAnimId) cancelAnimationFrame(this.inkAnimId);
    renderInk();
  }

  // 2. Floating Ember Particles (Gold & White with Cursor Push)
  initEmberParticles() {
    this.emberParticles = [];
    const count = 22; // 15-25
    const heroBanner = document.querySelector('.hero-banner');
    const w = heroBanner ? heroBanner.clientWidth : 800;
    const h = heroBanner ? heroBanner.clientHeight : 400;

    for (let i = 0; i < count; i++) {
      const isGold = Math.random() < 0.65;
      this.emberParticles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        radius: Math.random() * 2 + 2, // 2-4px
        speedY: Math.random() * 0.5 + 0.3,
        phase: Math.random() * Math.PI * 2,
        swaySpeed: Math.random() * 0.02 + 0.008,
        color: isGold ? 'rgba(245, 158, 11, 0.6)' : 'rgba(255, 255, 255, 0.3)',
        alpha: Math.random() * 0.5 + 0.3
      });
    }
  }

  startEmberCanvas() {
    if (this.reducedMotion || !this.emberCtx || !this.emberCanvas) return;
    const heroBanner = document.querySelector('.hero-banner');

    const renderEmbers = () => {
      if (!this.isLibraryActive()) return;
      const w = heroBanner ? heroBanner.clientWidth : this.emberCanvas.width;
      const h = heroBanner ? heroBanner.clientHeight : this.emberCanvas.height;

      this.emberCtx.clearRect(0, 0, w, h);

      for (let p of this.emberParticles) {
        p.y -= p.speedY;
        p.phase += p.swaySpeed;
        p.x += Math.sin(p.phase) * 0.5;

        // Cursor repulsion within 100px radius
        if (this.mouseX >= 0 && this.mouseY >= 0) {
          const dx = p.x - this.mouseX;
          const dy = p.y - this.mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100 && dist > 0) {
            const force = (100 - dist) / 100;
            p.x += (dx / dist) * force * 3;
            p.y += (dy / dist) * force * 3;
          }
        }

        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }

        this.emberCtx.beginPath();
        this.emberCtx.fillStyle = p.color;
        this.emberCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        this.emberCtx.fill();
      }

      this.emberAnimId = requestAnimationFrame(renderEmbers);
    };

    if (this.emberAnimId) cancelAnimationFrame(this.emberAnimId);
    renderEmbers();
  }

  startCanvases() {
    this.startInkCanvas();
    this.startEmberCanvas();
  }

  stopCanvases() {
    if (this.inkAnimId) {
      cancelAnimationFrame(this.inkAnimId);
      this.inkAnimId = null;
    }
    if (this.emberAnimId) {
      cancelAnimationFrame(this.emberAnimId);
      this.emberAnimId = null;
    }
  }

  setupPointerTracking() {
    const heroBanner = document.querySelector('.hero-banner');
    if (!heroBanner) return;

    heroBanner.addEventListener('pointermove', (e) => {
      const r = heroBanner.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });

    heroBanner.addEventListener('pointerleave', () => {
      this.mouseX = -1000;
      this.mouseY = -1000;
    });
  }

  // 4. 3D Card Pointer Tilt
  setupCardTilt() {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest('.chapter-card');
      if (!card || this.reducedMotion) return;

      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;

      const inner = card.querySelector('.chapter-card-inner');
      if (inner) {
        inner.style.transform = `perspective(1000px) rotateX(${(-py * 8).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg) translateZ(12px)`;
      }
    });

    document.addEventListener('pointerout', (e) => {
      const card = e.target.closest('.chapter-card');
      if (card && !card.contains(e.relatedTarget)) {
        const inner = card.querySelector('.chapter-card-inner');
        if (inner) {
          inner.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateZ(0)';
        }
      }
    });
  }

  // GSAP Stagger Entrance for Cards
  animateCardGrid() {
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf('.chapter-card');
      gsap.from('.chapter-card', {
        y: 40,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'power3.out'
      });
    }
  }

  // 11. GSAP View Transitions
  transitionToReader(onComplete) {
    if (typeof gsap !== 'undefined') {
      gsap.to('#view-library', {
        opacity: 0,
        y: -30,
        duration: 0.4,
        ease: 'power2.in',
        onComplete: () => {
          document.getElementById('view-library').classList.add('hidden');
          document.getElementById('view-library').classList.remove('active');
          
          const readerView = document.getElementById('view-reader');
          if (readerView) {
            readerView.classList.remove('hidden');
            readerView.classList.add('active');
            readerView.style.display = 'flex';
          }

          gsap.fromTo('#view-reader',
            { opacity: 0, y: 30 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', onComplete }
          );
        }
      });
    } else {
      const lib = document.getElementById('view-library');
      const rdr = document.getElementById('view-reader');
      if (lib) { lib.classList.add('hidden'); lib.style.display = 'none'; }
      if (rdr) { rdr.classList.remove('hidden'); rdr.classList.add('active'); rdr.style.display = 'flex'; rdr.style.opacity = '1'; }
      if (onComplete) onComplete();
    }
  }

  transitionToLibrary(onComplete) {
    if (typeof gsap !== 'undefined') {
      gsap.to('#view-reader', {
        opacity: 0,
        y: 30,
        duration: 0.4,
        ease: 'power2.in',
        onComplete: () => {
          document.getElementById('view-reader').classList.add('hidden');
          document.getElementById('view-reader').classList.remove('active');

          const libView = document.getElementById('view-library');
          libView.classList.remove('hidden');
          libView.classList.add('active');

          gsap.fromTo('#view-library',
            { opacity: 0, y: -30 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', onComplete: () => {
              this.startCanvases();
              if (onComplete) onComplete();
            }}
          );
        }
      });
    } else {
      document.getElementById('view-reader').classList.add('hidden');
      document.getElementById('view-library').classList.remove('hidden');
      this.startCanvases();
      if (onComplete) onComplete();
    }
  }

  triggerDirectionalSweep() {
    const sweep = document.createElement('div');
    sweep.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 12;
      background: linear-gradient(110deg, transparent 35%, rgba(220, 38, 38, 0.15) 50%, transparent 65%);
      opacity: 0;
    `;
    const container = document.getElementById('view-reader') || document.body;
    container.appendChild(sweep);

    if (typeof gsap !== 'undefined') {
      gsap.fromTo(sweep,
        { opacity: 0.8, xPercent: 100 },
        {
          xPercent: -100,
          opacity: 0,
          duration: 0.5,
          ease: 'power2.out',
          onComplete: () => {
            if (sweep.parentNode) sweep.parentNode.removeChild(sweep);
          }
        }
      );
    } else {
      setTimeout(() => {
        if (sweep.parentNode) sweep.parentNode.removeChild(sweep);
      }, 350);
    }
  }
}

window.inkUIFX = new InkUIFX();
document.addEventListener('DOMContentLoaded', () => window.inkUIFX.init());
