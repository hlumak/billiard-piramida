# Mutation loop — reference

Companion to `SKILL.md`. Worked survivor classifications, the report fields you need, and the prompt texts in one place.

## 1. What a survivor looks like in `report.json`

```json
{
  "files": {
    "src/visitFee.ts": {
      "mutants": [
        { "id": "27", "mutatorName": "EqualityOperator", "status": "Survived",
          "replacement": "groupSize < 4", "location": { "start": { "line": 18, "column": 20 } },
          "killedBy": [], "coveredBy": ["visitFee.test.ts#calculateVisitFee small group base fee"] },
        { "id": "41", "mutatorName": "ConditionalExpression", "status": "Killed",
          "replacement": "false", "killedBy": ["visitFee.test.ts#… inside the May holidays"] },
        { "id": "58", "mutatorName": "BlockStatement", "status": "NoCoverage", "replacement": "{}" }
      ]
    }
  }
}
```

- `status`: `Killed` (a test failed), `Survived` (all tests green), `NoCoverage` (no test executed the line — a missing test, counted against the score), `Timeout` (counted as killed), `Ignored` (excluded by config or comment, not counted), `CompileError`/`RuntimeError` (not counted).
- `replacement` is the mutated expression; the original is the source at `location`. Read both before classifying.
- `coveredBy` non-empty and `killedBy` empty is the signature of a test gap or an equivalent mutant: the tests ran the line and none noticed.
- A test that appears in no `killedBy` anywhere in the file is a test that killed nothing (SKILL.md step 7).
- Score for the file = Killed + Timeout over Killed + Timeout + Survived + NoCoverage. Jest projects get the same JSON from `@stryker-mutator/jest-runner`.

## 2. Classification examples

All from a fee calculator example (`calculateVisitFee`: park load = first 4 people at 1 point, every further person at 1.5 *over* the threshold; nights the same; tariff tiers by load; high season = summer and May holidays 25.04–10.05; surcharges for campfire and protected zone; discounts for club years and early booking, **not summed — the largest applies** via `Math.max`) and a refund-eligibility example.

| # | Original → mutant | Question you ask | Verdict | Action |
|---|---|---|---|---|
| 1 | `month === 5 && day >= 25` → month check removed | Is 25 April in the task? Yes: "May holidays 25.04–10.05". Do the tests contain an April date on or after the 25th? No. | **Test gap** | Table-driven tests: 24.04 → base, 25.04 → season, 10.05 → season, 11.05 → base. Names by role ("first day after the May holidays"), dates in `expected*`/`date*` constants. In a real session the hand-written case `{ groupSize: 10, visitDate: '2026-05-11' } → 900` was the first one; it killed nothing until the mutated expression was read. |
| 2 | `day < 25` → `day <= 25` | Same boundary, the other side. Does any test sit exactly on 25.04? No. | **Test gap** | The 25.04 row above kills it. One boundary needs both sides: just below, on, just above. |
| 3 | `groupSize <= 4` → `groupSize < 4` | At `groupSize === 4`: original branch gives 4 points; mutant branch gives `4 + (4 − 4) × 1.5 = 4`. Equal. | **Equivalent** | `// Stryker disable next-line EqualityOperator: continuous at 4 — extra-person multiplier is 0 × 1.5`. Do not write "uses the first block, not the second" — that pins the implementation. If the rule were "from the 5th person on, *everyone* pays 1.5", the results would differ and this would be a test gap. |
| 4 | `nights <= N` → `nights < N` | Same shape as 3, same arithmetic. | **Equivalent** | Same exclusion, same reason, own line. |
| 5 | `groupSize < 3` guard removed | Is a minimum group size in the task? Observed: yes (the strong model still missed it). | **Test gap** | Tests for 2, 3, 4 people; the 2-person case expects the rule from the task (rejection or minimum fee), not whatever the code does. |
| 6 | `Math.max(clubDiscount, earlyDiscount)` → `Math.min(...)` | Do the tests contain a case where the club discount alone is the larger one, and one where early booking alone is? Tests varied one while the other dominated. | **Test gap** | One case per rule where exactly that rule is the maximum and the result changes; one case where they tie is optional. "Not summed" needs a case where summing would give a different number. |
| 7 | `return Math.round(fee)` → `return fee` | Is rounding in the task? No — the agent added it. | **Implementation-born boundary** | Do not write a test that blesses rounding. List it under "decisions made on my own": "fee is rounded to whole hryvnias — not in the task". Human decides, records in the issue, then the row goes into the spec table and the test follows. |
| 8 | `if (!facts.hasCertificate \|\| facts.certificateTemplateId === 'v1')` → `\|\|` replaced by `&&` | Is "v1 certificates are refundable" in the refund rules? Check the characterization tests and the PRD. | **Test gap** if the rule exists; **implementation-born** if the code is the only place it lives | Either a row `hasCertificate: true, templateId: 'v1' → eligible` or an escalation: "code treats v1 as refundable; no rule says so". |
| 9 | Second `if (size > MAX_SIZE)` inside a helper removed, outer check remains | Is the check duplicated on purpose (defence in depth)? Result identical on every input? | **Equivalent** (duplicate check) | Exclude with reason "guarded by the caller's check at line N", or remove the duplicate if the human agrees — never a test that reaches the helper directly. |
| 10 | `unpackedSize > MAX_UNPACKED` → `>=` in a zip validator | Is the unpacked-size limit in the task? In a real session the task said "a valid zip" — a stop-word. | **Implementation-born boundary** | Escalate: "the agent added a 2 GB unpacked-size limit (zip bomb); the task says only 'valid'". The human fixes the number in the issue; then it is a spec boundary and gets its three tests. |

