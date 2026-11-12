---
name: legacy-characterize
description: Approach code without tests — prioritise by risk, pin current behaviour with characterization tests, refactor pure/impure under the green net, write real tests, retire the pins. Use for "change legacy code", "add tests to untested code", "refactor this old function", "no tests here".
argument-hint: "<function or module to touch> [--weak-model]"
user-invocable: false
---

# Legacy: characterize before you touch

Code must change, and nobody can understand it whole in reasonable time. Agents do not solve this — they *shift the point of non-understanding*; Opus 4.7 did not find the cause of a bug in a 400-line ranking function. The trap for you is specific: you were trained to answer "what should this code do", not "what does it do today". You read the names, the comments, the neighbouring functions, decide that a strange branch is a bug, remove it and say "I fixed it" — deciding for the author who may have left the company. This procedure exists to stop that. The instrument is the **characterization (pinning) test**: it does not ask whether the behaviour is correct, only whether it worked this way before.

> The characterization test does not ask "is this right?". It asks only "did it work like this before?".

## When to use

- The task changes a file with no tests (file coverage 0) or with tests you do not trust (implementation coupling, always-green tests).
- Refactoring a legacy function; introducing tests into a project that has none; a manager says "tests are not needed" — this is the cheapest entry with visible payoff soon, not in a year (Pareto).
- Not for: implementing new behaviour from a task (`test-as-spec`), planning coverage for code that already has trusted tests (`test-plan-by-level`), choosing E2E (`e2e-select`). Step 4 hands off to `mutation-loop`; reading generated tests is a `review` pass.
- The function is non-deterministic (ML ranking, `Math.random`, real clock) → not this way. Stop and report; pinning requires determinism.

## Inputs

- The task that brought you here. Scope is bounded: one function or module, one task. Do not widen it.
- Repository access with spoilers removed (step 1a). Issue tracker export (last ~100 bugs) or an agent that can produce it; `git log` for 12 months.
- Real inputs: top-N requests from production logs plus a DB dump/slice, or the project's test database with factories (`testDb` and its setup file next to it).
- Confirmation the function is deterministic for those inputs.
- Model strength: a weak model (Flash, local) gets the input types enumerated; a strong one does not.

If missing, ask: "Which real inputs may I use?", "Is there an incident history for this module?", "How far may the refactoring go?".

## Procedure

Strict order. Swapping steps "ends very badly, based on personal experience". One knob at a time: never refactor and write "good tests" in the same step. Commit after every step.

> If you have a radio with many knobs, you never turn more than one knob at a time.

### 1. Recon and prioritisation

1a. **Human** removes everything that spoils the experiment from the agent's view: README with methodology, task/spec files, `docs/` with answers, solution or validation files, neighbouring directories. Restrict the working directory. Start a fresh session — a contaminated first prompt cannot be rolled back. Remember: `git reset --hard` does not delete untracked files and may bring a spoiler README back.

1b. **You** run the recon prompt on the whole repository. No criteria on purpose — the question is whether the model finds them itself:

> Study this codebase and determine which 2–3 modules or functions are the riskiest to leave without tests. Consider everything you find relevant. Briefly justify each choice.

1c. **Separate agents, separate prompts** produce two documents (texts in [reference.md](reference.md)): an issue-tracker scan of the last ~100 bugs → which modules break; a git change-frequency table for the last 12 months, significant modules only. Save them as `docs/incidents.md` and `docs/change-frequency.md`. Never mix them into the first prompt.

1d. **You**, second prompt with that context:

> Read the additional documents in docs/ (incident history and change frequency per module). Say how this changes your priorities, if at all.

Expected shape of the answer: "priority strengthened / confirmed / existing test is insufficient".

1e. **Human** checks the list against the three factors: (1) how often the code **was** the source of production incidents, (2) how often it changes, (3) what a failure costs — money or irreversibility. Cost outranks frequency: marketplace ranking is about money and goes above an unused internal report even if it breaks rarely. A production bug is a confirmed risk; a boundary you imagined is a hypothesis. Do not cover the whole legacy in one push — the net goes where the task takes you (boy-scout rule). Output: 2–3 targets with justification; take one.

### 2. Characterization (pinning) tests — before any refactoring

2a. **You** write the pinning tests. Prompt (enumerate input types only for a weak model — "cases the model may miss"; for a strong model drop the list):

> Write characterization (pinning) tests for function `checkRefundEligibility` from file `packages/server/src/checkRefundEligibility.ts`. Pin its current behaviour on different input types: a plain purchase, a purchase through a cohort, a purchase with an already issued certificate, a group order — without judging whether that behaviour is correct. Use the test database (`testDb`, see the setup file next to it). Constraints: do not open or use other test files of the project; do not modify the function itself. Make the tests green.

The words matter. Saying *characterization (pinning)* makes the model annotate the file itself with "these tests do not verify correctness" — that is the point.

> This is how important it is to use the right words.

2b. **Inputs come from reality**, not imagination: top-N requests from production logs replayed through today's code, a DB dump, or the test DB factories. An impure function is pinned against the real test database (testcontainers Postgres via the project's setup; Jest: same harness in `globalSetup`), never against a mocked DB. Check determinism first; a pin that blinks is worse than nothing.

2c. **Run the generated tests on the UNCHANGED code.** Red = you pinned an ideal, not a fact. Any diff outside test files = you modified the function under test (AGENTS.md §9) — revert it. Neither is fixed by editing expectations; re-prompt with the two-step formulation: first "pin what the function returns today, do not judge", then separately "what looks suspicious".

