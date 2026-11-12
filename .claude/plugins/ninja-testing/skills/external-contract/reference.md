# external-contract — reference skeletons

Companion to [SKILL.md](SKILL.md). Vitest + zod + MSW + supertest shown; Jest maps one-to-one (MSW `setupServer` is runner-agnostic).
## 1. Source inventory and gap/conflict report (procedure A, steps 1–2)

Fill one row per field. "Seen in all samples" is not a source for *required*.

| Field | Docs | OpenAPI / JSON Schema | npm typings | Real responses (n, states) | Verdict | Confirming source |
|---|---|---|---|---|---|---|
| `riskScore` | number | `number`, nullable | `number \| null` | 40 (normal, blocked), `null` in 3 (manual review) | `number \| null` | typings + samples #12,#15,#31 |
| `manualReviewRequired` | not mentioned | optional boolean | absent | `true` only when `riskScore` is `null` | optional; invariant **assumed** | samples only — **human confirms** |
| `warehouseId` | required string | — | `string \| null` | present in all 20 | `string \| null` | typings; docs conflict |

Report sections, in this order:

1. **Gaps** — every optional/nullable field and how it is known.
2. **Conflicts** — every disagreement between sources, no verdict chosen by the agent.
3. **Assumed invariants** — relationships between fields the agent inferred from samples and cannot verify.
4. **Unsampled states** — states named by the domain owner for which no real response exists yet.

## 2. Schema and fixture factory (procedure A, step 4)

```ts
// contracts/riskShield.schema.ts — the contract; the only place the shape is declared
import { z } from 'zod';

export const RiskShieldResponseSchema = z.discriminatedUnion('manualReviewRequired', [
  z.object({
    riskScore: z.number().int().min(0).max(100),
    flagged: z.boolean(),
    reasons: z.array(z.string()),          // shape, not the enum seen in samples
    manualReviewRequired: z.literal(false).optional(),
  }),
  z.object({
    riskScore: z.null(),
    flagged: z.literal(false),
    reasons: z.tuple([]),
    manualReviewRequired: z.literal(true),
  }),
]);
export type RiskShieldResponse = z.infer<typeof RiskShieldResponseSchema>;
```

```ts
// fixtures/riskShieldResponse.fixtures.ts — factory, typed from the contract, no redeclared interface
import { RiskShieldResponseSchema, type RiskShieldResponse } from '../contracts/riskShield.schema';

type Overrides = { riskScore?: number | null; flagged?: boolean; reasons?: string[] };
const defaults = { riskScore: 0, flagged: false, reasons: [] as string[] };

export function makeRiskShieldResponse(overrides: Overrides = {}): RiskShieldResponse {
  const base = { ...structuredClone(defaults), ...overrides };
  const candidate = base.riskScore === null
    ? { riskScore: null, flagged: false, reasons: [], manualReviewRequired: true }   // invariant lives here, once
    : { riskScore: base.riskScore, flagged: base.flagged, reasons: base.reasons };
  return RiskShieldResponseSchema.parse(candidate);   // a fixture that drifts from the contract fails at construction
}
// the few typical states; tests use these with overrides, not a personal fixture per test
export const riskShieldOk = () => makeRiskShieldResponse();
export const riskShieldBlocked = (reasons = ['velocity']) => makeRiskShieldResponse({ flagged: true, riskScore: 90, reasons });
export const riskShieldManualReview = () => makeRiskShieldResponse({ riskScore: null });
```

## 3. Fake at the network (procedure A, step 5)

```ts
// test/msw/riskShield.handlers.ts — fake: answers by input, holds the id → state mapping
import { http, HttpResponse } from 'msw';
import { riskShieldOk, riskShieldBlocked, riskShieldManualReview } from '../../fixtures/riskShieldResponse.fixtures';

const byOrder: Record<string, () => unknown> = { 'ord-ok': riskShieldOk, 'ord-blocked': riskShieldBlocked, 'ord-review': riskShieldManualReview };

export const riskShieldHandlers = [
  http.post('https://api.riskshield.example/v1/check', async ({ request }) => {
    const { orderId } = (await request.json()) as { orderId: string };
    return HttpResponse.json((byOrder[orderId] ?? riskShieldOk)());
  }),
];
// test/setup.ts: server.listen({ onUnhandledRequest: 'error' }) — a request you did not model fails the test
```

