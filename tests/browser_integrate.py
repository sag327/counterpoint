#!/usr/bin/env python3
"""Exercise Echo in the offline single-page release on desktop and phone."""

import argparse
import csv
from pathlib import Path
import shutil

from playwright.sync_api import expect, sync_playwright

from browser_smoke import ARTIFACT, check_network, observe, screenshot


def activate(locator, *, phone):
    if phone:
        locator.tap()
    else:
        locator.click()


def pointer(page, cdp, action, point):
    if cdp:
        touch_points = [] if action == "up" else [point]
        cdp.send("Input.dispatchTouchEvent", {
            "type": {"down": "touchStart", "move": "touchMove", "up": "touchEnd"}[action],
            "touchPoints": touch_points,
        })
    elif action == "up":
        page.mouse.up()
    else:
        page.mouse.move(point["x"], point["y"])
        if action == "down":
            page.mouse.down()


def check_width(page):
    widths = page.evaluate("({ page: document.documentElement.scrollWidth, viewport: innerWidth })")
    assert widths["page"] <= widths["viewport"], widths


def advance_phone_clock(page, phone, ms):
    if phone:
        page.clock.run_for(ms)


def check_guided_run(page, *, phone):
    find_echo = page.locator("#find-echo")
    page.locator("#dilation").select_option("1")
    activate(find_echo, phone=phone)
    times = [200, 800, 1400, 2000, 2600, 3200, 3800, 4400, 4800]
    advance_phone_clock(page, phone, 4900)
    page.wait_for_function(
        """times => JSON.stringify(counterpoint.events
            .filter(e => e.type === 'stimulus_attempted' && e.nodeId === 'CSp')
            .map(e => e.tMs)) === JSON.stringify(times)""",
        arg=times,
    )
    run_id = page.evaluate("counterpoint.transport.runId")
    activate(find_echo, phone=phone)
    assert page.evaluate("counterpoint.transport.runId") != run_id
    assert page.evaluate("""counterpoint.transport.commandLog()
        .find(command => command.commandId === 'S2')?.tMs""") == 4790
    advance_phone_clock(page, phone, 1500)
    page.wait_for_function("counterpoint.events.some(e => e.type === 'activation' && e.tMs >= 1400)")
    page.locator("#dilation").select_option("4")


def select_view(page, view, *, phone):
    button = page.locator(f"[data-view={view}]")
    activate(button, phone=phone)
    advance_phone_clock(page, phone, 32)
    expect(button).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("counterpoint.view") == view
    assert page.locator("#canvas").is_visible() == (view == "network")
    assert page.locator("#view-canvas").is_visible() == (view != "network")


def place_calipers(page, cdp):
    canvas = page.locator("#view-canvas")
    canvas.scroll_into_view_if_needed()
    page.wait_for_function("counterpoint.views.staves.timeAtX(0) !== null")
    box = canvas.bounding_box()
    assert box
    y = box["y"] + box["height"] / 2
    start = {"x": box["x"] + box["width"] * 0.40, "y": y}
    end = {"x": box["x"] + box["width"] * 0.76, "y": y}
    pointer(page, cdp, "down", start)
    pointer(page, cdp, "move", end)
    pointer(page, cdp, "up", end)
    page.wait_for_function("counterpoint.views.calipers()?.intervalMs > 0")
    return end


