# Content 01: glossary, study metadata, liner-note scaffolds (ticket 14g)

Branch `study-2-copy` (from study-2). Content only; no engine, music, visuals, contract or existing test changes.

## Delivered

- `src/content/glossary.json`: 12 layer 1 and 11 layer 2 entries with two-sentence cards, per-study notes and demo hints.
- `src/content/studies.json`: Preludes I to VIII plus the Unknown coda, with subtitles from the spec table, one chip term at most, EP mechanism text and a one-sentence invitation.
- `src/content/notes/<studyId>.md`: nine liner-note scaffolds with the six fixed headings, each marked "DRAFT — creator writes final text" and carrying a visible reference-verification warning.
- `tests/content.test.js`: 10 node:test checks (JSON shape, glossary coverage, id resolution, at most one layer 2 term per study, sentences under 20 words, subtitle layer 2 rule, no EP abbreviations, note structure).

## Decisions for the creator

- Glossary `demo.solo` site ids are plausible placeholders (for example HRA, CSp, V, R0, A, B) and must be reconciled with the final world site ids.
- Layer 2 terms that are not a study chip (phasing, accelerando, rubato, suspension, polyrhythm) have a card but no study lists them in `glossaryIds`, so the one-idea rule holds.
- Card sentence 2 is generic; the study-specific second sentence lives in `studyNotes`.
- History anchors and further reading use only the spec's References list, which the spec says was compiled from memory. All must be verified before publication.
- Unknown has no spec subtitle; "A hidden rhythm to work out" is a proposal.
- Study ids: prelude, echo, meter, ostinato, retrograde, ghost, canon, hemiola, unknown.

## Result

`npm test`: 57 tests, 57 pass, 0 fail (47 existing plus 10 new).
