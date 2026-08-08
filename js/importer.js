// InkScroll Importer Module - URL Scrapers & PDF Parser
class BaseSourceAdapter {
  constructor(name) {
    this.name = name;
  }
  canHandle(url) { return false; }
  async scrape(url) { throw new Error('Not implemented'); }
}

class ThreeAsqAdapter extends BaseSourceAdapter {
  constructor() { super('3asq Adapter'); }
  canHandle(url) { return url.includes('3asq.online') || url.includes('3asq.com'); }
  async scrape(url) {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!res.ok) throw new Error('Failed to scrape 3asq URL');
    return await res.json();
  }
}

class GenericScraperAdapter extends BaseSourceAdapter {
  constructor() { super('Generic Scraper Adapter'); }
  canHandle(url) { return true; }
  async scrape(url) {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!res.ok) throw new Error('Failed to scrape manga URL');
    return await res.json();
  }
}

class ChapterImporter {
  constructor() {
    this.adapters = [
      new ThreeAsqAdapter(),
      new GenericScraperAdapter()
    ];
  }

  // Scrape manga chapter from URL
  async importFromUrl(url) {
    const adapter = this.adapters.find(a => a.canHandle(url)) || this.adapters[this.adapters.length - 1];
    const scraped = await adapter.scrape(url);

    if (!scraped.pageUrls || scraped.pageUrls.length === 0) {
      throw new Error('No page images found at specified URL');
    }

    const pages = [];
    for (let i = 0; i < scraped.pageUrls.length; i++) {
      let imgUrl = scraped.pageUrls[i];
      // Proxy external images to prevent hotlink blocks
      if (imgUrl.startsWith('http')) {
        imgUrl = `/api/proxy?url=${encodeURIComponent(imgUrl)}&referer=${encodeURIComponent(url)}`;
      }
      
      const imgMeta = await this.loadImageMetadata(imgUrl);
      pages.push({
        index: i,
        imageUrl: imgUrl,
        width: imgMeta.width,
        height: imgMeta.height,
        isSpread: imgMeta.width > imgMeta.height * 1.35
      });
    }

    return {
      title: scraped.title || 'Imported Chapter',
      sourceUrl: url,
      sourceType: 'scraped',
      pages
    };
  }

  // Parse PDF file using PDF.js
  async importFromPDF(file) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js library is not loaded');
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageCount = pdf.numPages;

    const pages = [];
    for (let i = 1; i <= pageCount; i++) {
      const pdfPage = await pdf.getPage(i);
      const viewport = pdfPage.getViewport({ scale: 1.5 });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await pdfPage.render({ canvasContext: ctx, viewport }).promise;

      const blobUrl = canvas.toDataURL('image/jpeg', 0.85);
      pages.push({
        index: i - 1,
        imageUrl: blobUrl,
        width: viewport.width,
        height: viewport.height,
        isSpread: viewport.width > viewport.height * 1.35
      });
    }

    return {
      title: file.name.replace(/\.[^/.]+$/, ""),
      sourceType: 'pdf',
      pages
    };
  }

  // Import list of direct image URLs
  async importFromDirectUrls(urlsList, title = 'Direct Image Chapter') {
    const pages = [];
    for (let i = 0; i < urlsList.length; i++) {
      const imgUrl = urlsList[i].trim();
      if (!imgUrl) continue;

      const imgMeta = await this.loadImageMetadata(imgUrl);
      pages.push({
        index: i,
        imageUrl: imgUrl,
        width: imgMeta.width,
        height: imgMeta.height,
        isSpread: imgMeta.width > imgMeta.height * 1.35
      });
    }

    return {
      title,
      sourceType: 'images',
      pages
    };
  }

  // Helper to pre-load image and get native resolution
  loadImageMetadata(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ width: img.naturalWidth || 1000, height: img.naturalHeight || 1400 });
      img.onerror = () => resolve({ width: 1000, height: 1400 }); // Graceful fallback
      img.src = url;
    });
  }
}

window.chapterImporter = new ChapterImporter();
