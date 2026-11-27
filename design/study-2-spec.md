# Counterpoint · Study No. 2 — EP Realism & Musical Forms Design Spec

Nov 26, 2026 · @Stephen Gaeta

## Summary and how to use this spec

Study No. 2 turns Counterpoint from a three-scene instrument into a cycle of musical studies. Each study is a real electrophysiologic mechanism, and its musical form emerges from that mechanism. The work has four layers, built in this order:

1. **Tissue memory (engine contract v1.1).** Restitution of refractoriness and conduction, a relative refractory period, phase-4 automaticity with overdrive suppression, electrotonic coupling, decremental penetration (concealed conduction) and lesion formation. Without these, v0.1 reentry is metronomic and no maneuver behaves realistically.
2. **New studies.** Ostinato, Echo, Meter, Canon, Retrograde, Hemiola, Ghost and Fusion are presets of the same engine: topologies and parameters only, never scripted rhythms.
3. **Maneuvers as gestures.** Pacing trains, extrastimuli, entrainment, a post-pacing cadence, Stillness (adenosine-like AV block), the His-refractory extrastimulus and ablation lesions. They sit in the performer layer and carry no clinical labels.
4. **Views and presentation.** The Ladder view (a Lewis diagram drawn as a graphic score), Staves (intracardiac channels as a score), the Listening catheter, activation maps, Poincaré return plots, calipers, Unknown studies, liner notes and shareable performances.

**Audience.** The typical user is an electrophysiologist. Two sections make the plan work for them: Music made legible (plain musical words, deeper ideas on request) and The model made visible (inspect, plot and adjust restitution, refractoriness and conduction, and run S1–S2 protocols).

**Relationship to v0.1.** This spec extends `design/counterpoint-agent-handoff.md`; it does not replace it. Every principle in handoff §1.3 still binds. Engine contract v1.0.0 remains valid. v1.1 adds optional fields, so every v1.0 world and fixture must reproduce its existing traces byte for byte when the new fields are absent.

**Reading order for an implementing agent.** Read §Guardrails, then §Engine contract v1.1, which must pass its gate before any study ships. Then take one study and its maneuvers end to end: Echo is the recommended first study. Views can proceed in parallel once the event additions in v1.1 are frozen. The roadmap at the end lists tickets, dependencies and the evidence each gate requires.

**Status of numbers.** Parameter values below are physiologically motivated defaults chosen for audible clarity at 3×–5× time dilation. They are not clinical measurements. Where a value departs from typical human ranges for musical reasons, the departure is stated.

## Guardrails carried forward

All eight non-negotiable principles in handoff §1.3 remain binding. Five additional rules govern Study No. 2.

**1. The audience rule: EP depth on demand, music in plain words.** The primary user is an electrophysiologist, not a musician. The canvas stays beautiful and uncluttered. EP content is not hidden: the model, its curves and its measurements are one tap away and use standard EP terms. Music is the part that must never overwhelm. Simple musical ideas are named in plain words. Complex ones are hinted at and explained only when asked (see Music made legible).

| Surface | Shows | Avoids |
| --- | --- | --- |
| Main canvas | Study title, a one-line plain subtitle, sites, waves | Numbers, abbreviations, music theory |
| Performer controls | Plain action words ("Hold a tempo", "Stillness", "Draw a line") | Jargon from either field as the visible label |
| Accessible name of a control | One sentence naming the action and the EP maneuver | Tutorial text |
| Site and link inspector | EP terms and units: ERP, DI, conduction time, restitution curve, editable parameters | Music theory |
| Laboratory | Full EP nomenclature, protocol runner, curves, intervals in ms | Clinical interpretation or advice |
| Music cards (tap a hinted term) | Two plain sentences, Hear it, Show the beats | More than one new musical idea at a time |
| Liner notes | Mechanism, history, the musical idea in depth, references | Claims of clinical validity |

**2. Mechanism, not mimicry.** A study is a world definition: topology, refractory and restitution parameters, automaticity and coupling. Never schedule fabricated activations or a precomposed pattern. A guided protocol may only enqueue labeled stimuli, exactly as v0.1's "Find a rhythm" does. If a phenomenon does not emerge from the model, it is not shipped.

**3. Disease is not dissonance.** Pitch sets never change because a rhythm is pathologic. Reentry, block and fibrillatory behavior use the same tonal vocabulary as sinus rhythm. Musical tension may arise only from timing, density, overlap and silence that the physiology itself produces.

**4. Claims stay inside the model.** Liner notes and the Lab say "a lumped-element model of" before naming a mechanism. Do not claim fibrillation, torsades or clinically validated entrainment criteria. Where the model departs from reality (graph instead of continuum, single ERP per site, no ionic currents), the Lab's *Model notes* panel says so in one sentence.

**5. Every new behavior has a deterministic oracle.** Each new mechanism ships with a headless fixture whose expected event trace can be calculated by hand, as v0.1's A/B/C fixtures are. No study, view or maneuver advances a gate on a visual or audio impression alone.

## Music made legible

An electrophysiologist should enjoy every study without knowing any music theory. Musical ideas therefore come in three layers, and each study introduces at most one idea beyond the plain words.

### Three layers

| Layer | How it appears | Terms | Rule |
| --- | --- | --- | --- |
| 1 · Named | Plain words, used freely in subtitles and cards | rhythm, beat, tempo, rest, pause, melody, arpeggio, chord, echo, round, faster, slower | No explanation needed or given |
| 2 · Hinted | The word with a small "+" chip. One tap opens a card | hemiola, ostinato, retrograde, canon, phasing, meter, fermata, accelerando, rubato, suspension, polyrhythm | Card = two plain sentences, then Hear it, Show the beats, Read more |
| 3 · In depth | Liner notes, "The musical idea" | Anything else, including tuning, voicing and form | Only reached through Read more |

### Study subtitles

Each title keeps its musical name, but always shows a plain subtitle using layer 1 words. The subtitle carries the study's single layer 2 term as a chip.

| Study | Plain subtitle | Layer 2 chip |
| --- | --- | --- |
| Prelude | A pause, then the rhythm finds its way back | fermata |
| Echo | An arpeggio folds into a chord | none |
| Meter | Beats fall into groups | meter |
| Ostinato | A fast figure and its slower shadow | ostinato |
| Retrograde | A melody, then the same melody backwards | retrograde |
| Ghost | One voice goes quiet and stays quiet | none |
| Canon | One melody, two voices, half a lap apart | canon |
| Hemiola | Two tempos learn to line up | hemiola |

### Cards and their actions

- **Two sentences.** The first defines the term in plain words ("Three beats of one voice against two of the other"). The second says where it happens in this study ("Here it appears when the two pacemakers lock 2 : 3"). Sentences stay under 20 words.
- **Hear it** solos the voices involved for 8 seconds of wall time by changing the mix only. It never creates notes. It can also replay the last few seconds of the actual event stream.
- **Show the beats** draws brackets over the relevant notes on the Staves view (groups of 3 against 2, the repeating figure of an ostinato, the mirrored order of a retrograde). Brackets are derived from events.
- **Read more** opens the liner notes at "The musical idea".

### Musical controls stay quiet

- Palette (Chamber, Atmosphere, Minimalism) stays in the main controls. Voicings and dilation move to the Lab, under "Sound".
- No control is labelled with a music-theory term. "Time dilation" becomes "Slower / faster playback".

### Implementation

- `src/content/glossary.json`: `{ id, term, layer, short: [sentence, sentence], studyNotes: { studyId: sentence }, demo: { solo: [siteIds], brackets: 'groups' | 'figure' | 'mirror' } }`.
- Study metadata lists the glossary ids it uses. A test fails if a layer 2 term appears in visible copy without a chip, if a study introduces more than one layer 2 term, or if a card sentence exceeds 20 words.

## Current-state audit of v0.1 physiology

v0.1's event semantics are sound: all-or-none capture, an inclusive ERP, mid-link collisions, no immediate reflection and decremental AV-nodal delay. What it lacks is history dependence. Every site has one fixed ERP, conduction slows with prematurity on one link only, and automatic foci never interact. The result is reentry that repeats to the microsecond and maneuvers that cannot behave as they do in the lab.

### What is realistic now

- **Capture and block** at a site follow ERP exactly, and a blocked attempt leaves state unchanged (`engine/index.js`, `determineOutcomes`).
- **Decremental AV-nodal conduction.** On link `NH`, delay rises by up to 90 ms with τ = 120 ms as N's recovery interval shortens. This gives a plausible AH of 65–155 ms.
- **Unidirectional block from heterogeneous refractoriness.** In Circulation, R1's ERP of 300 ms against neighbours at 220 ms is a classic mechanism for initiating reentry with an S1–S2 pair.
- **Collision** of opposing wavefronts mid-link, with no fictitious outgoing wave.

### What is not realistic yet

| Gap | Where in v0.1 | Consequence | Fix (section) |
| --- | --- | --- | --- |
| ERP is independent of rate | `node.erp` fixed | No alternans, no rate-dependent aberrancy, reentry CL never adapts | ERP restitution (v1.1 §A) |
| Conduction time depends only on the source site | `transitDuration` uses source `priorUntil` | Waves entering partially recovered tissue do not slow; no excitable-gap dynamics | Relative refractory conduction (v1.1 §B) |
| Automaticity resets to a full cycle | `scheduleNextAutomatic` | Every premature beat produces the same pause; no overdrive suppression or warm-up | Phase-4 model (v1.1 §C) |
| Foci never interact | Duality has no links between groups | No parasystolic modulation, no mode-locking | Electrotonic coupling (v1.1 §D) |
| Capture is all or nothing at every site | Node model | No concealed conduction, no Wenckebach periodicity inside the node | Decremental penetration (v1.1 §E) |
| A cut is instantaneous and permanent | `setLinkEnabled` | Ablation cannot slow a circuit before terminating it; no gaps in a line | Lesion formation (v1.1 §F) |
| His ERP (180 ms) is shorter than the ventricle's (260 ms) | Conduction world | Aberrancy cannot occur; the real refractory gradient runs the other way | Parameter change (below) |

