---
name: test-plan-by-level
description: Before writing tests for a feature, produce a plan "check → level → door → real / substituted", get it confirmed by the human, then write. Use when asked to "cover feature X with tests", "write tests for", "test this module/flow", "add tests" — before a single test file is created.
argument-hint: "<feature or module to cover>"
user-invocable: false
---

# Test plan by level

When you are told "test this", you choose the levels yourself, and you almost never guess the level at which a check is cheapest and still meaningful. Which way you lean depends on the model you are: some versions write enormous E2E tests for a change a component test would cover (a new Capybara test in GitLab: browser, clicks, extra DB seeds, >10 s), older ones wrote fifty narrow unit tests and nobody stopped at integration. The cause is the same in both directions: you want to be maximally sure everything is fine, and maximal certainty has a price. The human is the balancer who sets that price. So the level is not yours to pick silently — it is written down in a plan, read and edited by the human, and only then are tests written.

> I usually ask myself: what must break for me to say this does not work? And then: at which level can I check that?

## When to use

- Any request of the form "cover X with tests", "write tests for X", "test the checkout flow", "add tests to this PR", where more than one test file may result.
- Before `integration-boundaries` and `e2e-select` — this skill decides *which* checks go to those levels; those skills decide *how* to write them.
- Do **not** use it when the task is "implement behaviour" — go to `test-as-spec` first (the tests are the specification, not something you plan after). Do not use it for code that has no tests and no known contract — `legacy-characterize`. A single explicitly-specified test ("unit test for `canTransition`, mock nothing") needs no plan; just state the level back and write it.

## Inputs

Have in hand before step 1; ask for anything missing in one message, not one question at a time.

- The feature or change: task text, PR diff, or the modules involved. If the task says only "make coverage better", stop: that request produces implementation-coupled tests (AGENTS.md §9). Ask which behaviours of which modules.
- Known bugs, especially production incidents, on this area. A bug that happened is a confirmed risk; every boundary you invent is a hypothesis.
- Who the user of the system is: an independent backend serving several clients (E2E = HTTP calls) or an application with its own frontend (E2E = a real browser).
- Project shape: are there existing tests, and are vertical slices visible in the directory structure? Is the project greenfield or a brownfield "zoo of levels"?
- A sample file per level the human trusts, if the existing tests are uneven.

## Procedure

### 1. You: list what must break

Write one line per breakage that would make the human say "this does not work". Not files, not functions — breakages. Order them by risk, in this fixed priority:

1. **Production bugs** on this area — each becomes a row, input taken from the incident, never invented.
2. **Business rules** and their boundaries: the value just below a threshold, on it, above it; zero duration; crossing midnight; "exactly N". High cost of error, low visibility — a wrong rule can return slightly wrong answers for months and nobody raises an alarm.
3. **Boundaries between modules**: what only shows when parts work together — status changed **and** audit-log entry written; write **and** recount; click in one component → effect in another; the authorization layer that stops the request before `changeStatus` is ever called.
4. **Glue / pass-through** last, and minimally. Before labelling anything "just glue", check it makes no business decision (which amount is charged, which status is set) — a wrapper that decides is a business rule pretending to be a simple function.

Do not distribute tests evenly across files; that is bookkeeping, not risk.

### 2. You: assign the cheapest level, by the door

For each row answer the second question: *what is the cheapest level at which I can check that?* The difference between levels is not how much code runs — it is **through which door the test enters the system**:

| Door | Level | Enters through | Diagnosis when red |
|---|---|---|---|
| the function | unit | direct call of one file; pure helpers stay real | one function, one set of values — almost nothing to search |
| the boundary between modules | integration | an explicit call of the orchestrator (`changeStatus`), a component tree with its real store | a handful of collaborating parts |
| the same door as the user | E2E | `PATCH /task` over HTTP, or clicks in a browser | "somewhere between catalogue and 'order placed'" — and often the browser itself |

