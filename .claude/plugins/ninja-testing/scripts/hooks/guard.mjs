#!/usr/bin/env node
// ninja-testing — PreToolUse guard for Bash | Edit | Write | MultiEdit.
// Denies the moves these rules forbid outright (snapshot updates, --no-verify, force push,
// lowering mutation thresholds) and asks for confirmation before editing runner/mutation config
// or snapshot files — "when a test fails, the fix is in the test, not in the config".

import { readFileSync } from 'node:fs';

const input = JSON.parse(readStdin() || '{}');
const tool = input.tool_name || '';
const ti = input.tool_input || {};

const decide = (permissionDecision, permissionDecisionReason) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason } }));
  process.exit(0);
};

if (tool === 'Bash') {
  const cmd = String(ti.command || '');
  const rules = [
    [/\b(vitest|jest|npx\s+vitest|npm\s+(run\s+)?test\S*|pnpm\s+test\S*|yarn\s+test\S*)\b[^\n|;&]*\s(-u|--update|--updateSnapshot|--update-snapshots)\b/, 'Updating snapshots is a human decision after reading the diff. Show the diff instead (AGENTS.md §9).'],
    [/--no-verify\b/, 'Bypassing hooks is forbidden. If tests are red, stop and report (AGENTS.md §9).'],
    [/\bgit\s+push\b[^\n|;&]*\s(--force\b|-f\b|--force-with-lease\b)/, 'Force push is forbidden for the agent. Report and let a human decide.'],
    [/\bstryker\b[^\n|;&]*--(break|thresholds?)\b/, 'Do not change mutation thresholds from the command line. Classify survivors (test gap vs equivalent) and exclude equivalents point-wise.'],
    [/\bgit\s+(checkout|restore)\b[^\n|;&]*\.snap\b/, 'Reverting snapshot files hides a behaviour change. Read the diff with a human.'],
    [/\brm\b[^\n|;&]*\.(test|spec)\.[cm]?[jt]sx?\b/, 'Deleting a test file is not a fix. Report the failing test instead (AGENTS.md §9).'],
  ];
  for (const [re, why] of rules) if (re.test(cmd)) decide('deny', `ninja-testing: ${why}`);
  process.exit(0);
}

if (/^(Edit|Write|MultiEdit)$/.test(tool)) {
  const p = String(ti.file_path || ti.filePath || '');
  if (/__snapshots__\/|\.snap$/.test(p))
    decide('deny', 'ninja-testing: snapshot files are not edited by the agent. Show the diff to a human; prefer explicit assertions.');
  if (/(vitest|vite|jest|stryker|playwright|rstest)\.config\.[cm]?[jt]s$|stryker\.conf(ig)?\.json$|\.mocharc/.test(p))
    decide('ask', 'ninja-testing: editing a runner/mutation config. If the reason is a failing test, the fix belongs in the test, not the config. Confirm this change is infrastructure work.');
  // Excluding a mutant is a verdict a human signs. Measured: a weak model labels the spec's own thresholds
  // "implementation boundary" and disables them to raise the score.
  const newText = [ti.new_string, ti.content, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [])].filter(Boolean).join('\n');
  if (/Stryker\s+(disable|restore)/i.test(newText))
    decide('ask', 'ninja-testing: adding a `Stryker disable` comment excludes a mutant from verification. Only an EQUIVALENT mutant (the outputs cannot differ for any input) may be excluded, and a human confirms it. A threshold, date or default that is in the task is never an "implementation boundary" — it is a test gap. Show the mutant and your reasoning instead.');
  process.exit(0);
}

process.exit(0);

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}
