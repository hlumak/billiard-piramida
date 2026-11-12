#!/usr/bin/env node
// ninja-testing — PostToolUse hook for Edit|Write|MultiEdit on test files.
// Mechanical anti-pattern check for test files.
// Exit 2 + stderr = the edit is reported back to the agent with the list of violations.
// Exit 0 + JSON additionalContext = warnings the agent should consider.
// Suppress a single line with a trailing or preceding comment: // ninja-testing-ignore

import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { execSync } from 'node:child_process';

const input = JSON.parse(readStdin() || '{}');
const filePath = input?.tool_input?.file_path || input?.tool_input?.filePath || '';
if (!filePath || !existsSync(filePath)) process.exit(0);

const isTestFile = /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath) || /(\/__tests__\/|\/tests?\/)/.test(filePath);
const isFixtureFile = /(fixtures?|factories|seed)/i.test(filePath);
if (!isTestFile && !isFixtureFile) process.exit(0);

const src = readFileSync(filePath, 'utf8');
// mode: standard (default) keeps the blocking rules and drops the advisory warnings; strict adds them back
// Worktree-aware: config is looked up in the git toplevel of cwd (the worktree), then in CLAUDE_PROJECT_DIR
// (the main checkout) — the harness config is per project and may not be committed.
let lite = false;
try {
  const cwd = gitToplevel(realpathSync.native(input.cwd || process.cwd()));
  const projectDir = process.env.CLAUDE_PROJECT_DIR || cwd;
  const cfgPath = [cwd, projectDir].map((d) => d + '/.claude/ninja-testing.json').find((p) => existsSync(p));
  if (cfgPath) lite = JSON.parse(readFileSync(cfgPath, 'utf8')).mode !== 'strict'; else lite = true;
} catch {}
const lines = src.split('\n');
const ignored = (i) => /ninja-testing-ignore/.test(lines[i] || '') || /ninja-testing-ignore/.test(lines[i - 1] || '');