Worked example: `canTransition(from, to)` — the state machine — is unit (possibly property-based on its invariants). `changeStatus` → `canTransition` + `auditLog` is integration: the check is "status changed **and** log entry appeared", two assertions in one test, and that is exactly what an integration test is for. `PATCH /task` → `changeStatus` is E2E, and at E2E you may **not** re-check the audit log: it costs another request or another page, and we trust what the level below already checked. "That is, of course, a question of trust."

A row goes to E2E only if at least one holds: the action is **irreversible**, it moves **money or access**, or it crosses a **real external boundary** an integration test cannot fake (AGENTS.md §7). Error flows stay at lower levels. If the whole project is small, "we trust nobody, everything through E2E" works — until the suite becomes catastrophically slow and a tooltip covering the middle of a card breaks a drag test. E2E is the most fragile level; its count does not grow with the number of screens.

### 3. You: state what is real and what is substituted

For every row name the doubles explicitly. The rule: if part of the responsibility for the behaviour lives in another module — code, a DB constraint, a store selector — you lose the right to mock that module. The mock boundary is where *ours* ends: network, external services, browser APIs. Infrastructure (database, network) and a neighbouring module (audit log) are different categories; the neighbouring module is pulled in, not mocked.

- unit: everything outside the process substituted; pure modules and exported constants stay real.
- integration: the whole vertical slice real, **including its database and store**; neighbouring slices may be mocked at the module; external services faked at the network; plumbing such as auth stubbed (`can → true`, a user "with every possible right, a dozen impossible ones and a couple of unbelievable ones") unless the row is *about* rights.
- E2E: the whole system real; only external channels intercepted (email, payment fake at the boundary).

### 4. You: check the plan against itself

Apply each check and fix the table before showing it:

- **No expensive duplicate.** If an integration row asserts only what a unit row already asserts, it is "an expensive variation of a unit test" — add the assertion on every module pulled in, or delete the row. Never repeat a unit check at integration level, never repeat an integration side-effect at E2E.
- **5±2 entities per integration row, prefer minus 2** (3–5 collaborating entities). Six to ten: split the row or lift it to E2E. Two screens of setup is the same signal.
- Ask of every integration and E2E row: *for what reasons could this test break, given all other tests are green?* Many reasons → split. (You may run this question over existing tests too.)
- Every level present for a reason: only units means nodes can be glued together wrongly; only integration means the plumbing (auth in front of `changeStatus`) is never exercised; both gaps get one row, not a layer.
- Name the level by the number of independently living nodes, not by the file name: a component with its own private store is a unit; several components through a shared store is integration. After a refactoring a test may drift from unit to integration — that is normal, rename it, do not re-plan.

### 5. You: output the plan and stop

Produce the table, then the list of decisions you made on your own (which side effects you left out of E2E, which module you treated as a neighbour, which external service you assumed is "not ours" — a service owned by another team is "ours" or "external" by team policy; ask). Then stop. **Do not write a test before the plan is confirmed.**

```
| # | What must break | Level | Door (enters through) | Real | Substituted | Why this level / why not lower |
|---|---|---|---|---|---|---|
| 1 | done → in_progress is refused | unit | canTransition(from, to) | the file | nothing | pure rule, boundaries: every transition pair |
| 2 | status changes AND audit entry written | integration | changeStatus(task, 'in_progress') | tasks slice + its DB + auditLog | auth (can → true) | only visible when two modules cooperate |
| 3 | unauthorized user cannot change status via API | E2E | PATCH /task as user without rights | whole system | e-mail channel | moves access; auth layer sits before changeStatus |
```

Suffix with the questions that block the plan (as few as possible).

### 6. Human: edits the plan

The human reads the table and changes rows — moves a row down a level, deletes a duplicate, adds a production bug you did not know. A prompt that worked:

> Draft a test plan, please: state what you plan to check at the unit, integration and E2E levels.

