#!/usr/bin/env python3
"""Exercise Echo in the offline single-page release on desktop and phone."""

import argparse
import csv
from pathlib import Path
import shutil
import time

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


def resume_after_late_wake(page):
    if page.evaluate("counterpoint.transport.status") == "paused":
        page.locator("#pause").evaluate("node => node.click()")


def wait_echoes(page, phone, count, after_ms):
    deadline = time.monotonic() + 90
    query = """(after) => counterpoint.events.filter(e => e.type === 'activation' && e.nodeId === 'CSp'
        && e.tMs > after && e.incomingLinkIds.includes('CF')).length"""
    while page.evaluate(query, after_ms) < count:
        assert time.monotonic() < deadline, page.evaluate("counterpoint.transport.state()")
        resume_after_late_wake(page)
        advance_phone_clock(page, phone, 500)
        page.wait_for_timeout(100)


def check_guided_run(page, *, phone):
    """One press shows the behaviour (creator decision 2026-11-27): nominal model,
    the drive already given, playback from 100 ms before the decisive S2."""
    page.locator("#dilation").select_option("4")
    # An edit to the model does not carry into a guided run.
    resume_after_late_wake(page)
    page.wait_for_function("counterpoint.transport.status === 'running'")
    site = page.locator("[data-site=FP]")
    site.press("i")
    field = page.locator(".lab-card-fields input").first
    page.locator(".lab-card-section[data-section=tune]").evaluate("node => { node.open = true; }")
    field.fill("330")
    field.dispatch_event("change")
    page.locator(".lab-card-close").evaluate("node => node.click()")

    activate(page.locator("#find-echo"), phone=phone)
    log = page.evaluate("counterpoint.transport.commandLog().map(c => c.commandId + ':' + c.tMs)")
    assert log == ["S1:200", "S2:4643"], log
    prelude = page.evaluate("""() => counterpoint.events
        .filter(e => e.type === 'stimulus_attempted' && e.nodeId === 'S').map(e => e.tMs)""")
    assert prelude == [200, 800, 1400, 2000, 2600, 3200, 3800, 4400], prelude
    assert page.evaluate("counterpoint.transport.presentedMs()") >= 4543
    wait_echoes(page, phone, 1, 4643)
    # Exactly one echo: none follows within the next second.
    deadline = time.monotonic() + 90
    while page.evaluate("counterpoint.transport.presentedMs()") < 5900:
        assert time.monotonic() < deadline, page.evaluate("counterpoint.transport.state()")
        resume_after_late_wake(page)
        advance_phone_clock(page, phone, 500)
        page.wait_for_timeout(100)
    assert page.evaluate("""counterpoint.events.filter(e => e.type === 'activation' && e.nodeId === 'CSp'
        && e.tMs > 4643 && e.incomingLinkIds.includes('CF')).length""") == 1

    activate(page.locator("#find-arrhythmia"), phone=phone)
    assert page.evaluate("counterpoint.transport.commandLog().find(c => c.commandId === 'S2')?.tMs") == 4677
    wait_echoes(page, phone, 3, 4677)


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
    assert page.evaluate("counterpoint.selectedSite") == "FP", "the inspected site is highlighted"
    if cdp:
        sheet = card.bounding_box()
        viewport = page.viewport_size
        assert sheet and viewport, (sheet, viewport)
        assert abs(sheet["y"] + sheet["height"] - viewport["height"]) <= 1, sheet
    capture("card")
    activate(close, phone=cdp is not None)
    expect(card).to_be_hidden()
    # A screenshot can stall headless Chrome past the commit horizon (late wake);
    # the sites are disabled while paused, so resume before the keyboard step.
    if page.evaluate("counterpoint.transport.status") == "paused":
        page.locator("#pause").evaluate("node => node.click()")
        page.wait_for_function("counterpoint.transport.status === 'running'")
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


