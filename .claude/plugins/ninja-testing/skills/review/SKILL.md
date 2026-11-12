---
name: review
description: Review tests written by an agent or a human — mechanical pass via the test-reviewer subagent in a clean context, then the human pass "which tests are missing?". Use on "review these tests", "review the PR tests", "are these tests good", "check the tests the agent wrote", before merging tests.
argument-hint: "[diff | test files | PR] [--criteria <file>]"
---

# review

The author of a test always has a finished solution and is tempted to say "I wrote the correct code". An agent reviewing in its own session goes further: it recognises its own text and likes it, so "check whether the tests are good" comes back as "all good". A fresh session given the same question does the opposite — it finds new problems on every run, each worse than the last. Neither is a review. And no reviewer — human or model — can see what is not on the screen: the missing test is the one that ships the bug.

> The question is not what is written but what is not written. And that is exactly what the agent-reviewer did not see at all.

So the review is two passes with different owners. The **mechanical pass** (always-green tests, implementation coupling, name↔expect, mocked subject, wrong level, survivors) is delegated to the `test-reviewer` subagent with checkable signs. The **judgement pass** ("which tests are missing?", which combinations matter) stays with the human. This skill is the process around the subagent, not its checklist.

## When to use

- A PR or a diff adds or changes tests — yours, a colleague's, an agent's.
- An agent has just finished "write tests for X" or "make the tests green" and you are about to accept.
- After a `mutation-loop` iteration: an agent has "added a test to kill the mutant" and nobody has read it yet.
- The first tests an agent writes in a new project or module — read those completely, not by sampling; afterwards the agent copies the style.

Not for: deciding *what* to test (`test-plan-by-level`), turning the task into a spec (`test-as-spec`), triaging a test that passed on retry (`flaky-triage`), or code review of the implementation — tests are the contract, code is the implementation; review the contract first.

> Looking at tests is an order of magnitude — ten times — more important than looking at code.

## Inputs

- The diff of test files **and** the implementation files they exercise. A reviewer that sees only tests cannot compare them with the code.
- The acceptance criteria from the task: the input→output table with boundaries (AGENTS.md §2). If the task has none, write them now from the issue, or state explicitly that the review is against test names only — a weaker review, say so in the result.
- The level each test claims (unit / integration / E2E) — from the folder, the file name, or the task.
- The size of the portion. More than ~15 test files or ~100 new tests is not one review: split by feature or by file before starting.

> In small pull requests the context is small and the agent has spare attention to go into the code and compare code with tests. For a large set of tests the whole attention window is taken by the tests themselves, and the agent gets much lazier about looking at the real implementation.

## Procedure

**1. You (the agent) — collect the author's decisions before anyone reviews.**
Send to the *author* agent, in its own session, before it is closed:

> Development is finished. List every decision you made on your own that is not in the task: limits, rounding, ordering, defaults, error handling, what happens on empty or oversized input. One line each. Do not fix anything.

Attach the list to the review package. This is AGENTS.md §2 and §10 as a question, and it is the only cheap way to see boundaries that appeared in the implementation rather than in the task.

**2. Human — check the decisions against the acceptance criteria.**
For each decision: is it in the criteria? If it is and matches — fine. If it is not — it is either a new criterion (write it into the task) or a wrong guess (it becomes a finding). Boundaries the agent invented are your decisions now; they must leave a trace outside the code.

**3. You — run the mechanical pass in a clean context.**
Delegate to the `test-reviewer` subagent. Never do this in the session that wrote the tests. When a second model is configured (see `CLAUDE.md` → Model notes), run the reviewer on it: if the tests were written with Claude, review with Codex, and the other way round.

Invocation text (fill the brackets; keep the acceptance criteria inline, not as a path the reviewer may skip):

> Review the tests in [files / diff]. Implementation under test: [files]. Claimed level: [unit / integration / E2E]. Acceptance criteria: [input→output table, boundaries, error cases]. Decisions the author reported: [list from step 1].
> Do not answer "the tests look good". Report findings as `file:line — check — what is wrong — what would satisfy the check`. Specifically: (1) tests where at least one assert addresses an internal call, private state or the fact that a method was called instead of the return value of the public function; (2) mutation testing on the changed implementation files — list survivors with the mutated expression and every test that killed nothing; (3) for each test, does its name and its `expect`s claim the same thing as the acceptance criteria; (4) what is mocked, and whether the subject of the test is among the mocked things.

Do not write "check whether the tests are good", "review for quality", "make sure the tests are meaningful".

> "Check whether the test is good" is not an instruction. It is wishful thinking.

For Jest projects the reviewer runs `npx stryker run --mutate <file>` with the Jest runner; the survivor list is the same artifact.

**4. Human — first pass: name + what it checks.**
Read the reviewer's report, then read the tests yourself in this order and stop at the first level that does not surprise you:

1. The test name.
2. Only the `expect` lines — ignore everything else in the body.
3. What is mocked (`vi.mock`, `vi.fn`, store patches, `setProps`).
4. The logic — only if something in 1–3 caught your eye.

> I read the title first, then the expects, and only then, if something caught me, the logic.

Two questions per test, both answerable from name + expects:

- *If there were a bug in the place this test covers, would this specific check go red?* A `try/catch` that logs, `toBeDefined()`, `length > 0`, a mock's configured value compared with the result ("testing the mocks") all answer "no".
- *Could I restore the function's behaviour from its tests alone?* Where you would have to guess, the tests do not tell the whole story.

If name and expects do not surprise you, trust the mechanical pass for the internals. Exceptions where you read the whole file: the agent's first tests in this project/module, and any test the reviewer flagged.

