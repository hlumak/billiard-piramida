## Mode: standard

AGENTS.md and the path-scoped rules are the contract; the hooks enforce the hard limits (no snapshot updates, no `--no-verify`, no config edits to fix a test, lint on test files). Nothing else is prescribed step by step — you are trusted to know when a procedure applies. The skills are available on demand:

`/ninja-testing:test-as-spec`, `test-plan-by-level`, `mutation-loop`, `review`, `legacy-characterize`, `integration-boundaries`, `external-contract`, `e2e-select`, `flaky-triage`.

Two things stay non-negotiable: run the **whole** suite before you stop, and run `/ninja-testing:mutation-loop` on new logic tests **before the PR** (not on every save — before the PR).

Need mutation testing and the self-review enforced on every session (a team that is only starting, tests nobody reads before merge, a money module)? `/ninja-testing:mode strict`.
