---
name: mode
description: Switch the ninja-testing harness between standard and strict mode, or show the current mode and the rule for choosing. Use when asked "make the testing rules stricter/lighter", "which mode am I in", "ninja-testing mode", "turn on strict".
argument-hint: "[standard|strict|status]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash(node *), Bash(cat *)
---

# Harness mode

Two modes, one rule. Say it to the user in their language before doing anything:

> **Standard** — по умолчанию, для любой модели. **Strict** — включи, когда мутационное тестирование и самопроверка должны быть принудительными на каждой сессии: команда только начинает, тесты агента никто не читает перед мержем, или модуль про деньги/доступ. Не уверен — standard.

What changes between them:

| | standard (default) | strict |
|---|---|---|
| AGENTS.md, path-scoped rules | yes | yes |
| Guard hook (no `-u`, no `--no-verify`, no config edits to fix a test) | yes | yes |
| Lint hook on test files | blocks | blocks + advisory warnings |
| Stop hook | full run demanded | full run **and** mutation testing **and** a verdict on every surviving mutant **and** the name↔expect self-review demanded (at most two blocks per session) |
| CLAUDE.md | skills listed, on demand; mutation-loop before the PR | procedures prescribed step by step |

Measured (Sep 2026, `evals/results/СВОДКА.md`). Concurrency task on `purchaseTickets`: standard catches the bug 3/3 on Haiku, 3/3 on Sonnet, 2/2 on Opus — at roughly bare-agent cost (Haiku 0.2 $, Sonnet 0.9 $, Opus 1.7 $); strict gives the same catch rate at about 2× the cost. Without any harness: Haiku 0/3, Sonnet 0/3. Mutation task on `calculateVisitFee`: Sonnet and Opus reach the 98.5 % ceiling in standard, running Stryker on their own — strict adds nothing there. Haiku runs Stryker, declares "most survivors are equivalent" and stops at 77 %; strict's survivor-verdict demand lifts it to 87 % at 3× the cost. Strict buys enforcement, not quality: it is for models or teams that do not finish the loop on their own.

## Procedure

1. Read `.claude/ninja-testing.json`. If it does not exist, say the harness is not installed and point to `/ninja-testing:init`.
2. `status` (or no argument): print the current `mode` (missing = standard), the rule above, and the two self-checks: *«Strict → standard: неделю хук ни разу не заблокировал правку и ревьюер ничего не нашёл. Standard → strict: ревьюер или Stryker нашли дыру, которую агент пропустил, а человек не заметил.»* Stop.
3. `standard` or `strict`:
   - set `"mode"` in `.claude/ninja-testing.json`;
   - in `CLAUDE.md`, replace everything between `<!-- ninja-testing:mode=… -->` and `<!-- /ninja-testing:mode -->` with the contents of `${CLAUDE_PLUGIN_ROOT}/templates/mode-<mode>.md`, and update the marker. If the markers are missing (hand-edited CLAUDE.md), append the section with markers at the end and say so.
   - Hooks read the mode from the JSON — nothing else to change.
4. Confirm in one line: what changed and how to switch back.