## 3. Continuity proof in thirty seconds

1. Take the boundary value `b` from the original expression.
2. Evaluate the *function's result* (not the branch) with the original and with the mutant at `b`, `b − ε`, `b + ε` (integers: `b − 1`, `b + 1`).
3. All three pairs equal → equivalent; exclude point-wise. Any pair differs → test gap; that input is your new test row.
4. Write the arithmetic into the exclusion reason so the next reader does not redo it.

Do this in a scratch file or REPL, not in the test suite — a test that asserts "both branches give 4" is the leaked implementation the loop warns about.

## 4. Point-wise exclusion syntax

```ts
// Stryker disable next-line EqualityOperator: continuous at BASE_GROUP (0 × 1.5 = 0)
const load = groupSize <= BASE_GROUP ? groupSize : BASE_GROUP + (groupSize - BASE_GROUP) * 1.5;

// Stryker disable EqualityOperator,ConditionalExpression: duplicate of the caller's guard (api.ts:42)
if (size > MAX_SIZE) throw new RangeError('too large');
// Stryker restore EqualityOperator,ConditionalExpression
```

- Always name the mutator and the reason; a bare `Stryker disable` hides future real survivors on that line.
- Do not put the mutator into `excludedMutations` in the config — that switches it off for the whole project.
- Mutator names you will meet on boundaries: `EqualityOperator` (`<` ↔ `<=`, `===` ↔ `!==`), `ConditionalExpression` (condition → `true`/`false`), `LogicalOperator` (`&&` ↔ `||`), `ArithmeticOperator`, `BlockStatement` (body removed), `StringLiteral`, `BooleanLiteral`.

## 5. Prompt texts that worked

The deliberately naive baseline prompt (it produced 100 % coverage and 16 survivors — that is the lesson; not a production prompt, AGENTS.md §9 gives the form):

> "Write unit tests for the function `calculateVisitFee` from `packages/shared/src/visitFee.ts`. Requirements: put the tests in a new file. Make the tests green and raise coverage as high as possible. You can check yourself with `npm test`. Changing any existing files is forbidden. Reading other project files is forbidden — work with `visitFee.ts` only."

Feeding the report back:

> "In `packages/shared/reports/mutation/report.json` there is the mutation testing report for your tests. Read it. You may improve. Report which changes were made."

Classification request:

> "Here are the surviving mutants. For each one say whether it is a test gap (insufficient testing) or an equivalent mutant, and why."

After an exclusion is agreed:

> "Go ahead, put it into `stryker.config.json`." (observed; prefer the source comment above so the reason lives next to the code)

Rerun after the strong model's first pass:

> "Look at the mutation testing results and fix your tests."

Course correction when the model enumerates mutations in its head:

> "Don't compute mutants yourself — that is what Stryker is for."

Zero-kill test:

> "Look specifically at this test — is everything alright with it? What does it check?"

Second agent, clean context, after the refine step:

> "Does any test in `<file>` check an unnecessary implementation detail? For each such test quote the assertion and say what result or visible effect it should assert instead."

## 6. Observed numbers, for calibration

- Cheap model, first pass: 100 % statement and branch coverage, 119 killed / 16 survived (≈88 %); three validation runs 87.41 % / 92 % / 95.56 %. After one report-driven pass: 98 %, the two remaining survivors equivalent.
- Strong model, same prompt: 97.04 % first pass, still missed the month check and `groupSize < 3`.
- Pure function extracted from a DB-bound refund check: 51 mutants, 51 killed; the one survivor (#82) was in another file.
- Whole-project scale: 3500 mutants, 150 survived — a good result, not a failure. 800 survivors is what made manual classification impossible before agents.
- Cost: one file of pure logic ≈ 4 s; a 10 s unit suite × 100 mutants ≈ 20 min, on four workers ≈ 5 min. "Is five minutes of waiting worth a radically higher level of trust in what the agent writes? I say yes."
