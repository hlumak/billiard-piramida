---
name: e2e-select
description: Select which scenarios deserve E2E (irreversible / money-or-access / real external boundary), demote the rest to unit or integration, then write each E2E as one user path with external-role steps via API. Use for "write E2E", "test the critical paths", "cover X with E2E", or a PR adding E2E files.
argument-hint: "<feature / cabinet / user path> [--review <diff>]"
user-invocable: false
---

# E2E: select, then write

A project had 112 E2E scenarios — "everything the user sees is covered". Green unit tests, green integration tests, and the password-reset page did not work for three days because after an auth rewrite it ended up behind the login. Not one of the 112 checked that the reset link works once and refuses the second time.

> There were many tests, but none of those that were actually worth writing at the E2E level.

An E2E test looks at the system through a human's eyes: a real environment, real rendering, real network. Every one of those adds fragility, and fragility is price. So the set of E2E tests must not grow with the number of screens, fields, or possible turns of events. Asked to "cover with tests", current models write E2E — and write many; asked to "test the most critical", they go by the visible structure of the UI and by what is easiest to script as a sequence of clicks, then rename the same field checks "critical". Risk is not visible in the DOM. This skill puts the selection criteria into your hands literally, and only then lets you write.

## When to use

- The task says "E2E", "end-to-end", "Playwright/Cypress test", "test the critical paths", "smoke tests", "cover the cabinet / checkout / onboarding with E2E".
- A PR adds or changes files under the E2E directory (`--review`): run steps 1–4 as a review, output the demote list.
- After `test-plan-by-level` produced rows marked E2E: this skill takes those rows and both re-validates and writes them.

Do **not** use it when:

- the task is "cover feature X with tests" with no level named → `test-plan-by-level` first; the level is never inherited from neighbouring files (AGENTS.md §7).
- an E2E test passed after a retry or "fix the flaky test" → `flaky-triage`. Do not touch timeouts here.
- the work is a fake for an external provider (payment sandbox, SMTP catcher contract) → `external-contract`; this skill only consumes the fake.

## Inputs

- The list of candidate user scenarios (from the task, `test-plan-by-level`, or the human). If you have only a feature name, produce the candidate list yourself in step 1 — but as *user paths*, not screens.
- The list of operations in the feature that are irreversible, move money or access, or leave the system (email, payment, third-party storage). If nobody can give it, derive it from the code (services that send, charge, revoke, issue) and show it to the human before selecting.
- The environment: how the app and its database start for E2E (`npm run dev`, seed script, docker compose), the external-channel interceptors available (SMTP catcher with web UI, payment sandbox/fake), an API or DB access for setup steps, the test accounts.
- The runner (Playwright assumed; Cypress maps 1:1 for locators and waiting). Read the path-scoped rule `.claude/rules/e2e.md` before creating a file — it cannot load before the file exists.

Missing: the irreversible/money/access list → ask; do not select by what the UI shows. Missing interceptor for a channel the path crosses → stop; an E2E that waits for real email delivery is not acceptable.

## Procedure

1. **You: list candidates as user paths.** One line each, in the form "actor does X → system shows Y at the end". Include the paths that leave the actor's cabinet ("student requests refund → admin approves → student sees the refund badge"). Do not list screens or fields.

2. **You: run the three questions on every candidate.** Write the answers next to each line:
   - **Irreversible?** Once done, the old state is gone (the old password stops working, the link is single-use, the money left). If the mistake is cheap to roll back, an expensive check is redundant.
   - **Money or access?** The action directly unlocks or locks something valuable: password change, role granted, funds charged, refund issued, certificate issued.
   - **Real external boundary?** The path crosses a system an integration test with a real database cannot honestly fake: email delivery, a payment gateway, third-party storage. A question about data inside our own system is integration, not E2E.

   One "yes" makes a candidate. A candidate with three "no" is demoted — no matter how visible or "important for the user" it feels. Keep both lists; the demote list is part of the output.

   > Even if the tooltip animation is broken, it does not unlock or lock anything — at most it annoys.

3. **You: demote and name the level.** For each demoted candidate say where it goes: validation of a field → unit on the rule + **one** integration test that validation is wired; a computed value or a row written → integration (real DB / real store); animation, hover, colour, tooltip → nowhere, ever. Seven E2E tests on phone formats are the pure logic of one field. Do not re-check at E2E what a lower level proved: E2E trusts the levels below — it is a question of trust, and the trust is deliberate.

   > It checks what cannot be proven any other way.

4. **You: keep the normal flow only.** Each surviving scenario has a normal flow (everything goes right), an error flow (planned rejection — a refund outside the window), an exception flow (network down). E2E covers the normal flow; error and exception flows go to unit/integration. Exception: one path per irreversible operation that proves the *second* attempt is refused (reusing the reset link) — that refusal is the irreversibility itself, not an error flow. A login test is justified: it proves auth is wired in front of the app, the thing that hid the reset page for three days.

5. **You: the "test which is missing" check.** Walk the list of irreversible / money / access operations from Inputs, not the list of candidates. For each operation confirm there is an E2E normal flow; if not, add it. No tool detects an absent test — only this walk does. Then ask the human: "which paths broke in production before?" — a past bug is a stronger criterion than any of the three.

6. **Human confirms the two lists.** Present: E2E list (each with its criterion and its named scenario) and the demote list (each with its level). In the task and in the file, name the criterion and the scenario, never the word "important" or "critical": *"E2E for reusing the password-reset link (irreversible)"*, *"E2E for admin approving a refund — money leaves through PayGate, status becomes refunded (money)"*. Mark the smoke subset: a few key paths (in a shop — buying a product) that run first; when smoke is red the heavy suite does not run. Smoke may break AAA — step, check, step, check.