Things worth a question rather than a verdict — the author agent usually fixes them itself when asked what they mean:

> What is the point of two such checks in a row? (`toBeLessThanOrEqual(3)` and then `toBe(2)` on the same value)

> Does it not seem to you that for a unit test "shows 0 hours" is incorrect, because "no-go = 0 hours en route" is an implementation detail of the system, not of the node we are testing?

**5. Human — second pass: which tests are missing?**
Stop for five minutes. No tool, no model. Write down, as named scenarios:

- past incidents in this module and the combination that caused each;
- the combinations that matter by criticality — the filter *and* another active filter, the last unit of a limited resource bought twice, `pending` counted against capacity;
- things models have no feel for: concurrency and time (`Promise.all` on the last seat), time zones, locales, missing file permissions;
- for E2E candidates: irreversible, money or access, real external boundary (AGENTS.md §7).

Where the module is combinatorial (flags, filters), *you* name the important combinations — from past bugs, criticality and the CI budget. Do not let the agent enumerate them all (exponential blow-up) and do not let it pick (it either misses the risky one or over-delivers "depending on effort").

Do not ask the agent "which tests are missing?" as the main tool. It is acceptable on the first days with a new team or module, as a prompt for your own thinking — never as the answer.

> AI will endlessly offer you new tests, as a rule of ever worse quality. Actually stopping for five minutes and thinking often saves hours of work.

The output of this pass is a list of named scenarios, each one line, e.g. "two concurrent purchases of the last seat → exactly one `sold_out`, `soldCount` = 5".

**6. You — send findings back to the author agent as "you did this — fix it".**
One message per portion, concrete, no generalities. Agents work badly with "do not do X" and well with "you did this — fix it": the search space is smaller. Template:

> In `purchase.test.ts:41` the test is named "rejects when sold out" but asserts only `orderId`. Assert `status === 'rejected'` and `reason === 'sold_out'`.
> In `pricing.test.ts:12` the expected value is computed with the same formula as `calcTotal`. Replace it with the constant from the task: 4 tickets at the group rate → 3600.
> Mutant `>= → >` at `pricing.ts:27` survived. Add the test on the boundary "exactly on the daily limit" from the acceptance table; if the function is continuous there, say "equivalent" and exclude it point-wise — do not add a test on an internal call.
> Missing: [scenarios from step 5, one line each].
> Constraints: do not modify the function under test; do not weaken, delete or skip any existing test; do not change the runner or mutation config.

Missing scenarios from step 5 go in the same message as one line each — in a real session, "I need tests for concurrent ticket purchase" was enough for three correct concurrency tests.

**7. You — re-review the delta only.**
After the fix, run step 3 on the changed tests only (a small portion again), then step 4 on the new assertions with one extra question: *is this test understandable without knowing which mutant or finding produced it?* A new `toHaveBeenCalledWith` on an internal method that "kills the mutant" is implementation coupling leaking in at the refinement step — the most common leak in teams running this loop. Throw such a test away.

**8. You — reliability gate before merge.**
Run the whole suite with parallelism and random order (AGENTS.md §10), and the changed files several times. Reliability of a suite is the product of its tests: 50 tests at 99% each ≈ 60% green runs, at 99.9% ≈ 95%; 100 tests at 99.9% ≈ 90% — every tenth run fails. A test that passed on retry is a finding, not a pass: hand it to `flaky-triage`, do not raise a timeout.

> You have 100 tests, each working with a splendid reliability of 99.9%. And in total every tenth run fails. Will there be trust in such tests? No.

## Done when

- Every decision from step 1 is either in the acceptance criteria or turned into a finding; none is silent.
- The `test-reviewer` report exists for this portion, produced in a clean context (different model when one is configured), and every finding is fixed or explicitly rejected with a reason.
- Mutation testing ran on the changed logic files; no surviving mutant is left unclassified; every "equivalent" has a one-line explanation and a point-wise exclusion.
- For every test, name and `expect`s say the same thing; no test compares a mock's configured value with the result; nothing that the test was supposed to exercise is mocked.
- The human "missing tests" list from step 5 is written down and each item is a test or a documented decision not to write it.
- No new assertion exists only to kill a mutant; each is understandable without the mutant.
- The full suite passed with parallelism and random order; no test was accepted on a retry.

## Red flags

- **Reviewer report says "tests look good" / "no issues"** — the question was open-ended, or the reviewer ran in the author's session. Re-run with the step 3 text in a clean context.
- **Every re-run finds new, different problems** — same cause from the other side. Stop re-asking the open question; give checkable signs and the acceptance table.
- **The reviewer flagged nothing about mocks in an "integration" test** — check step 4 item 3 yourself: a mocked repository, store method or selector makes it a unit test with a fake DB (AGENTS.md §7).
- **Findings list is long but none touches implementation files** — the portion was too big; the reviewer read tests only. Split and re-run.
- **Agent proposes the list of missing tests unprompted, and it is long** — combinatorial enumeration. Take only the items you would have named yourself in step 5.
- **The fix for a finding edits the function under test, weakens an assert, or changes thresholds / `excludedMutations` / `mutate` in `stryker.config`, or touches `vitest.config`** — AGENTS.md §9. (Scoping `mutate`, reporters and the gate are infrastructure work done by a human, never a reaction to a red run.) Reject the change, re-send the finding with the constraints line.
- **A new assertion is an internal call "because the mutant needed it"** — leaked implementation at the refinement step; delete it and add the boundary from the table instead.
- **Two checks on the same value where one absorbs the other** (`toBeLessThanOrEqual(3)` then `toBe(2)`) — ask the author what the point is; it will remove one.
- **"Passed on the second run"** in the PR conversation — not a pass; `flaky-triage`.