def check_inspector(page, cdp, capture):
    site = page.locator("[data-site=FP]")
    site.scroll_into_view_if_needed()
    box = site.bounding_box()
    assert box and box["width"] >= 44 and box["height"] >= 44, box
    point = {"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2}
    card = page.locator("#card-layer")
    close = page.get_by_role("button", name="Close the inspector card")
    pointer(page, cdp, "down", point)
    try:
        if cdp:
            page.clock.run_for(550)
        expect(card).to_be_visible(timeout=2000)
        expect(close).to_be_focused()
    finally:
        pointer(page, cdp, "up", point)
    assert page.evaluate("counterpoint.card.target.id") == "FP"
    if cdp:
        sheet = card.bounding_box()
        viewport = page.viewport_size
        assert sheet and viewport, (sheet, viewport)
        assert abs(sheet["y"] + sheet["height"] - viewport["height"]) <= 1, sheet
    capture("card")
    activate(close, phone=cdp is not None)
    expect(card).to_be_hidden()
    site.press("i")
    expect(card).to_be_visible()
    expect(close).to_be_focused()
    assert page.evaluate("counterpoint.card.target.id") == "FP"
    close.press("Escape")
    expect(card).to_be_hidden()
    expect(site).to_be_focused()


def check_worker(page, *, phone, output, capture):
    activate(page.locator("#lab-toggle"), phone=phone)
    runner = page.locator("#lab-study")
    expect(runner.locator("[data-read=guided]")).to_contain_text("S2 390 ms")
    expect(runner.locator("[data-control=protocol]")).to_have_value("s1s2")
    activate(runner.get_by_role("button", name="Run protocol"), phone=phone)
    summary = runner.locator("[data-read=status]")
    expect(summary).to_contain_text("21 engine runs, Web Worker", timeout=15000)
    expect(summary).to_contain_text("Jump of 105 ms at 290 ms")
    for erp in ["atrial ERP 220 ms", "fast pathway ERP 290 ms", "slow pathway ERP 230 ms"]:
        expect(summary).to_contain_text(erp)
    assert page.evaluate("counterpoint.studyLab.runnerMode") == "worker"
    expect(runner.locator("[data-control=results] figure")).to_have_count(2)
    with page.expect_download(timeout=5000) as download_info:
        activate(runner.get_by_role("button", name="Export CSV"), phone=phone)
    download = download_info.value
    assert download.suggested_filename == "counterpoint-echo-s1s2.csv", download.suggested_filename
    with Path(download.path()).open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        assert reader.fieldnames[:4] == ["s2Ms", "captured", "a1h1Ms", "a2h2Ms"], reader.fieldnames
        rows = {int(row["s2Ms"]): row for row in reader}
    assert list(rows) == list(range(400, 199, -10)), rows.keys()
    assert rows[400]["captured"] == "true" and rows[200]["captured"] == "false"
    assert round(float(rows[290]["a2h2Ms"]) - float(rows[300]["a2h2Ms"])) == 105

    check_width(page)
    summary.evaluate("node => node.scrollIntoView({ block: 'start' })")
    capture("lab")
    notes_button = runner.get_by_role("button", name="Read the liner notes (draft)")
    activate(notes_button, phone=phone)
    notes = page.locator("#notes-sheet")
    expect(notes).to_be_visible()
    expect(notes.get_by_role("heading", name="Echo", exact=True)).to_be_visible()
    expect(notes.get_by_text("DRAFT", exact=True)).to_be_visible()
    if output and phone:
        # Reopen with the keyboard for evidence without Chromium's tap highlight.
        page.locator("#notes-close").tap()
        notes_button.press("Enter")
        expect(notes).to_be_visible()
    capture("notes")
    activate(page.locator("#notes-close"), phone=phone)
    expect(notes).to_be_hidden()


def smoke(browser, output, *, phone):
    width, height = (390, 844) if phone else (1280, 900)
    context = browser.new_context(
        viewport={"width": width, "height": height}, offline=True, is_mobile=phone,
        has_touch=phone, device_scale_factor=2 if phone else 1, reduced_motion="reduce",
        accept_downloads=True,
    )
    page = context.new_page()
    cdp = context.new_cdp_session(page) if phone else None
    if phone:
        # Headless Chromium can defer timer wakes during touch input and screenshots.
        # Pause the phone page clock and step it where playback or gestures need time.
        page.clock.install(time="2026-01-01T00:00:00Z")
        page.clock.pause_at("2026-01-01T00:00:01Z")
    errors, requests = observe(page)
    url = f"{ARTIFACT.as_uri()}#study=echo"
    screen_prefix = "integrate-01-phone" if phone else "integrate-01"

    def capture(name):
        check_width(page)
        screenshot(page, output, f"{screen_prefix}-{name}")

    try:
        page.goto(url)
        expect(page.get_by_role("button", name="Echo", exact=True)).to_have_attribute("aria-pressed", "true")
        assert page.evaluate("counterpoint.worldId") == "echo"
        expect(page.locator("#study-name")).to_have_text("Echo")
        activate(page.get_by_role("button", name="Begin in silence"), phone=phone)
        assert page.evaluate("counterpoint.mixer") is None
        check_guided_run(page, phone=phone)
        activate(page.get_by_role("button", name="Pause", exact=True), phone=phone)
        advance_phone_clock(page, phone, 80)
        page.wait_for_function("counterpoint.transport.status === 'paused'")
        page.evaluate("window.scrollTo(0, 0)")

        for view in ["network", "ladder", "staves"]:
            select_view(page, view, phone=phone)
            if view == "staves":
                end = place_calipers(page, cdp)
            capture(view)
        pointer(page, cdp, "down", end)
        pointer(page, cdp, "up", end)
        page.wait_for_function("counterpoint.views.calipers() === null")

        select_view(page, "network", phone=phone)
        activate(page.get_by_role("button", name="Resume", exact=True), phone=phone)
        page.wait_for_function("counterpoint.transport.status === 'running'")
        check_inspector(page, cdp, capture)
        activate(page.locator("#stillness"), phone=phone)
        advance_phone_clock(page, phone, 100)
        page.wait_for_function("""counterpoint.transport.commandLog()
            .some(command => command.type === 'applyAgent' && command.agent === 'stillness' && command.doseScale === 1)""")
        page.wait_for_function("counterpoint.stillnessLevel() > 0")
        check_worker(page, phone=phone, output=output, capture=capture)
        assert not errors, errors
        check_network(requests, ARTIFACT.as_uri())
        print(f"PASS Echo {width}x{height} Chromium file:// offline, guided run, three views, calipers, "
              "inspector by hold and keyboard, Stillness, S1–S2 Web Worker and CSV, liner notes", flush=True)
    except Exception:
        diagnostics = page.evaluate("""window.counterpoint && ({
            state: counterpoint.transport.state(),
            interruption: counterpoint.transport.lastInterruption,
            tail: counterpoint.events.slice(-4)
        })""")
        print(f"Echo {width}x{height} transport diagnostics: {diagnostics}", flush=True)
        raise
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", help="Path to a Chromium executable")
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    assert ARTIFACT.is_file(), "Build the release first with npm run build."
    with sync_playwright() as driver:
        executable = args.chromium
        if not executable and not Path(driver.chromium.executable_path).is_file():
            executable = shutil.which("chromium")
        browser = driver.chromium.launch(executable_path=executable, args=["--no-sandbox"])
        print(f"Chromium {browser.version}", flush=True)
        try:
            smoke(browser, args.screenshots, phone=False)
            smoke(browser, args.screenshots, phone=True)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