2d. **Human reads every pinning test.** A test named "does not block refund for a non-v1 certificate" is green and is a business bug pinned as fact. That is expected. Suspicious items go into a list for discussion, not into a fix. Ask the agent separately: "Of the behaviours you pinned, which look suspicious to you, and why? Do not change anything." A decision "this is a bug" belongs to the engineer.

2e. **You** clean the generated slop (a weak model wrote 266 comments on one file):

> For every comment in the file assess its value. If it describes what the code does rather than why — delete it.

2f. Pins must not be flaky: run the file three times and in random order. Name the file `*.characterization.test.ts` with a header "temporary safety net — delete after the refactoring of X". Commit: `pin: checkRefundEligibility`.

> Do not show these tests to the testing zealots. They look ugly, and that is normal, like everything temporary.

### 3. Refactor for testability under the green net

3a. **You** separate pure from impure — the top-1 technique, "90% of codebase problems come from mixing them":

> Extract a separate pure function `computeRefundEligibility` from the logic of `checkRefundEligibility` to separate the pure and impure logic of this file.

Target shape: the impure function becomes a thin shell that collects facts (`RefundFacts`) from the DB and calls the pure function with them and `now`. Do not introduce DI, ports or adapters for a single implementation (AGENTS.md §5) — if something exists only to make the code testable, that is a bad sign. Fix time with fake timers, not a clock provider.

3b. **Run the pinning tests.** They must stay green **without changing a single expectation**. A red pin is a bell: "something was missed — reflect". Is the break part of the intended change? If yes, the human accepts the new baseline consciously, with the reason in the commit. If not, fix the refactoring. Never edit an expectation to make a run green.

> Now your refactoring has a witness.

3c. Clean comments again (2e). Commit: `iteration 1`.

### 4. Real tests on the new structure + mutation loop

4a. **You** write normal unit tests on the pure function — expected values from the domain, not from running the code (AGENTS.md §1) — and run mutation testing:

> Write tests for `computeRefundEligibility`. Run mutation testing.

Hand off to `mutation-loop` for survivor classification (test gap vs equivalent mutant). If you catch yourself listing possible mutants in reasoning — stop: "Don't compute mutants yourself — that is what Stryker is for." Only survivors in the target file count.

4b. Impure shell: one integration test against the real test DB is enough to prove the facts are collected correctly; do not repeat the unit checks there.

4c. Now the actual change from the task. A new rule that breaks old fixtures (an old mock needs `progressPercent: 100`) is normal — every fixture is incomplete; add the field, keep the old expectations. Panic only if old expectations change.

4d. Commit: `iteration 2`.

### 5. Retire the pinning tests

- Pinning tests are temporary. "Nothing is more permanent than temporary" — once step 4 is done and the mutation score confirms the new tests verify, delete the `*.characterization.test.ts` file or fold the surviving useful cases into normal tests with domain-derived names. Keep them only when the project is just entering testing and they are not flaky, or locally on the author's machine as a first canary in a project whose coverage nobody trusts.
- Snapshot as pinning only where the requirement is literally "the API response stays byte-identical"; the baseline is still changed by a human, never `-u` (AGENTS.md §9); the assertion line carries `// ninja-testing-ignore: byte-identical pinning of <endpoint>` or the lint hook blocks it.
- Keep the scope bounded: refactoring boundaries and pins are limited to the piece the task touched. Next task, next piece.
- No premature documentation of the legacy: code is the source of truth, the architecture will move during refactoring and a spec with an error is worse than no spec. Do not store intermediate MD scenarios — write tests.
- After every production bug in this area, run the retrospective: at which step was it missed, and which test should have caught it?

## Done when

- Priorities were confirmed by incidents and change frequency, not only by "complex code".
- Every pinning test was green on the original code before any edit; the function file had no diff at step 2.
- The human read every pinning test; the suspicious list exists and no item in it was "fixed" silently.
- After the refactoring the pins are green with unchanged expectations (or every changed baseline has a human decision recorded).
- Pure/impure are separated; no DI or port appeared for a single implementation.
- Mutation testing ran on the pure function; survivors classified (`mutation-loop`).
- The pinning file is deleted, or marked temporary with an owner and a removal condition.
- Commits: `pin`, `iteration 1`, `iteration 2`; list of decisions you made on your own (AGENTS.md §2).

## Red flags

- **Agent normalises behaviour** — a pinning test expects "relevance" without the forgotten tag; the agent deleted the tag and said "I fixed it". Counter: run pins on the unchanged code; red = ideal pinned, not fact; two-step "pin, do not judge" → "what looks suspicious".
- **Silent implementation edit during "add tests"** — diff outside test files. Counter: revert; constraint "do not modify the function itself" in the prompt; hook on the diff.
- **Refactoring before pinning** — one PR with restructuring and "correct" new tests, no pins. Counter: order is fixed; "any refactoring, even the most harmless, can change behaviour".
- **Snapshot pinning regenerated with `-u`** — updated snapshot files without explanation. Counter: baseline change is a human decision, in the commit message.
- **Invented inputs** — test data not from production. Counter: top-N real requests plus dump, or factories from the project's harness.
- **Pinning a non-deterministic function** — the test blinks immediately. Counter: stop, report, different approach.
- **Whole-legacy coverage push** — test PRs not tied to tasks. Counter: boy-scout, net where you go.
- **Scope creep in the refactoring** — "the problem I have myself", a common confession. Counter: bounded diff; one function, one task.
- **Reasoning about mutants instead of running Stryker.** Counter: "Don't compute mutants yourself".
- **Slop comments** — hundreds of "what" comments. Counter: cleanup prompt (2e) or a hook.
- **Pins live forever** — metric: age of `*.characterization.test.ts`. Counter: step 5.
