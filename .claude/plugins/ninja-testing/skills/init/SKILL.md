---
name: init
description: Generate a testing harness for this repository (AGENTS.md, CLAUDE.md, path-scoped rules, hooks, test-reviewer subagent, Stryker config, npm scripts) tailored to its stack and to the answers of a short interview. Use when asked to "set up testing rules", "configure the agent for tests", "ninja-testing init", or when starting to add tests to a project that has no agent instructions for testing.
argument-hint: "[--deep] [--dry-run] [--lang ru|en]"
disable-model-invocation: true
allowed-tools: Bash(node *), Bash(git *), Bash(npm *), Bash(pnpm *), Bash(yarn *), Read, Write, Edit, Glob, Grep
---

# Harness init

You generate a testing harness for the current repository. The harness is an opinionated set of testing rules; your job is to keep only what this repository needs — a backend-only service must not receive component-test rules, a frontend-only app must not receive database isolation rules. The interview is short by default; the four hard decisions are analysed only in `--deep` mode or when the facts trigger them.

Talk to the user in the language they use (default Russian — the interview texts below are Russian). All generated files are in English.

## Budget

The whole run should fit in ~40 tool calls: read the facts JSON once, read each template once, write each output file once, verify hooks with one command. Do not re-read files you have already written. On a legacy repository (stage d) the D4 table is built from the facts and the two docs the user names — not from reading every module.

## Step 0 — do not overwrite blindly

- If `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `.claude/settings.json` or `.claude/agents/test-reviewer.md` already exist, read them. You will **merge**, not replace: keep the user's content, add a clearly marked `<!-- ninja-testing -->` section, and show the diff before writing.
- `--dry-run`: produce the plan and file previews, write nothing.

## Step 1 — autodetect (deterministic)

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/detect.mjs" "$(pwd)" > /tmp/ninja-testing-facts.json && cat /tmp/ninja-testing-facts.json
```

Read the JSON. `sides` tells you frontend/backend/fullstack; `signals` lists the things that need a decision; `git.hotUntested` lists frequently changed files without tests (input for legacy prioritisation). If `sides.confident` is false, ask question 1 first.

## Step 2 — interview (only what the repo cannot tell)

Ask one question at a time, with the recommended answer first. Skip a question when the facts already answer it (say so in one line: «БД не обнаружена — вопросы про изоляцию пропускаю»). Default mode: questions 1–7. `--deep`: also the four analyses in Step 3.

1. **Стороны** (only if `sides.confident` is false): «Это backend, frontend или fullstack-проект? Я нашёл: …» → sets `sides`.
2. **Критичные места**: «Где в проекте деньги, доступ или необратимые операции (платежи, выдача прав, отправка писем, удаление данных)? Назови модули или папки.» → priorities, mutation threshold, E2E candidates. Offer `git.hotUntested` as a hint.
3. **Стадия**: «Как оцениваешь существующие тесты: (a) проект новый, тестов нет; (b) тесты есть и им доверяю; (c) тесты есть, но качество разное; (d) legacy без тестов, который надо менять.» → greenfield / brownfield-trusted / brownfield-mixed / legacy. If (c): «Назови 2–3 тестовых файла, которые считаешь образцовыми» → whitelist of sample files.
4. **Внешние сервисы**: «Есть ли сервисы, которые команда не контролирует (платёжный шлюз, антифрод, почта, чужой API)? Есть ли для них OpenAPI/типы?» And: «Сервисы соседних команд считаем своими или внешними?» (policy).
5. **Параллельная разработка**: «Фронт и бэк делают параллельно разные люди или агенты?» → contract schema mandatory.
6. **Модели**: «Какая основная модель? Есть ли вторая для ревью тестов? Будут ли слабые/локальные модели писать код?» → reviewer model, `it.todo` two-step mode, explicit case lists, "prepared infrastructure" emphasis. **Mode**: standard by default, whatever the model (measured: standard catches the concurrency bug 3/3 on Haiku, 3/3 on Sonnet, 2/2 on Opus at bare-agent cost, and Sonnet/Opus reach the mutation-score ceiling in standard on their own). Ask one question: «Тесты агента кто-то читает перед мержем?» — if nobody does, or the team is only starting with tests, or the priority modules are money/access, or a weak/local model will write the tests (measured: Haiku stops at 77 % mutation score in standard and reaches 87 % only when strict forces a verdict on every survivor) → `strict` (mutation testing, survivor verdicts and the self-review enforced on every Stop, ~2–3× cost); otherwise `standard`. State the rule verbatim: «Standard — по умолчанию. Strict — когда мутации и самопроверка должны быть принудительными на каждой сессии. Не уверен — standard.»
7. **CI**: «Есть CI? Сколько минут допустимо на пайплайн MR? Есть ли ресурсы гонять мутационное тестирование в CI?» Skip the first part if `ci.any` is true. Also: «Docker доступен у разработчиков и в CI?» when a DB was detected and no test DB tool.

Optional (ask only if relevant): «Есть долгие сценарные тесты (feature specs), для которых строгий Arrange-Act-Assert неудобен?» → AAA exception.

## Step 3 — the four hard decisions (`--deep` or triggered)

Each is an *analysis → hypothesis → confirmation*, never a silent if-then. See `assembly-rules.md` §D for the exact procedure.

