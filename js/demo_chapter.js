// InkScroll Pre-Packaged Demo Manga Chapter Engine ("The Blade of Ink")
class DemoChapterBuilder {

  // Create or load the pre-packaged sumi-e demo chapter
  async ensureDemoChapterLoaded() {
    const existing = await window.inkStorage.getChapterFull('demo_blade_of_ink');
    if (existing) return existing;

    // Procedurally render high-resolution sumi-e manga pages onto canvas
    const p1Url = this.generateSumiPage1();
    const p2Url = this.generateSumiPage2();
    const p3Url = this.generateSumiPage3();

    const chapter = {
      id: 'demo_blade_of_ink',
      title: 'The Blade of Ink — Ch. 1: Whispering Bamboo',
      sourceType: 'scraped',
      sourceUrl: 'demo://blade_of_ink',
      importedAt: new Date().toISOString(),
      progress: 0,
      metadata: {
        mood: 'action',
        tags: ['Samurai', 'Sumi-e', 'Action', 'Cinematic']
      }
    };

    const pages = [
      { id: 'dp_0', chapterId: chapter.id, index: 0, imageUrl: p1Url, width: 1200, height: 1600, isSpread: false },
      { id: 'dp_1', chapterId: chapter.id, index: 1, imageUrl: p2Url, width: 1200, height: 1600, isSpread: false },
      { id: 'dp_2', chapterId: chapter.id, index: 2, imageUrl: p3Url, width: 1800, height: 1200, isSpread: true }
    ];

    // Pre-calculated authentic Manga RTL/TTB panels with SFX text overlays & Full Page Reveal steps
    const panels = [
      // Page 1 Panels
      {
        id: 'dp_p1_1', chapterId: chapter.id, pageIndex: 0, readingOrder: 0,
        bounds: { x: 0.52, y: 0.05, w: 0.43, h: 0.42 }, type: 'panel', isFullPageReveal: false,
        effects: { atmosphere: 'rain', shake: false },
        textElements: [
          { type: 'sfx', text: 'ザザザ', bounds: { x: 0.75, y: 0.12 }, fontStyle: 'brush' },
          { type: 'dialogue', text: 'The bamboo leaves whisper of bloodshed tonight...', bounds: { x: 0.55, y: 0.32 }, fontStyle: 'serif' }
        ]
      },
      {
        id: 'dp_p1_2', chapterId: chapter.id, pageIndex: 0, readingOrder: 1,
        bounds: { x: 0.05, y: 0.05, w: 0.43, h: 0.42 }, type: 'panel', isFullPageReveal: false,
        effects: { atmosphere: 'rain', shake: false },
        textElements: [
          { type: 'sfx', text: 'ゴゴゴ', bounds: { x: 0.25, y: 0.12 }, fontStyle: 'brush' }
        ]
      },
      {
        id: 'dp_p1_3', chapterId: chapter.id, pageIndex: 0, readingOrder: 2,
        bounds: { x: 0.05, y: 0.52, w: 0.90, h: 0.43 }, type: 'spread', isFullPageReveal: false,
        effects: { atmosphere: 'rain', shake: true },
        textElements: [
          { type: 'sfx', text: 'ドドン', bounds: { x: 0.45, y: 0.60 }, fontStyle: 'brush' },
          { type: 'dialogue', text: 'Who goes there?! Show yourself!', bounds: { x: 0.15, y: 0.75 }, fontStyle: 'serif' }
        ]
      },
      {
        id: 'dp_p1_fullreveal', chapterId: chapter.id, pageIndex: 0, readingOrder: 3,
        bounds: { x: 0, y: 0, w: 1, h: 1 }, type: 'fullbleed', isFullPageReveal: true,
        effects: { atmosphere: 'rain', shake: false }
      },

      // Page 2 Panels
      {
        id: 'dp_p2_1', chapterId: chapter.id, pageIndex: 1, readingOrder: 4,
        bounds: { x: 0.50, y: 0.05, w: 0.45, h: 0.43 }, type: 'panel', isFullPageReveal: false,
        effects: { atmosphere: 'rain', shake: false },
        textElements: [
          { type: 'dialogue', text: 'My blade seeks no innocent souls...', bounds: { x: 0.55, y: 0.15 }, fontStyle: 'serif' }
        ]
      },
      {
        id: 'dp_p2_2', chapterId: chapter.id, pageIndex: 1, readingOrder: 5,
        bounds: { x: 0.05, y: 0.05, w: 0.42, h: 0.43 }, type: 'panel', isFullPageReveal: false,
        effects: { atmosphere: 'rain', shake: false },
        textElements: [
          { type: 'sfx', text: 'キィン', bounds: { x: 0.20, y: 0.20 }, fontStyle: 'brush' }
        ]
      },
      {
        id: 'dp_p2_3', chapterId: chapter.id, pageIndex: 1, readingOrder: 6,
        bounds: { x: 0.05, y: 0.52, w: 0.90, h: 0.43 }, type: 'spread', isFullPageReveal: false,
        effects: { atmosphere: 'rain', shake: true },
        textElements: [
          { type: 'sfx', text: 'ズバッ', bounds: { x: 0.50, y: 0.65 }, fontStyle: 'brush' },
          { type: 'dialogue', text: 'SUMI-E INK SLASH!', bounds: { x: 0.20, y: 0.78 }, fontStyle: 'serif' }
        ]
      },
      {
        id: 'dp_p2_fullreveal', chapterId: chapter.id, pageIndex: 1, readingOrder: 7,
        bounds: { x: 0, y: 0, w: 1, h: 1 }, type: 'fullbleed', isFullPageReveal: true,
        effects: { atmosphere: 'rain', shake: false }
      },

      // Page 3 Panel (Double-Page Spread)
      {
        id: 'dp_p3_1', chapterId: chapter.id, pageIndex: 2, readingOrder: 8,
        bounds: { x: 0.02, y: 0.02, w: 0.96, h: 0.96 }, type: 'fullbleed', isFullPageReveal: false,
        effects: { atmosphere: 'dramatic', shake: true },
        textElements: [
          { type: 'sfx', text: '勝 負 決 着', bounds: { x: 0.82, y: 0.15 }, fontStyle: 'brush' },
          { type: 'dialogue', text: 'Silence returns to the bamboo grove...', bounds: { x: 0.35, y: 0.82 }, fontStyle: 'serif' }
        ]
      },
      {
        id: 'dp_p3_fullreveal', chapterId: chapter.id, pageIndex: 2, readingOrder: 9,
        bounds: { x: 0, y: 0, w: 1, h: 1 }, type: 'fullbleed', isFullPageReveal: true,
        effects: { atmosphere: 'dramatic', shake: false }
      }
    ];

    const demoFull = { chapter, pages, panels };
    await window.inkStorage.saveChapter(demoFull);
    return demoFull;
  }

