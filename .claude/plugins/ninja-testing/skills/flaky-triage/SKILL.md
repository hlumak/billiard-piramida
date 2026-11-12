---
name: flaky-triage
description: Diagnose an unstable test instead of making it green. Use for "the test passed after retry", "fix the flaky test", "fails only on CI / only in parallel", "passes locally", "raise the timeout", "put it in quarantine", or when building the flaky list from CI history.
argument-hint: "<test file or name> [--e2e] [--ci-export runs.json]"
user-invocable: false
---

# Flaky triage

A test with a spinner failed in one run out of ten; everyone knew a retry helps. One day the retry did not help, so the pipeline was restarted four or five times without anyone looking at the log; on the fifth it passed. The cause was a cache race somewhere else, and it went to production. The unreliability of one test hid another unreliability — and a red pipeline stopped meaning anything to that team.

> Imagine life on roads where a red light means "well, you probably should not go".

An agent handed "the test is flaky, fix it" reaches for the cheapest way to green: raise a timeout, delete the intermediate check, add `retry`, or rewrite the runner config. Every one of those hides the source and keeps the test in the flaky statistics. This skill replaces "make it green" with "name the source of instability", and puts the test into a process (flaky list, quarantine, metrics) when no source is confirmed. Two axes matter: which *level* the test is at (unit/integration vs E2E), and whether the test is *non-deterministic* or *flaky*.

## When to use

- A test failed on CI and passed after a retry; a test fails only in parallel, only in a different order, only on a colleague's machine.
- Someone asks you to raise a timeout, remove a spinner/loading check, add `retry`, or slow the backend "for the tests".
- A test in the flaky list or in quarantine is assigned to you for diagnosis.
- The team needs the flaky list or the flaky rate built from CI history (`${CLAUDE_PLUGIN_ROOT}/skills/flaky-triage/scripts/flaky-from-ci.mjs`).

Not this skill: a test that fails **every** run on the current code is a regression or a wrong test → fix code or test, not triage. A test that depends on `Math.random`, `Date.now()`, locale or time zone is **non-deterministic**, not flaky — we failed to provide the environment; fix it inside the test (fake timers, fixed seed, fixed locale; AGENTS.md §4) and stop here. Choosing whether a check belongs at E2E or lower → `e2e-select`; classifying dependencies of an integration test → `integration-boundaries`.

## Inputs

- The failing run's log and the runner output of that run: the **seed** (`Vitest` prints it under `sequence.shuffle`; Jest: `--randomize --seed`), the worker/parallelism setting, the CI job id and the commit SHA.
- The test file and, for E2E, the page or flow it exercises; whether the app or the infrastructure changed recently (caching added, runner shared with other jobs).
- Whether the test is **critical** (money, access, irreversible action) — decides between "fix now" and "quarantine".
- For the process part: access to CI run history (a JSON export, see the script), the current flaky list and quarantine list, who owns the area.

Missing the log → ask for it before touching anything. Missing the seed → get the run repeated once with `--sequence.shuffle --sequence.seed` printed, not "until it passes".

## Procedure

1. **You: read the log of the failing run before anything else.** Write down what the assertion expected, what it saw, and at what point of the scenario. No retry until this line exists. A retry that was not preceded by reading the log is the failure mode this skill exists for.
2. **You: classify — non-deterministic or flaky.** Random, date, locale, time zone, unordered `Object.keys`/`Set` iteration in the test or in the code under test → non-deterministic → fix the environment inside the test, report, done. Otherwise the test blinks on a *live* system → flaky → continue. Say which one in your report.
3. **Unit / integration test: reproduce by seed, not by retry.** Tests leak into each other through three channels (AGENTS.md §4): (a) a mutated fixture (shared object instead of a factory), (b) `globalThis`/`window` written and not cleaned — libraries do it too, and two files in one process share `globalThis`, (c) a shared resource: DB, cache (Redis in front of the substituted DB), file, port, reused browser with HTTP cache. Procedure:
   1. Rerun locally with the **same seed and the same parallelism** as CI (`vitest run --sequence.shuffle --sequence.seed=<seed>`; match `pool`/`maxWorkers`). The failure must reproduce before you change anything.
   2. Run `--no-file-parallelism` (Jest: `--runInBand`). Green sequential and red parallel = a shared resource between files. Green with `it.only` on the failing test and red in its file = a shared resource between tests of one file, or a file-level constant used by one test.
   3. Ask of the test: *"which shared resources does this test use?"* — grep for `globalThis.`/`window.` assignments, an exported object fixture, a file path, a DB table, a port. Check what is passed from test setup to workers: only serializable data crosses a process boundary; a function in setup fails as soon as the file runs in a separate worker or process.
   4. Isolate in the **dependent file**: `beforeEach(() => resetLog())` in every file that touches the resource, returning the promise. Not `beforeAll` (it does not separate two tests sharing the resource), not `globalSetup` in the runner config (it does not document who depends on what, and does not run when a file is launched without that config). Constants one test needs are declared inside that `it`. If the resource genuinely cannot be shared → a copy per worker (schema/DB per worker) or mark that group sequential; "sometimes tests have to run sequentially — that is normal".
   5. Rerun with the original seed (must be green now) and with three other seeds, in parallel, whole suite (AGENTS.md §10).