const isComponentTest = /@testing-library\/|vitest-browser-|@vue\/test-utils|@testing-library|render\(<|mount\(/.test(src) || /\.(tsx|jsx|vue)$/.test(filePath) && /render|mount/.test(src);
const isE2E = /@playwright\/test|from ['"]playwright['"]|cy\./.test(src) || /\/e2e\//.test(filePath);
const isFrontend = isComponentTest || isE2E;

const blocks = [];
const warns = [];
const add = (list, i, rule, msg) => { if (!ignored(i)) list.push(`${filePath}:${i + 1} [${rule}] ${msg}`); };

// --- line-level checks -------------------------------------------------------
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('//') || t.startsWith('*')) return;

  if (/toMatch(Inline|File)?Snapshot\(/.test(t))
    add(blocks, i, 'no-snapshot', 'Snapshot assertion. Write explicit expects on the parts that matter (AGENTS.md §9). If this is an intentional byte-exact pinning test, add `// ninja-testing-ignore` with a reason.');

  if (/(globalThis|global|window)\.fetch\s*=|vi\.stubGlobal\(\s*['"]fetch['"]|vi\.mock\(\s*['"](axios|node-fetch|undici|got|ky)['"]|\bmockFetch\b|jest\.mock\(\s*['"]axios['"]/.test(t))
    add(blocks, i, 'network-at-boundary', 'fetch/axios is mocked at the client. Intercept at the network with MSW handlers (`onUnhandledRequest: "error"`), not the client module (AGENTS.md §5).');

  if (/expect\(\s*(?!\(|async\b|function\b|\[|\{)[\w$.]+\([^()]*\)\s*\)\s*\.(not\.)?toThrow/.test(t))
    add(blocks, i, 'throw-wrapper', 'The call is evaluated before expect sees it. Use `expect(() => fn(args)).toThrow(ErrorType)`.');

  if (isFrontend && /getByTestId\(|data-testid|querySelector\(|querySelectorAll\(|\.closest\(|getByClass|\$\(['"][.#]/.test(t))
    add(isE2E ? warns : blocks, i, 'locators-as-user', 'Locate elements as the user does: text/label → ARIA role. test-id/CSS/`closest` only after trying to fix the markup, with a comment why.');

  if (isComponentTest && /toHaveClass\(\s*['"][^'"]*(hidden|invisible|visible|show|shown|collapsed|d-none|sr-only)/i.test(t))
    add(blocks, i, 'visibility-not-class', 'Visibility via CSS class is a jsdom lie. Assert `toBeVisible()` / `not.toBeVisible()` in a real browser.');
  else if (isComponentTest && /toHaveClass\(\s*['"][^'"]*(open|active|expanded)/i.test(t))
    add(warns, i, 'state-via-class', 'State asserted through a CSS class. If this is selection/expansion state, prefer the ARIA attribute the user agent sees (`toHaveAttribute("aria-selected", "true")`, `aria-expanded`); if it is visibility, use `toBeVisible()`.');

  if (isE2E && /waitForTimeout\(|page\.waitFor\(\s*\d|\bsleep\(|setTimeout\(\s*resolve/.test(t))
    add(blocks, i, 'wait-for-state', 'Fixed pause. Wait for a state (element with a stable attribute appears/disappears), never for time.');

  if (/export\s+const\s+\w*(Fixture|Fixtures|Response|Mock|Data|Seed|Payload)\s*(:\s*[^=]+)?=\s*[{\[]/.test(t))
    add(blocks, i, 'fixture-is-a-function', 'Shared object fixture. Export a factory `makeX(overrides)` built on structuredClone (AGENTS.md §6).');

  if (/^(it|test)(\.each\([^)]*\))?\(\s*['"`][^'"`]*\d/.test(t) && !/\.each\(/.test(t))
    add(warns, i, 'no-numbers-in-names', 'Number in a test name. Name the behaviour and the role of the boundary ("on the daily limit"); the number goes into an `expected*` constant.');

  if (/toHaveBeenCalled(Times|With|Once)?\(|toBeCalled(Times|With)?\(/.test(t))
    add(warns, i, 'call-vs-result', 'Assertion on a call. Is the *call* the behaviour (boundary side effect: audit log, notification)? If the behaviour is a result, assert the result (AGENTS.md §1, §5).');

  if (/\b(it|test|describe)\.only\(/.test(t))
    add(warns, i, 'only-not-committed', '`.only` left in the file — never commit it.');

  if (/\b(it|test|describe)\.skip\(|\bxit\(|\bxdescribe\(|\bxtest\(/.test(t))
    add(warns, i, 'no-skipping', 'A skipped test. If it fails, report it; do not hide it (AGENTS.md §9).');

  if (/\bvi\.fn\(\)\s*\.mockResolvedValue|\bvi\.fn\(\)\s*\.mockReturnValue/.test(t) && /(getSoldCount|getCapacity|repository|repo\b|\bdb\b|prisma|drizzle|knex)/i.test(t))
    add(warns, i, 'db-is-not-mocked', 'Looks like a mocked repository/DB. If this file claims integration level and the responsibility lives in the database (constraint, recount, lock), the DB is not mocked. If it is a unit test of pure logic with the DB as a stub, ignore.');
});

// --- structural checks ---------------------------------------------------------
// try/catch without an expect inside the catch block
const catchRe = /catch\s*(\([^)]*\))?\s*\{/g;
let m;
while ((m = catchRe.exec(src))) {
  const start = m.index + m[0].length;
  let depth = 1, j = start;
  while (j < src.length && depth > 0) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
  const body = src.slice(start, j - 1);
  const lineNo = src.slice(0, m.index).split('\n').length - 1;
  if (!/expect\(|assert[.(]|fail\(/.test(body))
    add(blocks, lineNo, 'swallowed-exception', '`catch` without an assertion swallows the failure and the test stays green. Use `expect(() => fn()).toThrow(ErrorType)`.');
}

// loops / conditionals around expect inside test bodies — only an `expect` *inside the body* of the
// loop/if counts; a loop in Arrange followed by an expect in Assert is fine.
const loopRe = /\b(for\s*\(|for\s+(const|let|var)\b|\.forEach\(|while\s*\(|\bif\s*\()/g;
while ((m = loopRe.exec(src))) {
  const lineNo = src.slice(0, m.index).split('\n').length - 1;
  const insideTest = /\b(it|test)\s*\(/.test(src.slice(0, m.index).split('\n').slice(-40).join('\n'));
  if (!insideTest) continue;
  const body = statementBody(src, m.index, /\.forEach\(/.test(m[0]));
  // `if (cond) throw …` is a type-narrowing guard (discriminated unions), not test logic
  const isGuard = /\bif\b/.test(m[0]) && /^\s*\{?\s*(throw\b|return\b|expect\.fail|fail\()/.test(body);
  if (/expect\(/.test(body) && !isGuard) {
    const kind = /\bif\b/.test(m[0]) ? 'conditional' : 'loop';
    add(blocks, lineNo, 'no-logic-in-tests', `A ${kind} around \`expect\`. Tests contain no logic: unroll into explicit calls, split into separate tests, or use \`it.each\`.`);
  }
}
// Body of the statement starting at `from`: for `.forEach(` the callback argument; for `for/while/if (` the
// `{…}` block after the closing paren, or the single statement up to `;`/newline when there are no braces.
function statementBody(text, from, isCallback) {
  const open = text.indexOf('(', from);
  if (open < 0) return '';
  let depth = 0, j = open;
  for (; j < text.length; j++) { if (text[j] === '(') depth++; else if (text[j] === ')') { depth--; if (depth === 0) break; } }
  if (isCallback) return text.slice(open + 1, j);
  let k = j + 1;
  while (k < text.length && /\s/.test(text[k])) k++;
  if (text[k] === '{') {
    let d = 0, e = k;
    for (; e < text.length; e++) { if (text[e] === '{') d++; else if (text[e] === '}') { d--; if (d === 0) break; } }
    return text.slice(k, e + 1);
  }
  const end = text.slice(k).search(/;|\n/);
  return end < 0 ? text.slice(k) : text.slice(k, k + end);
}

// chained act/assert scenarios: >3 groups of expect separated by calls within one it()
const testBodies = [...src.matchAll(/\b(?:it|test)\s*\(\s*['"`][^'"`]*['"`]\s*,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g)];
for (const tb of testBodies) {
  const start = tb.index + tb[0].length;
  let depth = 1, j = start;
  while (j < src.length && depth > 0) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
  const body = src.slice(start, j - 1);
  const groups = body.split(/\n\s*\n/).filter((g) => /expect\(/.test(g)).length;
  const lineNo = src.slice(0, tb.index).split('\n').length - 1;
  if (groups > 3)
    add(warns, lineNo, 'arrange-act-assert', `${groups} separate expect groups in one test — looks like act→assert→act→assert. Split by behaviour; previous steps become the Arrange of the next test.`);
}

// time without fake timers
if (/\bDate\.now\(\)|new Date\(\)/.test(src) && !/useFakeTimers|setSystemTime|FakeTimers|mockdate|sinon\.useFakeTimers/.test(src))
  add(warns, 0, 'fix-the-clock', 'The file touches the current time but never fixes it (`vi.useFakeTimers()` + `vi.setSystemTime(...)`). Unit tests are deterministic.');

// --- report ----------------------------------------------------------------------
if (blocks.length) {
  process.stderr.write(
    `ninja-testing: ${blocks.length} rule violation(s) in the test you just wrote. Fix the test, not the rule.\n` +
    blocks.map((b) => ' - ' + b).join('\n') +
    (warns.length && !lite ? `\nAlso consider:\n` + warns.map((w) => ' - ' + w).join('\n') : '') + '\n'
  );
  process.exit(2);
}
if (warns.length && !lite) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `ninja-testing warnings for ${filePath}:\n` + warns.map((w) => ' - ' + w).join('\n'),
    },
  }));
}
process.exit(0);

function gitToplevel(dir) { try { return execSync('git rev-parse --show-toplevel', { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || dir; } catch { return dir; } }
function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}
