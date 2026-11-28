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
