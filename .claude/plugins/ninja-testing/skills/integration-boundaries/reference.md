# integration-boundaries — reference

Companion to [SKILL.md](SKILL.md). Two things live here: the dependency-classification table (template + two filled examples) and the code patterns the procedure refers to.

## 1. Dependency-classification table

One row per dependency the behaviour touches. A dependency sits in exactly one bucket. The deciding question for every row: *does part of the responsibility for this behaviour live there?* If yes → inside, whatever it is.

### Template

| Dependency | Kind | Owner | Responsibility it carries for this behaviour | Bucket | Decision in the test |
|---|---|---|---|---|---|
| `<module / table / store slice / component / HTTP service / browser API / auth>` | code · table · store · component · network · browser · plumbing | this slice · neighbouring slice · not ours · runs-before-logic | `<constraint, recount, selector, rendering, …>` or "none" | inside · neighbour · external · plumbing | real · mock the module (not its tables) · MSW fake from contract · stub `can → true` |

Rules of thumb per kind:
- **table / constraint / transaction** owned by the slice → inside, real. Owned by a neighbour → mock the neighbour's *module*, leave its tables alone.
- **store + selectors** of the tree under test → inside, real. Preset state only when the ceremony is unreasonable, with a comment.
- **component**: dumb (props only) → real; self-sufficient child from *another* slice (loads its own data) → neighbour, mock the module, assert props.
- **network** to something the team does not own → external, MSW, `onUnhandledRequest: 'error'`; the fake carries every known branch (`null` fields, manual review, rejection).
- **auth / feature flags / rate limiting** that run before the logic → plumbing, stub, unless the test is about them.

### Example A — backend, `purchaseTickets` (slice: orders)

Behaviour: a purchase reserves seats, confirms or rejects the order, never oversells.

| Dependency | Kind | Owner | Responsibility | Bucket | Decision |
|---|---|---|---|---|---|
| `events` table (`status = on_sale` check) | table | orders | rejects `event_not_on_sale` | inside | real |
| `ticketTiers` rows + `SELECT … FOR UPDATE` | table + lock | orders | capacity, the no-oversell invariant | inside | real, plus a concurrent test |
| `orders`, `orderItems` writes in one transaction | tables | orders | both-or-neither | inside | real; assert linked writes together |
| `calcOrderTotal` (`shared/`) | pure code | shared | totals, group discount | inside (pure) | real; its own unit tests elsewhere |
| RiskShield antifraud (`POST /risk/check`) | network | not ours | `flagged` → rejected, `manualReviewRequired` → pending | external | MSW fake from the contract, all three branches |
| reports / analytics recount | code | neighbouring slice | none for this behaviour | neighbour | mock the module; do not touch its tables |
| `can(user, 'purchase')` | plumbing | auth | none | plumbing | user with all rights / `can → true` |

Entities: events, tiers, orders(+items), totals, RiskShield → 5. Fits.

### Example B — frontend, `TicketWidget → TierPicker → OrderSummary` (slice: cart)

Behaviour: adding tickets in `TierPicker` updates the "Remaining: N seats" badge in `OrderSummary`.

| Dependency | Kind | Owner | Responsibility | Bucket | Decision |
|---|---|---|---|---|---|
| `TierPicker`, `OrderSummary` | components | cart | the action and the visible effect | inside | real |
| `useCartStore` + `selectRemainingForTier` | store | cart | `availability − quantity in cart` | inside | real; never `vi.fn` on a selector |
| `GET /api/events/:id/availability` on mount | network | ours — but the network is where the tree's slice ends, so it is faked at the boundary like an external service | initial availability | network boundary | MSW handler with known numbers |
| `ReviewsPanel` rendered unconditionally inside the widget, loads its own data | component | reviews slice | none | neighbour | `vi.mock('./ReviewsPanel')`, assert props |
| `PriceTag` (props only) | component | cart | formatting | inside (dumb) | real |
| `navigator.geolocation` used for the currency hint | browser API | not ours | none | external | stub |

Entities: two components, store, one request → 4. Fits.

## 2. Concurrency test pattern (backend)

Reference test from a real session. `committedDb` is the root connection without a wrapping transaction; `testDb` is inside a per-test transaction and cannot race against itself.

