// InkScroll Manga Panel & Zone Segmentation Engine
// Implements 6-Panel Reading Sequence (1 -> 2 -> 3 -> 4 -> 5 -> 6) & Full-Page Zoom-Out Reveal
class MangaPanelDetector {

  // Auto-detect panels & reading zones for an array of page images
  async detectChapterPanels(pages) {
    let allPanels = [];
    let globalOrder = 0;

    for (let page of pages) {
      const pagePanels = await this.detectPagePanels(page);
      for (let panel of pagePanels) {
        panel.readingOrder = globalOrder++;
        allPanels.push(panel);
      }
    }

    return allPanels;
  }

  // Detect panel bounding boxes & build zone sequence for a single manga page
  async detectPagePanels(page) {
    try {
      const { canvas, ctx, w, h } = await this.getUntaintedCanvas(page.imageUrl);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      const detectedBoxes = this.detectProjectionBoxes(data, w, h);
      let pagePanels = [];

      if (detectedBoxes.length >= 2) {
        // Sort detected panels in strict Manga Reading Order (Right to Left per row, Top to Bottom)
        const sorted = this.sortMangaReadingOrder(detectedBoxes);
        pagePanels = sorted.map((b, idx) => ({
          id: `p_${page.index}_panel_${idx}_${Date.now()}`,
          chapterId: page.chapterId || '',
          pageIndex: page.index,
          bounds: {
            x: Math.max(0, Math.min(1, b.x)),
            y: Math.max(0, Math.min(1, b.y)),
            w: Math.max(0.05, Math.min(1, b.w)),
            h: Math.max(0.05, Math.min(1, b.h))
          },
          isFullPageReveal: false,
          type: 'panel'
        }));
      } else {
        // Authentic 6-Panel Reading Grid (1 top-right, 2 top-left, 3 mid-right, 4 mid-left, 5 bot-right, 6 bot-left)
        pagePanels = this.generate6PanelReadingGrid(page);
      }

      // Append the Full-Page Zoom-Out Reveal step at the end of this page
      pagePanels.push({
        id: `p_${page.index}_fullreveal_${Date.now()}`,
        chapterId: page.chapterId || '',
        pageIndex: page.index,
        bounds: { x: 0, y: 0, w: 1, h: 1 },
        isFullPageReveal: true,
        type: 'fullbleed'
      });

      return pagePanels;

    } catch (err) {
      console.warn(`Panel generation fallback for page ${page.index}:`, err);
      const fallback = this.generate6PanelReadingGrid(page);
      fallback.push({
        id: `p_${page.index}_fullreveal_${Date.now()}`,
        chapterId: page.chapterId || '',
        pageIndex: page.index,
        bounds: { x: 0, y: 0, w: 1, h: 1 },
        isFullPageReveal: true,
        type: 'fullbleed'
      });
      return fallback;
    }
  }

