"""Check the shipping pacing controls with Chromium on desktop and touch layouts."""
import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from browser_smoke import ARTIFACT, CIRCULATION


def live_pulses(page):
    return page.evaluate("""counterpoint.transport.commandLog()
        .filter(command => command.type === 'stimulate')""")


def exercise(browser, *, phone, artifact, model):
    context = browser.new_context(viewport={"width": 360 if phone else 1100, "height": 800},
                                  has_touch=phone, is_mobile=phone, reduced_motion="reduce")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script("window.AudioContext = window.webkitAudioContext = undefined")
    page.clock.install(time="2026-01-01T00:00:00Z")
    page.clock.pause_at("2026-01-01T00:00:01Z")
    page.goto(artifact.as_uri() + "#study=" + model)
    assert page.evaluate("counterpoint.worldId") == model
    field = page.get_by_role("spinbutton").filter(visible=True)
    click = lambda element: element.tap() if phone else element.click()
    expect(field).to_have_count(1)
    expect(page.get_by_text("Pacing cycle length", exact=True)).to_be_visible()
    initial_length = int(field.input_value())
    minus, plus = page.locator("#pacing-minus"), page.locator("#pacing-plus")
    click(minus)
    expect(field).to_have_value(str(initial_length - 10))
    click(plus)
    expect(field).to_have_value(str(initial_length))
    if phone:
        for element in (minus, plus, field, page.locator("#pacing-toggle")):
            box = element.bounding_box()
            assert box["width"] >= 44 and box["height"] >= 44, box
    field.fill("530")
    field.press("Enter")
    initial_count = len(live_pulses(page))
    page.clock.run_for(850)
    assert len(live_pulses(page)) == initial_count
    click(page.get_by_role("button", name="Pace", exact=True))
    page.clock.run_for(6500)
    pulses = live_pulses(page)[initial_count:]
    assert len(pulses) >= 3, pulses
    assert round(pulses[-1]["tMs"] - pulses[-2]["tMs"], 3) == 530
    if model != "circulation":
        assert pulses[-1]["nodeId"] == {"conduction": "A", "echo": "CSp"}[model]
    field.fill("470")
    field.press("Enter")
    page.clock.run_for(4200)
    pulses = live_pulses(page)
    assert round(pulses[-1]["tMs"] - pulses[-2]["tMs"], 3) == 470
    click(page.get_by_role("button", name="Stop pacing", exact=True))
    page.clock.run_for(550)
    stopped = len(live_pulses(page))
    page.clock.run_for(4300)
    assert len(live_pulses(page)) == stopped
    assert page.evaluate("counterpoint.transport.status") == "running"
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.reload()
    expect(field).to_have_value("470")
    expect(page.get_by_role("button", name="Pace", exact=True)).to_be_visible()
    assert not errors, errors
    print(f"PASS {model}, {artifact.name}, {'touch' if phone else 'desktop'}", flush=True)
    context.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", type=Path)
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium)
        for phone in (False, True):
            for model in ("conduction", "echo", "circulation"):
                exercise(browser, phone=phone, artifact=ARTIFACT, model=model)
            exercise(browser, phone=phone, artifact=CIRCULATION, model="circulation")
        browser.close()
