#!/usr/bin/env node
// ninja-testing — Stop hook.
// "The agent lives in a small local world": it runs two changed files sequentially and calls it done.
// If tests or mutated logic were touched in this session, require (once) a full parallel run and a
// mutation run before the turn ends. Uses stop_hook_active to avoid loops.

import { readFileSync, existsSync, statSync, readdirSync, writeFileSync, realpathSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const input = JSON.parse(readStdin() || '{}');
// Loop guard: at most two blocks per user turn (1: full run / mutation run; 2: verdicts on survivors).
// `stop_hook_active` alone is too coarse — it is true for every Stop after the first block, so the
// second demand could never fire. Keyed by session + prompt, so the next user request starts fresh.
const MAX_BLOCKS = 2;
const counterKey = `${input.session_id || 'nosession'}-${input.prompt_id || 'noprompt'}`.replace(/\W/g, '');
const counterPath = join(tmpdir(), `ninja-testing-stop-${counterKey}`);
let blocksSoFar = 0;
try { blocksSoFar = Number(readFileSync(counterPath, 'utf8')) || 0; } catch {}
if (blocksSoFar >= MAX_BLOCKS) process.exit(0);

// Worktree-aware roots. `cwd` follows Claude (it is the worktree, and moves on `cd`); CLAUDE_PROJECT_DIR stays
// on the main checkout. Everything about *files* is resolved against the git toplevel of cwd; the harness
// config is per project, so it may fall back to the main checkout when the worktree has no copy.
// Paths are compared as strings, so everything goes through realpath first: on macOS /var is a symlink to
// /private/var and `git rev-parse` returns the resolved form while the transcript carries the unresolved one.
const cwd = real(gitToplevel(real(input.cwd || process.cwd())));
const projectDir = process.env.CLAUDE_PROJECT_DIR || cwd;
const cfgPath = [join(cwd, '.claude', 'ninja-testing.json'), join(projectDir, '.claude', 'ninja-testing.json')].find((p) => existsSync(p));
const cfg = cfgPath ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
const fullRun = cfg.commands?.testAll || 'npm test';
const mutationRun = cfg.commands?.mutation || (existsSync(join(cwd, 'stryker.config.json')) || existsSync(join(cwd, 'stryker.config.mjs')) || existsSync(join(cwd, 'stryker.conf.json')) ? 'npm run test:mutation' : null);

// Files this agent changed in this session: Edit/Write tool calls, files written through Bash (`>`, `tee`,
// `cp`, `mv`), and — because a redirect inside a heredoc or a script is easy to miss — anything `git status`
// reports as dirty whose mtime is after the session started. Not everything uncommitted in the tree: a human's
// or another session's older edits are not this agent's.
let changed = [];
let commands = []; // { cmd, ok, ts } — ok = the tool result was not an error and did not report failures
let transcriptOk = false;
let sessionStart = 0;
let lastChangeTs = 0; // a run counts only if it happened after the last change (transcript time, exact)
let lastChangeMtime = 0; // …or after the newest dirty file (file time, 2 s slack for rounding)
let lastAssistantText = '';
try {
  const lines = readFileSync(input.transcript_path, 'utf8').split('\n').filter(Boolean);
  transcriptOk = true;
  const edited = new Set();
  const pending = new Map(); // tool_use_id -> index in commands
  for (const l of lines) {
    try {
      const j = JSON.parse(l);
      if (!sessionStart && j?.timestamp) sessionStart = Date.parse(j.timestamp) || 0;
      const content = j?.message?.content;
      if (!Array.isArray(content)) continue;
      if (j.type === 'assistant') {
        const text = content.filter((c) => c?.type === 'text').map((c) => c.text).join('\n');
        if (text.trim()) lastAssistantText = text;
      }
      // A line's cwd tells which tree the call ran in; a full run in the main checkout before EnterWorktree
      // says nothing about the worktree. Lines without cwd (older formats) count.
      const lineCwd = j.cwd ? real(String(j.cwd)) : '';
      const inThisTree = !lineCwd || lineCwd === cwd || lineCwd.startsWith(cwd + '/');
      for (const c of content) {
        if (c?.type === 'tool_result' && pending.has(c.tool_use_id)) {
          const i = pending.get(c.tool_use_id);
          const text = [typeof c.content === 'string' ? c.content : JSON.stringify(c.content || ''), j.toolUseResult?.stdout, j.toolUseResult?.stderr].filter(Boolean).join('\n');
          commands[i].ok = !c.is_error && !j.toolUseResult?.interrupted && !/(^|\s)([1-9]\d* failed|FAIL\b|Test Files\s+[1-9]\d* failed|[1-9]\d* failing\b|✗|ERR_)/m.test(text);
          continue;
        }
        if (c?.type !== 'tool_use' || !inThisTree) continue;
        const ts = Date.parse(j.timestamp || '') || 0;
        if (c.name === 'Bash' && c.input?.command) {
          const cmd = String(c.input.command);
          commands.push({ cmd, ok: false, ts });
          pending.set(c.id, commands.length - 1);
          const targets = bashWriteTargets(cmd);
          for (const f of targets) edited.add(f);
          if (targets.length) lastChangeTs = Math.max(lastChangeTs, ts);
        }
        if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(c.name || '') && c.input?.file_path) {
          const f = real(String(c.input.file_path));
          if (f.startsWith(cwd + '/')) { edited.add(f.slice(cwd.length + 1)); lastChangeTs = Math.max(lastChangeTs, ts); } // edits in another tree are not ours
        }
      }
    } catch {}
  }
  changed = [...edited];
} catch {}
try {
  const dirty = execSync('git status --porcelain -uall', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').map((l) => l.slice(3).trim().replace(/^.* -> /, '')).filter(Boolean);
  for (const f of dirty) {
    if (changed.includes(f) || !/\.[cm]?[jt]sx?$/.test(f) || /(^|\/)(node_modules|dist|build|coverage|reports)\//.test(f)) continue;
    if (!transcriptOk) { changed.push(f); continue; }
    try { const mt = statSync(join(cwd, f)).mtimeMs; if (mt >= sessionStart - 60_000) { changed.push(f); lastChangeMtime = Math.max(lastChangeMtime, mt); } } catch {}
  }
} catch { if (!transcriptOk) process.exit(0); }
const changedTests = changed.filter((f) => /\.(test|spec)\.[cm]?[jt]sx?$|__tests__\//.test(f));
const changedLogic = changed.filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !/\.(test|spec)\./.test(f) && !/__tests__\//.test(f) && !/\.config\./.test(f));
if (!changedTests.length && !changedLogic.length) process.exit(0);


// A run counts only as a whole command (`yarn test:e2e` is not `yarn test`), not scoped to files or a name
// pattern, and only if its result was green: `yarn test || true` reports failures in its output and is not a run.
const isWholeRun = (seg, run) => (seg === run || seg.startsWith(run + ' ')) && !/\s\S*\.(test|spec)\.[cm]?[jt]sx?\b/.test(seg) && !/\s--?(t|testNamePattern)\b/.test(seg);
const segments = (cmd) => cmd.split(/\n|&&|\|\||;|\|/).map((x) => x.trim()).filter(Boolean);
const fresh = (c) => !c.ts || (c.ts >= lastChangeTs && c.ts >= lastChangeMtime - 2_000);
const ranFull = commands.some((c) => c.ok && fresh(c) && segments(c.cmd).some((seg) => isWholeRun(seg, fullRun) || (/^(npx\s+)?vitest(\s+run)?(\s|$)/.test(seg) && isWholeRun(seg, seg.split(/\s+/).slice(0, /^npx/.test(seg) ? 2 : 1).join(' ')))));
const ranMutation = mutationRun ? commands.some((c) => c.ok && fresh(c) && segments(c.cmd).some((seg) => isWholeRun(seg, mutationRun) || /^(npx\s+)?stryker\s+run\b/.test(seg))) : true;

const reasons = [];
if ((changedTests.length || changedLogic.length) && !ranFull)
  reasons.push(`Run the WHOLE suite with parallelism and random order before finishing: \`${fullRun}\`. A green run of the files you touched is not verification. Changed: ${[...changedTests, ...changedLogic].slice(0, 8).join(', ')}${changed.length > 8 ? ', …' : ''}.`);
const lite = cfg.mode !== 'strict'; // standard (default) = full-run reminder only; strict = + mutation + self-review
const mutationDue = !lite && (changedLogic.length || changedTests.length) && mutationRun && !ranMutation && (cfg.mutation?.required ?? true);
if (mutationDue)
  reasons.push(`${changedLogic.length ? `Logic files changed (${changedLogic.slice(0, 5).join(', ')})` : `Tests were added or changed (${changedTests.slice(0, 5).join(', ')}) — a test that kills no mutants verifies nothing`}. Run mutation testing on the covered logic (\`${mutationRun}\`, or scoped: \`npx stryker run --mutate <file>\`) and classify survivors: test gap → add the boundary test; equivalent → exclude point-wise with a reason. Do not reason about mutants yourself — run the tool.`);
// strict: a mutation run is not the finish line — every survivor gets a verdict. Measured: a weak model runs
// Stryker, writes "the tests kill most mutants" and stops at 65–85 %. One nudge with the exact list, once.
if (!lite && ranMutation) {
  const survivors = unclassifiedSurvivors(cwd, cfg, sessionStart, String(input.last_assistant_message || lastAssistantText || ''));
  if (survivors.length)
    reasons.push(`The mutation report still has ${survivors.length} surviving mutant(s) you did not give a verdict on${survivors.length > 12 ? ' (first 12)' : ''}:\n` +
      survivors.slice(0, 12).map((s) => `     ${s.file}:${s.line} ${s.mutator} → ${s.replacement}`).join('\n') +
      `\n   For each one, in your final message: TEST GAP (boundary is in the task) → add the test on that exact boundary and re-run; IMPLEMENTATION BOUNDARY (a limit or default nobody asked for) → do not bless it, list it under your decisions; EQUIVALENT (no input can make the outputs differ) → say why; the point-wise \`// Stryker disable next-line\` exclusion is proposed to a human, not applied by you. A threshold, date or default that is in the task is never an implementation boundary — it is a test gap. Never lower the threshold (AGENTS.md §8).`);
}
// The self-review checklist never blocks on its own; it rides along with a real blocker.
if (reasons.length && changedTests.length && !lite)
  reasons.push('Then, for every test you touched: does the name say the same thing as its expects? Is anything mocked that the test was supposed to exercise? List the decisions you made on your own.');

if (reasons.length) {
  try { writeFileSync(counterPath, String(blocksSoFar + 1)); } catch {}
  process.stderr.write('ninja-testing — before you stop:\n' + reasons.map((r) => ' - ' + r).join('\n') + '\n');
  process.exit(2);
}
process.exit(0);

// Survived mutants from the freshest Stryker JSON report written during this session, minus the ones the
// agent's final message already talks about (by line number or by an explicit disable comment in the source).
function unclassifiedSurvivors(root, cfg, since, finalText) {
  const candidates = [];
  const explicit = cfg.mutation?.report;
  if (explicit) candidates.push(join(root, explicit));
  for (const dir of ['.', ...listDirs(join(root, 'packages')), ...listDirs(join(root, 'apps'))]) {
    for (const rel of ['reports/mutation/report.json', 'reports/mutation/mutation.json', 'reports/mutation/mutation-report.json'])
      candidates.push(join(root, dir, rel));
  }
  let best = null;
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const mtime = statSync(p).mtimeMs;
    if (since && mtime < since - 60_000) continue; // stale: written before this session
    if (!best || mtime > best.mtime) best = { p, mtime };
  }
  if (!best) return [];
  let report;
  try { report = JSON.parse(readFileSync(best.p, 'utf8')); } catch { return []; }
  const out = [];
  for (const [file, data] of Object.entries(report.files || {})) {
    const src = safeRead(join(root, file)) || safeRead(join(root, dirOf(best.p, 'reports'), file)) || '';
    const srcLines = src.split('\n');
    for (const m of data.mutants || []) {
      if (m.status !== 'Survived') continue;
      const line = m.location?.start?.line;
      const prev = srcLines[line - 2] || '';
      if (/Stryker disable/i.test(prev)) continue;
      if (line && new RegExp(`(^|[^\\d.])${line}([^\\d]|$)`).test(finalText)) continue;
      out.push({ file: file.split('/').slice(-2).join('/'), line, mutator: m.mutatorName, replacement: String(m.replacement || '').replace(/\s+/g, ' ').slice(0, 60) });
    }
  }
  return out;
}
function listDirs(p) { try { return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(p, d.name).replace(cwd + '/', '')); } catch { return []; } }
function safeRead(p) { try { return readFileSync(p, 'utf8'); } catch { return null; } }
function dirOf(p, marker) { const i = p.indexOf('/' + marker + '/'); return i < 0 ? '.' : p.slice(0, i).replace(cwd + '/', ''); }
// Files a shell command writes to, relative to the tree: `> path`, `>> path`, `tee path`, `cp/mv … path`.
function bashWriteTargets(cmd) {
  const out = [];
  const add = (f) => { if (!f) return; f = f.replace(/^['"]|['"]$/g, ''); if (f.startsWith('/')) f = real(f); if (f.startsWith(cwd + '/')) f = f.slice(cwd.length + 1); if (!f.startsWith('/') && !f.startsWith('/dev/') && /\.[cm]?[jt]sx?$/.test(f)) out.push(f.replace(/^\.\//, '')); };
  for (const m of cmd.matchAll(/>{1,2}\s*(['"]?[^\s'"|;&>]+['"]?)/g)) add(m[1]);
  for (const m of cmd.matchAll(/\btee\s+(?:-a\s+)?(['"]?[^\s'"|;&]+['"]?)/g)) add(m[1]);
  for (const m of cmd.matchAll(/\b(?:cp|mv)\s+(?:-\S+\s+)*\S+\s+(['"]?[^\s'"|;&]+['"]?)/g)) add(m[1]);
  return out;
}
// realpath of a path that may not exist any more: resolve the longest existing prefix, keep the rest.
function real(p) {
  let head = p, tail = '';
  while (head && head !== '/') {
    try { return join(realpathSync.native(head), tail); } catch {}
    const i = head.lastIndexOf('/');
    tail = head.slice(i + 1) + (tail ? '/' + tail : '');
    head = head.slice(0, i) || '/';
  }
  return p;
}
function gitToplevel(dir) { try { return execSync('git rev-parse --show-toplevel', { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || dir; } catch { return dir; } }
function readStdin() { try { return readFileSync(0, 'utf8'); } catch { return ''; } }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
