import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import re
import os
import sys

PORT = 8080

class InkScrollHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # Image proxy endpoint to handle hotlinking headers (Referer / User-Agent)
        if path == '/api/proxy':
            target_url = query.get('url', [None])[0]
            if not target_url:
                self.send_error(400, "Missing 'url' parameter")
                return
            
            try:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Referer': query.get('referer', [target_url])[0]
                }
                req = urllib.request.Request(target_url, headers=headers)
                with urllib.request.urlopen(req, timeout=15) as resp:
                    content = resp.read()
                    content_type = resp.headers.get('Content-Type', 'image/jpeg')
                    
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Cache-Control', 'public, max-age=86400')
                    self.end_headers()
                    self.wfile.write(content)
            except Exception as e:
                self.send_error(502, f"Proxy failed: {str(e)}")
            return

        # SPA route fallback for /main, /library, /reader, etc.
        relative_path = path.lstrip('/')
        if relative_path and not os.path.exists(os.path.join(os.getcwd(), relative_path)) and not path.startswith('/api/'):
            self.path = '/index.html'

        # Fallback to standard static file serving
        super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # Scraper API endpoint
        if path == '/api/scrape':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                url = data.get('url', '')
                if not url:
                    raise ValueError("URL is required")

                result = self.scrape_manga_chapter(url)
                self.send_json_response(200, result)
            except Exception as e:
                self.send_json_response(400, {'error': str(e)})
            return

        # Series Scraper API endpoint (Manga/Series page -> Chapter List)
        if path == '/api/scrape-series':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                url = data.get('url', '')
                if not url:
                    raise ValueError("URL is required")

                result = self.scrape_manga_series(url)
                self.send_json_response(200, result)
            except Exception as e:
                self.send_json_response(400, {'error': str(e)})
            return

        self.send_error(404, "Endpoint not found")

    def send_json_response(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def scrape_manga_chapter(self, url):
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
        
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as resp:
            html = resp.read().decode('utf-8', errors='ignore')

        # Extract title
        title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
        title = title_match.group(1).strip() if title_match else "Scraped Chapter"
        title = re.sub(r'\s+', ' ', title)

        search_htmls = [html]

        # Handle HTMX / dynamic sub-endpoints like /images or /images/full (e.g., WeebCentral)
        if '/chapters/' in url or 'weebcentral.com' in url:
            sub_url = url.rstrip('/') + '/images'
            try:
                sub_req = urllib.request.Request(sub_url, headers=headers)
                with urllib.request.urlopen(sub_req, timeout=15) as sub_resp:
                    search_htmls.append(sub_resp.read().decode('utf-8', errors='ignore'))
            except Exception as e:
                pass

        images = []

        for search_html in search_htmls:
            img_tags = re.findall(r'<img[^>]+>', search_html, re.IGNORECASE)
            for tag in img_tags:
                src_match = re.search(r'(?:src|data-src|data-lazy-src|data-original)=["\']\s*([^"\']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"\']*)?)\s*["\']', tag, re.IGNORECASE)
                if not src_match:
                    continue

                img_url = src_match.group(1).strip()
                img_lower = img_url.lower()

                # Ignore non-chapter images
                if any(k in img_lower for k in ['gravatar.com', 'avatar', 'wpdiscuz', 'emoticons', 'plugin', 'emoji', 'facebook', 'twitter', 'share', '150x150', '240x300', 'logo', 'banner', 'icon', 'button', 'brand']):
                    continue

                if img_url.startswith('//'):
                    img_url = 'https:' + img_url
                elif img_url.startswith('/'):
                    parsed_base = urllib.parse.urlparse(url)
                    img_url = f"{parsed_base.scheme}://{parsed_base.netloc}{img_url}"

                if img_url not in images:
                    images.append(img_url)

        # Sort images logically by page numbers in URL
        def page_key(u):
            filename = u.split('/')[-1].split('?')[0]
            numbers = re.findall(r'(\d+)', filename)
            return int(numbers[-1]) if numbers else 0

        if images:
            images.sort(key=page_key)

        return {
            'title': title,
            'sourceUrl': url,
            'pageUrls': images,
            'pageCount': len(images)
        }

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

        # Handle WeebCentral / Generic HTMX full-chapter-list sub-endpoint
        series_html = html
        if 'weebcentral.com' in url or '/series/' in url:
            # Extract series ID if available or construct sub_url
            series_id_match = re.search(r'/series/([^/]+)', url)
            if series_id_match:
                s_id = series_id_match.group(1)
                parsed_base = urllib.parse.urlparse(url)
                sub_url = f"{parsed_base.scheme}://{parsed_base.netloc}/series/{s_id}/full-chapter-list"
            else:
                sub_url = url.rstrip('/') + '/full-chapter-list'

            try:
                sub_req = urllib.request.Request(sub_url, headers=headers)
                with urllib.request.urlopen(sub_req, timeout=15) as sub_resp:
                    sub_html = sub_resp.read().decode('utf-8', errors='ignore')
                    if '/chapters/' in sub_html:
                        series_html = sub_html
            except Exception as e:
                pass

        # Extract chapter links & titles
        ch_matches = re.findall(r'<a[^>]+href=["\']([^"\']*/chapters/[^"\']+)["\'][^>]*>(.*?)</a>', series_html, re.IGNORECASE | re.DOTALL)
        
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

            # Clean chapter title
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

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"InkScroll Server running at http://localhost:{PORT}")
    with socketserver.TCPServer(("", PORT), InkScrollHandler) as httpd:
        httpd.serve_forever()
