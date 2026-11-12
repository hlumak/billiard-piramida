# Assembly rules for /ninja-testing:init

Every rule has an id, a condition over `facts` (from `detect.mjs`) and `answers` (from the interview), an action. Rules marked **1f** depend on one factor — plain if-then. Rules marked **2f+** need more than one factor and are listed in §D as analyses. Report the ids you applied in the plan so the user can trace each generated line to the rule that produced it.

## A. Always

| id | action |
|---|---|
| A-CORE | write `AGENTS.md` from template; write `CLAUDE.md` with `@AGENTS.md` |
| A-UNIT | write `.claude/rules/unit-tests.md` |
| A-FIXT | write `.claude/rules/fixtures.md` |
| A-HOOKS | install the three hooks + settings merge |
| A-REVIEWER | install `test-reviewer` subagent |
| A-CI | if `ci.any` is false: first recommendation in the summary is "set up CI, even solo" — hooks are not a substitute because an agent can bypass a local hook |
| A-FULLRUN | Stop hook requires a full parallel run when tests/logic changed |

## B. Sides — what is kept, what is dropped (1f)

| id | condition | action |
|---|---|---|
| B-BE | `sides.backend` | write `integration-backend.md`; `{{BACKEND_PATHS}}` = server package dirs (`packages/server/**`, `apps/api/**`, `src/server/**`, or `src/**` when not a monorepo) |
| B-FE | `sides.frontend` | write `component-tests.md`; `{{FRONTEND_PATHS}}` = client dirs + `**/*.{tsx,jsx,vue,svelte}` tests; add `test:browser` script |
| B-E2E | `e2e.playwright \|\| e2e.cypress \|\| answers.critical.length` | write `e2e.md`; `{{E2E_PATHS}}` = `e2e/**`, `**/*.e2e.*`, playwright test dir |
| B-NO-FE | not `sides.frontend` | drop component-tests, browser-mode script, MSW-browser notes, locator warnings in hooks are auto-off (they key on file content) |
| B-NO-BE | not `sides.backend` | drop integration-backend, DB isolation, testcontainers, `committedDb` |
| B-SHARED | `structure.monorepo` and a `shared`/`common` package with pure logic | note in CLAUDE.md: "pure business logic used by both sides lives in `<shared>` and is unit-tested once there" |

## C. Stack decisions (1f unless noted)

### Runner

| id | condition | action |
|---|---|---|
| C-RUN-1 | `runner.vitest` | `{{RUNNER}}=Vitest`, `{{RUN_ALL}}=npx vitest run` (or the `test` script), `{{RUN_ONE_FILE}}=npx vitest <file>` |
| C-RUN-2 | `runner.jest && runner.bundler in (vite, rspack, esbuild)` | recommendation block in summary: migrate to Vitest/Rstest — "two build systems drift apart; in 2026 do not choose Jest voluntarily for a bundled frontend"; still generate for Jest (`jest --randomize`, `jest.mock`) |
| C-RUN-3 | `runner.jest && runner.bundler == webpack` or backend-only | keep Jest; placeholders for Jest; no migration nag |
| C-RUN-4 | `runner.rstest` | `{{RUNNER}}=Rstest` |
| C-RUN-5 | `runner.nodeTest` (backend purists) | acceptable; note that doubles come from `node:test` mock API, MSW still applies |
| C-RUN-6 | none detected | recommend Vitest (or Rstest if rspack); offer to install |
| C-RUN-7 | `!runner.coverage` | add `test:coverage`; coverage config shows 100% files too; coverage excludes E2E |
| C-RUN-8 | `!runner.fastCheck` and priority modules contain pure rules with stated invariants (ask) | offer `fast-check`; keep rule text about invariants |
| C-RUN-9 | runner supports shuffle | enable `sequence.shuffle` + printed seed in config (Vitest: `test.sequence.shuffle = true`); Jest: `--randomize` |

### Doubles and network

