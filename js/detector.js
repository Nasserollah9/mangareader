// InkScroll Guided Reading Engine
// 12-Zone Right-to-Left / Top-to-Bottom reading grid matching user diagram:
//
//  Page:  ┌────┬────┬────┬────┐
//   Row1  │ 4  │ 3  │ 2  │ 1  │  <- right to left
//   Row2  │ 8  │ 7  │ 6  │ 5  │
//   Row3  │ 12 │ 11 │ 10 │ 9  │
//         └────┴────┴────┴────┘
//  Zones overlap to ensure 100% page coverage with no gaps.
//  No circles drawn — purely camera logic.
//  Sequence: 1→2→3→4→5→6→7→8→9→10→11→12→FullPageReveal → next page zone 1

class MangaPanelDetector {

  // Build ordered reading zones for all pages in a chapter
  async detectChapterPanels(pages) {
    let allZones = [];
    let globalOrder = 0;

    for (let page of pages) {
      const pageZones = this.generatePageReadingZones(page);
      for (let zone of pageZones) {
        zone.readingOrder = globalOrder++;
        allZones.push(zone);
      }
    }

    return allZones;
  }

  // Generate 12 overlapping reading zones for a single page + final Full Page Reveal
  generatePageReadingZones(page) {
    const zones = [];

    // Each zone is a viewport region large enough to fill the screen
    // so you can see ONLY that zone — not the rest of the page.
    // Zones overlap ~25% with neighbours for coverage continuity.
    //
    // Grid: 4 columns (x), 3 rows (y), reading RIGHT → LEFT per row, TOP → BOTTOM
    //
    // Column positions (right to left): col0=right, col1=mid-right, col2=mid-left, col3=left
    // Each zone width = ~40% of page, step = ~22% so they overlap

    const W = 0.40;  // zone width  (as fraction of page width)
    const H = 0.38;  // zone height (as fraction of page height)

    // Column X starts (right to left: col 0 is rightmost)
    const colX = [
      1.0 - W,       // col 0: right edge  (zone 1, 5, 9)
      1.0 - W - 0.20, // col 1              (zone 2, 6, 10)
      1.0 - W - 0.40, // col 2              (zone 3, 7, 11)
      0.0,            // col 3: left edge   (zone 4, 8, 12)
    ];

    // Row Y starts (top to bottom)
    const rowY = [
      0.00,  // row 0: top    (zones 1-4)
      0.31,  // row 1: middle (zones 5-8)
      0.62,  // row 2: bottom (zones 9-12)
    ];

    let zoneNum = 1;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        // Clamp to [0,1]
        const bx = Math.max(0, Math.min(1 - 0.01, colX[col]));
        const by = Math.max(0, Math.min(1 - 0.01, rowY[row]));
        const bw = Math.min(1 - bx, W);
        const bh = Math.min(1 - by, H);

        zones.push({
          id: `pg${page.index}_z${zoneNum}_${Date.now()}`,
          chapterId: page.chapterId || '',
          pageIndex: page.index,
          zoneNumber: zoneNum,
          bounds: { x: bx, y: by, w: bw, h: bh },
          isFullPageReveal: false,
          type: 'zone'
        });
        zoneNum++;
      }
    }

    // Final Full-Page Reveal step — zooms out to show entire page
    zones.push({
      id: `pg${page.index}_fullreveal_${Date.now()}`,
      chapterId: page.chapterId || '',
      pageIndex: page.index,
      zoneNumber: 13,
      bounds: { x: 0, y: 0, w: 1, h: 1 },
      isFullPageReveal: true,
      type: 'fullbleed'
    });

    return zones;
  }

  // Legacy: single page detection (used by URL import flow)
  async detectPagePanels(page) {
    return this.generatePageReadingZones(page);
  }
}

window.mangaDetector = new MangaPanelDetector();
