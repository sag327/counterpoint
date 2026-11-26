#!/usr/bin/env python3
"""Exercise the built single-page release through Chromium's actual browser APIs."""

import argparse
import functools
import hashlib
import http.server
import json
import math
from pathlib import Path
import shutil
import threading
import time
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "dist" / "counterpoint.html"
ACTIVATIONS = "counterpoint.events.filter(event => event.type === 'activation')"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def observe(page):
    failures, requests = [], []
    page.on("pageerror", lambda error: failures.append(str(error)))
    page.on("console", lambda message: failures.append(message.text) if message.type == "error" else None)
    page.on("request", lambda request: requests.append(request.url))
    return failures, requests


def check_network(requests, allowed_url):
    unexpected = [
        url for url in requests
        if url != allowed_url and urlsplit(url).scheme not in {"data", "blob"}
    ]
    assert not unexpected, unexpected


def screenshot(page, output, name):
    if output:
        output.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=output / f"{name}.png", animations="disabled")


def choose_world(page, world):
    page.get_by_role("button", name=world, exact=True).click()
    assert page.get_by_role("button", name=world, exact=True).get_attribute("aria-pressed") == "true"


def ring_cut_swipe(page, link_index, *, touch=False, context=None):
    box = page.locator("#canvas").bounding_box()
    radius = min(box["width"], box["height"]) * 0.33
    theta = (link_index + 0.5) * math.tau / 8 - math.pi / 2
    def at_distance(distance):
        return {
            "x": box["x"] + box["width"] / 2 + distance * math.cos(theta),
            "y": box["y"] + box["height"] / 2 + distance * math.sin(theta),
        }
    start, end = at_distance(radius - 33), at_distance(radius + 34)
    if touch:
        cdp = context.new_cdp_session(page)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [start]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [end]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        cdp.detach()
    else:
        page.mouse.move(start["x"], start["y"])
        page.mouse.down()
        page.mouse.move(end["x"], end["y"], steps=6)
        page.mouse.up()
    page.wait_for_function(
        "(id) => document.querySelector('[data-link=' + id + ']').getAttribute('aria-pressed') === 'true'",
        arg=f"L{link_index}",
    )


def await_reentry(page):
    page.locator("#guide").click()
    page.wait_for_function(f"{ACTIVATIONS}.some(event => event.nodeId === 'R0' && event.tMs === 1200)")
    trace = page.evaluate("""() => ({
        r0: counterpoint.events.filter(e => e.type === 'activation' && e.nodeId === 'R0').slice(0, 4).map(e => e.tMs),
        attempts: counterpoint.events.filter(e => e.type === 'stimulus_attempted').map(e => e.tMs),
        block: counterpoint.events.some(e => e.type === 'activation_blocked' && e.nodeId === 'R1' && e.tMs === 300)
    })""")
    assert trace == {"r0": [0, 240, 720, 1200], "attempts": [0, 240], "block": True}, trace


