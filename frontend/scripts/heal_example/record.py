"""Record the replay GIFs on the Self-Healing Automation page.

Serves frontend/public on localhost, opens the page in headless Chrome with reduced motion (so a
tap shows as a still ring), and captures the phone at every step of each replay through
window.healReplay (portfolio/heal-anim.js). Each GIF frame lasts as long as its step does on the
page. The PNG is the last frame, shown instead of the GIF under reduced motion. Writes
public/portfolio/replays/<id>.gif and <id>.png. Run after build.py: python3 record.py
"""
import base64
import functools
import http.server
import io
import json
import os
import shutil
import socketserver
import subprocess
import tempfile
import threading
import time
import urllib.request

import websocket
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.abspath(os.path.join(HERE, '..', '..', 'public'))
OUT = os.path.join(PUBLIC, 'portfolio', 'replays')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
WIDTH = 360        # GIF pixels; the cards show it at about 170 CSS px, so it stays sharp on 2x screens
HOLD_LAST = 1500   # extra ms on the last frame before the loop restarts
COLORS = 64


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=PUBLIC))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=30, suppress_origin=True)
        self.n = 0

    def __call__(self, method, **params):
        self.n += 1
        self.ws.send(json.dumps({'id': self.n, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == self.n:
                if 'error' in msg:
                    raise RuntimeError(f'{method}: {msg["error"]}')
                return msg['result']

    def js(self, expr):
        r = self('Runtime.evaluate', expression=expr, awaitPromise=True, returnByValue=True)
        if 'exceptionDetails' in r:
            raise RuntimeError(f'{expr}: {r["exceptionDetails"]}')
        return r['result'].get('value')


def main():
    os.makedirs(OUT, exist_ok=True)
    httpd = serve()
    profile = tempfile.mkdtemp(prefix='heal-rec-')
    dbg = 9300 + os.getpid() % 500
    proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={dbg}', f'--user-data-dir={profile}',
                             '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{dbg}/json/list'))
                page = next(t for t in targets if t['type'] == 'page')
                break
            except Exception:
                time.sleep(0.1)
        cdp = CDP(page['webSocketDebuggerUrl'])
        cdp('Emulation.setDeviceMetricsOverride', width=1200, height=1600, deviceScaleFactor=2, mobile=False)
        cdp('Emulation.setEmulatedMedia', features=[{'name': 'prefers-reduced-motion', 'value': 'reduce'}])
        url = f'http://127.0.0.1:{httpd.server_address[1]}/portfolio/self-healing-agent.html'
        cdp('Page.navigate', url=url)
        for _ in range(100):
            if cdp.js("document.readyState === 'complete' && !!window.healReplay"):
                break
            time.sleep(0.1)
        cdp.js('document.fonts.ready.then(() => true)')
        for rid in cdp.js('window.healReplay.ids'):
            steps = cdp.js(f'window.healReplay.steps({json.dumps(rid)})')
            frames = []
            for n in range(len(steps)):
                cdp.js(f'window.healReplay.show({json.dumps(rid)}, {n}), true')
                r = cdp.js(f"""(() => {{
                    const el = document.querySelector('#heal-{rid} .phone svg');
                    el.scrollIntoView({{block: 'center'}});
                    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {{
                        const b = el.getBoundingClientRect();
                        res({{x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height}});
                    }})));
                }})()""")
                shot = cdp('Page.captureScreenshot', format='png',
                           clip={'x': r['x'], 'y': r['y'], 'width': r['w'], 'height': r['h'], 'scale': 1})
                img = Image.open(io.BytesIO(base64.b64decode(shot['data']))).convert('RGB')
                h = round(img.height * WIDTH / img.width)
                frames.append(img.resize((WIDTH, h), Image.LANCZOS))
            sheet = Image.new('RGB', (WIDTH, sum(f.height for f in frames)))
            y = 0
            for f in frames:
                sheet.paste(f, (0, y))
                y += f.height
            pal = sheet.quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT)
            q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
            durations = [s['ms'] for s in steps]
            durations[-1] += HOLD_LAST
            gif = os.path.join(OUT, f'{rid}.gif')
            q[0].save(gif, save_all=True, append_images=q[1:], duration=durations, loop=0, disposal=1, optimize=False)
            frames[-1].save(os.path.join(OUT, f'{rid}.png'), optimize=True)
            print(f'{rid}: {len(frames)} frames, {sum(durations) / 1000:.1f} s, {os.path.getsize(gif) // 1024} KB gif')
    finally:
        proc.terminate()
        httpd.shutdown()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == '__main__':
    main()
