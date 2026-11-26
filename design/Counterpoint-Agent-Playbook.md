# Counterpoint | Study No. 1
## Production playbook for small-model sessions

**Starting state:** Design package prepared. All implementation tickets are OPEN. No engine trace, listening verdict, or application test is claimed by this package.

Give the lead the original handoff, the five design plates and this file. The handoff governs behavior and scope. The plates propose composition, mark shapes and control placement. Use the generated material study for atmosphere. Use the vector plates for geometry, and §5 of the handoff for exact event order and timing. Where the artwork is ambiguous, consult the trace. Treat filenames below as proposed paths and map them to the existing repository at kickoff.

### How to read the plates

1. **Rest.** At desktop size the wreath is an object suspended in space. Keep R0 at the top, hollow out the center and start with the eight sites visible. Before Begin there is no traveling light. The action to find a rhythm appears after Begin.
2. **Induction.** Use the six timestamps as screenshot bookmarks. Frame 240 contains two separate attacks, including one coalesced capture at R4. Frame 300 contains one attack. Check the sense of rotation with two successive frames so a reversed coordinate transform cannot slip through. Compare 450 and 720 with eyes closed once audio exists.
3. **Marks.** The normal attack, blocked arrival, pending gesture and refractory core each have a different silhouette. Decorative threads stay dim and static. A mid-edge collision cancels two transits. The meeting at R4 in protocol A is a simultaneous node capture and makes one sound.
4. **Controls.** Stage-first phone study. The compact performer panel can become a popover on desktop. Make the guide's reset side effect visible before activation. On narrow screens preserve the stage during ordinary play and allow the detailed inspector to occupy its own sheet. Provide accessible labels for sound state and time dilation. An actual cut persists until restore/reset; opening or dismissing a panel does not change link state.
5. **Worlds.** Preserve the shared material across P1. Only the topology and event history give rise to new movements. Keep physically disconnected threads visually separated at crossings. The completed observer opening is Conduction. The first playable delivery opens on Circulation.

**Proposed renderer settings for a first comparison:** Use §8.1 colors, a cached layer of two to four topology echoes per link, a central path near one CSS pixel wide and a core radius near 2–3 CSS px at desktop scale. Separate the 44 px input target from this mark. Try a short wake roughly one fifth of a link, one localized capture ring and static background. Check against a flat dark mobile display as well as a desktop; raise resting-path contrast before enlarging bloom. These are adjustable art settings. Biological times stay in simulated ms. Use system serif for the title and system sans for controls, with no external font files.

## Team and context budget

Use one inexpensive model in distinct roles. Each session owns **one ticket, one writable area, one reviewable outcome**. The lead owns contracts, integration and the single STATUS index. Engine owns engine/worlds. Sound owns music and its tests. Visual owns rendering. Runtime owns transport and input. An independent verifier reads the changes, reruns the gate, and signs the receipt. Reuse roles across tickets. Where staffing or budget is tight, run sessions sequentially in exactly the same dependency order.

After the contract gate, run up to three workers concurrently as a starting budget. Engine can continue while sound and visuals use the same versioned test fixture. Runtime uses the next free slot. Use separate branches or worktrees for simultaneous edits. Each worker writes a separate receipt. Only the lead merges and updates the index. Contract change requests go to the lead with a failing example, affected consumers and the smallest proposed change. Reissue affected tickets against the new contract version. Never silently fork types or clocks.

A fresh worker reads the assigned handoff sections, its plate number, the contract, the latest accepted receipt for its dependency, and its ticket. Avoid sending full chat histories. If a change needs two independent gates, split it. After two attempts at the same failure, save the smallest reproduction and have a fresh reviewer diagnose it. Reserve a stronger model or the project owner for a demonstrated cross-subsystem ambiguity or a subjective artistic choice. Routine tests and fixes stay with the workers.

## Ticket queue

The lead can split any row into the indicated small passes. Record each pass before taking the next. Times below are simulation times unless stated otherwise. E and M identifiers are the named tests in handoff §10.