7. **You: phase one for async / multi-actor scenarios.** Before writing, prompt (a rule alone is not enough for this):

   > Describe the asynchronous scenarios in the system connected with `<X>` (for example, with refunds): which actions are performed by another role or an external system, in what order, and what the user sees at the end of each.

   **Human validates the list** — removes what is not real, adds what the model missed. If nobody can validate, say so in the output and proceed on the model's word. This list is the input to the next step; without it the model drops the external actor's step about half the time.

8. **You: write the tests.** Prompt to the writer (yourself or a subagent), constraints word for word:

   > Write E2E tests for the following scenarios only: `<list from step 6 with criterion per line>`. Do not forget the asynchronous scenarios — use this list as input: `<validated list from step 7>`. Steps performed by another role or an external system (admin approves, gateway confirms) are done through the API or the database, not through a second browser. Each test seeds its own data; dates are offsets from `new Date()` at seed time. Assert the end result the user sees, not the "request sent" message. Locators by role and label; `getByTestId` only with a comment saying why the element could not get a role or a label; no CSS, no XPath. Wait for state, never for time. One user path per file. Do not create tests for scenarios not in the list.

   Rules the file must follow (details in `.claude/rules/e2e.md`, do not re-derive them):
   - First line of each test is a comment with the criterion: `// E2E criterion: irreversible — reset link is single-use`.
   - External-role steps via API/DB. Logging in as admin in a second browser context to click a queue item brings no value to the student's path and adds flake risk — send it back on review.
   - Seed per test; no shared state. In a real session the model's tests leaked state through one worker; it noticed "tests mutate state" and moved to seeding — the most valuable fix of the session.
   - External channels intercepted at the boundary: the SMTP catcher container with a web UI (read the reset link there), the payment provider's sandbox or a fake at the boundary. Never through real delivery.
   - Assert the user-visible end: the "refund issued" badge, the certificate link that opens, the second click on the link refused. "Request submitted" alone is a test of the button.
   - Several asserts along the path are fine; that is what a path test is. Keep intermediate-state checks (spinner appeared, then result).
   - Do not drive the whole system into a second `expect` for side effects an integration test already proved (audit row, computed value) — that needs another request or page and is slow.

9. **You: run.** Locally, only the spec you work on, with the dev server and seed up beforehand. Read every failure log before rerunning; a test that passes after a retry goes to the flaky list, not to "done". Never raise a timeout, remove a spinner check, or slow the backend to make it green — those are the two prohibitions:

   > Congratulations, you have just broken the test, because the refresh button stopped working.

10. **You: place it in CI.** E2E runs after unit and integration are green; for pull requests use the folder heuristic ("touched `orders/` → run `e2e/orders/`"); the full suite runs nightly. Smoke tag/project/directory separate and first. For a system too big to run locally (dozens of services), E2E runs against a remote stage — a dedicated environment so garbage and "the tragedy of settings" do not accumulate; the suite needs only an admin login, creates its own users and data, and partly sweeps after itself (the gitlab-qa pattern). E2E is never mutation-tested.

## Done when

- Every E2E file has its criterion comment (irreversible / money-or-access / external boundary) and a scenario name; none says "important" or "critical".
- The demote list exists and every item names its level (unit / integration / none); no E2E touches a single field's validation, hover, animation, or colour.
- For every irreversible, money, or access operation in the feature there is exactly one E2E normal flow; for each irreversible one, the second attempt is shown refused.
- The async/external-actor list was validated by a human (or the output says it was not), and every step on it appears in a test as an API/DB step.
- No test shares state with another; no `waitForTimeout`/`sleep`; no CSS or XPath locators, `getByTestId` only with a written reason; no second browser for a helper role; no real SMTP or live payment credentials in config.
- Each test's last assertion is what the user sees at the end of the path.
- Smoke subset is separated and ordered first; CI runs E2E after unit/integration, by folder on PRs, in full nightly.
- The number of E2E tests did not grow with the number of screens or fields in the feature.

## Red flags

- **E2E chosen by UI structure** — a spec per screen, a test per field, login/catalog/search/filter specs when asked for "the most critical" → give the three criteria literally in the prompt and name the scenario; regenerate from the list, not from the app.
- **"Critical" is a rename** — the same field checks now titled "critical path" → the criterion comment is mandatory; a test whose criterion you cannot fill in is demoted.
- **External actor dropped** — "student sees refund" with no admin approval step (≈50% of runs) → phase one list, validated by a human, fed back as input.
- **Second browser for a helper role** → API/DB call prepared in Arrange; send back on review.
- **Assert stops at "submitted"** → extend the path to the visible end result.
- **E2E asserts the DB row / computed value** → integration proved it; delete the assert or the test.
- **Shared seed across tests** — passes alone, fails under a different order or worker count → seed per test; dates relative to now.
- **Waits for real email or hits the live gateway** → SMTP catcher container, sandbox/fake at the boundary; the flake is not the test's fault, the setup is.
- **Green by timeout, spinner check removed, backend slowed** → revert; hand to `flaky-triage`; a timeout change without a named source of instability is refused.
- **`getByTestId` / CSS selectors** → role and label. "Started looking for `page.getByTestId`. Disgusting."
- **Smoke mixed into the heavy suite** → separate it; when smoke is red nothing else runs.
- **A production bug appears** → ask "was there an E2E that should have caught it?" If yes, that E2E is bad — period. If no, run step 5 again; the quality of E2E is how closely it reproduces the user's real path.