### Parameter table: v0.1 against recommended defaults

Human values are approximate, at a drive cycle of about 600 ms. The recommended values keep musical intervals audible at 4× dilation.

| Element | v0.1 | Typical human range | Recommended v1.1 default | Note |
| --- | --- | --- | --- | --- |
| Sinus cycle (S) | 800 ms | 600–1000 ms | 800 ms, with RSA ±40 ms optional | RSA only when the "Breath" control is on |
| Atrial ERP (A) | 220 ms | 200–250 ms | 220 ms at CL 600, restitution on |  |
| AV node ERP (N) | 250 ms | 250–400 ms | 300 ms fast pathway, 230 ms slow pathway (Echo) | Dual pathways only in Echo |
| His ERP (H) | 180 ms | 330–450 ms (His–Purkinje) | 360 ms | Corrects the gradient |
| Right bundle ERP | n/a | longer than left | 400 ms | Right-bundle aberrancy most common |
| Left bundle ERP | n/a |  | 340 ms |  |
| Ventricular ERP (V1, V2) | 260 ms | 200–280 ms | 250 ms, restitution on |  |
| A→N delay (atrial-nodal) | 35 ms | AH 50–120 ms in total | 35 ms |  |
| N→H delay | 65 ms + ≤ 90 ms |  | 60 ms + ≤ 140 ms, τ = 140 ms | Larger decrement makes Wenckebach audible |
| H→V delay | 25 / 45 ms | HV 35–55 ms | 40 ms right bundle, 35 ms left bundle |  |
| Circulation link delay | 60 ms × 8 | Flutter CL 200–280 ms | Keep 60 ms in Circulation; use 30 ms in Ostinato | The wide gap in Circulation is what lets Canon exist |
| Circulation excitable gap | 54% of CL | 15–30% in flutter | Keep in Circulation and Canon; 25–35% in Ostinato |  |

Keep the v0.1 worlds frozen as `*-v1` presets so existing fixtures remain valid. New defaults apply to new presets and to the v1.1 versions of Conduction, Circulation and Duality.

## Engine contract v1.1

Contract v1.1 adds six optional mechanisms (A–F), three commands and three event types. Every addition is opt-in per world. A world that omits every new field must produce the v1.0 trace for fixtures A, B, C and `ring.json` byte for byte. This is the first gate of Study No. 2.

Schemas in `contracts/*.v1.schema.json` use `additionalProperties: false`, so v1.1 ships as new files (`*.v1_1.schema.json`). `readWorld` accepts both. Wire units stay milliseconds; internal time stays integer microsecond ticks.

### World additions at a glance

```ts
type NodeV11 = NodeV1 & {
  tissue?: 'sinus' | 'atrial' | 'nodal' | 'hisPurkinje' | 'ventricular' | 'accessory'; // default 'atrial'
  audible?: boolean;                 // default true; false = model-only site (concealed segments)
  restitution?: {                    // §A
    erpMaxMs: number;                // ERP after a long rest
    amplitudeMs: number;             // how much ERP can shorten
    tauMs: number;                   // time constant against diastolic interval
    erpMinMs: number;                // floor
  } | null;
  automaticity: null | (AutomaticityV1 & {
    overdrive?: { gainPerBeat: number; maxMs: number; warmupFactor: number } | null; // §C
    protected?: boolean;             // entrance block: conduction cannot capture this focus (§D)
  });
};

type DirectionV11 = DirectionV1 & {
  entry?: { maxExtraMs: number; tauMs: number } | null;   // §B relative-refractory slowing
};

type WorldV11 = WorldV1 & {
  contractVersion: '1.1.0';
  coupling?: Array<{ id: string; from: string; to: string; amplitude: number }>; // §D
  autonomic?: { breathPeriodMs: number; depth: number; targets: Array<'sinus' | 'nodal'> } | null;
};
```

### A. Refractory restitution

ERP is recomputed at each accepted capture from the diastolic interval, defined here as the time since the previous refractory period ended. A site that has never been activated uses `erpMaxMs`.

```latex
\mathrm{ERP}_n = \operatorname{clamp}\big(E_{max} - A\,e^{-\mathrm{DI}_n/\tau},\; E_{min},\; E_{max}\big), \qquad \mathrm{DI}_n = t_n - \mathrm{refractoryUntil}_{n-1}
```

- The slope of this curve is (A/τ)·e^(−DI/τ). Where the slope exceeds 1 at a fixed drive rate, ERP alternates long–short. That alternation must emerge; it must not be coded.
- Worked example for the fixture: E\_max 300, A 200, τ 60 ms. At a drive cycle of 340 ms the steady ERP is about 253 ms and the slope about 0.78, so the response is stable. At 300 ms the steady ERP is about 233 ms with a slope of about 1.1, so alternans appears. The fixture computes the exact sequence numerically and asserts the alternation.
- `activation` gains an optional `diastolicIntervalMs` (null on first capture). `erpMs` already reports the ERP snapshot.
- If a site has `restitution`, a `setNodeERP` command sets `erpMaxMs` and shifts `erpMinMs` by the same amount.

### B. Relative-refractory conduction (entry slowing)

v0.1 slows conduction only according to the source site's recovery. Real tissue also conducts more slowly into a site that has only just recovered. A direction may declare `entry`. At launch, the engine computes the nominal arrival `t̂ = departure + baseDelay + sourceDecrement`. If the destination is activated and `t̂ ≥ refractoryUntil`, it adds:

```latex
\Delta_{entry} = M_{entry}\, e^{-(\hat t - \mathrm{refractoryUntil}_{dest})/\tau_{entry}}
```

- Arrival deadlines stay fixed at launch, as in v1.0. The destination state used is the one at the end of the launching batch. A later capture of the destination by another wave does not change a planned arrival; that arrival then blocks or merges under existing rules. The Lab's *Model notes* states this simplification.
- This single rule produces lap-to-lap cycle variation in reentry, a wave that slows as it runs into the excitable gap, and resetting curves that rise as the extrastimulus gets earlier.
- `conduction_launched` gains an optional `delayParts: { baseMs, sourceMs, entryMs, lesionMs }` for the Lab and the Ladder view.

### C. Phase-4 automaticity, overdrive suppression and autonomic tone

Each automatic focus keeps `suppressionMs` (initially 0). When the focus is captured by a non-automatic source at an interval I shorter than its cycle, suppression grows. When it fires spontaneously, suppression decays.

```latex
S \leftarrow \min\big(S_{max},\; S + g\,(T - I)\big) \ \text{(driven capture)}, \qquad S \leftarrow w\,S \ \text{(spontaneous firing)}, \qquad t_{next} = t + T + S
```

- With T 800 ms, g 0.06, S\_max 450 ms and w 0.6: 30 driven beats at 500 ms saturate S at 450 ms. The first spontaneous return is 1250 ms after the last paced beat (a corrected recovery time of 450 ms, within the normal range). Later cycles are then 1070, 962, 897.2 ms (exact: 800 + 0.6³ × 450): a written-out accelerando back to tempo. A "sick sinus" Unknown study raises S\_max to 2000 ms.
- `resetOnCapture: false` keeps v1.0 behavior: a non-reset focus produces the fully compensatory pause. `resetOnCapture: true` produces the non-compensatory pause. Both pauses must appear in the post-PVC fixture.
- **Autonomic tone (optional).** When `autonomic` is present, the effective sinus cycle is T·(1 + d·sin(2πt/P\_breath)) at scheduling time. Nodal decrement `maxExtra` is multiplied by (1 + d·sin(…)) for `nodal` targets. This is respiratory sinus arrhythmia: phrasing that comes from a modelled breath, never a beat grid. It changes intervals only and creates no attacks. Default is off; the performer control is "Breath", which sends `setAutonomic { value: {…} | null }` (contract 1.1.0, 11e). The breath phase follows absolute sim time, so toggling never resets it.
- New command `setTone { value: -1..1 }` scales sinus cycle (±20%) and nodal decrement (±50%) prospectively. Positive is sympathetic: cycle × (1 − 0.2v), decrement × (1 − 0.5v); negative is vagal (11e). It emits `parameter_changed` with `parameter: 'tone'`.

### D. Electrotonic coupling (modulated parasystole)

A coupling entry lets every accepted activation of site `from` shift the next scheduled firing of automatic focus `to`, without capturing it. The shift follows a sinusoidal phase-response curve: inputs early in the cycle delay the focus, late inputs advance it.

```latex
\varphi = \frac{t - t_{lastFire}}{T_{to}}, \qquad \Delta t = T_{to}\, a\, \sin(2\pi\varphi), \qquad t_{next} \leftarrow \max(t + 1\,\text{tick},\; t_{next} + \Delta t)
```