| Ticket / owner | Needs | Work and pass condition | Evidence for next session |
|---|---|---|---|
| 00 Lead | Design package | Inventory repository. Freeze v1 event payloads, command precedence, node/link/transit IDs, time units, run generation, recovery state, clock read/commit rules. Define test-only command stream and a small presentation fixture for A/B/C. Review against §§4, 5, 7 before fan-out. | Contract revision, exact fixture path, hand-calculated oracle and example blocked event; classify fixture origin. |
| 01 Engine | 00 | Isolated node plus one link. Rested stimulus captures, ERP−1 blocks, equality captures. Directed delay exact, no immediate reflection. | E01–04, tiny input and expected/actual trace. |
| 02a Engine | 01 | Batch same-time arrivals and collect all incoming links. A fresh ring given S1 yields 8 activations, one at R4 at 240, then rests. | E05/E14, sorted event table and queue end state. |
| 02b Engine | 02a | Opposing transits on the same link cancel at their calculated meeting point. Invalidate collision and arrival after a cut. | E06–08, staggered example with intersection position/time. |
| 03a Engine | 02b | Induce with S1/S2 alone. Record R1 block and R7 capture at 300, R0 return at 720, then at least 20 cycles with TCL 480. Repeat with irregular advancement chunks. | E15/E21, command list, trace and measured intervals. |
| 03b Engine | 03a | Sweep coupling at 1 ms spacing around both boundaries. Test equal ERP and prolonged ERP controls. Disable L4 at 1000 and in a separate run cut an active link. Restore into silence. Find one reproducible manual perturbation and describe its outcome. | E16–18, sweep endpoints, cut trace, perturbation receipt, explanation of divergence. |
| 04a Sound | 00 | Convert accepted activations to deterministic NoteIntents. Check chord at 240, single attack at 300, no normal note for R1 block. | M01–02, join event IDs to intents and list unmatched counts. |
| 04b Sound | 04a | Build one Chamber voice set and mixer, then render three short candidate voicings from identical input. Hold timing and gain comparable. | Offline signal, peak, tail and polyphony checks M09–11. Label actual listening separately. |
| 05a Visual | 00 | Match plate 01, then capture plate 02 bookmarks from the fixture with fixed viewport, theme and DPR. | Rest, 240, 300 and 450 frames; timestamp, size and fixture revision for each. |
| 05b Visual | 05a | Add interruption, pending input and recovery from plate 03. Verify path direction both ways. Reduced motion retains a distinct block glyph and disabled-link gap. | Short frame sequence plus grayscale and reduced-motion comparisons. |
| 06a Runtime | 00 | Implement a single presentation/commit clock with fake-clock tests first. Uniform dilation maps 60 sim ms to 240 wall ms at 4×. Bound and measure scheduling latency. | M04–05, trace of command, commit and presentation times. |
| 06b Runtime | 06a | Pause mid-transit, resume, change dilation, reset and hide/restore the page. Fence already-scheduled audio by run identity, preserve ordering. | M06–08, no duplicate onset or backlog; report observed limits. |
| 07a Lead + runtime | 03b, 04b, 05b, 06b | Connect real engine to all consumers. Enable Begin, individual stimulus, one-impulse and two-impulse guide, cut/restore, pause, sound, gain, reset and dilation. | Reproduce A–D through controls. Compare actual event IDs/times across engine, audio and render. Establish stable single-file build. |
| 07b Independent QA | 07a | Launch built file locally. Verify offline network behavior, silent operation, keyboard and narrow viewport. Exercise repeated reset, multiple cuts and a timed 10–15 minute run. Inspect production entry for fixture imports and scripted laps. | Build revision/digest, browser matrix, run length, errors, resource trend, corrective tickets, P0 release disposition. |
| 08 Creator + lead | 07b | Play the same passage at 3×/4×/5×. Compare the three voicings at fixed dilation. Review contrast at fixed timing/audio. Change one variable per comparison. | Listener and date, chosen take, one reason, one change to try. Mark audition pending until actually heard. |
| 09a Engine / visual | P0 stable | Conduction, then Duality, each in a separate session. Cover dynamic edits and automaticity in E09–13, Conduction E19, Duality E20. | Real traces for N→H rested/premature and for B unaffected by A stimulation; matching plate 05 captures. |
| 09b Sound / runtime | 09a | Add remaining palettes with M03. Add P1 inspector in separate tickets for transport, selected state, protocol, event log/raster and music. Add preference persistence and semantic controls. | Per-panel comparison to authoritative model data; viewport, keyboard, touch and reduced-motion evidence. |
| 10 QA + lead | 09b | Rebuild complete v0.1, verify Conduction opening, rerun A–E and whole §10 matrix, invalid inputs/event budget E22 and E23 when applicable. Repeat offline/browser checks and artistic review. | Release file, tagged source, README, test-to-evidence matrix, platform limitations and actual audition status. |