def desktop_smoke(browser, output):
    url = ARTIFACT.as_uri()
    context = browser.new_context(viewport={"width": 1280, "height": 900}, offline=True, accept_downloads=True)
    page = context.new_page()
    errors, requests = observe(page)
    page.goto(url)
    page.wait_for_function("window.counterpoint !== undefined")
    screenshot(page, output, "desktop-opening")
    assert page.get_by_role("button", name="Conduction", exact=True).get_attribute("aria-pressed") == "true"
    assert page.evaluate("counterpoint.events.length") == 0
    assert page.evaluate("counterpoint.mixer == null")
    page.get_by_role("button", name="Begin in silence").focus()
    page.keyboard.press("Enter")
    page.wait_for_function(f"{ACTIVATIONS}.some(e => e.nodeId === 'V2' && e.tMs === 170)")
    assert page.evaluate("counterpoint.mixer == null")
    page.locator("#premature").click()
    page.wait_for_function(f"{ACTIVATIONS}.some(e => e.nodeId === 'H' && e.tMs === 465)")
    screenshot(page, output, "conduction-running")
    choose_world(page, "Duality")
    page.wait_for_function(f"{ACTIVATIONS}.some(e => e.nodeId === 'B2' && e.tMs === 280)")
    assert page.evaluate("counterpoint.events.every(e => e.worldId === 'duality')")
    screenshot(page, output, "duality-running")
    choose_world(page, "Circulation")
    page.locator("#single").click()
    page.wait_for_function(f"{ACTIVATIONS}.length === 8")
    screenshot(page, output, "circulation-running")
    await_reentry(page)
    page.get_by_role("button", name="Pause", exact=True).click()
    page.wait_for_function("counterpoint.transport.status === 'paused'")
    count = page.evaluate("counterpoint.events.length")
    run_id = page.evaluate("counterpoint.transport.runId")
    time.sleep(0.4)
    assert page.evaluate("counterpoint.events.length") == count
    page.get_by_role("button", name="Resume", exact=True).click()
    page.wait_for_function("(count) => counterpoint.events.length > count", arg=count)
    assert page.evaluate("counterpoint.transport.runId") == run_id

    command_count = page.evaluate("counterpoint.transport.commandLog().length")
    ring_cut_swipe(page, 4)
    swipe = page.evaluate("count => counterpoint.transport.commandLog().slice(count)", command_count)
    assert len(swipe) == 1 and swipe[0]["type"] == "setLinkEnabled" and swipe[0]["linkId"] == "L4", swipe
    ring_cut_swipe(page, 4)
    assert page.evaluate("counterpoint.transport.commandLog().length") == command_count + 1
    page.locator("summary").click()
    cut = page.locator("[data-link=L1]")
    cut.focus()
    page.keyboard.press("Space")
    page.wait_for_function("document.querySelector('[data-link=L1]').getAttribute('aria-pressed') === 'true'")
    time.sleep(2.15)
    count = page.evaluate(f"{ACTIVATIONS}.length")
    page.locator("#restore").click()
    page.wait_for_function("Array.from(document.querySelectorAll('[data-link]')).every(button => button.getAttribute('aria-pressed') === 'false')")
    time.sleep(0.48)
    assert page.evaluate(f"{ACTIVATIONS}.length") == count

    page.locator("#reset").click()
    page.wait_for_function("(run) => counterpoint.transport.runId !== run && counterpoint.events.length === 0", arg=run_id)
    page.locator("#dilation").select_option("5")
    page.get_by_role("button", name="Stimulate site R3").focus()
    page.keyboard.press("Space")
    page.wait_for_function("counterpoint.events.some(e => e.type === 'stimulus_attempted' && e.nodeId === 'R3')")
    page.locator("#lab-toggle").click()
    assert page.locator("#lab").is_visible()
    assert page.locator("#metrics").inner_text()
    assert page.locator("[data-read=world]").inner_text() == "Circulation"
    page.locator("[data-control=coupling]").fill("239")
    page.locator("[data-control=guide]").click()
    page.wait_for_function("""
        counterpoint.events.filter(e => e.type === 'stimulus_attempted').map(e => e.tMs).join() === '0,239'
    """)
    assert page.locator("#log tr").count() > 0
    with page.expect_download() as download_info:
        page.locator("#export").click()
    exported = json.loads(Path(download_info.value.path()).read_text())
    assert exported["origin"] == "actual-engine" and exported["world"]["worldId"] == "circulation" and exported["events"], exported
    assert all(event["runId"] == exported["runId"] for event in exported["events"])
    assert not errors, errors
    check_network(requests, url)
    print("PASS desktop Chromium file:// offline, three worlds, keyboard/silent, reentry, pause/resume, drag and keyboard cuts, restore, reset, dilation, inspector/export", flush=True)
    context.close()


def mobile_smoke(browser, url, output):
    context = browser.new_context(
        viewport={"width": 360, "height": 800}, device_scale_factor=2,
        is_mobile=True, has_touch=True, reduced_motion="reduce",
    )
    page = context.new_page()
    errors, requests = observe(page)
    page.goto(url)
    page.wait_for_function("window.counterpoint !== undefined")
    screenshot(page, output, "mobile-opening")
    assert page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    choose_world(page, "Circulation")
    page.locator("#begin").tap()
    page.wait_for_function("counterpoint.mixer != null")
    page.wait_for_function(f"{ACTIVATIONS}.length === 8")
    checked_notes = page.evaluate("""() => {
        const notes = counterpoint.mixer.diagnostics();
        const captures = counterpoint.events.filter(e => e.type === 'activation');
        return notes.recent.map(n => n.eventId).join() === captures.map(e => e.eventId).join()
            && notes.scheduled === captures.length && !notes.duplicates;
    }""")
    assert checked_notes, page.evaluate("counterpoint.mixer.diagnostics()")
    page.locator("#mute").tap()
    assert page.locator("#mute").get_attribute("aria-pressed") == "true"
    page.locator("#mute").tap()
    assert page.locator("#mute").get_attribute("aria-pressed") == "false"
    page.locator("#reset").tap()
    site = page.get_by_role("button", name="Stimulate site R5")
    box = site.bounding_box()
    assert box and box["width"] >= 44 and box["height"] >= 44, box
    site.tap()
    page.wait_for_function("counterpoint.events.some(e => e.type === 'stimulus_attempted' && e.nodeId === 'R5')")
    ring_cut_swipe(page, 1, touch=True, context=context)
    run_id = page.evaluate("counterpoint.transport.runId")
    page.locator("#palette").select_option("minimalism")
    page.locator("#volume").fill("0.42")
    assert page.evaluate("counterpoint.transport.runId") == run_id
    screenshot(page, output, "mobile-running")
    page.locator("#lab-toggle").tap()
    assert page.get_by_role("heading", name="Activation raster").is_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.reload()
    assert page.locator("#palette").input_value() == "minimalism"
    assert float(page.locator("#volume").input_value()) == 0.42
    assert page.get_by_role("button", name="Conduction", exact=True).get_attribute("aria-pressed") == "true"
    assert page.evaluate("counterpoint.mixer == null")
    assert not errors, errors
    check_network(requests, url)
    print("PASS Chromium HTTP, 360 CSS px / DPR 2, reduced motion, touch tap/swipe, Web Audio, mute, palette/preferences, inspector", flush=True)
    context.close()