Production boundary: `RiskShieldResponseSchema.parse(await res.json())` in the client, type inferred. No `?? defaultValue` on missing fields.

## 4. Drift-check job (procedure A, step 7)

Separate scheduled workflow (`on: schedule: cron '0 6 * * *'` + `workflow_dispatch`), token from secrets; never a step of the PR pipeline.

```ts
// scripts/contract-drift.ts — fetch with retry, then compare; exit code = drift
const SAMPLE_IDS = ['ord-ok', 'ord-blocked', 'ord-review'];   // ids in different states, kept current by the domain owner

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) { if (i === attempts) throw new Error(`service unavailable after ${attempts} attempts: ${e}`); }
  }
}

const failures: string[] = [];
for (const id of SAMPLE_IDS) {
  const json = await withRetry(() => fetchRiskShield(id, process.env.RISKSHIELD_TOKEN!));
  const r = RiskShieldResponseSchema.safeParse(json);
  if (!r.success) failures.push(`${id}: ${r.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  failures.push(...extraKeys(json, RiskShieldResponseSchema).map(k => `${id}: extra field ${k}`));
}
// optional second stage: diff the published OpenAPI / typings against the schema (AI-assisted is fine here)
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
```

Two meanings of red: "unavailable after N attempts" → retry later; anything else → the contract diverged → update the schema, then the fixtures.

## 5. Two-side contract check (procedure B, step 4)

```ts
// contract/orderResult.schema.ts — the single source of truth, written by the coordinator before work starts
export const OrderResultSchema = z.union([
  z.object({ status: z.literal('confirmed'), orderId: z.string(), totalCents: z.number().int().nonnegative() }),
  z.object({ status: z.literal('rejected'), reason: z.string() }),
]);
```

```ts
// run-contract-check.ts — each side against the schema, never against the other side
import request from 'supertest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
const server = setupServer();
server.listen({ onUnhandledRequest: 'error' });

const items = [{ tier: 'std', qty: 2 }];
const scenarios = [
  { eventId: 'evt-ok',      wire: { status: 'confirmed', orderId: 'o-1', totalCents: 270000 }, expect: { status: 'confirmed', totalCents: 270000 } },
  { eventId: 'evt-blocked', wire: { status: 'rejected', reason: 'risk_check_failed' },         expect: { status: 'rejected', reason: 'risk_check_failed' } },
];

function fieldReport(actual: Record<string, unknown>, expectedKeys: string[]) {
  const missing = expectedKeys.filter(k => !(k in actual));
  const extra = Object.keys(actual).filter(k => !expectedKeys.includes(k));
  return { missing, extra };   // "renamed" = one missing + one extra with a similar meaning; report both
}

for (const s of scenarios) {
  // backend: real route + real orderEligibility, raw JSON through the schema
  const res = await request(backendApp).post('/api/orders').send({ eventId: s.eventId, items });
  report('backend', s.eventId, OrderResultSchema.safeParse(res.body), fieldReport(res.body, Object.keys(s.wire)), res.body, s.expect);

  // frontend: the OFFICIAL wire JSON from the same schema served at the network boundary (MSW);
  // a one-off script may use vi.mocked(postOrder) instead — fine for a check script, not for suite tests
  server.use(http.post('/api/orders', () => HttpResponse.json(OrderResultSchema.parse(s.wire))));
  const out = await checkoutSubmit(s.eventId, items);
  report('frontend', s.eventId, OrderResultSchema.safeParse(out), fieldReport(out, Object.keys(s.wire)), out, s.expect);
}
```

Expected output shape (a divergence observed in a real session): `frontend evt-ok: FAIL — missing: totalCents; extra: totalAmount` · `frontend evt-blocked: FAIL — missing: reason` · `backend: PASS`. Verdict: sides diverge; only the coordinator edits the schema.