| id | condition | action |
|---|---|---|
| C-DBL-1 | `!backend.di` | `{{SUBSTITUTION_MECHANISM}}` = "module mocking (`vi.mock`) of the module that owns the side effect; the code is not changed for tests" |
| C-DBL-2 | `backend.di` (NestJS/Angular/inversify…) | `{{SUBSTITUTION_MECHANISM}}` = "the project's DI container and its testing utilities; do not add a second mechanism" |
| C-DBL-3 | `backend.effect` | add paragraph: side effects are described as effects and substituted at the runtime layer; no direct `fetch` inside Effect code |
| C-DBL-4 | `!doubles.msw` and (frontend or HTTP client deps) | propose `msw`; write `test/msw.ts`; `onUnhandledRequest: 'error'` |
| C-DBL-5 | `doubles.axios && doubles.axiosMockAdapter && !doubles.msw` | accept axios-mock-adapter as the unhandled-request accountant; still recommend MSW for new tests |
| C-DBL-6 | `doubles.sinon` | fine; terminology stub/spy/mock/fake is the same |

### Backend / database (B-BE only)

| id | condition | action |
|---|---|---|
| C-DB-1 | `backend.db` and (`backend.testcontainers` or `answers.docker`) | `{{DB_SETUP}}` = "Postgres/MySQL in testcontainers, started once in `globalSetup`, URL passed via `provide/inject`, migrations applied at start" |
| C-DB-2 | `backend.db == postgres` and no Docker | `{{DB_SETUP}}` = "PGlite (Postgres in WASM) — lighter, with known limitations; upgrade to testcontainers when Docker is available" |
| C-DB-3 | `backend.db == sqlite` | `{{DB_SETUP}}` = "SQLite file/in-memory per worker" |
| C-DB-4 | `backend.db == mongo` | `{{DB_SETUP}}` = "mongodb in testcontainers (or mongodb-memory-server)"; isolation = drop collections + seed |
| C-DB-5 | `backend.redis` | add "cache is a shared resource: flush per test or namespace keys per worker" |
| C-DB-6 | `!backend.db` but ORM/DB detected as external (another team's DB) | treat as external boundary: fake + contract |
| **D2** | isolation strategy | see §D |

### Frontend (B-FE only)

| id | condition | action |
|---|---|---|
| C-FE-1 | `frontend.framework == react` | `{{BROWSER_MODE}}` = "Vitest Browser Mode with `vitest-browser-react` (Playwright provider, Chromium, headless)"; `{{FRONTEND_FRAMEWORK}}=React`; note: "do not use `@testing-library/react`; use Testing Library *approaches* (queries by role/text) inside Browser Mode" |
| C-FE-2 | `frontend.framework == vue` | `vitest-browser-vue`; component stubs are available and preferred for cross-slice children |
| C-FE-3 | `frontend.framework == angular` | Angular TestBed + DI; Browser Mode via `@analogjs/vitest-angular` or Karma/Jest already in place — do not fight the framework |
| C-FE-4 | `frontend.framework == svelte/solid` | `vitest-browser-svelte`; same locator rules |
| C-FE-5 | `runner.jsdom && !runner.browserMode` | signal `frontend:jsdom`: rule text keeps "jsdom only if the browser run exceeds ~15 s"; summary recommends adding a browser config next to the jsdom one and moving visual assertions there |
| C-FE-6 | `frontend.store` | name the store in the rule: "the real `<store>` store; never `vi.fn()` on its methods or selectors" |
| C-FE-7 | `frontend.i18n` | "locale fixed in setup" line becomes concrete: name the setup file |
| C-FE-8 | `frontend.storybook` | mention Storybook test platform for composite components |
| C-FE-10 | `frontend.framework == vanilla` (bundled client without a framework) | `{{BROWSER_MODE}}` = "Vitest Browser Mode with plain DOM (`page.getByRole` from `@vitest/browser/context`)"; `{{FRONTEND_FRAMEWORK}}=vanilla DOM`; the store paragraph becomes "the module that holds client state"; locator rules unchanged |
| C-FE-9 | `tests.uses.testId > 0` | CLAUDE.md "Known debt": test-id locators exist; new tests do not add them; hook blocks new ones |

### E2E (B-E2E only)

| id | condition | action |
|---|---|---|
| C-E2E-1 | `e2e.playwright` | `{{E2E_TOOL}}=Playwright`; `test:e2e = playwright test` |
| C-E2E-2 | `e2e.cypress` | same rules; note Cypress recommends `data-cy` — these rules disagree: text/role first |
| C-E2E-3 | `answers.critical` names email/payments | add "external channel interception" lines (SMTP catcher container; payment sandbox/fake at the boundary) |
| C-E2E-4 | no E2E tool and critical paths exist | propose Playwright; only after `e2e-select` produced a list with criteria |
| C-E2E-5 | `answers.stage == legacy` | E2E section in CLAUDE.md "Where to start": a few E2E on the critical paths after characterization tests, not before |

### External services and contracts

| id | condition | action |
|---|---|---|
| C-EXT-1 | `answers.external.length` | CLAUDE.md lists them; `external-contract` skill is the entry point; contract-check is a separate CI job (or a separate npm script if no CI) |
| C-EXT-2 | `answers.parallelFrontBack` | contract schema mandatory before work: Zod/Effect Schema (`doubles.zod`/`effectSchema` present) > JSON Schema/OpenAPI; one schema file, each side checked independently; "only the coordinator changes the contract" |
| C-EXT-3 | `answers.neighbourTeamsAreExternal` | neighbours' services go under external rules (fake + contract); otherwise they are "neighbouring slices" (may mock the module) |
| C-EXT-4 | `doubles.zod` or `effectSchema` and `sides.fullstack` | runtime validation of API responses at the boundary; no "soft" handling of missing fields |

### Mutation testing

| id | condition | action |
|---|---|---|
| C-MUT-1 | `!mutation.stryker` | offer to add Stryker; `mutate` = priority **pure-logic** files only, never `src/**`. A priority module that mixes logic with I/O (DB, HTTP) is **not** put into `mutate`: the plan says "extract the pure decision function first (`legacy-characterize` step 3), then mutate it" — mutation testing through a real database is an anti-pattern (slow, non-deterministic, unscoped) |
| C-MUT-2 | `mutation.stryker` | read config; if `mutate` is a whole tree, recommend narrowing; if `thresholds.break` is 100, warn: never 100 |
| C-MUT-3 | `sides.frontend` | note: Browser Mode is not instrumented by Stryker → logic in pure modules, mutated there |
| C-MUT-4 | `answers.weakModel` | summary: three conditions for a weak model — prepared infrastructure (scripts, Stryker), least-surprise decisions, quality gates the model can run itself |
| **D3** | gate vs report | see §D |

### Stage and models

| id | condition | action |
|---|---|---|
| C-ST-1 | `answers.stage == greenfield` | CLAUDE.md: "the first 5–10 tests are the pattern — a human reads them completely"; architecture constraints stated explicitly (logic not in controllers/components) because there is no neighbour to imitate |
| C-ST-2 | `answers.stage == brownfield-mixed` | CLAUDE.md: whitelist of sample test files; prompts add "use files X, Y as the pattern; do not read other tests" |
| C-ST-3 | `answers.stage == brownfield-trusted` | CLAUDE.md: "the requested test level is always stated explicitly; do not inherit it from neighbours" |
| C-ST-4 | `answers.stage == legacy` | CLAUDE.md "Where to start" = D4 output; `legacy-characterize` first; no premature documentation ("a spec with a mistake is worse than none; the code is the source of truth") |
| C-MD-1 | `answers.secondModel` | reviewer `model:` = that model; note "review in a clean session, other model — models recognise their own text" |
| C-MD-2 | `!answers.secondModel` | reviewer keeps `model: sonnet` (different from an Opus/Fable main); note: clean context is the minimum |
| C-MD-3 | `answers.weakModel` | CLAUDE.md "Working with weaker models": two-step `it.todo` → implement; enumerate cases in prompts; forbid changing the function under test and reading other tests; write "arrange, act, assert" in full words |
| C-MD-4 | `answers.longScenarioTests` | rule exception: "for <feature specs> a step→check chain is allowed; everywhere else strict AAA" |

### CI

| id | condition | action |
|---|---|---|
| C-CI-1 | `ci.any && answers.pipelineBudgetMin < full run` | CLAUDE.md: unit → integration ordering; affected-only for unit/integration in MR; E2E by folder heuristic; nightly full run |
| C-CI-2 | tests are known flaky (`answers.flaky` or later) | full-run, not fail-fast; flaky list auto-generated (passed after retry), limit ≈10; quarantine 1–2 with owner; quarantine list from master, not the branch |
| C-CI-3 | `!ci.any` | see A-CI; hooks still installed |
| C-CI-4 | `ci.preCommit` only | keep, but say a pre-commit hook is not a barrier for an agent |

## D. The four analyses (2f+)

**D1 — mock boundaries.** Inputs: priority modules, import graph. Procedure: for each priority module list its imports; classify each import: same directory/feature → *inside slice* (never mocked, DB included); other feature directory → *neighbour* (may mock the module, not its tables); package from `node_modules` that talks to the network or a service the team does not own → *external* (fake at the network + contract). If `structure.fsdLike || modulesLike`, derive from directories and only ask for confirmation; otherwise present the table and ask the user to correct it. Output: "Slices in this repo" table appended to `integration-backend.md` (and `component-tests.md` for frontend slices).

**D2 — DB isolation.** Factors: (a) parallel workers (runner config `pool`, `fileParallelism`, CI cores); (b) nested transactions supported and code does not open its own transactions in a conflicting way (Postgres/SQLite: savepoints ok; MySQL: limited; Prisma: `$transaction` interactive caveat); (c) cache in front of the DB; (d) concurrency scenarios. Decision: no parallelism → transaction rollback per test; parallelism and (b) ok → transaction rollback + one DB/schema per worker; (b) not ok → reset + seed per test; (c) → cache flush per test or key namespace per worker; (d) → additionally `committedDb` (no wrapping transaction) for concurrency tests. Fill `{{ISOLATION_STRATEGY}}` and `{{COMMITTED_DB}}`.

**D3 — mutation gate.** Measure unit-test wall time `t`; count mutation candidate files `n` (pure logic in priority modules); estimate `cost ≈ t × 30…100` per run (scoped to changed files it is much less). Decision: CI budget allows and Stryker incremental/scoped runs fit → **hard gate per MR** (`thresholds.break` = 90 initially, per-domain later); budget tight → **report only** in CI + Stop-hook reminder locally (`ninja-testing.json: mutation.required = true`); no CI → local only, `mutation.required = true`. Never 100. Never on E2E; integration only if fast.

**D4 — legacy priorities.** Table: file, changes in 12 months (`git.hotFiles`), incidents (user supplies from tracker or an agent scan of the last ~100 bugs), money/access/irreversible (user). Order by incidents first, then money, then churn ("where it breaks, where it is touched often, and money"). Output 2–3 modules; first step for each is `legacy-characterize`. Remind: pinning tests strictly before refactoring; one handle at a time; boy-scout rule elsewhere.

## E. Placeholder resolution

| placeholder | from |
|---|---|
| `{{RUNNER}}`, `{{RUN_ALL}}`, `{{RUN_ONE_FILE}}`, `{{IT_ALIAS}}` | C-RUN-*; `IT_ALIAS` = grep existing tests for `it(` vs `test(` (default `it`) |
| `{{SUBSTITUTION_MECHANISM}}` | C-DBL-1/2/3 |
| `{{BACKEND_PATHS}}`, `{{FRONTEND_PATHS}}`, `{{E2E_PATHS}}` | B-*; YAML list items, each quoted |
| `{{DB_SETUP}}`, `{{ISOLATION_STRATEGY}}`, `{{COMMITTED_DB}}` | C-DB-*, D2; `COMMITTED_DB` default "a second client without the wrapping transaction (`committedDb`)" |
| `{{FRONTEND_FRAMEWORK}}`, `{{BROWSER_MODE}}` | C-FE-* |
| `{{E2E_TOOL}}` | C-E2E-* |
| `{{RULES_INDEX}}` | list of written rules, one line each: path — what it governs |
| `{{COMMANDS}}` | real scripts: test, test:coverage, test:mutation, test:e2e, test:browser |
| `{{MODEL_NOTES}}` | C-MD-* |

## F. What the generator never does

- Never writes rules for a side that is not present.
- Never sets `mutate: ["src/**"]`.
- Never sets a mutation threshold of 100 or a coverage-only gate.
- Never introduces DI, ports or adapters into the codebase.
- Never adds `data-testid` conventions.
- Never overwrites user content in existing instruction files without showing the diff.
