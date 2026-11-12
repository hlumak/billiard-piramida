## Mode: strict

Every procedure below is mandatory in the situation named, and the Stop hook enforces mutation testing, a verdict on every surviving mutant, and the self-review on every session. Measured to cost roughly 2–3× the standard mode for the same bug-catching rate and the same mutation score; it buys enforcement, not quality — keep it while the team is learning, when tests are merged without a human reading them, or on money/access modules. Back to standard: `/ninja-testing:mode standard`.

- Implementing behaviour from a task → `/ninja-testing:test-as-spec` first: turn the task into an input→output table with boundaries; only then implement.
- "Cover feature X with tests" → `/ninja-testing:test-plan-by-level` before writing a single test; the plan must be confirmed.
- Wrote or changed tests on logic → `/ninja-testing:mutation-loop` before declaring done. The Stop hook will not let you finish without a run and without a verdict on each survivor; "most survivors are equivalent" is not a verdict.
- Reviewing tests (yours or a PR) → `/ninja-testing:review`: it delegates the mechanical pass to the `test-reviewer` subagent (clean context), then the human second pass: "which tests are missing?".
- Changing code that has no tests → `/ninja-testing:legacy-characterize`.
- Writing an integration test → `/ninja-testing:integration-boundaries` to classify every dependency (inside slice / neighbour / external).
- New external API or a fake for one → `/ninja-testing:external-contract`.
- Asked for E2E or "test the critical paths" → `/ninja-testing:e2e-select`.
- A test passed after retry / "fix the flaky test" → `/ninja-testing:flaky-triage`.