  // Draw Page 1: Samurai under bamboo rain
  generateSumiPage1() {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');

    // Background rice paper sumi-e tone
    ctx.fillStyle = '#0f0f14';
    ctx.fillRect(0, 0, 1200, 1600);

    // Draw Panel Borders (RTL arrangement)
    this.drawPanelBorder(ctx, 620, 80, 520, 680, "PANEL 1");
    this.drawPanelBorder(ctx, 60, 80, 520, 680, "PANEL 2");
    this.drawPanelBorder(ctx, 60, 820, 1080, 700, "PANEL 3 - SPREAD");

    // Sumi-e Brush Bamboo Silhouettes in Panel 1
    ctx.fillStyle = '#22222e';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(660 + i * 80, 120, 14, 600);
    }

    // Moon in Panel 2
    ctx.fillStyle = '#e2e2e8';
    ctx.beginPath();
    ctx.arc(320, 300, 70, 0, Math.PI * 2);
    ctx.fill();

    // Samurai Silhouette in Panel 3
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(600, 1100, 40, 0, Math.PI * 2); // Red eyes / headband
    ctx.fill();

    ctx.fillStyle = '#14141c';
    ctx.fillRect(520, 1140, 160, 280); // Ronin body

    return canvas.toDataURL('image/jpeg', 0.9);
  }

  // Draw Page 2: Sword Drawing Close-up
  generateSumiPage2() {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(0, 0, 1200, 1600);

    this.drawPanelBorder(ctx, 600, 80, 540, 680, "PANEL 4");
    this.drawPanelBorder(ctx, 60, 80, 500, 680, "PANEL 5");
    this.drawPanelBorder(ctx, 60, 820, 1080, 700, "PANEL 6 - SLASH");

    // Diagonal Katana Blade Stroke in Panel 6
    ctx.strokeStyle = '#f3f3f6';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(120, 1400);
    ctx.lineTo(1080, 900);
    ctx.stroke();

    // Crimson Ink Splatter
    ctx.fillStyle = '#dc2626';
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.arc(400 + Math.random() * 400, 950 + Math.random() * 300, Math.random() * 12 + 2, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas.toDataURL('image/jpeg', 0.9);
  }

  // Draw Page 3: Full Bleed Double Spread
  generateSumiPage3() {
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#08080c';
    ctx.fillRect(0, 0, 1800, 1200);

    this.drawPanelBorder(ctx, 30, 30, 1740, 1140, "DOUBLE PAGE SPREAD");

    // Full moon
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(900, 450, 180, 0, Math.PI * 2);
    ctx.fill();

    // Sumi mountain silhouettes
    ctx.fillStyle = '#161622';
    ctx.beginPath();
    ctx.moveTo(0, 1200);
    ctx.lineTo(400, 600);
    ctx.lineTo(900, 800);
    ctx.lineTo(1400, 550);
    ctx.lineTo(1800, 1200);
    ctx.closePath();
    ctx.fill();

    return canvas.toDataURL('image/jpeg', 0.9);
  }

  drawPanelBorder(ctx, x, y, w, h, label) {
    ctx.strokeStyle = '#2d2d38';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = '#606070';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(label, x + 20, y + 40);
  }
}

window.demoChapterBuilder = new DemoChapterBuilder();