- `protected: true` on the target focus means conduction and stimuli arriving at it emit `activation_blocked` with a new cause, `'protected'` (entrance block). Exit is unaffected: the focus can still capture neighbours that are excitable.
- New event `phase_modulated { nodeId, couplingId, sourceActivationId, phase, shiftMs, nextAttemptMs }`, emitted after outcomes and before automatic schedules are finalized in the same batch.
- Expected behavior with today's Duality cycles (A 720 ms, B 1030 ms, coupling A→B). This was checked with a quick event-level prototype while writing this spec, and the production fixture must confirm it. Uncoupled, the ratio of B to A beats is 0.699 and drifts. At a ≈ 0.155–0.205 it locks to exactly 2:3, a hemiola, interrupted by a narrow 5:7 window near a = 0.1825. At a = 0.21–0.22 it jumps to 3:4. Above that it becomes irregular. This is the sine circle map's devil's staircase, heard.

### E. Decremental penetration and concealed conduction

No new engine rule is required. The compact AV node is modelled as a short chain of model-only sites (`audible: false`, `tissue: 'nodal'`), each with its own ERP, restitution and decrement. A wave that captures the first sites but blocks deeper in the chain leaves those sites refractory and silent. The next wave is delayed or blocked. This is concealed conduction. Wenckebach periodicity emerges from progressive decrement along the chain.

- The renderer and Lab derive a `concealed` annotation from the existing causal chain: a launch tree that ends in `activation_blocked` or `conduction_collision` without reaching an audible site.
- The mapper must return `null` for `audible: false` sites. This is the explicitly configured exception already allowed in handoff §6.2.

### F. Lesion formation

New command `ablate { target: linkId, durationMs, completeness: 0..1 }`. Over `durationMs` of simulated time, the engine raises the link's delay in both directions in steps of 250 ms of sim time, following delay × (1 + 3p²) for progress p. At p = completeness, the link is disabled if completeness = 1, and it stays closed until reset (`setLinkEnabled(true)` is rejected). If completeness < 1, it is left with a permanent extra delay. (The earlier "ERP floor on the link" was removed by lead decision in 11e: links have no refractoriness in this model.)

- Each step emits `parameter_changed` (`parameter: 'delayMs'`, `cause: 'lesion'`). The final block emits `link_changed`. A new event `lesion_changed { linkId, progress, completeness }` drives the visual lesion.
- Musically: a circulating phrase slows over a few laps, then stops at the line. An incomplete line conducts through its gap with a delay, and the phrase returns.

### G. New commands and events: summary

