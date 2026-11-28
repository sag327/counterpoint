# Counterpoint — Repository Instructions

## Computational Efficiency Policy

Classify each development task before execution:

**Tier 1 — Trivial:** Styling, labels, sizing, configuration, and minor layout changes.
- Use one agent and minimal reasoning.
- Inspect only relevant files.
- Skip formal planning.
- Perform targeted verification.

**Tier 2 — Standard:** Localized features, ordinary bug fixes, and interaction changes.
- Use one agent with moderate reasoning.
- Create a brief plan only when useful.
- Run relevant automated tests.
- Verify affected functionality.

**Tier 3 — Complex:** Architecture, simulation algorithms, optimization, security, and difficult debugging.
- Use higher reasoning effort.
- Employ multiple agents only when their independent contributions justify the overhead.
- Perform comprehensive verification.

**General rules:**
- Default to the lowest sufficient tier.
- Escalate only when complexity or failed attempts justify it.
- Avoid repeated repository-wide inspection.
- Delegate routine regression testing to existing CI workflows when appropriate.
- Avoid unrelated refactoring.
- Reuse existing implementations, utilities, and documentation.
- Maintain concise handoff documentation.
- Where appropriate, batch related changes into a single implementation and verification cycle.
- Preserve existing functionality and correctness.
- If blocked after repeated attempts, report the blocker rather than entering an expensive retry loop.

## Development and deployment policy

Counterpoint is in active pre-release development.

- Commit routine UI, styling, text, and localized configuration changes directly to `main`.
- Use development branches and pull requests for substantive simulation, architectural, or potentially disruptive changes.
- Run only the tests warranted by the scope of the change, subject to existing project-specific verification requirements.
- Rely on GitHub Actions for broader automated regression checks when they cover the relevant revision.
- Avoid redundant repository inspection and verification.
- Preserve rollback capability through small, logically organized commits.
- Report changes, verification results, and unresolved issues concisely.
- Do not require separate merge approval for routine changes unless explicitly requested or required by existing safety, verification, or branch protection rules.
