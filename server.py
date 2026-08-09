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
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            html = resp.read().decode('utf-8', errors='ignore')

        # Extract title
        title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
        title = title_match.group(1).strip() if title_match else "Scraped Chapter"
        title = re.sub(r'\s+', ' ', title)

        images = []

        # Scope search to reading content container if present
        reading_match = re.search(r'<(?:div|section)[^>]+class=["\'][^"\']*(?:reading-content|read-container|entry-content|chapter-content)[^"\']*["\'][^>]*>(.*?)(?:<div[^>]+id=["\'](?:comments|respond|disqus_thread)|<footer|\Z)', html, re.DOTALL | re.IGNORECASE)
        search_html = reading_match.group(1) if reading_match else html

        img_tags = re.findall(r'<img[^>]+>', search_html, re.IGNORECASE)

        for tag in img_tags:
            src_match = re.search(r'(?:src|data-src|data-lazy-src|data-original)=["\']\s*([^"\']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"\']*)?)\s*["\']', tag, re.IGNORECASE)
            if not src_match:
                continue

            img_url = src_match.group(1).strip()
            img_lower = img_url.lower()
            tag_lower = tag.lower()

            # Ignore comment avatars, gravatars, emoticons, logos, social buttons
            if any(k in img_lower for k in ['gravatar.com', 'avatar', 'wpdiscuz', 'emoticons', 'plugin', 'emoji', 'facebook', 'twitter', 'share', '150x150', '240x300', 'logo', 'banner', 'icon', 'button']):
                continue

            is_chapter_img = (
                'wp-manga-chapter-img' in tag_lower or
                'id="image-' in tag_lower or
                'wp-manga' in img_lower or
                'chapter' in img_lower or
                re.search(r'/\d+[-_]?\d*\.(?:jpg|png|webp|jpeg)', img_lower)
            )

            if is_chapter_img:
                if img_url.startswith('//'):
                    img_url = 'https:' + img_url
                elif img_url.startswith('/'):
                    parsed_base = urllib.parse.urlparse(url)
                    img_url = f"{parsed_base.scheme}://{parsed_base.netloc}{img_url}"

                if img_url not in images:
                    images.append(img_url)

        # Fallback Strategy if scoped container yielded 0 images
        if not images:
            all_tags = re.findall(r'<img[^>]+>', html, re.IGNORECASE)
            for tag in all_tags:
                src_match = re.search(r'(?:src|data-src|data-lazy-src|data-original)=["\']\s*([^"\']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"\']*)?)\s*["\']', tag, re.IGNORECASE)
                if not src_match:
                    continue
                img_url = src_match.group(1).strip()
                img_lower = img_url.lower()
                tag_lower = tag.lower()

                if any(k in img_lower for k in ['gravatar.com', 'avatar', 'wpdiscuz', 'emoticons', 'plugin', 'emoji', '150x150', '240x300', 'logo', 'banner']):
                    continue

                if 'wp-manga-chapter-img' in tag_lower or 'wp-manga' in img_lower or 'chapter' in img_lower:
                    if img_url.startswith('//'): img_url = 'https:' + img_url
                    elif img_url.startswith('/'):
                        parsed_base = urllib.parse.urlparse(url)
                        img_url = f"{parsed_base.scheme}://{parsed_base.netloc}{img_url}"
                    if img_url not in images:
                        images.append(img_url)

        # Sort images logically by page numbers in URL
        def page_key(u):
            filename = u.split('/')[-1].split('?')[0]
            numbers = re.findall(r'(\d+)', filename)
            return int(numbers[0]) if numbers else 0

        if images:
            images.sort(key=page_key)

        return {
            'title': title,
            'sourceUrl': url,
            'pageUrls': images,
            'pageCount': len(images)
        }

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"InkScroll Server running at http://localhost:{PORT}")
    with socketserver.TCPServer(("", PORT), InkScrollHandler) as httpd:
        httpd.serve_forever()
