#!/usr/bin/env bash
# Self-test for the ninja-testing hooks: synthetic transcripts and test files, expected exit codes.
# Run: bash scripts/hooks/selftest.sh   (needs node + git)
set -u
H="$(cd "$(dirname "$0")" && pwd)"
S="$(cd "$(mktemp -d)" && pwd -P)"   # pwd -P: on macOS mktemp returns /var/… which is a symlink to /private/var
export TMPDIR="$S"                     # the hook keeps its block counters in os.tmpdir(); keep them inside the sandbox
trap 'rm -rf "$S"' EXIT
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected $2, got $3"; fail=1; fi; }

# --- repo + config -----------------------------------------------------------------------------
mkdir -p "$S/repo/src" "$S/repo/.claude"
git -C "$S/repo" init -q && echo '{"name":"x"}' > "$S/repo/package.json" && git -C "$S/repo" add -A && git -C "$S/repo" -c user.email=a@b -c user.name=t commit -qm init
echo '{"mode":"standard","commands":{"testAll":"yarn test","mutation":"yarn test:mutation"}}' > "$S/repo/.claude/ninja-testing.json"

# transcript builder: python expression over edit(file) / bash(cmd, ok=True, out=..., cwd=None)
mk() { python3 - "$S" "$1" "$2" <<'EOF'
import json,sys
S,name,spec=sys.argv[1],sys.argv[2],sys.argv[3]
R=S+'/repo'; t=[0]
def ts(): t[0]+=1; return "2026-01-01T10:00:%02dZ"%t[0]
def edit(f): return {"type":"assistant","cwd":R,"timestamp":ts(),"message":{"content":[{"type":"tool_use","id":"e%d"%t[0],"name":"Edit","input":{"file_path":R+"/"+f}}]}}
n=[0]
def bash(cmd, ok=True, out="Tests 3 passed (3)", cwd=None):
    n[0]+=1; i="b%d"%n[0]
    return [{"type":"assistant","cwd":cwd or R,"timestamp":ts(),"message":{"content":[{"type":"tool_use","id":i,"name":"Bash","input":{"command":cmd}}]}},
            {"type":"user","cwd":cwd or R,"timestamp":ts(),"message":{"content":[{"type":"tool_result","tool_use_id":i,"is_error":not ok,"content":out}]},"toolUseResult":{"stdout":out,"stderr":""}}]
lines=[{"type":"user","timestamp":"2026-01-01T10:00:00Z","message":{"content":[{"type":"text","text":"go"}]}}]
for item in eval(spec): lines += item if isinstance(item,list) else [item]
open(S+'/'+name+'.jsonl','w').write('\n'.join(json.dumps(l) for l in lines))
EOF
}
stop() { # name expected [prompt_id] [last_assistant_message]
  rm -f "$S"/ninja-testing-stop-selftest*
  printf '{"cwd":"%s","transcript_path":"%s","session_id":"selftest","prompt_id":"%s","last_assistant_message":%s}' "$S/repo" "$S/$1.jsonl" "${3:-p1}" "$(printf '%s' "${4:-}" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')" \
    | node "$H/stop-check.mjs" >/dev/null 2>&1; check "stop $1" "$2" "$?"
}

echo "# stop-check"
mk a  '[edit("src/a.test.ts")]';                                                            stop a 2
mk b  '[edit("src/a.test.ts"), bash("yarn test:e2e")]';                                     stop b 2   # yarn test:e2e is not yarn test
mk c  '[edit("src/a.test.ts"), bash("yarn test || true", out="Tests 1 failed | 2 passed")]'; stop c 2  # failures in output
mk c2 '[edit("src/a.test.ts"), bash("yarn test", ok=False, out="FAIL src/a.test.ts")]';    stop c2 2
mk d  '[edit("src/a.test.ts"), bash("yarn test")]';                                         stop d 0
mk e  '[edit("src/a.test.ts"), bash("cd packages/x && yarn test && echo done")]';           stop e 0
mk f  '[bash("echo x > src/b.test.ts"), bash("echo ok")]';                                  stop f 2   # Bash write counts as a change
mk g  '[bash("yarn test"), bash("cat <<EOF > src/c.test.ts\nx\nEOF")]';                     stop g 2   # run before the write is stale
mk h  '[bash("yarn test"), edit("src/a.test.ts")]';                                         stop h 2
mk h2 '[edit("src/a.test.ts"), bash("yarn test"), edit("src/a.test.ts"), bash("yarn test")]'; stop h2 0
mk w  '[edit("src/a.test.ts"), bash("yarn test", cwd="/elsewhere/main")]';                  stop w 2   # run in another tree (worktree)
mk v  '[edit("src/a.test.ts"), bash("npx vitest run")]';                                    stop v 0
mk v2 '[edit("src/a.test.ts"), bash("npx vitest run src/a.test.ts")]';                      stop v2 2  # scoped to a file
mk v3 '[edit("src/a.test.ts"), bash("yarn test -t boundary")]';                             stop v3 2  # name pattern
# counter: two blocks per prompt, a new prompt starts fresh
rm -f "$S"/ninja-testing-stop-selftest*; seq=""
for p in p1 p1 p1 p2; do printf '{"cwd":"%s","transcript_path":"%s","session_id":"selftest","prompt_id":"%s"}' "$S/repo" "$S/a.jsonl" "$p" | node "$H/stop-check.mjs" >/dev/null 2>&1; seq="$seq$?"; done
check "stop counter per prompt (2,2,0 then new prompt 2)" "2202" "$seq"
# dirty file written by a script during the session (not in the transcript)
echo x > "$S/repo/src/d.test.ts"; touch -d '2026-01-01T10:00:01Z' "$S/repo/src/d.test.ts"
mk i  '[bash("node gen.js")]';                                                              stop i 2
mk i2 '[bash("node gen.js"), bash("yarn test")]';                                           stop i2 0
touch -d '2026-01-01T09:00:00Z' "$S/repo/src/d.test.ts";                                    stop i 0   # dirty before the session: not ours
rm -f "$S/repo/src/d.test.ts"
# strict: verdict on survivors from last_assistant_message
echo '{"mode":"strict","commands":{"testAll":"yarn test","mutation":"yarn test:mutation"}}' > "$S/repo/.claude/ninja-testing.json"
mkdir -p "$S/repo/reports/mutation"
echo '{"files":{"src/fee.ts":{"mutants":[{"status":"Survived","mutatorName":"EqualityOperator","replacement":"a < 4","location":{"start":{"line":12}}},{"status":"Survived","mutatorName":"ConditionalExpression","replacement":"true","location":{"start":{"line":30}}}]}}}' > "$S/repo/reports/mutation/report.json"
mk m '[edit("src/fee.test.ts"), bash("yarn test && yarn test:mutation", out="Tests 3 passed\nMutation score 90%")]'
stop m 0 q1 "Verdicts: line 12 equivalent (continuous at 4); line 30 test gap, added."
stop m 2 q2 "Done, most survivors are equivalent."
rm -rf "$S/repo/reports"