  // Projection profiling to discover distinct panels
  detectProjectionBoxes(data, w, h) {
    const rowBrightness = new Float32Array(h);
    let maxRow = 0, minRow = 255;

    for (let y = 0; y < h; y++) {
      let sumLum = 0;
      const rowOffset = y * w * 4;
      for (let x = 0; x < w; x++) {
        const idx = rowOffset + x * 4;
        sumLum += (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
      }
      const avg = sumLum / w;
      rowBrightness[y] = avg;
      if (avg > maxRow) maxRow = avg;
      if (avg < minRow) minRow = avg;
    }

    const isWhiteBg = maxRow > 200;
    const rowGutterThresh = isWhiteBg
      ? Math.max(185, maxRow - (maxRow - minRow) * 0.18)
      : Math.min(70, minRow + (maxRow - minRow) * 0.18);

    const panelYRanges = [];
    let inPanelRow = false;
    let startY = 0;

    for (let y = 0; y < h; y++) {
      const isRowGutter = isWhiteBg ? (rowBrightness[y] >= rowGutterThresh) : (rowBrightness[y] <= rowGutterThresh);
      if (!inPanelRow && !isRowGutter) {
        inPanelRow = true;
        startY = y;
      } else if (inPanelRow && isRowGutter) {
        if (y - startY > h * 0.05) {
          panelYRanges.push([startY, y]);
        }
        inPanelRow = false;
      }
    }

    if (inPanelRow && h - startY > h * 0.05) {
      panelYRanges.push([startY, h]);
    }

    const rawBoxes = [];
    for (let [ys, ye] of panelYRanges) {
      const bandH = ye - ys;
      const colBrightness = new Float32Array(w);
      let maxCol = 0, minCol = 255;

      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let y = ys; y < ye; y++) {
          const idx = (y * w + x) * 4;
          sum += (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
        }
        const avg = sum / bandH;
        colBrightness[x] = avg;
        if (avg > maxCol) maxCol = avg;
        if (avg < minCol) minCol = avg;
      }

      const colGutterThresh = isWhiteBg
        ? Math.max(185, maxCol - (maxCol - minCol) * 0.18)
        : Math.min(70, minCol + (maxCol - minCol) * 0.18);

      let inColPanel = false;
      let startX = 0;

      for (let x = 0; x < w; x++) {
        const isColGutter = isWhiteBg ? (colBrightness[x] >= colGutterThresh) : (colBrightness[x] <= colGutterThresh);
        if (!inColPanel && !isColGutter) {
          inColPanel = true;
          startX = x;
        } else if (inColPanel && isColGutter) {
          if (x - startX > w * 0.06) {
            rawBoxes.push({
              x: Math.max(0, startX / w),
              y: Math.max(0, ys / h),
              w: Math.min(1, (x - startX) / w),
              h: Math.min(1, bandH / h)
            });
          }
          inColPanel = false;
        }
      }

      if (inColPanel && w - startX > w * 0.06) {
        rawBoxes.push({
          x: Math.max(0, startX / w),
          y: Math.max(0, ys / h),
          w: Math.min(1, (w - startX) / w),
          h: Math.min(1, bandH / h)
        });
      }
    }

    return rawBoxes;
  }

  // Authentic 6-Panel Manga Layout Grid (1 top-right, 2 top-left, 3 mid-right, 4 mid-left, 5 bot-right, 6 bot-left)
  generate6PanelReadingGrid(page) {
    const panels = [
      { bounds: { x: 0.50, y: 0.00, w: 0.50, h: 0.33 } }, // 1: Top-Right
      { bounds: { x: 0.00, y: 0.00, w: 0.50, h: 0.33 } }, // 2: Top-Left
      { bounds: { x: 0.50, y: 0.33, w: 0.50, h: 0.33 } }, // 3: Mid-Right
      { bounds: { x: 0.00, y: 0.33, w: 0.50, h: 0.33 } }, // 4: Mid-Left
      { bounds: { x: 0.50, y: 0.66, w: 0.50, h: 0.34 } }, // 5: Bot-Right
      { bounds: { x: 0.00, y: 0.66, w: 0.50, h: 0.34 } }  // 6: Bot-Left
    ];

    return panels.map((z, idx) => ({
      id: `p_${page.index}_p${idx + 1}_${Date.now()}`,
      chapterId: page.chapterId || '',
      pageIndex: page.index,
      bounds: z.bounds,
      isFullPageReveal: false,
      type: 'panel'
    }));
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

    const bandThreshold = 0.12;
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

    const finalOrderedPanels = [];
    for (let row of rows) {
      // Sort panels right-to-left within each row (highest X center to lowest X center)
      row.sort((a, b) => (b.bounds.x + b.bounds.w / 2) - (a.bounds.x + a.bounds.w / 2));
      finalOrderedPanels.push(...row);
    }

    return finalOrderedPanels;
  }
}

window.mangaDetector = new MangaPanelDetector();
