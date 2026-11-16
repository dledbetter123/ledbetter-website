"""Record the replay GIFs on the Self-Healing Automation page.

Serves frontend/public on localhost, opens the page in headless Chrome at phone width with reduced
motion (so a tap shows as a still ring), and captures the player's header, phone and code side by
side at every step of each replay through window.healReplay (portfolio/heal-anim.js). Each GIF frame
lasts as long as its step does on the page. The PNG is the last frame, shown instead of the GIF under
reduced motion. Writes public/portfolio/replays/<id>.gif and <id>.png. Run after build.py:
python3 record.py, then python3 build.py again if the GIF size changed (the cards' img width and
height come from it), and bump GIF_V in build.py and the hero's ?v= in the page.
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
VIEW = 390         # CSS px viewport: the phone-width layout, where the phone sits beside the code
SCALE = 3          # device pixels per CSS px while capturing
WIDTH = 640        # GIF pixels; the cards and hero show it at about 340 CSS px, so it stays sharp on 2x screens
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
        cdp('Emulation.setDeviceMetricsOverride', width=VIEW, height=1400, deviceScaleFactor=SCALE, mobile=False)
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
                # The header row down to the bottom of the phone or the code, whichever is lower, plus the
                # log's top border as a bottom edge; the code pane's reserved height keeps every frame equal.
                r = cdp.js(f"""(() => {{
                    const root = document.querySelector('#heal-{rid}');
                    root.querySelectorAll('.ha-log li').forEach((li) => {{ li.style.visibility = 'hidden'; }});
                    root.scrollIntoView({{block: 'start'}});
                    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {{
                        const box = (s) => root.querySelector(s).getBoundingClientRect();
                        const a = root.getBoundingClientRect(), head = box('.agent-head');
                        const bottom = Math.max(box('.phone').bottom, box('pre.code').bottom) + 1;
                        res({{x: a.x + scrollX, y: head.y + scrollY, w: a.width, h: bottom - head.y}});
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
            pal = sheet.quantize(colors=COLORS - 1, method=Image.Quantize.MEDIANCUT)
            q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
            # Pixels that did not change since the previous frame become the transparent index, so each
            # frame stores only what moved (the phone's screen, a code line), and the GIF shrinks.
            clear = COLORS - 1
            for prev, cur in zip([f.copy() for f in q], q[1:]):
                a, b = prev.getdata(), list(cur.getdata())
                cur.putdata([clear if x == y else y for x, y in zip(a, b)])
                cur.info['transparency'] = clear
            durations = [s['ms'] for s in steps]
            durations[-1] += HOLD_LAST
            gif = os.path.join(OUT, f'{rid}.gif')
            q[0].save(gif, save_all=True, append_images=q[1:], duration=durations, loop=0, disposal=1, optimize=False,
                      transparency=clear)
            frames[-1].save(os.path.join(OUT, f'{rid}.png'), optimize=True)
            print(f'{rid}: {len(frames)} frames, {sum(durations) / 1000:.1f} s, {os.path.getsize(gif) // 1024} KB gif')
    finally:
        proc.terminate()
        httpd.shutdown()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == '__main__':
    main()
