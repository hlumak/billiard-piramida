# legacy-characterize — reference

Supporting material for `SKILL.md`. The core prompts (recon, docs follow-up, pinning, extraction, comment cleanup) live in the skill; this file holds the auxiliary agent prompts, the prioritisation worksheet, the shape of a pinning test built from real inputs and the human review checklist.

## A. Auxiliary agent prompts (step 1c)

Run each in its own agent/session. Their outputs are context for the second recon prompt, never part of the first one.

**Issue-tracker scan** (input: export of the last ~100 bugs, or tracker access):

> Analyse the last ~100 bug reports in this tracker. For each bug name the module or file where the root cause lived (not where it was noticed). Produce a table: module — number of bugs — the three most recent bug titles — whether the bug touched money, access or an irreversible operation. Do not read the source code to guess; use only the bug reports and their linked fixes.

**Git change frequency** (input: the repository):

> Using `git log --since="12 months ago" --name-only`, count how many commits touched each file. Keep only significant modules (business logic, data access, payment, access control); drop generated files, lockfiles, tests, docs. Produce a table: file — commits in 12 months — number of distinct authors. Do not judge risk; only count.

Save the results as `docs/incidents.md` and `docs/change-frequency.md`. In a real session the tables looked like this:

```
docs/change-frequency.md
checkRefundEligibility.ts   14
calculateProgress.ts         6
checkGroupOrderRefund.ts     3
AdminAnalyticsDashboard.tsx  2
CourseCatalogSearch.tsx      1
```

```
docs/incidents.md
1. Refund approved after a Pro certificate had been issued.
2. Progress reset to zero after lessons were reordered.
3. Group order for 20 seats refunded partially (should be all-or-nothing).
```

## B. Prioritisation worksheet (step 1e)

Fill one row per candidate the recon named. A candidate with a "yes" in *money / irreversible* goes to the top regardless of frequency.

| Candidate | Incidents (past prod) | Commits / 12 mo | Money / irreversible? | Business rule or glue? | Verdict |
|---|---|---|---|---|---|
| `checkRefundEligibility` | 1 (refund after certificate) | 14 | money | rule, three eras layered | pin first |
| `checkGroupOrderRefund` | 1 (partial refund) | 3 | money, no atomicity | rule, copy of the refund rule | second |
| `calculateProgress` | 1 (progress reset) | 6 | no (visible, fixable by hand) | rule with unfinished migration | third |
| `AdminAnalyticsDashboard` | 0 | 2 | no | glue | leave |

Rules of thumb:

- A business rule has high cost of error and low visibility — it can return slightly wrong numbers for months and nobody raises an alarm. Glue has the opposite profile: the error shouts by itself.
- "Everywhere a little" is the worst of both worlds. Attention for reading generated tests is finite; spend it where the risk is.
- Before labelling something "just glue", check whether the wrapper decides an amount, a status or a right. Agents do this audit well: "Does this function make any business decision (sum, status, permission) besides formatting?"
- Code untouched for years and never in an incident can wait — "though once a year even a stick fires".

## C. Shape of a pinning test from real inputs (step 2b)

For a deterministic function with recorded production inputs (example: `rankSearchResults(query, catalog)`):

1. Take the top-N queries from production logs (N = 100 in the example) and a DB dump or slice consistent with the period of the logs.
2. Replay each query through **today's unchanged code**; record the result as the expected value. Any agent, "even the dumbest", can do this mechanical part.
3. Store the pairs as a table-driven test; do not compute anything inside the test.

```ts
// packages/search/src/__tests__/rankSearchResults.characterization.test.ts
// Temporary safety net for the refactoring of rankSearchResults.
// These tests pin behaviour as of <date>; they do NOT verify correctness.
// Delete after the pure ranking function has its own tests and a mutation run.
import { it, expect } from 'vitest';
import { rankSearchResults } from '../rankSearchResults';
import { catalogSnapshot } from './fixtures/catalog-2026-08-snapshot';
import { pinned } from './fixtures/rankSearchResults.pinned'; // [{ query, expectedIds }]

it.each(pinned)('pins ranking for production query "$query"', ({ query, expectedIds }) => {
  const result = rankSearchResults(query, catalogSnapshot);

  expect(result.map((item) => item.id)).toEqual(expectedIds);
});
```

For an impure function (example: `checkRefundEligibility(db, enrollmentId, now)`) the "real input" is the test database with the project's factories (`insertEnrollment`, `insertCertificate`, `insertGroupOrder`…), one scenario per test, `now` passed explicitly, no mocked DB. Jest projects use the same testcontainers harness from `globalSetup`.

Snapshot as pinning: acceptable only when the requirement is "the API response stays byte-identical". Then `toMatchSnapshot()` on the serialised response is the pin, the snapshot file is committed with the `pin:` commit, and a later diff is shown to a human — never `-u`.

## D. Human review checklist for pinning tests (step 2d)

Read every generated test. For each one answer:

1. **Fact or ideal?** Would this exact expectation be produced by running today's code? If the file was red on the unchanged code, the agent pinned what it thought should happen. Discard that test, re-prompt with "pin, do not judge".
2. **Did the function change?** `git diff -- <function file>` must be empty.
3. **Is the input real?** From logs, a dump or project factories — not an invented object that "looks like" an enrollment.
4. **Is it deterministic?** Run three times, random order. A blinking pin is worse than no pin.
5. **Does it look suspicious?** Mark, do not fix. Example: `does not block refund for a non-v1 certificate` is green and pins a business bug (`templateId === 'v1'` written before `v2`/`v3` existed). The right move was to keep the pin and put the item on the discussion list.
6. **Slop?** Comments describing what the code does, restated setup, `expect(...).not.toThrow()` as the only assertion — clean up with the comment prompt; a test with no meaningful `expect` is deleted.

Suspicious list format (goes to the task, not to the code):

```
Suspicious behaviour pinned in checkRefundEligibility (not fixed):
- non-v1 certificate does not block refund — check against the refund policy for Pro/Team.
- group order: refund allowed per seat — incidents.md #3 says all-or-nothing.
Decision owner: <name>. Until decided, the pins stay as they are.
```

## E. Follow-up prompts that worked

After the pins are green and reviewed, and only then:

> Of the behaviours you pinned, which look suspicious to you, and why? Do not change anything; return a list.

When the model reasons about mutants instead of running the tool (step 4):

> Don't compute mutants yourself — that is what Stryker is for. Run `npm run test:mutation` and report the survivors in `computeRefundEligibility.ts` only.

When a new rule breaks old fixtures (step 4c):

> The old fixtures fail because the new rule needs a field they do not define. Add the missing field to those fixtures with the value that preserves their original scenario. Do not change any existing expectation; list the fixtures you touched.
