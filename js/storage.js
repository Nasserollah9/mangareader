// InkScroll Storage Engine - Powered by Dexie.js IndexedDB
class InkStorage {
  constructor() {
    this.db = new Dexie('InkScrollDB');
    this.db.version(1).stores({
      chapters: 'id, title, sourceType, importedAt, lastReadAt, progress',
      pages: 'id, chapterId, index',
      panels: 'id, chapterId, pageIndex, readingOrder'
    });
    this.db.version(2).stores({
      chapters: 'id, title, seriesId, sourceType, importedAt, lastReadAt, progress',
      pages: 'id, chapterId, index',
      panels: 'id, chapterId, pageIndex, readingOrder',
      series: 'id, title, coverUrl, sourceUrl, addedAt'
    });
  }

  async init() {
    try {
      await this.db.open();
    } catch (e) {
      console.warn('Dexie DB open error, attempting upgrade fallback:', e);
    }
  }

  // Save series metadata + uncompiled chapter list (deduplicated by sourceUrl / title)
  async saveSeries(seriesData) {
    const { id, title, coverUrl, sourceUrl, chapters } = seriesData;
    if (!this.db.series) return null;

    // Check if series with same sourceUrl or title already exists
    let existing = null;
    if (sourceUrl) {
      existing = await this.db.series.where('sourceUrl').equals(sourceUrl).first();
    }
    if (!existing && title) {
      existing = await this.db.series.where('title').equals(title).first();
    }

    const seriesId = existing ? existing.id : (id || `series_${Date.now()}`);

    const seriesObj = {
      id: seriesId,
      title,
      coverUrl,
      sourceUrl,
      addedAt: existing ? existing.addedAt : new Date().toISOString(),
      chapters: chapters || []
    };

    await this.db.series.put(seriesObj);
    return seriesObj.id;
  }

  async getAllSeries() {
    if (!this.db.series) return [];
    try {
      const all = await this.db.series.orderBy('addedAt').reverse().toArray();
      const uniqueMap = new Map();
      for (let s of all) {
        const key = s.sourceUrl || s.title;
        if (key && !uniqueMap.has(key)) {
          uniqueMap.set(key, s);
        }
      }
      return Array.from(uniqueMap.values());
    } catch (e) {
      return [];
    }
  }

  async getSeries(seriesId) {
    if (!this.db.series) return null;
    try {
      return await this.db.series.get(seriesId);
    } catch (e) {
      return null;
    }
  }

  async deleteSeries(seriesId) {
    if (!this.db.series) return;
    try {
      await this.db.transaction('rw', this.db.series, this.db.chapters, this.db.pages, this.db.panels, async () => {
        await this.db.series.delete(seriesId);
        const chs = await this.db.chapters.where('seriesId').equals(seriesId).toArray();
        for (let ch of chs) {
          await this.deleteChapter(ch.id);
        }
      });
    } catch (e) {}
  }

  // Save a compiled chapter with pages and panels
  async saveChapter(chapterData) {
    const { chapter, pages, panels } = chapterData;

    const safePages = pages.map((p, idx) => ({
      id: p.id || `pg_${chapter.id}_${idx}_${Date.now()}`,
      chapterId: chapter.id,
      index: p.index ?? idx,
      ...p
    }));

    const safePanels = panels.map((p, idx) => ({
      id: p.id || `p_${chapter.id}_${idx}_${Date.now()}`,
      chapterId: chapter.id,
      pageIndex: p.pageIndex ?? 0,
      readingOrder: p.readingOrder ?? idx,
      ...p
    }));

    await this.db.transaction('rw', this.db.chapters, this.db.pages, this.db.panels, async () => {
      await this.db.chapters.put(chapter);
      await this.db.pages.where('chapterId').equals(chapter.id).delete();
      await this.db.pages.bulkPut(safePages);
      await this.db.panels.where('chapterId').equals(chapter.id).delete();
      await this.db.panels.bulkPut(safePanels);
    });
    return chapter.id;
  }

  // Get all saved chapters for the library grid
  async getAllChapters() {
    return await this.db.chapters.orderBy('importedAt').reverse().toArray();
  }

  // Get full chapter data with pages and panels by chapter ID
  async getChapterFull(chapterId) {
    const chapter = await this.db.chapters.get(chapterId);
    if (!chapter) return null;

    const pages = await this.db.pages.where('chapterId').equals(chapterId).sortBy('index');
    const panels = await this.db.panels.where('chapterId').equals(chapterId).sortBy('readingOrder');

    return { chapter, pages, panels };
  }

  // Update chapter reading progress
  async updateProgress(chapterId, progress, currentPanelId) {
    await this.db.chapters.update(chapterId, {
      progress: progress,
      currentPanelId: currentPanelId,
      lastReadAt: new Date().toISOString()
    });
  }

  // Delete chapter
  async deleteChapter(chapterId) {
    await this.db.transaction('rw', this.db.chapters, this.db.pages, this.db.panels, async () => {
      await this.db.chapters.delete(chapterId);
      await this.db.pages.where('chapterId').equals(chapterId).delete();
      await this.db.panels.where('chapterId').equals(chapterId).delete();
    });
  }

  // Clear all stored chapters & panels from IndexedDB cache
  async clearAllChapters() {
    await this.db.transaction('rw', this.db.chapters, this.db.pages, this.db.panels, async () => {
      await this.db.chapters.clear();
      await this.db.pages.clear();
      await this.db.panels.clear();
    });
  }

  // Export chapter as .inkscroll package (JSON package with base64 image data)
  async exportInkScroll(chapterId) {
    const fullData = await this.getChapterFull(chapterId);
    if (!fullData) throw new Error('Chapter not found');

    const jsonStr = JSON.stringify(fullData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${fullData.chapter.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.inkscroll`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import .inkscroll package file
  async importInkScrollFile(file) {
    const text = await file.text();
    const fullData = JSON.parse(text);
    if (!fullData.chapter || !fullData.pages || !fullData.panels) {
      throw new Error('Invalid .inkscroll package structure');
    }
    await this.saveChapter(fullData);
    return fullData.chapter.id;
  }
}

window.inkStorage = new InkStorage();
