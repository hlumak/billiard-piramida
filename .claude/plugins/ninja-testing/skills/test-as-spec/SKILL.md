---
name: test-as-spec
description: Turn a task into a test-as-spec (input→output table with boundary rows) before implementing, then hand it to an implementer under strict constraints. Use for "implement X", "add a function that…", "the task says…", or before delegating implementation to a weaker model.
argument-hint: "<task / issue / function name> [--two-step] [--differential]"
user-invocable: false
---

# Test as spec

Two agents get the same task in prose — "truncate the text to 50 characters, add an ellipsis if longer". Both PRs are green, both are merged. Then a text lands exactly on the limit and one implementation counts the ellipsis inside the limit, the other outside. Nothing in the prompt said which. The agent had to make a dozen small decisions nobody voiced, and it shipped each one as confident, finished-looking code — not marked as a choice. Rerun the same prompt and the decisions change. On code review the difference is invisible.

> The wording differed in one thing: what the agent's input was — a paragraph of text or a test.

The test is not a record of a finished solution; it is one way of stating the task. Concrete input→output pairs close every fork before the implementer opens it, and the same pairs are the acceptance criteria — you accept by the tests given on the way in, never by tests the implementer wrote itself. The cost is that you have to think about the edges up front. The pattern does not remove that work; it moves it to the cheapest possible moment.

## When to use

- You are about to implement behaviour from a task, issue, or a sentence in chat, and the logic has thresholds, ranges, rounding, ordering, limits, or an "if longer / older / heavier than" clause.
- Several implementations are equally plausible from the prose and you can already imagine the case that separates them.
- You are delegating implementation to another model (especially a weaker one) — the spec is the only channel through which you talk to it about required behaviour.
- There is a contract between two sides (frontend ↔ backend, two teams): one spec is the input to both parallel tasks.

Do **not** use it as the whole task description when:

- the requirement is a side effect (email sent, file written, event emitted) or subjective (wording quality, how a UI feels). Describe those in prose and append: *"Focus on these edge cases: …"* with the list from step 1. The pairs you can state still go in a table; the rest does not.
- the task is "cover existing feature X with tests" → `test-plan-by-level`. Existing code without tests that must change → `legacy-characterize`.

## Inputs

- The task text (issue, message, PRD fragment). An issue is also a prompt: apply every check below to it as well.
- The domain source for expected values: requirements, the task, or the domain owner. Expected values never come from running code (AGENTS.md §1). If the task does not say what the output must be at a boundary, that boundary is a question, not a guess.
- The signature or a proposed one (`calcTripCost(durationMin, startHour, tariff)`); the target test file path and the runner (Vitest assumed; `it.each` exists in Jest too; the tagged-template table form exists in both runners and is not used here — see `unit-tests.md`).
- Which model implements. If it is weak, or the module is critical, plan the two-step mode (step 5).

Missing task text or missing expected values → ask before writing a single row. Do not infer a contract from the function name.

## Procedure

1. **You: list the boundaries.** Read the task and write, as plain comments, every threshold with three rows — the value just below, exactly on, just above — plus: empty input; an input that violates an assumption (one word longer than the limit; a zero-minute trip); a non-integer where the type allows one. If a value is a limit, add the row that hits the cap. A missing boundary row is undefined behaviour: the absence of a test says nobody thought about it.
2. **You: run the stop-words check on the task and on your rows.** *Valid, correct, proper, properly, validated* and their synonyms without a number or a boundary next to them are stop-words. "The file must be a valid zip" — is a 100 GB archive valid? One that unpacks to 3 TB? Replace each stop-word with a concrete limit or ask the human for one. If you do not set the limit, the implementer will not ask — it will decide for you, and its notion of "valid" differs from yours.
3. **You: for every constraint ask — requirement or implementation detail?** "Splits on spaces using `split(' ')`", "calls the tariff resolver once", "uses the first range, not the second" are implementation details: drop them from the spec and never put them into an assertion. Assertions touch only what the function returns outward. Do not dictate internal structure; in a project with decent code the implementer copies the surrounding style. The one exception: a fresh project, or one without an architecture linter, or with code of doubtful quality — then add a one-line architectural constraint to the prompt ("check that the logic does not live in controllers") and, then turn it into a lint rule afterwards.
4. **You: write the spec as an `it.each` table.** One row per pair, boundary rows first-class, the role of the boundary in the label, no numbers in test names outside the parameters, no logic (AGENTS.md §3). A generic shape, for a trip-cost function with a night rate from 23:00 to 06:00, a 10% discount for trips longer than three hours, a minimum fee, and rounding to whole units:

   ```ts
   const tariff = { baseFee: 40, dayRate: 6, nightRate: 9, minFee: 60 };

   // rows: the role of the boundary in the label, the numbers in the parameters (the `%i` placeholders are the accepted exception)
   it.each([
     [10,  12, 100,  'plain daytime rate'],
     [10,  23, 130,  'on the night-rate start — already night'],
     [10,  22, 100,  'an hour before the night rate — still day'],
     [10,   5, 130,  'last hour of the night rate — still night'],
     [10,   6, 100,  'on the day-rate start — already day'],
     [180, 12, 1120, 'exactly on the discount threshold — no discount yet'],
     [181, 12, 1013, 'just over the discount threshold — discount applies, result rounds down'],
     [1,   12, 60,   'below the minimum fee — floored to it'],
     [185, 23, 1535, 'a half-unit result — rounds up'],
   ])('calcTripCost(%i, %i, tariff) === %i (%s)', (durationMin, startHour, expected) => {
     expect(calcTripCost(durationMin, startHour, tariff)).toBe(expected);
   });
   ```

   Every fork the prose left open — is 23:00 night, is 180 "longer than three hours", which way does .5 go, does the minimum apply before or after rounding — is now a row. Expected values in the rows come from the task or the domain owner; if you computed one yourself from a formula the task did not state, mark the row `// decision:` and put it in the questions for the human.
