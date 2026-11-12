---
name: mutation-loop
description: Run Stryker on changed logic before a PR and classify every survivor (test gap / implementation-born boundary / equivalent mutant) without leaking implementation into tests. Use for "run mutation testing", "check the tests with Stryker", "kill the survivors", or before declaring logic tests done.
argument-hint: "<path/to/logic-file.ts> [more files]"
user-invocable: false
---

# Mutation loop

Coverage measures execution, not verification: a green test on a line proves the line ran, not that anything was checked. In a real session, a cheap model produced 100 % statement and branch coverage on a fee calculator and Stryker still found 16 survivors out of 135 — the whole May-holidays season check was missing. Mutation testing is the only tool that catches this, and it is the tool that lets you tell an agent "you did this — fix it" with a concrete mutant instead of "don't write bad tests". Agents get it wrong in three ways: they reason about mutants instead of running Stryker; they kill a survivor with an assertion on an internal call; they chase 100 % and start testing equivalent mutants. This procedure prevents all three.

> Don't compute mutants yourself — that is what Stryker is for.

## When to use

- You (the agent) wrote or changed tests for logic, or implemented logic against tests. Run this before you say "done" (AGENTS.md §8, §10).
- A human says "run mutation testing", "check the tests", "kill the survivors", "why is the mutation score low".
- A coverage gate is green but nobody trusts the tests.

Do not use it for:
- Slow tests, browser-mode component tests, DB-bound integration tests, E2E. Stryker cannot instrument browser mode and a run per mutant against a database or a browser is unaffordable. Extract the pure logic first (`legacy-characterize` for untested code) and mutate the pure module.
- Deciding *which* behaviours to test — that is `test-plan-by-level`; turning a task into boundaries — `test-as-spec`.
- Reviewing test text without a mutation run — the `test-reviewer` subagent.

## Inputs

- The logic file(s) under test and their test file(s). Ask which files if not given; never mutate `src/**`.
- Fast unit tests of pure logic: the whole unit suite green, milliseconds per test. If the function mixes I/O and logic, stop and extract first (step 0).
- A Stryker config with `mutate` scoped to these files, `testRunner: "vitest"` (Jest: `@stryker-mutator/jest-runner`, `testRunner: "jest"`), and a JSON report path:

```json
{
  "mutate": ["src/visitFee.ts"],
  "testRunner": "vitest",
  "reporters": ["html", "json", "progress"],
  "jsonReporter": { "fileName": "reports/mutation/report.json" },
  "thresholds": { "high": 90, "low": 80, "break": null }
}
```

- The acceptance criteria of the task (input → output table with boundaries). Without them you cannot tell a test gap from a boundary the implementation invented.

## Procedure

0. **Separate pure from impure (you, only if needed).** If the logic sits inside a function that reads a DB, the clock or the network, extract a pure function first and leave the original as a thin wrapper that only gathers facts. A prompt that worked: *"Extract a separate pure function `computeRefundEligibility` from the logic of `checkRefundEligibility`, to separate the pure and impure logic of the file."* Existing tests must stay green without changing a single expectation. Artifact: the pure function and its wrapper.

1. **Baseline (you).** Run the whole unit suite (`npm test`), then `npm run test:coverage`. Everything green, coverage on the target file known. Do not touch the mutation config to make anything pass (AGENTS.md §9).

