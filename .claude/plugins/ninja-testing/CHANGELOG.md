# Changelog

## 0.1.2

- Hooks compare paths through `realpath`: a project under a symlinked directory (macOS `/var` → `/private/var`, `/tmp`) no longer makes every edit look like it belongs to another tree (thanks again, Denys).
- `selftest.sh` runs on macOS: temp root resolved with `pwd -P`, block counters kept in the sandbox via `TMPDIR`.

## 0.1.1

Hooks, after a field report from a Next.js + Vitest + RTL team (thanks, Denys):

- `stop-check`: the block counter is keyed by session **and** prompt — a new user request in the same session gets its reminder again (was: silent after two blocks per session).
- `stop-check`: a run counts only as a whole command (`yarn test:e2e` is not `yarn test`; a file path or `-t` disqualifies it), only if its tool result was not an error and its output reports no failures (`yarn test || true` no longer counts), and only if it happened **after the last change**.
- `stop-check`: files written through Bash (`>`, `>>`, `tee`, `cp`, `mv`) and dirty files whose mtime is inside the session are changes too; a Bash-only session is checked. Commands are attributed to a tree by the transcript line's `cwd`, which also fixes the worktree case properly.
- `stop-check` (strict): survivor verdicts are read from the hook's `last_assistant_message`, not from the transcript, which may not be flushed yet.
- `test-lint` `no-logic-in-tests`: looks for `expect` inside the actual body of the loop / `if` (brace-matched, or the single statement), not in a 600-character window — a loop in Arrange followed by an expect in Assert passes.
- `test-lint` `visibility-not-class`: blocks only visibility words (`hidden`, `invisible`, `visible`, `show`, `shown`, `collapsed`, `d-none`, `sr-only`); `active` / `open` / `expanded` are a new warning `state-via-class` pointing at the ARIA attribute.
- `scripts/hooks/selftest.sh`: 32 synthetic cases for the three hooks (`bash scripts/hooks/selftest.sh`).

Earlier in 0.1.x (unreleased): worktree-aware hooks; no course provenance in agent-facing text; three human commands, eight agent procedures; standard/strict modes; survivor verdicts on Stop; human gate on `Stryker disable`.

## 0.1.0

First release.