def check_live_curve_and_model(page, *, phone, capture):
    """Revise M2: the S1–S2 curve builds from the session; Model sliders log commands."""
    runner = page.locator("#lab-study")
    # A fresh guided run (S2 243 ms at 4643 ms, presented from 4543 ms) becomes a
    # point once playback passes it by the settle window. Resume after a headless late wake.
    page.locator("#find-echo").evaluate("node => node.click()")
    deadline = time.monotonic() + 90
    while page.evaluate("counterpoint.liveCurve.length") < 1:
        assert time.monotonic() < deadline, page.evaluate("counterpoint.transport.state()")
        if page.evaluate("counterpoint.transport.status") == "paused":
            page.locator("#pause").evaluate("node => node.click()")
        advance_phone_clock(page, phone, 2000)
        page.wait_for_timeout(250)
    point = page.evaluate("counterpoint.liveCurve.at(-1)")
    assert 253 < point["couplingMs"] < 254 and point["driveCycleMs"] == 600, point
    live = runner.locator("[data-control=curves] figure").first
    expect(live.locator("figcaption")).to_contain_text("premature beat", timeout=5000)
    slider = runner.locator("#model-fp-erp")
    expect(slider).to_have_value("304")
    slider.evaluate("node => { node.value = '340'; node.dispatchEvent(new Event('input')); node.dispatchEvent(new Event('change')); }")
    page.wait_for_function("""counterpoint.transport.commandLog()
        .some(c => c.type === 'setRestitution' && c.nodeId === 'FP' && c.erpMaxMs === 340)""")
    expect(runner.locator("[data-read=model-status]")).to_contain_text("Fast pathway ERP: 340 ms")
    runner.get_by_role("button", name="Study defaults").evaluate("node => node.click()")
    page.wait_for_function("""counterpoint.transport.commandLog()
        .some(c => c.type === 'setRestitution' && c.nodeId === 'FP' && c.erpMaxMs === 304)""")
    expect(slider).to_have_value("304")
    runner.locator("[data-control=model-panel]").evaluate("node => node.scrollIntoView({ block: 'start' })")
    capture("model")


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
    page.add_init_script("window.AudioContext = window.webkitAudioContext = undefined")
    url = f"{ARTIFACT.as_uri()}#study=echo"
    screen_prefix = "integrate-01-phone" if phone else "integrate-01"

    def capture(name):
        check_width(page)
        screenshot(page, output, f"{screen_prefix}-{name}")

    try:
        page.goto(url)
        expect(page.get_by_role("button", name="Echo", exact=True)).to_have_attribute("aria-pressed", "true")
        assert page.evaluate("counterpoint.worldId") == "echo"
        assert page.locator("#study-line").count() == 0, "Echo's header matches the other worlds"
        assert page.evaluate("counterpoint.mixer") is None
        check_guided_run(page, phone=phone)
        activate(page.get_by_role("button", name="Pause", exact=True), phone=phone)
        advance_phone_clock(page, phone, 80)
        page.wait_for_function("counterpoint.transport.status === 'paused'")
        page.evaluate("window.scrollTo(0, 0)")

        # Creator decisions 2026-11-27: Staves and musical labels are hidden; Duality
        # is withdrawn; playback speed reads as a fraction of real time.
        assert page.locator("[data-view=staves]").count() == 0
        assert page.locator("[data-world=duality]").count() == 0
        assert page.locator("#dilation option").all_inner_texts() == ["1", "1/4", "1/8", "1/12"]
        assert page.locator("#mute").count() == 0 and page.locator("#volume").count() == 0
        instructions = page.locator("#protocol-hint")
        expect(instructions).to_be_visible()
        assert float(instructions.evaluate("node => parseFloat(getComputedStyle(node).fontSize)")) >= 16
        assert page.evaluate("counterpoint.selectedSite") == "FP"  # inspected in check_guided_run
        for view in ["network", "ladder"]:
            select_view(page, view, phone=phone)
            capture(view)

        select_view(page, "network", phone=phone)
        activate(page.get_by_role("button", name="Play", exact=True), phone=phone)
        page.wait_for_function("counterpoint.transport.status === 'running'")
        check_inspector(page, cdp, capture)
        assert page.locator("#stillness").count() == 0, "Stillness is removed (2026-11-27)"
        # The Laboratory is hidden for now (SHOW_LABORATORY = false, 2026-11-27).
        # Its steps run again when the flag returns.
        if page.locator("#lab-toggle").is_visible():
            check_worker(page, phone=phone, output=output, capture=capture)
            check_live_curve_and_model(page, phone=phone, capture=capture)
        else:
            assert page.locator("#lab").is_hidden()
        assert not errors, errors
        check_network(requests, ARTIFACT.as_uri())
        print(f"PASS Echo {width}x{height} Chromium file:// offline, one-press echo and arrhythmia, two views, "
              "inspector by hold and keyboard, no Stillness, Laboratory hidden", flush=True)
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
