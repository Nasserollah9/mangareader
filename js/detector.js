// InkScroll Manga Panel Segmentation Engine - Projection Profiling & Manga RTL Order
class MangaPanelDetector {

  // Auto-detect panels for an array of page images
  async detectChapterPanels(pages) {
    let allPanels = [];
    let globalOrder = 0;

    for (let page of pages) {
      const pagePanels = await this.detectPagePanels(page);
      
      // Sort panels according to authentic Manga Reading Order (TTB, RTL)
      const sortedPagePanels = this.sortMangaReadingOrder(pagePanels);

      for (let panel of sortedPagePanels) {
        panel.readingOrder = globalOrder++;
        allPanels.push(panel);
      }
    }

    return allPanels;
  }

  // Detect panel bounding boxes on a single manga page using Projection Profiling
  async detectPagePanels(page) {
    try {
      const { canvas, ctx, w, h } = await this.getUntaintedCanvas(page.imageUrl);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // Calculate row average brightness (Horizontal Projection Profile)
      const rowBrightness = new Float32Array(h);
      for (let y = 0; y < h; y++) {
        let sum = 0;
        const rowOffset = y * w * 4;
        for (let x = 0; x < w; x++) {
          const idx = rowOffset + x * 4;
          sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        }
        rowBrightness[y] = sum / w;
      }

      // White gutter threshold for panel row separation
      const whiteThreshold = 220;

      // Identify Horizontal Panel Rows / Bands
      const panelYRanges = [];
      let inPanelRow = false;
      let startY = 0;

      for (let y = 0; y < h; y++) {
        const isWhiteRow = rowBrightness[y] >= whiteThreshold;
        if (!inPanelRow && !isWhiteRow) {
          inPanelRow = true;
          startY = y;
        } else if (inPanelRow && isWhiteRow) {
          if (y - startY > h * 0.07) { // Panel height threshold
            panelYRanges.append ? panelYRanges.append([startY, y]) : panelYRanges.push([startY, y]);
          }
          inPanelRow = false;
        }
      }

      if (inPanelRow && h - startY > h * 0.07) {
        panelYRanges.push([startY, h]);
      }

      const detectedBoxes = [];

      // For each horizontal row band, calculate Vertical Projection Profile
      for (let [ys, ye] of panelYRanges) {
        const bandH = ye - ys;
        const colBrightness = new Float32Array(w);

        for (let x = 0; x < w; x++) {
          let sum = 0;
          for (let y = ys; y < ye; y++) {
            const idx = (y * w + x) * 4;
            sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          }
          colBrightness[x] = sum / bandH;
        }

        let inColPanel = false;
        let startX = 0;

        for (let x = 0; x < w; x++) {
          const isWhiteCol = colBrightness[x] >= whiteThreshold;
          if (!inColPanel && !isWhiteCol) {
            inColPanel = true;
            startX = x;
          } else if (inColPanel && isWhiteCol) {
            if (x - startX > w * 0.10) {
              detectedBoxes.push({
                x: Math.max(0, (startX - 4) / w),
                y: Math.max(0, (ys - 4) / h),
                w: Math.min(1, (x - startX + 8) / w),
                h: Math.min(1, (bandH + 8) / h)
              });
            }
            inColPanel = false;
          }
        }

        if (inColPanel && w - startX > w * 0.10) {
          detectedBoxes.push({
            x: Math.max(0, (startX - 4) / w),
            y: Math.max(0, (ys - 4) / h),
            w: Math.min(1, (w - startX + 8) / w),
            h: Math.min(1, (bandH + 8) / h)
          });
        }
      }

      // Fallback: If projection profile found 0 panels or a full-spread page
      if (detectedBoxes.length === 0) {
        detectedBoxes.push({ x: 0, y: 0, w: 1, h: 1 });
      }

      return detectedBoxes.map((b, idx) => ({
        id: `p_${page.index}_${idx}_${Date.now()}`,
        chapterId: page.chapterId || '',
        pageIndex: page.index,
        bounds: b,
        type: (b.w > 0.85 && b.h > 0.85) ? 'fullbleed' : (b.w > 0.70 ? 'spread' : 'panel'),
        effects: {
          atmosphere: 'rain',
          shake: false,
          zoomLevel: 1.3
        }
      }));

    } catch (err) {
      console.warn(`Panel detection fallback for page ${page.index}:`, err);
      return [{
        id: `p_${page.index}_0_${Date.now()}`,
        chapterId: page.chapterId || '',
        pageIndex: page.index,
        bounds: { x: 0, y: 0, w: 1, h: 1 },
        type: 'fullbleed',
        effects: { atmosphere: 'none', shake: false, zoomLevel: 1.0 }
      }];
    }
  }

  // Fetch image via Blob to prevent CORS canvas tainting
  async getUntaintedCanvas(imageUrl) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (imageUrl.startsWith('data:')) {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = imageUrl;
      });
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      return { canvas, ctx, w: img.width, h: img.height };
    }

    const res = await fetch(imageUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.drawImage(bitmap, 0, 0);
    return { canvas, ctx, w: bitmap.width, h: bitmap.height };
  }

  // Authentic Manga Reading Order Algorithm (TTB Y-bands, RTL X-sorting within bands)
  sortMangaReadingOrder(panels) {
    if (panels.length <= 1) return panels;

    // Step 1: Group panels into Y-rows / bands
    const bandThreshold = 0.12; // Vertical overlap threshold
    const sortedByY = [...panels].sort((a, b) => a.bounds.y - b.bounds.y);
    
    const rows = [];
    for (let panel of sortedByY) {
      let addedToRow = false;
      for (let row of rows) {
        const rowAvgY = row.reduce((sum, p) => sum + p.bounds.y, 0) / row.length;
        if (Math.abs(panel.bounds.y - rowAvgY) < bandThreshold) {
          row.push(panel);
          addedToRow = true;
          break;
        }
      }
      if (!addedToRow) {
        rows.push([panel]);
      }
    }

    // Step 2: Sort each Y-row from Right to Left (Manga RTL convention: highest X to lowest X)
    const finalOrderedPanels = [];
    for (let row of rows) {
      row.sort((a, b) => (b.bounds.x + b.bounds.w) - (a.bounds.x + a.bounds.w));
      finalOrderedPanels.push(...row);
    }

    return finalOrderedPanels;
  }
}

window.mangaDetector = new MangaPanelDetector();
