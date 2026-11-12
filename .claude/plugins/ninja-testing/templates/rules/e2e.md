---
paths:
{{E2E_PATHS}}
---
# E2E tests ({{E2E_TOOL}})

AGENTS.md §7 is the contract. Before adding an E2E test, run the `e2e-select` skill; every E2E test states its criterion in a comment: irreversible / money-or-access / real external boundary.

## Scope

- Normal flow only. Field validation, error states, hover, animation are not E2E material — one integration test proves validation is wired, unit tests prove the rules.
- Do not re-check at E2E level what an integration test already proved (a value computed, a row written). E2E asserts what the user sees at the end of the path (the "refund issued" badge, the certificate link), not just "request sent".
- Several assertions along the path are fine. A smoke subset (a few key paths) runs first; when smoke is red the heavy suite does not run.

## Data and roles

- Each test seeds its own state; tests never share or mutate common state. Dates that depend on "now" are offsets from `new Date()` at seed time, never absolute.
- Steps performed by another role or an external actor (admin approves, payment gateway confirms) are done through the API or the database, not through a second browser. List these steps explicitly in the task — models drop about half of them.
- For asynchronous or multi-actor scenarios use the two-phase approach: first "describe the asynchronous scenarios connected with X" → a human validates the list → then write the tests with that list as input.
- External channels are intercepted at the boundary: email via a catching SMTP container with a web UI (read the link there), payments via the provider's sandbox or a fake at the boundary.

## Stability

- Wait for **state** (element with a stable attribute appears / disappears), never for time. No `waitForTimeout`, no `sleep`.
- Keep the intermediate-state checks (spinner appeared, then result). Removing them "for stability" blinds the test to the action breaking.
- Locators: `getByRole` / `getByLabel` / `getByText`; `getByTestId` is the last resort; CSS/XPath never.
- One user path per file; do not chain scenarios.
- A test that passed after a retry goes to the flaky list automatically; see the `flaky-triage` skill. Never raise a timeout without naming the source of instability in the commit.

## Runs

- Locally: only the spec you work on. In CI: E2E after unit and integration are green; folder heuristic for pull requests ("touched `orders/` → run `e2e/orders/`"), full run nightly.
- E2E is never mutation-tested and rarely parallelised beyond what the environment (one DB per worker) allows.