4. **E2E test: name the source before touching the test.** Most flaky tests are E2E — a live browser, a real network, real server response time. Four sources; check them in this order and write down which one the log confirms:
   - (a) **the test waits for time, not state** (scenario) — `waitForTimeout`, `sleep`, a fixed pause before an assertion → wait for a state with a stable attribute (`expect(locator).toBeVisible()`, a network response, a URL). Grep the E2E folder for `waitForTimeout|sleep\(|setTimeout` to find the pattern elsewhere.
   - (b) **server/DB state not reset between runs** (scenario) — an exact counter that depends on accumulated data, an entity created by the previous run → isolate/seed state per run; assert on the delta or on the created entity, not on a total.
   - (c) **brittle selector** — CSS class order, nth-child, XPath, a selector that depends on layout → `getByRole` / `getByLabel` / `getByText`; a test attribute only after trying to give the element a role or a label, with a comment saying why (`.claude/rules/e2e.md`). (scenario)
   - (d) **the race between the runner polling the page and the page changing.** The runner looks into the browser over CDP; the delay between the click and the next poll is not deterministic; if the test process's event loop is busy and the app got faster (caching added), the runner never sees `Loading` and sees the new table at once. Two asynchronous processes compete. **A faster app that makes a test fail is a race, not a regression** and not a reason to touch the app. Fix: attach the wait to a state that cannot be skipped — the network response of the refresh request, a changed row/timestamp, a request counter — rather than to a transient spinner; keep the assertion that the refresh actually happened.
5. **You: refuse the four "fixes" (AGENTS.md §9) and say why in the report.** (1) Raising a timeout without naming which source it covers — the cheapest way to green, the cause stays, the suite gets slower, the green is fake; a timeout change is allowed only with the source written next to it. (2) Removing the intermediate check ("click → table visible" without the spinner) — "congratulations, you just broke the test: the Refresh button stopped working and it does not reload the table". (3) Slowing or holding the backend so it "does not resolve without a command" — tests must reproduce behaviour as the user sees it. (4) A retry without reading the log.
6. **You: hand the time/race analysis to the human with your evidence.** Models have no sense of time: sequence-of-states reasoning about two competing async processes is where the agent is weakest. Deliver the log excerpt, the confirmed/unconfirmed source list from step 4, and the reproduction command; the human decides the fix for source (d). Routine (log scraping, seed reruns, building the list) is yours.
7. **Human + you: route the test into the process when no source is confirmed.** A test that failed and passed on the **same commit SHA** goes automatically to the **flaky list** (the script in step 9). If it is "really bad", **not critical**, and blocks merges → **quarantine**: a task with an owner and a deadline, higher priority than the flaky list. A critical test (money, access) is fixed now, never quarantined. Quarantined tests **keep running** and reporting, but do not block merge. The quarantine list is read **from master** — a scheduled job (every 5 minutes is fine) generates a `quarantined-tests` file from master, every CI run in any branch pulls that file and skips those tests; or the CI job queries master directly. A branch cut before the test was quarantined cannot know about it otherwise, and a two-hour rebase for one test is not an option. Small project with fast CI: rebase is acceptable.
8. **Human: run the lists on a schedule.** Flaky list reviewed at sprint start (monthly at worst) and assigned to people — not "when there is time", otherwise it grows unchecked "because what does the manager care". Limit ≈10 entries; more → alarm. Quarantine limit 1–2 (GitLab: 30–40 of ~300 000 tests). Quarantine is a signal — "this test is unreliable" — instead of silently re-clicking in the hope it passes.
9. **You: build the flaky list and the flaky rate from CI history.** `node "${CLAUDE_PLUGIN_ROOT}/skills/flaky-triage/scripts/flaky-from-ci.mjs" runs.json` reads a CI-agnostic JSON export of job runs (`sha`, `job`, `status`, `finishedAt`, optional `failedTests`). Flaky = the same job on the same SHA failed and later passed with no commit in between; with commits between, it is a real break fixed by the next commit, not flaky. It prints the flaky list, the per-test counts, and **flaky rate = failures caused by flaky tests / all failures** — not "failed runs / all runs", because a stable pipeline with many runs hides flaky tests in the denominator. Any AI writes this in one prompt; do not hand-count.
10. **Human: read the metrics together.** Flaky rate and **quarantine share** sit on the dashboard next to coverage and mutation score. Reliability math: 50 tests at 99% each → `0.99^50 ≈ 60%` green runs; 100 tests at 99.9% → `0.999^100 ≈ 90%` — every tenth run fails; nobody trusts that suite. If flaky rate grows while the code did not change, it is not the code: the tests do not match the infrastructure (a shared runner instead of 150 spot instances) or the level. Move the E2E down to integration with MSW at the network boundary: GitLab Duo frontend tests moved from real GraphQL to MSW went from 5% to 0.5% failures and 5–10× faster, still in a full browser. Without flaky rate there is no argument for that rewrite. Until flaky tests are stabilised, keep the main pipeline on full-run, not fail-fast — with blinking tests fail-fast "turns into torture and roulette".