5. **Two-step mode — weak model or critical module.** Do not go from prose to a finished test file in one prompt. The sequence that works:
   1. Leave the boundary list from step 1 as comments in the test file.
   2. Prompt: *"Turn the comments in `<file>` into `it.todo` with proper names."*
   3. **Human (or you, as reviewer) reads the names.** No numbers or thresholds in a name ("estimate 2 hours", "exactly 16 hours" drift when the constant changes — a name is just a string, nothing checks it). The role of the boundary must survive the rename: "on the daily limit", "just over the free allowance", not "sets the overnight flag". Prompts that worked: *"Remove 'estimate 2 hours' from the name: it risks going out of sync — the logic gets updated and nobody updates the name."* — *"But now the last test lost the idea that we hit the limit."* — *"Remove all numbers from the names. They make descriptions fragile — thresholds change."*
   4. Prompt: *"Implement them."* Add *"Do not open `<bonus/solution files>`."* if such files exist.
   5. Bring the first test by hand to the shape `const normalHike = {...}; const expectedDuration = 2; const expectedStatus = 'ok'; → result → expect`, then prompt: *"Rewrite all tests in the style of the first one."* Models copy a style very well once shown it.
   6. Import a constant the module exports (`MAX_DAY_HIKE_HOURS`) instead of hard-coding it; use `toContain` / `not.toBe` where the exact number is not the subject of the test.
6. **Human confirms the spec.** The human reads the table before any implementation exists — reading tests is ten times more important than reading code, and this is where that skill is trained. Questions raised in steps 2 and 4 are answered here. The spec file is now the acceptance criterion.
7. **You (or the implementer model): implement against the spec.** Prompt, constraints word for word:

   > Implement `<function>` so that all tests in `<spec file>` pass. Do not modify the test file. Do not open or use other files of the project. Implement the minimum needed for these tests; do not add logic no test asks for. At the end, list the decisions you made on your own (limits, rounding, ordering, defaults, error handling).

   Split the roles: a strong model writes the spec, a weaker one implements — by a well-written spec even a weak model does an order of magnitude better than a strong one set loose on prose. Tests from one model, code from another: never let the implementer's own tests serve as acceptance.
8. **You: accept.** Run the spec file, then the whole suite in parallel and random order (AGENTS.md §10). Read the implementer's list of decisions: each item is either already a row in the table, or becomes a new row plus an answer from the human. A limit that appeared in the implementation but not in the task is your decision even if the agent made it — record it in the issue, not only in code. Then hand the pair test+implementation to `mutation-loop` before it reaches a PR.
9. **Optional — differential run.** When two implementations of one spec exist (prose vs spec, two models, old vs new), compare them with a property-based run (`fast-check`: random `(durationMin 0..600, startHour 0..23, tariff)`, assert equal outputs, print the shrunk counterexample). "No discrepancy in 1500 inputs" is one seed — repeat with another before concluding. In a real session, the second run found `durationMin 61, startHour 22` — the prose implementation had chosen a different inclusivity.

## Done when

- The spec file exists, is table-driven, and every threshold in the task has a below / on / above row; empty input and a violated assumption each have a row.
- No stop-word remains in the task, the issue, or a test name without a number or boundary next to it.
- No assertion mentions an internal call, a helper, or "which branch"; every `expect` compares a returned value.
- Test names carry the behaviour and the role of the boundary, no numbers; numbers live in parameters or `expected*` constants.
- The human confirmed the table before implementation started, and answered every `// decision:` row.
- The spec file is byte-identical after implementation; the whole suite is green in random order.
- The implementer's list of decisions has been read; each item is a row, a documented decision in the issue, or a question sent back.
- `mutation-loop` has been run on the pair (or is the explicit next step).

## Red flags

- **Prose prompt with an unstated fork** ("from 23:00 to 06:00", "longer than three hours", "rounded") → stop; add the on/below/above rows for that fork before anyone implements.
- **Abstract assertion** — "should correctly truncate", `toBeTruthy`, `toBeDefined` where a value is known → write the exact pair.
- **Implementation detail in the spec** — "must call the word splitter exactly once", `toHaveBeenCalledTimes` on an internal function in a pure-function test → delete it; keep only the outward value. If a constraint survives the "requirement or detail?" question only as "I want the code shaped like this", it is a lint rule, not a test.
- **Silent decisions** — confident code with a limit or a rounding rule the task never mentioned → require the decisions list in the prompt; read it; record the new boundary in the issue.
- **Acceptance by the implementer's own tests** → acceptance is by the spec given on the way in. The implementer may add tests; they are not the criterion.
- **Test file modified during implementation** → revert, report; AGENTS.md §9.
- **"Valid" without a number** in an issue, a PRD, or a test name → the issue is a prompt too; fix it there.
- **Enumerating all flag combinations yourself** → ask which combinations matter (past bugs, criticality, budget); AGENTS.md §2.
- **A test-as-spec for a side effect or a subjective requirement** → prose plus "focus on these edge cases"; do not force a table where there is no output to tabulate.