P0 can stand on its own after 07b. Pending listening remains visible on its release receipt. P1 feature work follows a playable P0 and a recorded artistic review decision. Score, Orbit, Field and topology editing belong in a later backlog.

## Progress that survives the end of a session

**STATUS.md** is the fast restart point. One row per ticket with state (OPEN / ACTIVE / REVIEW / ACCEPTED / BLOCKED), owner, dependency revision, receipt link and next action. The lead appends the last integrated revision, last passing gate, outstanding defects and the next ready ticket. Only verified receipts advance a dependency to ACCEPTED. Write a partial receipt before handing off an interrupted attempt.

**docs/runs/<ticket>-<attempt>.md** holds actual observations. Check in small deterministic command/trace files. Store larger screenshots or audio alongside the release evidence and link them by stable path and revision. A screenshot of the fixture and one from the running product must carry different provenance. Keep historical failures and link the receipt that resolves each one.

**DECISIONS.md** records decisions with date, author, affected contract or plate, reason, alternative tried and when to revisit. Log changes to physiology, clock, visual semantics or pitch mappings here. The lead maintains a §10 coverage table with each E/M ID, applicable milestone, test path, most recent run and outcome. Untested stays untested.

### Worker ticket template

> Ticket, owner, dependency revision, relevant handoff sections and plate number. Goal in one sentence. Allowed paths. Input command stream or fixture. One observable pass condition. Required test/evidence paths. Stop after producing the receipt. If blocked, give the first divergent event, expected/actual, and smallest reproduction.

### Receipt template

    Ticket / attempt / state:
    Base revision → proposed revision / contract version:
    Files changed:
    Reproduce from a clean checkout (commands, inputs, environment):
    Gate IDs and expected / observed results:
    Evidence paths and provenance (analytic / fixture / actual engine / human):
    Assumptions or deviations:
    Open defect / unverified checks:
    Next action, intended owner and prerequisite:
    Reviewer / independent rerun / disposition:

### Example checkpoint for 03a before implementation

    State: OPEN. Requirement: E15. Evidence origin: analytic only.
    Input: fresh §5.1 ring; R0 stimuli at 0 and 240 sim ms.
    Expected: at 300, R1 blocks and R7 captures. R0 captures at 720 and 1200.
    Observed: pending. No executable trace yet.
    Next owner: engine worker after 02b acceptance.
    Reviewer: use the raw event history to count 20 successive 480 ms return
    intervals. Inspect the production input stream for exactly two stimuli.

### Review and restart protocol

The reviewer checks out the candidate revision, runs the receipt’s commands, compares output with the frozen oracle and tries one negative control. Name the first differing event or visible mark on failure. A test that passes only on the worker’s fixture cannot close an integration ticket. QA ties each defect to its ticket, input and severity. The lead merges a passing change, reruns the affected integration gate and updates STATUS. A newly started agent can choose the next OPEN row with accepted dependencies without reconstructing project history.

**First future assignment:** Give the lead ticket 00 alone. Its deliverable is an agreed contract and reference data. Once reviewed, issue 01, 04a and 05a with the same revision. The project owner’s first listening decision is ticket 08, with a playable file and comparable takes.
