from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os

PORT = int(os.environ.get('PORT', 3000))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        body = json.dumps({'message': 'Hello from Exocore Python!', 'status': 'running'})
        self.wfile.write(body.encode())
    
    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {format % args}")

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', PORT), Handler)
    print(f'[Exocore] Python server running on http://0.0.0.0:{PORT}')
    server.serve_forever()
