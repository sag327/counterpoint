# Engine receipt for 01, 02a, 02b, 03a and 03b

**Attempt 01, ready for lead review.** The engine uses contract 1.0.0 and the ticket 00 baseline recorded in `STATUS.md`. This run used Node v24.22.3 and Python 3 with `jsonschema`.

Implementation lives in `src/engine/` and the production topology in `src/worlds/circulation.js`. Reproduce from the project root.

```sh
node --test tests/engine.test.js
node tests/engine-evidence.js > evidence/engine-01.json
python3 tests/engine-contract.py
```

[Engine evidence](../../evidence/engine-01.json) contains complete actual event traces and inputs for 13 runs. The validator checked 1,040 events against the frozen event schema, validated each world and command, and checked monotonic identity, backward cause references and one terminal event per transit. The 18 Node tests also compare every event in A, B and C against their analytic fixtures.

| Ticket | Expected gate | Actual engine observation |
| --- | --- | --- |
| 01 | Rested capture, ERP−1 block, ERP equality capture, directed launch and no reflection | Isolated A captured at 0 ms with deadline 100, blocked at 99 with 1 ms left, and captured at 100 with deadline 200. A→B launched at 0 and arrived at 60. The reverse-disabled link did not launch on B's 120 ms stimulus. The bidirectional control launched back only on that fresh stimulus. |
| 02a | One capture from coincident arrivals. Eight total captures for S1 alone. | A produced 25 events and exactly eight captures, R0 at 0, R1/R7 at 60, R2/R6 at 120, R3/R5 at 180 and R4 at 240. R4's two arrivals gave one capture with incoming L3 and L4. Through 720 there were zero queued items and zero live transits. A separate mixed-source test joined two external attempts, one automatic attempt and two arrivals in a single capture that excluded both incoming links. |
| 02b | Collide opposing waves and invalidate arrivals. Apply cuts first. | A 120 ms forward wave at 0 and a 60 ms reverse wave at 20 collided at 53.333 ms and position 4/9 from A. Both arrivals disappeared. A cut at 40 canceled both, and restoring at 200 produced no traversal. A test at an exact collision tick confirmed edit priority and cancellation by numeric transit order. |
| 03a | R1 block and R7 capture at 300, R0 return at 720, at least 20 laps with TCL 480 | Two commands only, `S1` at 0 and `S2` at 240, both at R0. R1 blocked at 300 with 60 ms remaining. R7 accepted at 300. Returns to R0 started at 720, then every 480 through 10,320 ms, for 21 full intervals measured from S2. All 535 emitted events matched under one-shot, 10 ms, and irregular advancement. |
| 03b | Sweep both induction bounds, cut/restore, negative controls, and document one manual perturbation | A 0–360 ms sweep at 1 ms spacing measured sustained induction only at 220–299 ms inclusive. Each positive case completed ten 480 ms returns and had one live transit. C's cut at 1000 left the wave on L3 alive, with the final capture at R5 at 1380. The separate 930 ms active L4 cut canceled at position 0.5 and left 900 as the final capture. Both restored at 1500 and remained quiescent through 2000. |

At equal 220 ms ERP, S1/S2 produced 16 captures and stopped at the second merge at 480. At 500 ms ERP with the reverse directions gated off, a single impulse circled once and blocked at R0 at 480 with 20 ms remaining. The manual perturbation is a third R0 stimulus at 500 ms after 0/240 induction. The forward branch collided with the original wave on L1 at 610 ms, at position 5/6 from R1. The reverse branch returned to R0 at 980 instead of the original 720 return and continued at 1460 and 1940. The measured ring timing agrees with the analytic prediction.

Additional verified cases include E09–E13 for prospective edits, decrement and automatic tokens, and E22–E23 for invalid input, fault atomicity and multiple live fronts. The engine stores queue instants as integer microseconds and retains up to 4,096 state-changing batches by default. Reads before retained history report an explicit error. A fault exposes the last complete horizon and any complete events already committed in the same call, and requires reset.

One collision-order edge received a lead clarification. On a link with 500 ms forward travel from 0 and 1 ms reverse travel from 499.999, the unrounded interior intersection occurs at about 499.999002. The wire timestamp rounds to the second wave's departure at 499.999. The engine emits the newly discovered collision after its causal launch in the same batch. Collisions already scheduled when the batch begins remain ahead of arrivals, even if their interior position rounds onto an arrival tick. The regression covers both cases and an exact endpoint meeting.

E19 and E20 depend on the later Conduction and Duality worlds. This receipt covers the headless engine. Lead and integration reviewers can rerun the commands above before closing the tickets.
