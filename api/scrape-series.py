from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import urllib.parse
import re

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            data = json.loads(body)
            url = data.get('url', '')
            if not url:
                raise ValueError("URL is required")

            result = self.scrape_manga_series(url)
            res_bytes = json.dumps(result).encode('utf-8')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(res_bytes)
        except Exception as e:
            res_bytes = json.dumps({'error': str(e)}).encode('utf-8')
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(res_bytes)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def scrape_manga_series(self, url):
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }

        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as resp:
            html = resp.read().decode('utf-8', errors='ignore')

        # Title
        title_m = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
        title = title_m.group(1).strip() if title_m else "Manga Series"
        title = re.sub(r'\s*\|\s*Weeb Central.*', '', title, flags=re.IGNORECASE).strip()
        title = re.sub(r'\s+', ' ', title)

        # Cover image
        og_img = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.IGNORECASE)
        if not og_img:
            og_img = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html, re.IGNORECASE)
        cover_url = og_img.group(1).strip() if og_img else ''

        # Automatically detect and fetch HTMX / Madara wp-manga full chapter endpoints
        series_html = html
        
        # 1. Check Madara / wp-manga theme pattern (e.g. 3asq.online/manga/manga-name/ajax/chapters/)
        if 'ajax/chapters' not in url:
            ajax_chapters_url = url.rstrip('/') + '/ajax/chapters/'
            try:
                ajax_headers = dict(headers)
                ajax_headers['X-Requested-With'] = 'XMLHttpRequest'
                ajax_req = urllib.request.Request(ajax_chapters_url, method='POST', headers=ajax_headers)
                with urllib.request.urlopen(ajax_req, timeout=15) as ajax_resp:
                    ajax_html = ajax_resp.read().decode('utf-8', errors='ignore')
                    if 'wp-manga-chapter' in ajax_html or 'href=' in ajax_html:
                        series_html = ajax_html
            except Exception as e:
                pass

        # 2. If series_html is still unchanged, check hx-get attribute
        if series_html == html:
            hx_get_match = re.search(r'hx-get=["\']([^"\']*(?:full-chapter-list|chapter-list|all-chapters)[^"\']*)["\']', html, re.IGNORECASE)
            sub_url = hx_get_match.group(1).strip() if hx_get_match else None

            if not sub_url and ('weebcentral.com' in url or '/series/' in url):
                series_id_match = re.search(r'/series/([^/]+)', url)
                if series_id_match:
                    s_id = series_id_match.group(1)
                    parsed_base = urllib.parse.urlparse(url)
                    sub_url = f"{parsed_base.scheme}://{parsed_base.netloc}/series/{s_id}/full-chapter-list"
                else:
                    sub_url = url.rstrip('/') + '/full-chapter-list'

            if sub_url:
                if sub_url.startswith('/'):
                    parsed_base = urllib.parse.urlparse(url)
                    sub_url = f"{parsed_base.scheme}://{parsed_base.netloc}{sub_url}"

                try:
                    sub_req = urllib.request.Request(sub_url, headers=headers)
                    with urllib.request.urlopen(sub_req, timeout=15) as sub_resp:
                        sub_html = sub_resp.read().decode('utf-8', errors='ignore')
                        if '/chapters/' in sub_html or 'href=' in sub_html:
                            series_html = sub_html
                except Exception as e:
                    pass

        # Extract chapter links & titles across all supported sites (WeebCentral, 3asq, etc.)
        ch_matches = re.findall(r'<a[^>]+href=["\']([^"\']*(?:/chapters/|/manga/[^"\']+/[0-9]+)[^"\']*)["\'][^>]*>(.*?)</a>', series_html, re.IGNORECASE | re.DOTALL)
        if not ch_matches:
            ch_matches = re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', series_html, re.IGNORECASE | re.DOTALL)
        
        parsed_base = urllib.parse.urlparse(url)
        base_domain = f"{parsed_base.scheme}://{parsed_base.netloc}"

        chapters = []
        seen = set()
        for link, inner in ch_matches:
            if link.startswith('/'):
                full_link = base_domain + link
            else:
                full_link = link

            if full_link in seen:
                continue
            seen.add(full_link)

            clean = re.sub(r'<svg[^>]*>.*?</svg>', '', inner, flags=re.DOTALL | re.IGNORECASE)
            clean = re.sub(r'<time[^>]*>.*?</time>', '', clean, flags=re.DOTALL | re.IGNORECASE)
            clean = re.sub(r'<img[^>]*>', '', clean, flags=re.IGNORECASE)
            clean = re.sub(r'<[^>]+>', ' ', clean)
            clean = re.sub(r'\s+', ' ', clean).strip()
            clean = re.sub(r'\bLast Read\b', '', clean, flags=re.IGNORECASE).strip()

            if not clean:
                clean = "Chapter " + link.split('/')[-1]

            chapters.append({
                'url': full_link,
                'title': clean
            })

        return {
            'mangaTitle': title,
            'coverUrl': cover_url,
            'sourceUrl': url,
            'chapters': chapters,
            'chapterCount': len(chapters)
        }