- **D1 Mock boundaries** — triggered by `structure:slices-not-explicit` with a backend. Build an import graph for the 2–3 priority modules (`grep -rn "from '" <module>`), propose which modules are inside the slice / neighbours / external, ask the user to confirm the slice markup. Output goes into `integration-backend.md` as a "Slices in this repo" table.
- **D2 DB isolation strategy** — triggered by any detected DB. Check: parallel workers in runner config; nested-transaction support (Postgres/SQLite yes; MySQL limited; Prisma interactive transactions caveat); cache in front of the DB (`backend:cache-shared-resource`); ask: «Есть сценарии с конкуренцией (лимиты, балансы, блокировки)?». Propose one of: transaction-rollback per test (+ `committedDb` for concurrency tests) / schema-per-worker / reset+seed. Write it into `{{ISOLATION_STRATEGY}}`.
- **D3 Mutation testing: gate or report** — triggered when Stryker exists or is being added. Measure: `time <unit test command>`; count candidate files (pure logic in priority modules). Estimate cost = unit time × ~30–100. Propose: hard gate per MR (threshold 90, per-domain) / report only / manual scoped runs — by CI budget from question 7.
- **D4 Legacy priorities** — triggered by stage (d) or `tests:hot-untested-files`. Build a table from `git.hotFiles` (change frequency) and, if the user has an issue tracker, ask them to name modules with the most incidents; the user supplies the "money" column. Result: an ordered list of 2–3 modules for `legacy-characterize`, written into CLAUDE.md "Where to start".

## Step 4 — assemble (if-then)

Apply `assembly-rules.md` §A–§C to facts + answers. Produce the file list with, for each file, the rule that caused it (rule id). Show the plan:

```
Будет создано / изменено:
  AGENTS.md                         — ядро (все проекты)
  CLAUDE.md                         — @AGENTS.md + скиллы + хуки
  .claude/rules/unit-tests.md       — A-UNIT (всегда)
  .claude/rules/integration-backend.md — C-DB-1: найден drizzle + postgres
  .claude/rules/component-tests.md  — пропущено: фронтенд не обнаружен
  …
Пропущено сознательно: …
```

Wait for confirmation (unless `--dry-run`, then stop here).

## Step 5 — write

Templates live in `${CLAUDE_PLUGIN_ROOT}/templates/`. Fill placeholders (`{{RUNNER}}`, `{{RUN_ALL}}`, `{{DB_SETUP}}`, `{{ISOLATION_STRATEGY}}`, `{{FRONTEND_PATHS}}`, …) from the decisions table in `assembly-rules.md` §E. Remove any section whose placeholder resolved to "n/a".

Write:

- `AGENTS.md` (template as is; append a short "This repository" block: sides, runner, DB, E2E tool, priority modules).
- `CLAUDE.md` (template; fill `{{RULES_INDEX}}` with the rules actually written, `{{COMMANDS}}` with the real npm scripts, `{{MODEL_NOTES}}` from question 6, `{{MODE}}` and `{{MODE_SECTION}}` from `${CLAUDE_PLUGIN_ROOT}/templates/mode-<standard|strict>.md`).
- `.claude/rules/<name>.md` — only the applicable ones.
- `.claude/agents/test-reviewer.md` — copy of `${CLAUDE_PLUGIN_ROOT}/agents/test-reviewer.md` with `model:` set to the second model from question 6 (fallback: `sonnet`).
- `.claude/hooks/ninja-testing/{test-lint,guard,stop-check}.mjs` — copied from `${CLAUDE_PLUGIN_ROOT}/scripts/hooks/`.
- `.claude/settings.json` — merge `templates/settings.json` into the existing file (arrays are unioned, never replaced).
- `.claude/ninja-testing.json` — `{ "mode": "standard"|"strict", "sides": …, "commands": { "testAll": …, "mutation": … }, "mutation": { "required": true|false }, "priorityModules": […] }` (read by the hooks; `/ninja-testing:mode` flips it later).
- If Stryker is absent and the user agreed to add it: `npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner`, `stryker.config.json` with `mutate` = priority pure-logic files only (never `src/**`), `testRunner: "vitest"`, `reporters: ["html","json","progress"]`, `jsonReporter.fileName: "reports/mutation/report.json"`, thresholds `{ high: 90, low: 80, break: null }` (a break value is set only after D3 chose "gate").
- npm scripts if missing (principle of least surprise — a weak model must be able to run them): `test`, `test:coverage`, `test:mutation`, `test:e2e`, `test:browser` (frontend only).
- If MSW is absent and network calls exist: propose `npm i -D msw` and a `test/msw.ts` with `setupServer` / `setupWorker` and `onUnhandledRequest: 'error'` (write it only after confirmation).

## Step 6 — explain and hand over

Print a Russian summary: what was written, which rules produced it, and the three things to do next:

1. «Прочитай AGENTS.md целиком один раз — это контракт, который агент будет соблюдать.»
2. «Первые 5–10 тестов в проекте прочитай глазами полностью: дальше агент копирует стиль.»
3. «Команд для тебя три: `/ninja-testing:init`, `/ninja-testing:review` перед мержем тестов, `/ninja-testing:mode`. Остальное агент делает сам: скажи «покрой фичу X тестами» — он возьмёт план по уровням» — or, for legacy, «скажи «надо поменять модуль <X>, тестов нет» — агент начнёт с разведки и пиннинга».

Never claim the hooks or Stryker work until you ran them once: run `node .claude/hooks/ninja-testing/test-lint.mjs < /dev/null` (must exit 0) and, if Stryker was added, `npx stryker run --dryRunOnly` or the smallest scoped run.