def take_metrics(page, cdp):
    response = cdp.send("Performance.getMetrics")
    metrics = {item["name"]: item["value"] for item in response["metrics"]}
    stats = page.evaluate("""() => ({
        events: counterpoint.events.length,
        state: counterpoint.transport.status,
        run: counterpoint.transport.runId,
        lastMs: counterpoint.events.at(-1)?.tMs ?? null,
        discarded: counterpoint.retention?.discardedEvents ?? null,
        mixer: (({liveSources, peakSources, cacheBuffers, late, scheduled, duplicates}) =>
            ({liveSources, peakSources, cacheBuffers, late, scheduled, duplicates}))(counterpoint.mixer.diagnostics())
    })""")
    stats["usedHeapBytes"] = int(metrics["JSHeapUsedSize"])
    stats["domNodes"] = int(metrics["Nodes"])
    return stats


def soak(browser, minutes):
    url = ARTIFACT.as_uri()
    context = browser.new_context(viewport={"width": 1000, "height": 760}, offline=True)
    page = context.new_page()
    errors, requests = observe(page)
    page.goto(url)
    choose_world(page, "Circulation")
    page.locator("#begin").click()
    page.wait_for_function("counterpoint.mixer != null")
    await_reentry(page)
    cdp = context.new_cdp_session(page)
    cdp.send("Performance.enable")
    start = time.monotonic()
    deadline = start + minutes * 60
    initial = take_metrics(page, cdp)
    samples = [initial]
    print(json.dumps({"soakElapsedSeconds": 0, **initial}), flush=True)
    while time.monotonic() < deadline:
        time.sleep(min(60, deadline - time.monotonic()))
        sample = take_metrics(page, cdp)
        samples.append(sample)
        print(json.dumps({"soakElapsedSeconds": round(time.monotonic() - start, 1), **sample}), flush=True)
        assert sample["state"] == "running", sample
        assert sample["lastMs"] > samples[-2]["lastMs"], samples[-2:]
        assert sample["run"] == initial["run"], sample
        assert sample["events"] <= 4096, sample
        assert sample["mixer"]["liveSources"] <= 40, sample
        assert sample["mixer"]["cacheBuffers"] <= 48, sample
        assert sample["mixer"]["duplicates"] == 0, sample
        assert not errors, errors
    for _ in range(12):
        page.locator("#reset").click()
        page.wait_for_function("counterpoint.events.length === 0")
        page.locator("#guide").click()
        page.wait_for_function(f"{ACTIVATIONS}.length > 0")
    page.locator("#reset").click()
    page.wait_for_function("counterpoint.events.length === 0")
    assert not errors, errors
    check_network(requests, url)
    print(json.dumps({"afterThirteenResets": take_metrics(page, cdp)}), flush=True)
    context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", help="Path to a Chromium executable")
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--soak-minutes", type=float, default=0)
    parser.add_argument("--soak-only", action="store_true")
    args = parser.parse_args()
    executable = args.chromium or shutil.which("chromium")
    assert ARTIFACT.is_file(), "Build the release first with npm run build."
    print(f"SHA256 {hashlib.sha256(ARTIFACT.read_bytes()).hexdigest()}", flush=True)
    with sync_playwright() as driver:
        if not args.chromium and Path(driver.chromium.executable_path).is_file():
            executable = None
        browser = driver.chromium.launch(executable_path=executable, args=["--no-sandbox"])
        print(f"Chromium {browser.version}", flush=True)
        if not args.soak_only:
            desktop_smoke(browser, args.screenshots)
            handler = functools.partial(QuietHandler, directory=ARTIFACT.parent)
            with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    mobile_smoke(browser, f"http://127.0.0.1:{server.server_port}/counterpoint.html", args.screenshots)
                finally:
                    server.shutdown()
                    thread.join()
        if args.soak_minutes > 0:
            soak(browser, args.soak_minutes)
        browser.close()


if __name__ == "__main__":
    main()