| Name | Kind | Payload | Emits |
| --- | --- | --- | --- |
| `stimulateTrain` | command | `nodeId, startMs, cycleMs, count, label` | One `stimulus_attempted` per pulse, `triggerId` = `<commandId>#<k>` |
| `cancelTrain` | command | `trainId` (the train's `commandId`) | Remaining pulses removed; `train_completed { cancelled: true }` with the partial `delivered` |
| `setAutonomic` | command | `value: { breathPeriodMs, depth, targets } \| null` | `parameter_changed` (`autonomic`) |
| `setTone` | command | `value` | `parameter_changed` (`tone`) |
| `ablate` | command | `target, durationMs, completeness` | `parameter_changed`, `lesion_changed`, `link_changed` |
| `applyAgent` | command | `agent: 'stillness' \| 'slow', doseScale` | `parameter_changed` per affected site (see Maneuvers) |
| `phase_modulated` | event | see §D |  |
| `lesion_changed` | event | see §F |  |
| `train_completed` | event | `commandId, trainId, delivered, count, cancelled` | Once per train, at completion or cancellation |

`setCoupling { couplingId, value }` is the parameter edit for §D. It emits `parameter_changed` with `parameter: 'coupling'`.

`setRestitution`, `setDecrement` and `setEntry` edit the §A, v1.0 decrement and §B parameters. They emit `parameter_changed` with the parameter name and generation (see The model made visible).

`stimulateTrain` lives in the engine so that a shared performance replays exactly from its command log. The UI must never synthesize trains with timers.

### Ordering within one instant (additions to contract step list)

1. Edits, now including `setTone`, `applyAgent` and lesion steps, apply in submission order before collisions.
2. Train pulses due at this tick enter the stimulus phase in train-command order, then pulse index.
3. Restitution (§A) is computed inside `determineOutcomes` from pre-capture state.
4. Entry slowing (§B) is computed at launch from destination state after all outcomes of the batch.
5. Coupling (§D) is applied after launches and before automatic schedules are finalized. A focus both reset and modulated in one batch is reset first, then modulated.
6. Overdrive (§C) updates suppression when outcomes are determined, and schedules with T + S at finalization.

### Required oracles (headless, before any study)

- [ ] **v1 regression:** A, B, C and `ring.json` traces unchanged under v1.1 code.
- [ ] **Restitution:** S1 train at 340 ms gives a stable ERP; at 300 ms ERP alternates, with the sequence matching a closed-form iteration.
- [ ] **Entry slowing:** an S2 scan in a ring yields a monotonic resetting curve; reentry cycle length varies lap to lap by less than 5 ms after the third lap.
- [ ] **Overdrive:** 30 pulses at 500 ms into an 800 ms focus give a 1250 ms return, then 1070, 962 and 897.2 ms (exact).
- [ ] **Compensatory pauses:** a premature stimulus into a non-reset focus gives a pause of exactly 2× cycle; a reset focus gives cycle + coupling interval.
- [ ] **Coupling:** a sweep of a from 0 to 0.25 over the Duality cycles reproduces the 2:3 and 3:4 plateaus within the stated ranges.
- [ ] **Concealed conduction:** a three-site nodal chain paced at a chosen cycle gives a 4:3 Wenckebach pattern with progressive prolongation, computed by hand.
- [ ] **Lesion:** a reentrant ring with a full ablation terminates on the first lap after p = 1; an incomplete ablation leaves reentry with a longer cycle.

## New studies

Study No. 2 is a cycle of eight studies played by one engine, ordered like a concert program. Each is a world preset plus optional guided protocols that enqueue only labelled stimuli. Echo is the reference study and is specified in full. The others list what differs from it.

| No. | Title (public) | Mechanism (Lab and liner notes only) | Musical idea | New engine features | Builds on |
| --- | --- | --- | --- | --- | --- |
| I | Prelude | Sinus rhythm, overdrive suppression, respiratory sinus arrhythmia | Fermata and accelerando; breath phrasing | C | Conduction v1.1 |
| II | Echo | Dual AV-nodal pathways, AH jump, echo beat, typical AVNRT | Arpeggio collapses into a rolled chord | A, B, E | Reference |
| III | Meter | Wenckebach periodicity vs infranodal 2:1 block | Meter emerges: 5:4, 4:3, 3:2 group beating | A, E | Echo nodal chain |
| IV | Ostinato | Macroreentrant atrial flutter, variable AV conduction, entrainment | A fast ostinato and its rhythmic reduction | A, B, E, F | Circulation, Meter |
| V | Retrograde | Accessory pathway: pre-excitation, orthodromic and antidromic AVRT | A melody and its retrograde; fusion timbres | A, B, E | Echo |
| VI | Ghost | Concealed conduction, linking, Ashman aberrancy | A voice silenced by its own echo | A, B | Conduction v1.1 |
| VII | Canon | Double-wave reentry | A round that settles into exact half-cycle imitation | A, B | Circulation |
| VIII | Hemiola | Modulated parasystole, phase-locking | Two tempi lock into 3:2, then 4:3 | C, D | Duality |

### Orchestration by tissue (applies to every study)

Timbre identifies tissue across the whole cycle, so a listener learns the "instruments" once. Pitch identifies the site within a study. The tonal vocabulary stays the v0.1 D-centred Dorian set (D F G A C, E for colour).

| Tissue | Voice | Register | Rationale |
| --- | --- | --- | --- |
| Atrial | felt, pluck | D4–D5 | Mid-register "upper staff" like HRA and CS channels |
| His–Purkinje | glass, quiet (gain ×0.6) | A5–D6 | The His deflection is small and sharp |
| Ventricular | bow | D3–A3 | Large, slow, low |
| Accessory | glass with a short bow layer | E5 | A distinct colour for the hidden path |
| Nodal, sinus | silent (`audible: false`) | n/a | Neither is recorded on intracardiac channels |

### II. Echo (reference study)

**Mechanism.** Two AV-nodal inputs: a fast pathway with a long ERP and a slow pathway with a short ERP join at a lower common pathway. A premature atrial impulse blocks in the fast pathway and conducts down the slow one (an AH jump). It can return up the fast pathway (an echo) or keep circling (typical slow–fast AVNRT).

**Musical behavior to obtain.** Sinus rhythm: atrium then ventricle about 115 ms later, an arpeggio. After a well-timed premature tap, the ventricle comes suddenly later (a suspension), then the atrium sounds once more (an echo, like an appoggiatura). A slightly earlier tap gives sustained circulation in which atrium and ventricle sound about 15 ms apart, a rolled chord repeating every 303 ms (CSp → SP → LCP → FP → CSp: 250 ms of base delay plus decrement).

**Sites.** Starting values; the tuning ticket must hit the windows in the oracle below.

| Site | Tissue | Audible | ERP / restitution (E\_max, A, τ) | Automaticity | Pitch / voice / pan |
| --- | --- | --- | --- | --- | --- |
| S | sinus | no | 200 | 800 ms, reset, overdrive g 0.06 | n/a |
| HRA | atrial | yes | 230, 60, 80 | none | D4 felt, −0.2 |
| CSp | atrial | yes | 230, 60, 80 | none | F4 pluck, +0.1 |
| FP | nodal | no | 300, 60, 120 | none | n/a |
| SP | nodal | no | 240, 40, 100 | none | n/a |
| LCP | nodal | no | 250, 60, 120 | none | n/a |
| H | hisPurkinje | yes | 360, 140, 150 | none | A5 glass, 0 |
| V | ventricular | yes | 250, 60, 80 | none | D3 bow, +0.15 |

**Links** (all bidirectional unless noted; delays in ms, decrement = maxExtra / τ, entry = maxExtra / τ).

| Link | Ends | Delay | Decrement | Entry | Note |
| --- | --- | --- | --- | --- | --- |
| SH | S→HRA | 25 | none | none | one-way |
| HC | HRA–CSp | 30 | none | 15 / 40 |  |
| CF | CSp–FP | 10 | none | 20 / 60 |  |
| FL | FP–LCP | 30 | 30 / 100 | 20 / 60 | fast pathway |
| CS | CSp–SP | 50 | none | 20 / 60 |  |
| SL | SP–LCP | 160 | 60 / 120 | 30 / 80 | slow pathway |
| LH | LCP→H | 40 | none | 10 / 40 | one-way antegrade |
| HV | H→V | 35 | none | 10 / 40 | one-way |

These values were tuned on the v0.1 engine (restitution off, His ERP 250 ms) while writing this spec. With a 600 ms drive from CSp, S2 at 300 ms conducts with an AH of 110 ms. At 296 ms it jumps to 288 ms (+178 ms). S2 from 280 to 240 ms starts sustained circulation with a cycle of 303 ms and CSp-to-V of 15–17 ms, against 116 ms in the driven rhythm. With restitution on, His E\_max 360 ms shortens to about 260 ms at that rate, so 1:1 conduction holds. The LH and HV links are one-way so the study isolates the nodal circuit. Retrograde ventricular conduction is not needed here (it appears in Retrograde).

**Guided protocols** (performer labels; EP name in Lab).

- "Find the echo": an 8-pulse train at 600 ms from CSp, then one premature pulse, stepping 10 ms earlier on each repeat. The Lab calls this "S1–S2 decremental atrial extrastimulus, drive 600 ms".
- "Find the chord": the same, with a second premature pulse (S3) if a single one does not sustain circulation.
- "Stillness" during circulation terminates it, because both limbs are nodal.

**Oracle (must hold before visual or audio tuning).**

- [ ] AH (CSp to H) for S2 at 600 ms drive rises smoothly by less than 40 ms between successive 10 ms steps, then jumps by at least 50 ms at the fast-pathway ERP. The Lab plots this as the classic discontinuous curve.
- [ ] At least one 20 ms-wide S2 window produces exactly one echo (a CSp activation caused by FP retrograde conduction).
- [ ] At least one S2 or S2–S3 combination produces circulation sustained for 60 s of sim time, with CSp-to-V interval between 10 and 60 ms.
- [ ] Stillness terminates sustained circulation within 3 laps. Termination is by block in a nodal site, never by a cut.

### I. Prelude (Conduction v1.1)

Conduction keeps its topology. ERP corrections from the audit apply (H 360 ms; bundle sites as in Ghost). Sinus gets overdrive suppression. "Hold a tempo" paces the atrium. Releasing it produces the fermata and accelerando from v1.1 §C. "Breath" toggles respiratory sinus arrhythmia (period 4000 ms of sim time, depth 0.05). Oracle: the overdrive numbers in §C, and with Breath on, RR intervals follow the modelled breath within one tick.

### III. Meter

Meter depends on v1.1 §B. On the v0.1 engine, the Conduction world paced from A conducts 1:1 at every drive cycle from 600 down to 280 ms (checked while writing this spec), because delay depends only on the source's recovery and the node's ERP is fixed. A prototype of the §B rule gives 1:1 down to 320 ms, 6:5 Wenckebach at 300 ms and 3:2 at 280 ms. Echo's nodal region is simplified to a single pathway of three silent sites (N1–N3, ERP 260/280/300, restitution on, decrement on N2–N3 links). "Hold a tempo" paces HRA at the cycle set by the player's tapping (tap-tempo, 280–800 ms). As cycle shortens, the AH interval lengthens beat by beat and a beat drops: 1:1, then 5:4, 4:3, 3:2, 2:1. The player hears a ritardando ending in a rest: meter born from decrement.

A second mode, "Sudden", raises H's ERP to 420 ms. The rhythm then drops beats without warning (2:1 infranodal block, no prolongation before the drop). Musically, the rest arrives with no ritardando.

Oracle: for drive cycles 600, 450, 400, 360, 330 and 300 ms the conduction ratios and the AH sequence within each group match a hand-computed table committed with the fixture.

### IV. Ostinato

A 10-site atrial ring (link delay 24 ms, one slower "isthmus" link of 45 ms; cycle about 260 ms with restitution) circulates. Ring site R0 connects to Meter's nodal chain, then H and two bundle sites, then V. The nodal chain filters the ring: mostly 2:1, with 3:1 and 4:1 groupings as tone and restitution shift. Atrial ring voices are short felt and pluck notes (high, quiet). The ventricle is a low bow: it plays a rhythmic reduction of the ostinato.

- **Stillness** removes the ventricular voice for about 6 s of sim time. The ostinato is heard alone, then the reduction returns.
- **Slow** (IC-like agent) lengthens ring conduction about 30%, so the cycle rises to about 340 ms. The nodal chain then conducts 1:1 and the ventricle doubles its rate. That paradox is the study's hidden turn; the Lab names it.
- **Ablate the isthmus**: the ostinato slows over 2–3 laps, then stops. An incomplete lesion leaves a slower ostinato.
- **Entrainment** (Maneuvers §): pacing from R0 (in the circuit) returns with PPI − TCL within 10 ms. Pacing from bystander site X (one link of 50 ms off R3) returns with PPI − TCL of about 100 ms.

Oracle: steady cycle 255–270 ms, ventricular ratio 2:1 at tone 0, 1:1 under Slow, termination within 3 laps after a complete isthmus lesion, and both entrainment values within the stated tolerances.

### V. Retrograde

Sites: HRA, CSp (septal atrium), CSd (lateral atrium), Meter's nodal chain, H, Vs (septal ventricle), Vl (lateral ventricle), and accessory pathway AP (tissue `accessory`, ERP 280, no decrement, no entry slowing) joining Vl and CSd. Links Vs–Vl and CSp–CSd carry the spread within each chamber.

- **Sinus with pre-excitation:** Vl is reached through AP before the nodal route arrives. Vs is then captured by both wavefronts in one batch (`source: 'mixed'`), heard as a Fusion timbre (Audio §). Stillness blocks the node, not AP: the ventricle is then fully pre-excited and the Fusion colour disappears.
- **Orthodromic circulation** (down the node, up AP) from an atrial premature tap that blocks in AP. Melody: CSp, H, Vs, Vl, CSd. Lateral atrium is earliest, so the Staves view shows an eccentric atrial contour.
- **Antidromic circulation** (down AP, up the node) from a ventricular premature tap that blocks retrogradely in the node. Melody: CSd, Vl, Vs, H, CSp: the same notes in retrograde.
- **His-refractory extrastimulus** during orthodromic circulation: a tap on Vl when H is refractory still advances CSd, which proves the hidden path. The Lab marks it.

Oracle: both circulations sustain for 60 s; their site orders are exact reversals over the shared sites; the His-refractory tap advances CSd by at least 10 ms; Stillness terminates both circulations, since each uses the node, but leaves sinus pre-excitation through AP intact.

### VI. Ghost

Conduction v1.1 with right and left bundle sites (RB ERP 400 ms, LB 340 ms, restitution on), two ventricular sites (RV, LV) and a transseptal RV–LV link of 60 ms. RB links are bidirectional, so retrograde invasion is possible.

- **Linking.** Pacing at 380 ms blocks in RB. RV is activated late from LV; that wave invades RB retrogradely and silently, which keeps RB refractory at the next beat. RB stays silent for as long as pacing continues. One longer interval (a single skipped pulse, the "Rest" gesture) releases it.
- **Ashman.** With Breath or tone producing a long interval followed by a short one, the long cycle lengthens RB's ERP through restitution and the short beat is aberrant.
- Concealed penetrations are drawn as faint waves that die (Views §).

Oracle: under 380 ms pacing RB is silent for every beat after the first block, until one interval of at least 600 ms; then normal conduction resumes on the next beat.

### VII. Canon (Circulation v1.1)

The 8-site ring keeps 60 ms links but gains restitution (E\_max 220, A 80, τ 60) and entry slowing (20 / 60). One ring segment is direction-dependent: link L3 conducts R3→R4 only, modelling unidirectional block from source–sink mismatch. A second wavefront can then enter only where its backward component is stopped by L3 before it can collide with the first wave.

- A stimulus in the excitable gap on the correct side of L3 starts a second wave following the first. The cycle per site halves, and each site sounds twice per lap: two voices in canon.
- Entry slowing makes the trailing wave slow when it is too close to the leader and speed up when far, so spacing converges to half a lap within a few laps. The round settles into exact imitation. If the second wave is too close, it dies in refractory tissue and the canon collapses back to one voice.

Oracle: after a gap stimulus in the valid window, inter-wave spacing at R0 converges to 50% ± 2% of the lap within 8 laps; outside that window, one wave survives. Steady single-wave ERP and cycle match the restitution fixed point.

### VIII. Hemiola (Duality v1.1)

Duality keeps its two groups and cycles (A 720 ms, B 1030 ms). Focus B becomes protected, and a coupling entry links A to B. The performer control "Listen to each other" sets coupling a from 0 to 0.25. Uncoupled, the voices phase as in v0.1. At a ≈ 0.155–0.205, they lock 2:3 (a hemiola); the default marker sits at 0.17. At 0.21–0.22 they lock 3:4. Higher values give irregular modulation. The Lab draws the locking ratio against a (a devil's staircase) and marks where the player is.

Oracle: the coupling sweep in Engine §D, run on the production engine.

## Performer maneuvers and gestures

Every maneuver is a gesture that produces ordinary engine commands, so it replays exactly from the command log. The visible label is musical. The accessible name explains the action in one sentence. The Lab names the EP maneuver and reports its measurements.

### Gesture map

| Gesture (visible label) | Touch | Keyboard | Engine commands | Lab readout | EP name (Lab only) |
| --- | --- | --- | --- | --- | --- |
| Touch | Tap a site | Enter or Space on a focused site | `stimulate` | Captured / blocked, coupling interval | Single extrastimulus |
| Hold a tempo | Tap 3–4 times on a site, then press and hold | `P` on a focused site starts; `P` again stops | `stimulateTrain` (cycle = median tap interval), `cancelTrain` on release | Drive cycle, capture ratio | Incremental pacing / drive train |
| A quick answer | While holding, tap the same site with a second finger, or press `E` | `E` | `cancelTrain`, then one `stimulate` at the chosen coupling interval | S1, S2 (and S3) in ms | Programmed extrastimulation |
| Rest | Lift for one beat and press again | `R` while pacing | `cancelTrain`, new `stimulateTrain` 2× cycle later | Long–short sequence | Pause / long–short sequence |
| Stillness | Press and hold the open centre of the canvas for 600 ms | `S` | `applyAgent { agent: 'stillness' }` | Nodal block duration, unmasked rhythm | Adenosine-like transient AV-nodal block |
| Slow the current | Lab or performer menu | menu | `applyAgent { agent: 'slow' }` | Conduction time per link, cycle change | Class IC-like sodium-channel slowing |
| Breath | Toggle | `B` | `setAutonomic` (world `autonomic` on/off) | RR variability | Respiratory sinus arrhythmia |
| Draw a line | Swipe across a link | Connection list: "Apply lesion" | `ablate` (each pass adds completeness 0.5) | Lesion progress, gap / complete | Radiofrequency lesion |
| Listen to each other | Slider (Hemiola only) | Arrow keys | `setCoupling` (parameter edit on `coupling[].amplitude`) | Locking ratio | Electrotonic modulation |

Safety rules for every train. A train holds at most 64 pulses and its cycle is at least 150 ms of sim time. It is cancelled on pointer release, `pointercancel`, page hide, world switch and reset. No gesture can leave pacing running unattended, as handoff §2.3 requires.

### Tap-tempo detail

- The pacing cycle is the median of the last 3 tap intervals in wall time, divided by the current dilation to give sim ms. It is clamped to 250–1200 ms and rounded to 10 ms so Lab values read cleanly.
- During the hold, a faint metronomic tick is **not** played. The only sound is the tissue's response, including silence for blocked pulses.
- If taps are too irregular (interquartile range above 25% of the median), the train does not start and the site shows the neutral "awaiting" ripple.

### Entrainment and the return

Hold a tempo 10–40 ms faster than a circulating rhythm, then release. The Lab detects the maneuver and measures it:

1. Before pacing, TCL = median of the last 5 cycles at the paced site.
2. Capture = 3 consecutive cycles at the paced site equal to the pacing cycle (±1 tick), with no change in activation order along the circuit.
3. At release, PPI = time from the last paced stimulus to the next activation at the paced site. The Lab shows PPI − TCL in ms.

On the canvas, a return within 20 ms draws a thin gold arc closing around the paced site, as if the phrase had come home. A long return draws nothing. The player learns, without being told, where the music lives. Expected values are in the Ostinato oracle. The Lab labels this "entrainment in a lumped-element model", not a clinical criterion.

### The cadence after stopping

After ventricular pacing with 1:1 retrograde conduction during a circulating rhythm, the Lab classifies the first notes after release as V–A–V or V–A–A–V. The atrial tachycardia variant in Unknown studies gives V–A–A–V. Echo and Retrograde give V–A–V. Musically, the mechanism is named by its cadence.

### Stillness (adenosine-like agent)

`applyAgent` drives an envelope e(t) from 0 to 1 over 1500 ms of sim time, holds for 2000 ms and decays to 0 over 6000 ms. It is applied in 100 ms steps, each a `parameter_changed` with `cause: 'agent'`:

- `nodal` sites: ERP + 600 ms · e, enough to block at any physiological rate at the peak.
- `sinus`: cycle × (1 + 0.5 e).
- `atrial`: ERP × (1 − 0.2 e). This shortening is real and is noted in the Lab.
- `accessory`, `hisPurkinje`, `ventricular`: unaffected.

The canvas dims its background by 6% at the envelope's peak, the only visual cue. No sound is added.

### Slow the current (IC-like agent)

Non-nodal link delays × (1 + 0.3 · dose · (1 + max(0, (400 − CL) / 400))), where CL is the preceding cycle at the link's source. This use dependence slows fast rhythms more than slow ones. Applied over 3000 ms of sim time and persistent until reset. It produces the Ostinato 1:1 paradox.

### His-refractory extrastimulus (Retrograde)

When the player presses and holds Vl during a circulating rhythm, a faint arc on H shows its current refractory window, with no numbers. Releasing inside it delivers the stimulus. The Lab reports "His refractory at delivery: yes" and the atrial advance in ms. If CSd advances, the Lab draws the accessory pathway, which was hidden until then.

### Lesions and line verification

- A first pass over a link applies `ablate` with completeness 0.5 over 2000 ms of sim time: conduction slows. A second pass completes it.
- **Verification:** after a lesion, the Lab offers "Pace each side". It paces the sites on each side of the line in turn and reports the conduction time across it. Block is confirmed when the time across equals the long way round, within one link delay. On the canvas, the wave visibly travels the long way.
- v0.1 instant swipe-to-cut remains in Circulation and Conduction (`lesionModel: 'instant'`), so v0.1 behavior is preserved.

## Visual modes

Study No. 2 adds two full views beside Network (Ladder and Staves), one overlay (Map), one interaction (Listening catheter) and two Lab panels (Return plot, Staircase). All of them read the same event stream and snapshots as Network. None may draw anything the engine did not emit. The design system in handoff §8.1 still applies: near-black ground, gold for antegrade and warm sites, cool blue for retrograde and cool sites, fine lines, generous space.

The concept plates at the end of this section show intent, not final pixels. Plates 1–3 and the jump curve in plate 4 come from real runs of the v0.1 engine (`src/engine`) with new world definitions. The other Lab panels use small prototypes of the v1.1 rules written for this spec.

### View switcher

A quiet three-word switch under the title: **Network · Ladder · Staves**. Switching never touches the simulation. The URL fragment remembers the view (`#view=ladder`). On phones, Ladder and Staves rotate to use the long edge when the device is landscape.

### Ladder (a Lewis diagram as graphic score)

The Ladder view is the signature image of Study No. 2. EPs read it as a ladder diagram; everyone else reads a graphic score.

- **Tiers.** Each world declares `display.tiers`: an ordered list of rows, each naming the sites it holds (Echo: A, AV node fast, AV node slow, His, V). Ring worlds use one tier per ring site, so reentry draws as a helix.
- **Time** runs left to right. The playhead sits at 72% of the width; the past scrolls left. The window is 3000 ms of sim time by default (Lab: 1500–6000 ms).
- **Marks.** Activation = a small dot on its tier at the event time, with a hairline "note stem". Conduction = a line from departure to arrival, so slope is delay: steep is fast, shallow is slow. Antegrade lines are gold, retrograde lines cool blue. Block = the line ends in a short perpendicular bar (the classical ladder notation). Concealed penetration = a dashed line that ends mid-tier with no bar. Collision = two lines meeting at a soft point, no continuation. Stimuli = a small open triangle above the top tier.
- **Annotations** (Lab on only): intervals in ms between selected marks; tier names in EP terms.
- **Data path.** `conduction_launched` gives departure and arrival; `activation`, `activation_blocked`, `conduction_collision` and `conduction_canceled` give the endpoints. Positions are pure functions of event times. The renderer never infers delay from geometry.

### Staves (intracardiac channels as a score)

- One staff per audible site, ordered as EP channels from top to bottom (HRA, His, CS proximal to distal, RV or ventricle). The order comes from `display.staves` in each world.
- Each activation draws a synthetic electrogram kernel centred on its onset: atrial biphasic (40 ms), His spike (12 ms, small), ventricular (80 ms, large). Kernels are deterministic and labelled synthetic in the Lab. A note head sits on the staff at the onset.
- Coronary-sinus staves make activation order visible as contour: a septal-first chevron in sinus rhythm, an eccentric slope during orthodromic circulation in Retrograde.
- **Calipers.** Drag horizontally on the staves to place two hairlines. The readout shows the interval in sim ms and, when a reference interval is selected, the ratio rounded to the nearest simple fraction (2:3, 3:4). Calipers are the shared tool of EP and rhythm.

### Listening catheter

Drag from empty canvas (or use the Lab's "Listen from" list) to move a listening point, drawn as a small ring with two thin bands like a bipolar tip. Each site's sound is then shaped by its distance d from the point (see Audio § for the model): nearby sites are present and crisp, distant sites far and soft. Without a listening point the mix is the v0.1 default. The point is stored per world and in shared performances.

### Map (activation overlay)

A toggle colours each site and link by local activation time relative to a reference site, using a gold–ivory–blue ramp (no rainbow). In a circulating rhythm the colours span the whole cycle, and the seam where earliest meets latest rotates with the wave. The overlay redraws once per cycle so it never flickers.

### New semantic marks in Network

| Event | Mark |
| --- | --- |
| Concealed penetration | A dim, dashed travelling point that fades out mid-link; no ripple at a site |
| `lesion_changed` | The filament breaks into small darker beads; during formation a faint warm glow; complete = visible gap |
| `phase_modulated` | A hairline arc between the two foci brightens for 200 ms |
| Mixed-source capture (fusion) | The site's halo shows two half-rings in the two incoming colours |
| Double potential at a line | Two concentric flash rings at the flanking site, separated by the measured interval |
| Entrainment return within 20 ms | A thin gold arc closes around the paced site (Maneuvers §) |

### Lab panels

- **Return plot (Poincaré).** Interval n against interval n+1 for a chosen site, last 200 intervals, points fading with age. Sinus is a tight cluster, Wenckebach a short repeating cycle of points with one long pause, bigeminy two points, Hemiola locking a small closed set.
- **Staircase.** Hemiola only: the locking ratio against coupling a, precomputed by running the engine headlessly at 100 values of a. The player's current setting is a gold marker.
- **Curves.** Echo: AH against S2 (the jump curve). Every world with restitution: ERP against DI for the selected site, with the live point.

### Concept plates

The plates follow, in the order the views are described above.

&#91;image: Ladder view of Echo: a driven arpeggio, a premature touch that blocks in the fast pathway, the jump down the slow pathway, then sustained circulation\]

*Plate 1 · Ladder · Echo.* Engine run of the Echo topology. Driven beats play as an arpeggio (116 ms from septal atrium to ventricle). The premature touch blocks in the fast pathway (bar), conducts down the slow one (the jump) and returns up the fast pathway in blue. Circulation then plays atrium and ventricle together every 303 ms. Open rings are silent nodal sites; the hairline is the playhead.

&#91;image: Staves view of Echo: high atrium, His, septal atrium and ventricle as staves with synthetic electrograms, note heads and two calipers\]

*Plate 2 · Staves · Echo.* The same run on intracardiac-style staves, with the pitch of each voice under its name. Calipers read 116 ms in the driven rhythm and 303 ms with A : V at 1 : 1 during circulation.

&#91;image: Activation map of Ostinato: a ten-site ring coloured from gold (earliest) to blue (latest), an isthmus, a listening point with field rings, and a silent nodal chain leading to His and ventricle\]

*Plate 3 · Map · Ostinato.* Engine run of a 10-site ring (24 ms links, 45 ms isthmus): cycle 261 ms, ventricle every 522 ms (2 : 1). Colour is local activation time over one cycle; the seam where early meets late is where the wave closes on itself. The listening point is drawn with its field.

&#91;image: Laboratory panels: the AH jump curve, return plots for breath, Wenckebach, and Hemiola drifting and locked, and the Hemiola staircase\]

*Plate 4 · Laboratory.* The jump curve is from the v0.1 engine (+178 ms at S2 = 296 ms). Meter and Hemiola panels use small prototypes of v1.1 §B and §D written for this spec. The staircase shows the 2 : 3 plateau, the narrow 5 : 7 window near 0.18 and the 3 : 4 plateau; the gold marker is the default coupling.

## The model made visible

Every rule the engine uses can be seen, measured and changed. Each curve shows the parameter law as a line and the engine's own events as dots, so the model checks itself in plain view. This is where an EP spends time once the music has drawn them in.

### Three layers of access

1. **Site and link inspector.** Press and hold a site or link (or choose it from the connection list) to open a card. It shows live state (last activation, refractory until, recovery, current DI, current ERP or conduction time) and the governing curve with a live point. Handles on the curve and number fields edit parameters. "Study default" restores them.
2. **Protocol runner (Lab).** Standard protocols run headlessly and plot their results. The main study keeps playing.
3. **Plots.** A fixed catalog, below, reachable from the inspector, the runner and the Lab.

### Plot catalog

| Plot | Axes | Line (model) | Dots (engine) | Where |
| --- | --- | --- | --- | --- |
| Refractory restitution | DI → ERP | §A law for the site | Every capture: (DI, ERP) | Inspector, any site with restitution |
| Alternans cobweb | ERP(n) → ERP(n+1) at a chosen drive cycle | Restitution map and identity line | The iteration the engine actually produced | Inspector, "Fixed drive" toggle |
| Conduction restitution and decrement | Recovery → conduction time | Base delay + source decrement + entry slowing | Every launch on the link | Inspector, any link |
| S1–S2 conduction curve | A1–A2 → A2–H2 | none | Runner results | Lab, Echo and all AV studies |
| S1–S2 output against input | A1–A2 → H1–H2 (or V1–V2) | Identity line | Runner results, ERPs marked | Lab |
| Incremental pacing | Drive cycle → AH and conduction ratio | none | Runner results; Wenckebach cycle marked | Lab, Meter and Prelude |
| Resetting curve | Coupling interval → return cycle | Fully reset and fully compensatory reference lines | Runner results | Lab, circulating studies |
| Entrainment map | PPI − TCL drawn at each pacing site on the network | none | Runner results | Lab, Ostinato and Unknown |
| Phase response and staircase | Phase → shift; coupling → locking ratio | §D sine law | Every `phase_modulated` event; runner sweep | Lab, Hemiola |
| Ladder and Staves | Time | none | Live events | Views |

ERPs are marked by rule, not by hand. ERP is the longest coupling interval that fails to capture or conduct at that site. Functional refractory period is the shortest output interval. A jump is an increase of at least 50 ms for a 10 ms shorter coupling interval. Detection functions live in `src/lab/measure.js` and are unit-tested.

### Protocol runner

| Protocol | Inputs | Output |
| --- | --- | --- |
| S1–S2 (and S3) | Site, drive cycle, drive count, S2 range and step | Conduction and output curves; atrial, fast-pathway, slow-pathway and AV-nodal ERPs; jump |
| Incremental pacing | Site, cycle range and step, beats per step | AH and ratio by cycle; Wenckebach cycle |
| Burst | Site, cycle, count | Whether a rhythm sustains |
| Resetting | Site, coupling range during circulation | Resetting curve, termination window |
| Entrainment | Each candidate site, cycle = TCL − 20 ms | PPI − TCL per site |
| Coupling sweep | Range and step of a | Staircase |

- The runner uses `runProtocol(world, protocol)` in `src/lab/protocols.js`. It builds a fresh engine for each step from the current world parameters, not from live state, so results are deterministic. It runs in a Web Worker with a progress bar. Each step is capped by the existing processing budget.
- Results can be exported as CSV and are stored in the performance file, so a shared link reproduces the plots.
- An S1–S2 run takes a few hundred engine runs of a few seconds of sim time each. On Echo that is well under a second of compute on a laptop; mobile can use a coarser step.

### Editing the model

- New commands: `setRestitution { nodeId, erpMaxMs, amplitudeMs, tauMs, erpMinMs }`, `setDecrement { linkId, direction, maxExtraMs, tauMs }` and `setEntry { linkId, direction, maxExtraMs, tauMs }`. With `setNodeERP`, `setDirectionDelay`, `setAutomaticity` and `setCoupling`, every handle maps to a logged command, so edits are replayable and shareable.
- Edits apply prospectively at the next committed boundary, as v1.0 edits already do. Ranges follow handoff §5.4, extended for the new fields.
- A site or link that differs from its study default shows a small open ring on the canvas, so altered models are never mistaken for the preset.
- Each curve has a one-line *Model note* (for example, "Entry slowing is computed at launch from the tissue state at that moment").

### Accessibility

Every plot has a data-table alternative and a one-sentence text summary ("Jump of 178 ms at 296 ms"). Handles are operable with arrow keys (1 ms steps, 10 ms with Shift).

### Oracles

- [ ] The S1–S2 runner on Echo reproduces the values in plate 6: jump at 296 ms (+178 ms), fast-pathway ERP 296–300 ms, slow-pathway block at 232–236 ms, atrial ERP 228–232 ms.
- [ ] For every curve, the engine's dots lie on the parameter line within 1 tick.
- [ ] Changing a parameter by handle, then replaying the performance file, gives an identical event trace.

### Concept plate

Plate 6 shows the inspector card, the S1–S2 output curve and the conduction curve from the Echo engine run, with the music layers below.

&#91;image: Model panels: a fast-pathway restitution curve with editable handles and a live point; an S1–S2 output-against-input curve with atrial, slow and fast ERPs marked; a slow-pathway conduction curve with engine dots on the parameter line; and a row of music chips with a hemiola card\]

*Plate 6 · Model, visible and adjustable.* The S1–S2 curve and conduction dots are v0.1 engine runs of Echo: H1–H2 jumps where the fast pathway fails (296 ms), conduction stops at the slow-pathway ERP, and every slow-pathway launch sits on its decrement curve. The restitution card shows the v1.1 §A parameters with handles. Below, gold chips are plain musical words and blue chips open a two-sentence card.

## Audio design additions

The audio rule from v0.1 is unchanged: one accepted activation produces at most one note, at its exact onset. Study No. 2 changes how a note sounds according to where you listen and how the site was reached. It never adds attacks.

### Listening model (near field and far field)

An electrode records local activation sharply and distant activation as a smaller, slower, low-frequency signal. The listening model applies the same physics to sound. For a site at normalized distance d from the listening point (d₀ = 0.18 of the scene's shorter side):

```latex
g(d) = \frac{1}{1 + (d/d_0)^{k}}, \qquad f_c(d) = 600 + 7400\, g(d)\ \text{Hz}, \qquad \mathrm{send}(d) = \mathrm{send}_0 + 0.25\,(1 - g(d))
```

- k = 3 in **Close** listening, the bipolar-like default. k = 2 in **Wide** listening, which lets far-field activity bleed in as unipolar recordings do.
- g scales gain, f\_c sets a one-pole low-pass applied when the note is rendered, and send raises reverberation with distance. A distant site therefore sounds farther away, not just quieter.
- These values extend `NoteIntent` with an optional `listen: { gain, cutoffHz, sendAdd }`, computed in `mapActivation` from the listening point. Offline renders therefore stay reproducible from the command log.
- **Double potentials emerge on their own.** With the listening point beside a complete lesion line, the near site plays loudly and the site across the line plays softly and later, as its far field. No extra note is created.
- **Palette rationale.** Minimalism is close to bipolar listening (dry, local). Atmosphere is close to unipolar (diffuse, far field everywhere). The liner notes can say so.

### Fusion

When an activation has `source: 'mixed'` or more than one `incomingLinkIds`, the mapper sets `blend: { voice, amount: 0.3 }`. The second voice belongs to the tissue of the other incoming link (for example, an accessory-pathway glass layer over the ventricular bow). Synthesis renders both partial sets into the same single buffer, so it is still one voice resource and one onset. In Retrograde, pre-excited beats therefore have a recognizable colour that disappears under Stillness.

### Silence carries the mechanism

- Concealed penetrations, blocked attempts and `audible: false` sites produce no sound.
- Stillness, Slow and lesion formation produce no sound. Their effects are heard only as changed timing and missing notes.
- Entrainment's gold arc and every Lab readout are silent.

### Expression from tissue state (extends handoff §6.4)

- `recoveryBefore` still shapes gain, brightness and release.
- With restitution, `erpMs` at capture additionally sets release, scaled ±15% around the site's resting ERP. Alternans is then audible as an alternating long–short resonance, not only as timing.
- His–Purkinje notes keep a fixed gain ×0.6 so they never mask atrial and ventricular voices.

### Audition gates

`tests/music-offline.js` gains one fixed command log per study, rendered at 3×, 4× and 5× dilation in each palette. Each render is signal-checked: peak, onset alignment within 1 ms of `tMs` × dilation, and no attack without an activation. Human listening stays a separate verdict, recorded by the creator as in ticket 08. No agent may report that it listened.

## Unknown studies (hidden-substrate puzzles)

An Unknown study plays a living rhythm on wiring the player cannot fully see. The player probes it with the same gestures, finds where the music lives and silences it with as few lesions as possible. EPs will recognize an EP study; others play a listening puzzle. It is the coda of the cycle and the main reason to return.

### Generation

- A seeded generator (`#unknown=<seed>`, plus one daily seed) picks a mechanism template and draws its parameters from ranges that the template's oracle has validated.
- Templates for v1: typical AVNRT (Echo topology), orthodromic AVRT through a concealed accessory pathway (retrograde-only AP), focal atrial tachycardia (an automatic atrial focus), isthmus-dependent flutter (Ostinato), and a ring with a bystander branch.
- All sites are visible. Some links are hidden: drawn identically to decorative topology echoes, so the player cannot tell which threads conduct. Site positions are drawn from the template's layout with seeded jitter, so the geometry stays beautiful.
- **Solvability check.** Before a seed is offered, the generator runs headlessly: the rhythm must be inducible with a standard protocol, and at least one set of at most two lesions must make it non-inducible without causing complete block. Seeds that fail are skipped deterministically.

### Play

1. The study opens already circulating (it is started by a labelled guided induction, visible in the event log).
2. The player probes with Touch, Hold a tempo, entrainment returns, Stillness and the Staves calipers.
3. Draw a line places a lesion. A budget of 4 lesion passes is shown as four small marks.
4. When the rhythm stops, the study runs its hidden induction protocol (drive train, single and double extrastimuli, burst). If nothing sustains, the study is resolved. If something does, the music returns and the probing continues.

### Consequences, all emergent

- A lesion on the normal pathway (the node or His) gives complete block. A slow ventricular escape focus (automaticity at 1500 ms, protected only by refractoriness) then takes over: a lone, slow bass. This counts as a failed outcome but is not fatal; Reset restores the study.
- An incomplete line slows but does not stop the circuit, and the player hears the cycle lengthen.

### Scoring and reveal

- Score = lesion passes used, plus a penalty for collateral block. There is no timer.
- On resolution, hidden links fade in over 2 s. The Ladder view replays the whole session at 8× speed, and a liner card names the mechanism in one line with a link to its liner notes.
- A result string (`Unknown 0412 · 2 lesions · no collateral`) can be copied. It carries the seed and score only, never the solution.

## Presentation and sharing

The project should read as an interdisciplinary study as well as an instrument. That means program notes, exact replay and exports musicians and EPs can use elsewhere, all without breaking the single-file, no-network rule.

### Liner notes

Each study has notes opened from a small "Notes" link beside its title. They show in a reading sheet set in the system serif at a 62-character measure. They are bundled in the HTML. The structure is fixed; the text is the creator's to write. Agents draft placeholders only and mark them as drafts.

1. **The musical idea** (2–3 sentences, no EP terms).
2. **What the tissue is doing** (the mechanism, named, in plain language).
3. **How the model makes it** (which sites, which v1.1 mechanisms, one sentence on what is simplified).
4. **A note from history** (one anchor, such as Mines' rings for Canon or Lewis's ladder diagrams for the Ladder view).
5. **Try this** (one gesture, phrased as an invitation).
6. **Further reading** (two or three references from the list at the end).

### Shareable performances

- Because the engine is deterministic, a performance is fully described by: contract version, study and seed, view, palette, voicing, dilation, listening point, and the timestamped command log.
- Encode it as JSON, compress with the browser's built-in `CompressionStream('deflate-raw')`, and base64url-encode it into the fragment: `#p=<data>`. The fragment never leaves the browser, so the file still makes no network requests.
- Opening such a link starts the study paused at t = 0 with a "Play performance" action. Commands are replayed by sim time; the player can take over at any moment, which forks a new log.
- Above 6 KB of encoded data, offer a `.counterpoint.json` file download instead. The v0.1 Lab export becomes this format, with `kind: 'performance'`.

### Exports

| Export | Format | Contents | Notes |
| --- | --- | --- | --- |
| Score | MIDI (SMF type 1) | One track per audible site, named by site; note = mapped pitch; velocity from gain; length from release | 60 bpm, 1000 PPQ, so 1 tick = 1 ms. Choose sim time or wall time at the current dilation |
| Ladder plate | SVG | The current Ladder window or a full session, with title, study, seed and date as a colophon | Print-ready at A3; fonts are system fonts converted to paths |
| Staves plate | SVG | Synthetic electrograms, note heads and caliper marks | Labelled "synthetic electrograms" in the colophon |
| Audio | WAV | Offline render of the performance | Uses the existing offline renderer |
| Performance | JSON | As above | Replaces the v0.1 Lab export |

### GitHub Pages

The Pages site currently renders `README.md` as its landing page rather than opening the instrument. Change that:

- Add a build step that writes `site/index.html` as a title plate (wordmark, "Study No. 2", one epigraph line, the eight study titles as a quiet program, and **Enter**). Enter opens the instrument, and "Notes" opens an essay page.
- Publish `dist/counterpoint.html` at `/play/` and keep the standalone download link for offline use.
- Deploy from a GitHub Actions workflow that runs `npm test` and `npm run build` before publishing. A failed gate blocks deployment.
- Add an Open Graph image: a Ladder plate of Echo at 1200×630.

&#91;image: Title plate for GitHub Pages: COUNTERPOINT, Study No. 2, an epigraph, the eight study titles with one-line musical descriptions, Coda Unknown, an Enter button, and a luminous ring\]

*Plate 5 · Title plate.* The proposed Pages landing: wordmark, epigraph from the handoff, the program with each study's musical idea (no EP terms), and Enter. The ring on the right is a live, quiet Circulation running in silence until Enter.

## Roadmap

Study No. 2 ships in four phases behind four gates. Contract v1.1 comes first and blocks everything else. Views and audio can then run in parallel with the studies. Ticket numbers continue the repository's sequence (00–10), and each ticket writes a receipt under `docs/runs/` as v0.1 did.

&#91;embedded content: Study No. 2 roadmap · 4 phases, 4 gates\]

Nothing starts before G1. Views and audio (14a–14c) run beside phases 2 and 3 and must land before G3.

| Ticket | Phase | Work | Depends on | Evidence required |
| --- | --- | --- | --- | --- |
| 11a | 1 Contract | v1.1 schemas, `readWorld` accepting v1.0 and v1.1, lead decision record | none | Schema tests, v1 fixtures unchanged |
| 11b | 1 Contract | Restitution (A), entry slowing (B), phase-4 and tone (C) | 11a | Restitution, entry, overdrive and pause oracles |
| 11c | 1 Contract | Coupling (D), lesion (F), `stimulateTrain`, `applyAgent`, `setCoupling`, new events | 11a | Coupling sweep, lesion and train oracles |
| 11d | 1 Contract | Concealed-chain fixture (E), ordering regression, budget limits for trains | 11b, 11c | Wenckebach 4:3 oracle; G1 report |
| 12a | 2 Echo | Echo world and its tuning to hit the oracle windows | G1 | Echo oracle, AH jump curve JSON |
| 12b | 2 Echo | Ladder view renderer | G1 | Native-canvas trace parity: every mark traced to an event ID |
| 12c | 2 Echo | Hold a tempo, A quick answer, Rest, Stillness gestures | G1 | Gesture-to-command tests, safety rules |
| 12d | 2 Echo | Orchestration by tissue, `audible: false`, mapper v1.1 | G1 | Offline renders signal-checked |
| 13a–g | 3 Studies | Prelude, Meter, Ostinato, Retrograde, Ghost, Canon, Hemiola (one ticket each) | G2 | Each study's oracle; offline render per study |
| 13h | 3 Studies | Entrainment detection, cadence classifier, His-refractory helper, lesion verification | 13c, 13d | PPI − TCL and VAV fixtures |
| 14a | 3 Views | Staves and calipers | G1 | Kernel determinism; caliper ratios |
| 14b | 3 Views | Listening catheter and Fusion blend | 12d | Gain and cutoff unit tests; offline renders |
| 14c | 3 Views | Map overlay, Return plot, Staircase, Curves | G1 | Each panel traced to events |
| 15a | 4 Release | Unknown studies generator and solvability check | G3 | 1000 seeds validated headlessly |
| 15b | 4 Release | Liner notes structure and drafts (creator writes final text) | G3 | Notes render offline |
| 15c | 4 Release | Shareable performances, MIDI and SVG exports | G1 | Round-trip replay identical; MIDI onsets within 1 ms |
| 15d | 4 Release | Pages landing, `/play/`, Actions deploy, OG image | 15c | Deploy blocked by failing gate |

**Gates.**

- **G1 Contract:** every v1 fixture is unchanged and every v1.1 oracle passes.
- **G2 Reference study:** the Echo oracle passes, Ladder marks trace one-to-one to events, and the creator has listened to Echo at 4×.
- **G3 Cycle:** all eight study oracles pass and every study has a signal-checked offline render.
- **G4 Release v0.2:** the live browser matrix and 10-minute soak pass, physical mobile review is done and the creator's listening verdict is recorded. These are the open items carried from v0.1 ticket 07b.

**Tickets for legibility and the model.** These join phase 3 and must pass before G3.

| Ticket | Work | Depends on | Evidence required |
| --- | --- | --- | --- |
| 14d | Site and link inspector, handles, `setRestitution` / `setDecrement` / `setEntry` | 11b, 11c | Handle edits replay identically; dots on lines within 1 tick |
| 14e | Protocol runner in a Web Worker, `measure.js` detection rules, CSV export | 11d | Echo S1–S2 values from plate 6; detection unit tests |
| 14f | Plot catalog (restitution, cobweb, conduction, S1–S2, incremental, resetting, entrainment map, phase response) | 14e | Each plot traced to events or runner rows; data-table alternatives |
| 14g | Glossary, music cards, Hear it / Show the beats, plain subtitles | 12b | Copy tests: one layer 2 term per study, chips present, sentences under 20 words |

### Agent assignments (model and effort)

Each ticket runs as its own agent with the model and effort below. A lead session coordinates, merges and checks gates. Effort is spent where an error would spread: the engine contract and the oracles.

| Wave | Tickets | Agent | Model | Effort | Starts when |
| --- | --- | --- | --- | --- | --- |
| 0 | 11a–11d | Contract engineer | Opus 5.5 | xhigh | Now |
| 0 | 14g (content only: glossary JSON, subtitles, liner-note scaffolds) | Copy writer | Sonnet 5.5 | medium | Now (no engine dependency) |
| 0 | 15d (Pages landing, `/play/`, Actions deploy) | Web engineer | Sonnet 5.5 | medium | Now |
| G1 review | 11a–11d diff | Independent reviewer: re-derives oracle numbers | Opus 5.5 | high | After wave 0 contract work |
| 1 | 12a, 13a–13g (study worlds and oracles) | Study tuner | Opus 5.5 | high | G1 |
| 1 | 12b, 14a, 14c (Ladder, Staves, Map, Lab panels) | Renderer engineer | Sonnet 5.5 | high | G1 |
| 1 | 12c, 12d, 14b (gestures, mapper v1.1, listening, fusion) | Interaction and audio engineer | Sonnet 5.5 | high | G1 |
| 1 | 14d, 14e, 14f (inspector, protocol runner, plots) | Lab engineer | Opus 5.5 | high | G1 |
| 1 | 13h (entrainment, cadence classifier, His-refractory helper) | Maneuver engineer | Opus 5.5 | high | 13c, 13d |
| 2 | 15a (Unknown generator and solvability) | Puzzle engineer | Opus 5.5 | high | G3 |
| 2 | 15b, 15c (liner notes UI, sharing, MIDI and SVG export) | Web engineer | Sonnet 5.5 | medium | G1 |
| Each gate | G2, G3, G4 | Independent reviewer | Opus 5.5 | high | Gate candidate ready |

All agents work on the `study-2` branch in separate worktrees. Each writes a receipt in `docs/runs/` and never weakens or edits a frozen v1 fixture. Human listening and device review stay with the creator.

## References

These references were compiled from memory and have not been looked up for this spec. Check each against its source before it appears in liner notes or the Lab.

**Electrophysiology and dynamics**

- Mayer AG. *Rhythmical pulsation in scyphomedusae.* Carnegie Institution of Washington, 1906. Jellyfish rings: the first circulating excitation. Anchor for Circulation and Canon.
- Mines GR. On dynamic equilibrium in the heart. *J Physiol* 1913;46:349–383. Also: On circulating excitations in heart muscles and their possible relation to tachycardia and fibrillation. *Trans R Soc Can* 1914.
- Lewis T. *The Mechanism and Graphic Registration of the Heart Beat.* Shaw & Sons, 1920. Ladder diagrams. Anchor for the Ladder view.
- Langendorf R. Concealed A-V conduction: the effect of blocked impulses on the formation and conduction of subsequent impulses. *Am Heart J* 1948;35:542–552. Anchor for Ghost.
- Gouaux JL, Ashman R. Auricular fibrillation with aberration simulating ventricular paroxysmal tachycardia. *Am Heart J* 1947;34:366–373.
- Nolasco JB, Dahlen RW. A graphic method for the study of alternation in cardiac action potentials. *J Appl Physiol* 1968;25:191–196. Restitution and alternans.
- Denes P, Wu D, Dhingra RC, et al. Demonstration of dual A-V nodal pathways in patients with paroxysmal supraventricular tachycardia. *Circulation* 1973;48:549–555. Anchor for Echo.
- Allessie MA, Bonke FIM, Schopman FJG. Circus movement in rabbit atrial muscle as a mechanism of tachycardia. III. The "leading circle" concept. *Circ Res* 1977;41:9–18.
- Moe GK, Jalife J, Mueller WJ, Moe B. A mathematical model of parasystole and its application to clinical arrhythmias. *Circulation* 1977;56:968–979. Anchor for Hemiola.
- Waldo AL, MacLean WA, Karp RB, et al. Entrainment and interruption of atrial flutter with atrial pacing. *Circulation* 1977;56:737–745. Anchor for Ostinato.
- Guevara MR, Glass L, Shrier A. Phase locking, period-doubling bifurcations, and irregular dynamics in periodically stimulated cardiac cells. *Science* 1981;214:1350–1353.
- Glass L, Mackey MC. *From Clocks to Chaos: The Rhythms of Life.* Princeton University Press, 1988.
- Stevenson WG, Khan H, Sager P, et al. Identification of reentry circuit sites during catheter mapping and radiofrequency ablation of ventricular tachycardia late after myocardial infarction. *Circulation* 1993;88:1647–1670. Post-pacing interval.
- Knight BP, Ebinger M, Oral H, et al. Diagnostic value of tachycardia features and pacing maneuvers during paroxysmal supraventricular tachycardia. *J Am Coll Cardiol* 2000;36:574–582. V–A–V versus V–A–A–V.
- Josephson ME. *Josephson's Clinical Cardiac Electrophysiology: Techniques and Interpretations.* Wolters Kluwer (current edition). General reference for maneuvers and intervals.

**Music and graphic notation**

- Reich S. *Piano Phase* (1967) and the essay "Music as a Gradual Process" (1968). Phasing; touchstone for Duality and Hemiola.
- Stockhausen K. "…wie die Zeit vergeht…" *Die Reihe* 3 (1957). Rhythm and pitch as one continuum of periodicity.
- Cardew C. *Treatise* (1963–67). Graphic score; touchstone for the Ladder view.
- Xenakis I. UPIC system (1977). Drawing as composition.
- Canon, round, ostinato, hemiola, retrograde: standard definitions, for example in *Grove Music Online*.

## Appendix: concept plates

Rendered images live in `design/plates/`. The scripts that produced them (v0.1 engine runs and small prototypes of v1.1 rules) are in `design/plates/src/`; paths in them point at the original scratch locations and are kept for provenance only.

1. `plate1_ladder.png` — Ladder view of Echo (engine run).
2. `plate2_staves.png` — Staves view of Echo (engine run).
3. `plate3_map.png` — Activation map of Ostinato with listening point (engine run).
4. `plate4_lab.png` — Laboratory curves and return plots (jump curve: engine; others: §B/§D prototypes).
5. `plate5_landing.png` — GitHub Pages title plate.
6. `plate6_model.png` — Model inspector, S1–S2 output curve, conduction curve, music chips.
