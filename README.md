# mangareader — InkScroll: Immersive Manga Reader

InkScroll is a single-page web application inspired by SBS's *"The Boat"* interactive graphic novel. It transforms traditional manga chapters into a cinematic, panel-by-panel reading experience with dramatic camera zooms, ink-wash aesthetics, atmospheric soundscapes, and authentic manga reading conventions (Right-to-Left, Top-to-Bottom).

## Features
- **Cinematic Panel-by-Panel Reader**: Three.js WebGL orthographic camera with smooth GSAP zooms.
- **Manga Panel Detection Engine**: Projection profiling algorithm automatically detects panel boundaries and sorts reading order (RTL / TTB).
- **Interactive Visual Editor**: Drag-to-adjust panel bounding boxes, reorder reading indices, and set atmospheric scene moods.
- **Multi-Source Importer**: Scrape URLs (e.g. 3asq), client-side PDF parsing (`PDF.js`), or paste direct image URLs.
- **Offline IndexedDB Storage**: Persistent local storage powered by Dexie.js with `.inkscroll` package export/import.
- **Vercel & Local Server Support**: Ready for Vercel deployment with Python Serverless Functions.

## Local Setup
```bash
python server.py
```
Open `http://localhost:8080` in your browser.

## Deployment on Vercel
Deploy seamlessly using Vercel CLI or by connecting your GitHub repository `https://github.com/Nasserollah9/mangareader.git`.