The human reads it and periodically changes it; only then are tests written. Treat the edited table as the specification for the next step; do not re-argue rows the human moved.

### 7. You: write tests row by row, level stated explicitly

Each row becomes one task with the level, the door and the doubles named in the prompt. In a brownfield project the level is **always** stated — modern models are trained on "this is how it is done here": given the same prompt, with a pure unit test next door you produce `vi.fn().mockResolvedValue(...)` for the repository; with an integration test next door you write against the real database, having peeked into the neighbouring file although the prompt said not to. On a greenfield project the first 5–10 tests become the sample, so read those with extra care. A prompt that worked, with the level added:

```
Write a test that checks that getTierAvailability returns the correct number of
remaining seats for a tier, for the function in src/getTierAvailability.ts.
Level: unit. Real: the file under test. Substituted: the db object (getSoldCount,
getCapacity). Save the test next to the existing tests in this directory.
Constraints: do not open or use files outside this directory; do not modify the
getTierAvailability function itself. Make the test green.
```

(Under AGENTS.md §2 "the correct number" is a stop-word — before sending, replace it with the expected value: "returns remaining = capacity − sold, e.g. 10 − 3 → 7".)

If some existing tests are bad, give a whitelist ("use `orders.test.ts` as the sample") instead of "do not read other tests". One phrase moves a test between levels — "Can we rewrite this as a unit test?" — but only in the direction the code allows (no real DB harness → no integration test).

Hand rows off by level: integration rows → `integration-boundaries` (classify every dependency: inside slice / neighbour / external; real DB; failure paths; real store, network intercepted). E2E rows → `e2e-select` (confirm the criterion, keep the count small, normal flow only). Unit rows on logic → write, then `mutation-loop` (AGENTS.md §8).

## Done when

- Every row of the confirmed plan has a test whose name and `expect`s say what the row says; no test exists that has no row.
- No check appears at two levels without a written reason in the table.
- Every integration test asserts on each module it pulled in (at least two assertions unless the human struck one).
- Every E2E test cites which of the three criteria it meets; the E2E count did not grow with screens or fields.
- No integration test has more than 5 entities or more than a screen of setup; the "why could it break if all others are green" answer is one or two reasons per test.
- In a brownfield project every test-writing prompt named its level, real and substituted parts.
- The decisions list was delivered with the plan, and again after the tests, per AGENTS.md §2 and §10.

## Red flags

- **Level by model preference.** You "voluntarily" pick E2E and test everything in maximum detail, taking 3–5 attempts per test; or you scatter fifty narrow unit tests and nothing at integration. Counter: the plan is the countermeasure — no test before the table; a new file in the E2E directory for a diff that only touches one component or function is rejected and rewritten at component/integration level.
- **Level inherited from the neighbours.** A `mockResolvedValue` repository appears where the convention is a real DB, or a real DB appears where nobody asked. Counter: name the level in every prompt; whitelist sample files.
- **Expensive variation of a unit test.** Integration test with one `expect` on the status, audit log unchecked. Counter: assertion per module pulled in, or delete.
- **"We trust nobody."** Side effects re-verified through the browser, extra requests, extra pages. Counter: trust the level below; leave the audit log to integration.
- **Hyper-enthusiasm.** "It is no trouble for the model to write two screens of setup" — six to ten entities in one test, the same test fixed for the fifth time for five different reasons. Counter: 5±2, split or lift.
- **Over-mocking your own slice** ("this orders module does not interest me yet, I'll mock it"). Counter: responsibility in another module → no right to mock it; the mock boundary is where ours ends.
- **"Just glue" without checking.** A formatter that also decides the charged amount is classified as glue and gets one "does not throw" test. Counter: re-verify every glue label for hidden business decisions — you do this well when asked explicitly.
- **Skipping the confirmation.** You produce the plan and start writing in the same turn. Counter: the plan ends the turn; tests begin only from the human's edited table.