## Done when

- The report names one of: non-deterministic (which input), coupling channel (a/b/c) with the resource, E2E source (a–d) — or states explicitly that none was confirmed and the test was routed to flaky list / quarantine with owner and deadline.
- For unit/integration: the failure reproduced with the original seed before the fix and does not reproduce after it; the whole suite is green in parallel with three more seeds; the reset lives in `beforeEach` of every dependent file; the runner config is unchanged.
- For E2E: no `waitForTimeout`/sleep added, no intermediate check removed, no backend delay introduced, no timeout raised without a source written next to it; the assertion that the action actually happened is still there.
- Race/time analysis (source d) went to a human with the log excerpt and the reproduction command.
- If the list was built: flaky is counted on the same SHA only; flaky rate uses all failures as the denominator; the list is under ≈10 or an alarm is raised; quarantine has 1–2 entries, each with owner and deadline, sourced from master.

## Red flags

- **Timeout raised, test "fixed"** — the diff changes only numbers; the test stays in the flaky statistics → revert; require the source; a timeout edit carries the source in the same commit.
- **Spinner check deleted** — "click → table visible" → put the intermediate state back; wait for a state that cannot be skipped.
- **Backend slowed "so the test can see loading"** → remove; the test must see what the user sees.
- **Config edited on "the test fails, fix it"** — in a real session, on *"Test race-alpha.test fails. Please fix it."* the agent added `globalSetup` to the Vitest config and reran the suite ten times: "a cannon at sparrows", it works and it is wrong → `beforeEach` in the dependent file; the `PreToolUse` hook on config files is not an obstacle to fight.
- **Agent ran the two changed files sequentially and reported green** — 90% of the time that is what it does; the race is invisible → full suite, parallel, shuffle, before "done".
- **"Non-deterministic" treated as flaky** — a `Date.now()` in the test put into quarantine → fix the environment inside the test.
- **Retry as culture** — pipelines restarted without a log being read → every restart is preceded by the log line from step 1; the script counts restarts.
- **Quarantine as parking** — entries with no owner, older than a sprint, the list creeping up "in pursuit of numbers" → quarantine share on the dashboard, a ceiling in the gate, higher priority than the flaky list.
- **Quarantine list stored in the branch** — old branches still run the quarantined test → generate the file from master on a schedule.
- **"Make it green" as the prompt** → *"Name which source of instability this failure belongs to: waits for time not state / server state not reset / brittle selector / runner-vs-page race / shared resource between tests. Do not raise timeouts, do not remove intermediate checks, do not edit runner config. If none is confirmed, say so."*
