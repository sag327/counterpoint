#!/usr/bin/env python3
"""Exercise the Lab inspector card in Chromium: keyboard and pointer handles, then a screenshot.
Usage: python3 tests/lab-browser.py [docs/runs/lab-01-card.png]"""
import functools, http.server, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FONTS = Path('/home/claude/fonts/ttf')

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith('/fonts/'):
            return str(FONTS / path[len('/fonts/'):])
        return super().translate_path(path)
    def log_message(self, *_):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/tests/lab-browser.html'
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome')
    page = browser.new_page(viewport={'width': 920, 'height': 900}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(url)
    page.wait_for_function('window.ready === true')
    tau = page.locator('#site [data-handle="tau"]')
    tau.focus()
    page.keyboard.press('Shift+ArrowUp')
    page.keyboard.press('ArrowUp')
    assert tau.get_attribute('aria-valuenow') == '131', tau.get_attribute('aria-valuenow')
    # Drag the slow-pathway decrement handle up by 30 px: one command on release.
    handle = page.locator('#link [data-handle="decrementMax"]')
    box = handle.bounding_box()
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2 - 30, steps=6)
    page.mouse.up()
    page.evaluate('window.lab.advance(6400)')
    log = page.evaluate('window.lab.log.filter(c => c.commandId.startsWith("edit"))')
    assert [c['type'] for c in log] == ['setRestitution', 'setRestitution', 'setDecrement'], log
    assert log[2]['maxExtraMs'] > 60, log[2]
    assert page.locator('#site .lab-card-modified').is_visible()
    assert not errors, errors
    if len(sys.argv) > 1:
        page.screenshot(path=sys.argv[1], full_page=True)
    print('ok', [(c['type'], c.get('tauMs'), c.get('maxExtraMs')) for c in log])
    browser.close()
server.shutdown()
