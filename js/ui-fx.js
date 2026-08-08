// InkScroll UI FX Engine - Reusable Animations, Particles & Pointer Effects
class InkUIFX {
  constructor() {
    this.emberCanvas = null;
    this.emberCtx = null;
    this.emberParticles = [];
    this.emberAnimId = null;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  init() {
    // Listen for reduced motion preference changes
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.reducedMotion = e.matches;
      if (this.reducedMotion && this.emberAnimId) {
        cancelAnimationFrame(this.emberAnimId);
        this.emberAnimId = null;
      } else if (!this.reducedMotion && !this.emberAnimId) {
        this.startEmberCanvas();
      }
    });

    this.setupEmberCanvas();
    this.setupTiltCards();
    this.setupVignetteSweep();

    // Pause embers when tab is hidden or library is inactive
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.emberAnimId) {
        cancelAnimationFrame(this.emberAnimId);
        this.emberAnimId = null;
      } else if (!document.hidden && !this.reducedMotion && !this.emberAnimId) {
        const libView = document.getElementById('view-library');
        if (libView && libView.classList.contains('active')) {
          this.startEmberCanvas();
        }
      }
    });
  }

  setupEmberCanvas() {
    let canvas = document.getElementById('ember-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'ember-canvas';
      canvas.className = 'ember-canvas';
      const libView = document.getElementById('view-library');
      if (libView) libView.prepend(canvas);
    }
    this.emberCanvas = canvas;
    this.emberCtx = canvas.getContext('2d');
    this.resizeEmberCanvas();

    window.addEventListener('resize', () => this.resizeEmberCanvas());

    if (!this.reducedMotion) {
      this.initEmberParticles();
      this.startEmberCanvas();
    }
  }

  resizeEmberCanvas() {
    if (!this.emberCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.emberCanvas.width = window.innerWidth * dpr;
    this.emberCanvas.height = window.innerHeight * dpr;
    if (this.emberCtx) this.emberCtx.scale(dpr, dpr);
  }

  initEmberParticles() {
    this.emberParticles = [];
    const count = 50;
    for (let i = 0; i < count; i++) {
      this.emberParticles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        radius: Math.random() * 2.2 + 0.8,
        speedY: Math.random() * 0.6 + 0.3,
        swayAmplitude: Math.random() * 1.5 + 0.5,
        swayFrequency: Math.random() * 0.02 + 0.005,
        opacity: Math.random() * 0.5 + 0.2,
        color: i % 3 === 0 ? 'rgba(245, 158, 11,' : 'rgba(220, 38, 38,',
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  startEmberCanvas() {
    if (this.reducedMotion || !this.emberCtx) return;

    const render = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.emberCtx.clearRect(0, 0, w, h);

      for (let p of this.emberParticles) {
        p.y -= p.speedY;
        p.phase += p.swayFrequency;
        p.x += Math.sin(p.phase) * p.swayAmplitude * 0.5;

        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }

        const grad = this.emberCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2);
        grad.addColorStop(0, `${p.color} ${p.opacity})`);
        grad.addColorStop(1, `${p.color} 0)`);

        this.emberCtx.beginPath();
        this.emberCtx.fillStyle = grad;
        this.emberCtx.arc(p.x, p.y, p.radius * 2, 0, Math.PI * 2);
        this.emberCtx.fill();
      }

      this.emberAnimId = requestAnimationFrame(render);
    };

    if (this.emberAnimId) cancelAnimationFrame(this.emberAnimId);
    render();
  }

  setupTiltCards(selector = '.chapter-card') {
    if (this.reducedMotion) return;

    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest(selector);
      if (!card) return;

      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform =
        `perspective(1000px) rotateX(${(-py * 8).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg) scale3d(1.02,1.02,1.02)`;
    });

    document.addEventListener('pointerout', (e) => {
      const card = e.target.closest(selector);
      if (card && !card.contains(e.relatedTarget)) {
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1,1,1)';
      }
    });
  }

  setupVignetteSweep() {
    let wrapper = document.getElementById('reader-vignette-sweep');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'reader-vignette-sweep';
      wrapper.className = 'reader-vignette-sweep';
      const readerView = document.getElementById('view-reader');
      if (readerView) readerView.appendChild(wrapper);
    }
  }

  triggerDirectionalSweep() {
    if (this.reducedMotion) return;
    const sweep = document.getElementById('reader-vignette-sweep');
    if (!sweep) return;

    gsap.killTweensOf(sweep);
    gsap.fromTo(sweep, 
      { opacity: 0, x: '-100%' },
      { opacity: 0.45, x: '100%', duration: 0.4, ease: 'power2.out', onComplete: () => {
        gsap.set(sweep, { opacity: 0 });
      }}
    );
  }

  triggerCounterTick(element, text) {
    if (!element) return;
    element.textContent = text;
    if (this.reducedMotion) return;

    gsap.killTweensOf(element);
    gsap.fromTo(element,
      { scale: 1.15, y: -4 },
      { scale: 1, y: 0, duration: 0.25, ease: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
  }
}

window.inkUIFX = new InkUIFX();
document.addEventListener('DOMContentLoaded', () => window.inkUIFX.init());
