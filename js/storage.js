// InkScroll Storage Engine - Powered by Dexie.js IndexedDB
class InkStorage {
  constructor() {
    this.db = new Dexie('InkScrollDB');
    this.db.version(1).stores({
      chapters: 'id, title, sourceType, importedAt, lastReadAt, progress',
      pages: 'id, chapterId, index',
      panels: 'id, chapterId, pageIndex, readingOrder'
    });
  }

  async init() {
    await this.db.open();
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
