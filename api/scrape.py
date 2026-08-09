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

            result = self.scrape_manga_chapter(url)
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

    def scrape_manga_chapter(self, url):
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
        
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as resp:
            html = resp.read().decode('utf-8', errors='ignore')

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