```ts
// Arrange — seed to "one seat left"; one trust-expect on the reused fixture
await seedCanonicalDemoState(committedDb);
expect(await soldCount(committedDb, 'tier-lastrow')).toBe(4); // the only tolerated deviation from AAA

// Act — real competing connections
const results = await Promise.all([
  purchaseTickets(committedDb, risk, 'user-buyer-1', 'evt-farewell', [{ tierId: 'tier-lastrow', quantity: 1 }]),
  purchaseTickets(committedDb, risk, 'user-buyer-2', 'evt-farewell', [{ tierId: 'tier-lastrow', quantity: 1 }]),
]);

// Assert — by counting, never by position
const failed = results.filter((r) => r.status === 'rejected');
expect(failed).toHaveLength(1);
expect(failed[0]).toMatchObject({ status: 'rejected', reason: 'sold_out' });
expect(await soldCount(committedDb, 'tier-lastrow')).toBe(5); // direct DB query
```

- `soldCount(db, tierId)` is a query helper in the DB layer, shared between tests — not a backdoor in production code.
- The three concurrent cases the agent produced from the one-line follow-up, all worth keeping: both fit in capacity → both confirmed; two that each exceed → exactly one `sold_out`, no overbooking; three buyers of one seat at capacity 2 → two confirmed, one `sold_out`.
- Clean-up: `afterEach` rolls back `testDb` and deletes the rows inserted through `committedDb`.
- Validation: swap in the version without the transaction — this test goes red while the happy-path file stays green. Restore with `git checkout`.
- Jest mapping: same code; run with `--randomize`; the DB harness (testcontainers / PGlite) is runner-independent.

## 3. Frontend skeleton — MSW + real store

```tsx
// Vitest Browser Mode (real Chromium) — see .claude/rules/component-tests.md
import { render } from 'vitest-browser-react';
import { page } from '@vitest/browser/context';
import { setupWorker } from 'msw/browser';
import { http, HttpResponse } from 'msw';

const worker = setupWorker(
  http.get('/api/events/:id/availability', () => HttpResponse.json({ 'tier-balcony': 5 })),
);
beforeAll(() => worker.start({ onUnhandledRequest: 'error' }));
afterEach(() => worker.resetHandlers());
afterAll(() => worker.stop());

it('adding a ticket lowers the remaining-seats badge', async () => {
  await render(<TicketWidget eventId="evt-jazz" />);        // the real store fills itself through the fake network
  await expect.element(page.getByText('Remaining: 5 seats')).toBeVisible();

  await page.getByRole('button', { name: 'Add balcony ticket' }).click();

  await expect.element(page.getByText('Remaining: 4 seats')).toBeVisible();  // effect in the other component
});
```

In a real session the same test was written with `@testing-library/react` + `setupServer` from `msw/node` — RTL is "the worst but most widespread way", and Vitest Browser Mode is the better choice today; the boundary decision (MSW + real store) is identical in both forms. Where the tree also sends something (mark as read, add to cart on the server), capture it in the handler and assert the body — the outgoing request is the second assertion of the boundary.

## 4. Self-sufficient child from another slice — mock the module, assert props

React has no library-level component stub, so it is done at the runner (`vi.mock`; `jest.mock` in Jest). Vue/Angular have stub components built in.

```ts
vi.mock('./ReviewsPanel', () => ({ default: vi.fn(() => null) }));
import ReviewsPanel from './ReviewsPanel';

render(<TicketWidget eventId="evt-jazz" />);

const props = (ReviewsPanel as Mock).mock.calls.at(-1)![0];
expect(props).toMatchObject({ eventId: 'evt-jazz' });
// a callback the parent must react to is called by hand:
props.onSuccessFlowFinish({ /* params — your responsibility that they match reality */ });
```

Mocks are spies at the same time; no factory that "mocks a list of components" — tests stay primitive.

## 5. Directory-level instruction for races

`packages/server/src/orders/CLAUDE.md` (or `AGENTS.md`), not the root file:

```
When testing code in this directory, pay attention to potential race conditions:
seats, balances and locks are shared between concurrent requests.
```

That is enough. In the root file the same sentence makes the model guard against impossible situations everywhere and inflates every test.