# --- test-lint -----------------------------------------------------------------------------------
echo "# test-lint"
mkdir -p "$S/lint/.claude"; echo '{"mode":"strict"}' > "$S/lint/.claude/ninja-testing.json"
lint() { printf '{"cwd":"%s","tool_input":{"file_path":"%s"}}' "$S/lint" "$S/lint/$1" | node "$H/test-lint.mjs" >/dev/null 2>&1; check "lint $1" "$2" "$?"; }
cat > "$S/lint/arrange-loop.test.ts" <<'EOF'
import { it, expect } from 'vitest';
it('sums all answer scores when the quiz has several answers', () => {
  const answers = [];
  for (let i = 0; i < 3; i++) answers.push({ score: 1 });
  if (process.env.DEBUG) console.log(answers);

  const result = sumScores(answers);

  expect(result).toBe(3);
});
it('dispatches through a fake', () => {
  const calls = [];
  const fake = { send(xs) { xs.forEach((x) => calls.push(x)); } };

  fake.send([1, 2]);

  expect(calls).toEqual([1, 2]);
});
EOF
lint arrange-loop.test.ts 0
cat > "$S/lint/real-loop.test.ts" <<'EOF'
import { it, expect } from 'vitest';
it('checks every item', () => {
  for (const x of make()) {
    expect(x.ok).toBe(true);
  }
});
it('checks each', () => {
  make().forEach((x) => expect(x.ok).toBe(true));
});
it('branches', () => {
  const r = run();
  if (r.kind === 'a') expect(r.value).toBe(1);
  else expect(r.value).toBe(2);
});
EOF
lint real-loop.test.ts 2
cat > "$S/lint/guard.test.ts" <<'EOF'
import { it, expect } from 'vitest';
it('narrows a union', () => {
  const r = run();
  if (r.kind !== 'ok') throw new Error('expected ok');

  expect(r.value).toBe(1);
});
EOF
lint guard.test.ts 0
cat > "$S/lint/state-class.test.tsx" <<'EOF'
import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
it('marks the selected tab', () => {
  render(<Tabs />);

  expect(screen.getByRole('tab', { name: 'Settings' })).toHaveClass('active');
});
EOF
lint state-class.test.tsx 0
cat > "$S/lint/vis-class.test.tsx" <<'EOF'
import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
it('hides the panel', () => {
  render(<Panel />);

  expect(screen.getByRole('region')).toHaveClass('hidden');
});
EOF
lint vis-class.test.tsx 2
cat > "$S/lint/bad.test.ts" <<'EOF'
import { it, expect } from 'vitest';
export const userFixture = { id: 1 };
it('throws on 5 items', () => {
  try { fn(); } catch (e) { }
  expect(fn()).toThrow();
  expect(x).toMatchSnapshot();
});
EOF
lint bad.test.ts 2

# --- guard ---------------------------------------------------------------------------------------
echo "# guard"
g() { printf '%s' "$2" | node "$H/guard.mjs" 2>/dev/null | grep -o '"permissionDecision":"[a-z]*"' | cut -d'"' -f4; }
check "guard snapshot update" "deny" "$(g x '{"tool_name":"Bash","tool_input":{"command":"npx vitest run -u"}}')"
check "guard no-verify" "deny" "$(g x '{"tool_name":"Bash","tool_input":{"command":"git commit --no-verify -m x"}}')"
check "guard force push" "deny" "$(g x '{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}')"
check "guard config edit asks" "ask" "$(g x '{"tool_name":"Edit","tool_input":{"file_path":"/r/vitest.config.ts","new_string":"x"}}')"
check "guard Stryker disable asks" "ask" "$(g x '{"tool_name":"Edit","tool_input":{"file_path":"/r/src/a.ts","new_string":"// Stryker disable next-line EqualityOperator: x\nif (a<4)"}}')"
check "guard plain edit passes" "" "$(g x '{"tool_name":"Edit","tool_input":{"file_path":"/r/src/a.ts","new_string":"if (a<4)"}}')"

[ $fail = 0 ] && echo "ALL OK" || { echo "FAILURES"; exit 1; }