2. **Run Stryker on the changed files, not on the project (you).**
   - Project script: `npm run test:mutation` (runs `stryker run` with the config's `mutate`).
   - Scoped: `npx stryker run --mutate src/visitFee.ts` (comma-separate several files).
   - Repeated iterations: add `--incremental` so only mutants touched by changed code/tests re-run; `--force` to discard the cache.
   One file of pure logic takes seconds. If it takes minutes, the tests are not unit tests — go back to step 0.
   Artifact: `reports/mutation/report.json` (plus the HTML report).

3. **Read the report (you).** For the target file collect: killed, survived, no-coverage, timeout, ignored; the score = (killed + timeout) / (killed + timeout + survived + no-coverage). For every survivor note the mutator, the original expression and the replacement (`<=` → `<`, a removed condition, `true`/`false`, a changed constant). Survivors in files outside your change are not yours — say so and leave them. `no-coverage` on a line of business logic is a missing test, not a mutation problem.

4. **Classify every survivor (you, then the human confirms).** Read the mutated expression, the acceptance criteria and the tests. Three verdicts, no fourth:
   - **Test gap** — the boundary is in the task (or in the domain rules) and no test sits on it. Add one test on that exact boundary: the value just below, on, and just above. Name the role of the boundary ("first day after the May holidays"), put the number into an `expected*` constant (AGENTS.md §3).
   - **Boundary that appeared in the implementation** — a limit, rounding, default or ordering the agent introduced that no task mentions. Do not silently write a test that blesses it. Escalate: list it under "decisions made on my own", the human decides and records it in the issue. "Even if the agent made the decision, you are responsible for it."
   - **Equivalent mutant** — behaviour is indistinguishable from outside. The classic case: the function is continuous at the boundary. Example: `groupSize <= 4` → `< 4` survived because the first four people cost 1 point each and every extra person 1.5 *over the threshold*; at exactly 4 the multiplier is zero, both branches return the same number. "Can you rewrite the code so the mutant cannot arise? No. This is the smoothness of the function." Other causes: defensive duplicate checks, a mutation neutralised by another check on the same data.
     Prove continuity by evaluating both expressions at the boundary value; if the results differ, it is a test gap. Exclude point-wise with a reason, in the source:
     ```ts
     // Stryker disable next-line EqualityOperator: continuous at groupSize === 4 (0 × 1.5 = 0), <= vs < is unobservable
     const overload = groupSize <= BASE_GROUP ? groupSize : BASE_GROUP + (groupSize - BASE_GROUP) * 1.5;
     ```
     The guard hook asks for confirmation on every edit that adds `Stryker disable` — that *is* the human confirmation; in a headless run, put the proposed comment in your report instead of applying it. A threshold, date or default that is in the task is never an "implementation boundary" and is never excluded — measured: a weak model disabled the tariff thresholds under that label to lift the score from 78 % to 90 %.
     Never lower `thresholds`, never widen `excludedMutations` for a whole mutator, never edit the config to make the score pass. See `reference.md` for worked examples of all three verdicts.

5. **Hand the report to the agent with the survivor in hand (the human, or you to a subagent).** The prompt that worked, verbatim:

   > "In `packages/shared/reports/mutation/report.json` there is the mutation testing report for your tests. Read it. You may improve. Report which changes were made."

   Short form after a rerun: *"Look at the mutation testing results and fix your tests."* When the agent starts enumerating possible mutations in its reasoning, interrupt: *"Don't compute mutants yourself — that is what Stryker is for."* Always name the concrete survivor ("you did this: `day < 25` survives on May 25 — fix it"), never a prohibition ("don't miss boundaries"): the search space for "you did this, fix it" is many times smaller. Artifact: new or changed tests and the agent's list of survivors it declares equivalent, each with a reason.

6. **Leakage check on every new assertion (you, then the human).** This step is where implementation detail leaks into tests in teams that adopted the loop, because nobody reads the tests any more. For each assertion added since step 2 ask:
   - Does it look at a *result or visible effect*, or at an *internal call*? `toHaveBeenCalledWith` on a helper to kill a mutant is the agent's shortest path; throw the test away and assert the value instead (AGENTS.md §1).
   - Is the test understandable without knowing which mutant produced it? A test that fixes "the price uses the first tariff block, not the second" on a continuous boundary is a leaked implementation — the honest answer was "equivalent mutant".
   - "If in the assertions you do not understand where this detail of behaviour comes from — that is a reason to throw the test out."
   Optional, when tokens allow: a second agent in a clean context (the `test-reviewer` subagent) with one question: *"Does any test check an unnecessary implementation detail?"* Artifact: the tests that survived the check; the ones discarded named in the report.

7. **Tests that killed nothing (you).** From the per-test data in the report (HTML report, or in the JSON: every test in `testFiles[].tests[]` whose id appears in no mutant's `killedBy` under `files[].mutants[]`) list every test in the target file with zero kills. A test that kills no mutants is a strong signal — not a verdict, Stryker may lack the creativity — that it verifies nothing. Ask the agent: *"Look specifically at this test — is everything alright with it? What does it check?"* Rewrite or delete; do not keep it for coverage.

8. **Rerun and repeat (you).** `npx stryker run --mutate <file> --incremental`. Go back to step 4 until every remaining survivor is an excluded equivalent with a reason. Two to three iterations are normal; in a real session the cheap model went 88 % → 98 % in one pass with the report, the strong model 97 % → clean after one "fix your tests". Then run the whole suite once more (parallel, random order) and list your decisions (AGENTS.md §10).

## Gate policy

- Two gates together, never one: coverage above the project threshold **and** mutation score above the mutation threshold. Each alone catches its own kind of bad test; coverage without mutation is what agents optimise into always-green tests.
- Score is computed **per merge request** on the changed logic files, not for the whole project ("unreal for any sizeable project"), and it is a hard gate on the way to merge.
- Start at **90 %**, be ready to move it up or down; different domains legitimately have different bars (money and access higher). **Never 100 %** — a 100 % bar produces tests on equivalent mutants and internal details. 150 survivors out of 3500 is a good result, not a failure.
- Run on unit tests of pure logic only; integration tests when they are fast; E2E never (black box, ten-minute runs, no per-mutant test selection).
- Where exclusions live: an equivalent mutant is excluded with `// Stryker disable next-line <Mutator>: <reason>` next to the code — the reason lives where the reader is. `stryker.config.*` is edited only as infrastructure (scoping `mutate`, reporters, the gate threshold decided by a human), never in reaction to a run; the guard hook asks on every config edit for exactly this reason.
- Goodhart: the moment mutation score becomes the goal it stops being a metric. Never hand an agent "raise the mutation score to N"; hand it the concrete survivors and the acceptance criteria (AGENTS.md §9). Watch mutation score, coverage and the sanity of the tests together — "agents strive to make everything look good, not to make it actually work".

## Done when

- `npm run test:mutation` (or the scoped run) on every changed logic file: zero survivors that are not excluded with a reason comment; no `no-coverage` mutants on business logic.
- Every exclusion is point-wise (`Stryker disable next-line <Mutator>: <reason>`), the reason states why behaviour is unobservable (continuity, duplicate check), and the config thresholds and `excludedMutations` are unchanged.
- Every boundary that appeared in the implementation is listed under "decisions made on my own" and, for a human-run loop, recorded in the issue.
- No test in the target file has zero kills, or each such test has a written justification.
- Every assertion added in this loop reads as a check of a result or visible effect and is understandable without the report.
- Coverage on the file did not drop; test names carry no numbers; the whole suite passes in parallel with random order.

## Red flags

- **Agent reasons about mutants instead of running the tool** — "the possible mutations of this condition are …" in the reasoning, no `stryker run` in the log. Counter: "Don't compute mutants yourself — that is what Stryker is for"; check the command log before accepting a score.
- **100 % coverage, survivors on `===`/`<` in season or threshold logic** — the run executed the branch on non-boundary data. Counter: a test on the exact boundary (May 24 / 25 / May 10 / 11), not "more tests".
- **Survivor killed by `toHaveBeenCalledWith`** — the shortest path to a kill. Counter: step 6; throw it away, assert the returned value.
- **Test fixing which branch was taken on a continuous boundary** — an equivalent mutant "killed" by pinning the implementation. Counter: evaluate both sides; if equal, exclude with a reason, do not test.
- **Config edited to pass** — `thresholds.break` lowered, a mutator added to `excludedMutations`, `mutate` narrowed to exclude the file. Counter: the guard hook asks for confirmation on every config edit — answer "no"; the fix is in the tests.
- **`mutate: ["src/**"]`** — a run that takes an hour and a report nobody reads. Counter: scope to the changed files; incremental runs.
- **Competing rules hide gaps** — several discounts under `Math.max(...)`, "not summed, the largest applies": tests vary one discount while another dominates, so the mutant on the varied one survives. Counter: for each rule a case where exactly that rule is the maximum and the result changes.
- **Agent reads previous reports or validation logs to derive expected values** — Counter: "work with this file only"; AGENTS.md §9.
- **Manual guess at a killing test** — a hand-written boundary case killed nothing ("the probabilistic nature"). Counter: read the mutated expression first, then write the test for that expression.
