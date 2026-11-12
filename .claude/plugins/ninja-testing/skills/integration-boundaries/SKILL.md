---
name: integration-boundaries
description: Write one integration test by classifying every dependency of the vertical slice (inside / neighbour / external / plumbing) before mocking anything. Use for "write an integration test", "test with the real database", "test the component tree with the store", "add a concurrent test", "what to mock".
argument-hint: "<slice or function/component tree> [backend|frontend]"
user-invocable: false
---

# Integration boundaries

"What exactly should an integration test cover?" is the question agents answer wrong most often — because most people answer it wrong too. Unit and E2E are the extremes of the spectrum and easy to picture; the middle is where the training data is degenerate: sometimes "integration" means gluing two modules, sometimes it means a near-E2E run. An agent therefore swings between two failures: it **over-mocks its own slice** ("this orders module does not interest me yet, I will mock it") and it **grabs too much** (two screens of setup, ten entities). On the backend the real database looks to it like a slower, harder-to-configure mock, so it writes a unit test with a fake DB and calls it integration. On the frontend a shared store looks like a source of unreliability, so it mocks a store method or a selector and the test quietly drops back to unit level. The cure is not a rule about mocks; it is a procedure that decides, for every dependency, whose it is.

> I test with integration tests a vertical slice that carries value and is not plumbing.

## When to use

- You are about to write, or review, a test where the action happens in one module/component and the check must be made in another (status changed **and** audit log written; click in `TierPicker` → badge in `OrderSummary`).
- The behaviour is partly implemented outside the function: a DB constraint, a transaction, a recount, a store selector.
- An agent's draft contains `vi.mock` / `jest.mock` on a repository, a store, a selector, or a module from the same feature directory.

Not this skill:
- Deciding *which* level a check belongs to → `test-plan-by-level`. Here the level is already integration and stated in the task.
- Building the fake of an external service and its contract → `external-contract`. This skill only decides *that* it is faked at the network and requires the fake to carry all known branches.
- Six or more entities that cannot be split → `e2e-select`.
- A concurrent test that passed on retry → `flaky-triage`.

## Inputs

- The slice named in business terms (orders, reviews, ticket purchase), not a layer (controllers, the store).
- The explicit level in the task: "integration". In a project with existing tests the level is always stated; the agent otherwise copies whatever lies next door (AGENTS.md §7).
- Backend: the name of the test DB harness — the transactional client (`testDb`) and the committed, non-transactional client (`committedDb`) — and the isolation strategy of the repo (transaction rollback or reset + seed).
- Frontend: whether MSW is installed (its presence in `package.json` is the strongest single nudge towards the right boundary), and the store's public API.
- Whether vertical slices are expressed in the directory structure (FSD, feature modules). If they are not, ask the human to mark the slice: "which directories/tables are orders?" — do not infer it from imports.
- Whether a service owned by another team counts as "ours". Teams answer differently; ask.

## Procedure

### 1. Name the slice and the value (you)

Write one sentence: "Slice: `orders`. Behaviour under test: a purchase reserves seats, confirms the order, and never oversells." This is the *vertical* slice — everything needed for one business task — not a horizontal layer. If the sentence names a layer ("the service layer", "the store"), rewrite it.

### 2. List the participating entities (you)

Enumerate the code modules, tables, store slices and components the behaviour touches. Target 3–5. Six or more, or a setup approaching two screens: split into two tests, or lift the check to E2E.

> 5 plus or minus 2 entities maximum. I prefer minus 2.

### 3. Classify every dependency (you) → the table

Fill the table in [reference.md](reference.md) — one row per dependency, one bucket each:

| Bucket | What goes here | Decision |
|---|---|---|
| **Inside the slice** | its modules, its DB tables and constraints, its store and selectors, its child components, pure `shared/` helpers | **real, never mocked** |
| **Neighbouring slice** | another business module the slice calls (reports, audit, reviews) | may mock **the module**; never its tables — "the piece of database other modules reach into you *can* mock, but better mock the modules themselves" |
| **External** | anything the team does not own: payment, antifraud, courier, a partner API | fake **at the network** (MSW `setupServer`/`setupWorker`, `onUnhandledRequest: 'error'`), built from the contract with all known branches — never by mocking the client module |
| **Plumbing** | authorisation and everything that runs before the business logic | stub: `can → true`, "a user object that already has every possible right, a dozen impossible ones and a couple of utterly unbelievable ones" — unless the test is about permissions |

The test of a row: *does part of the responsibility for this behaviour live there?* If yes, it is inside, whatever it is.

> If part of the responsibility of our element lives in another module, we lose the right to mock that module. Code module or database — it does not matter.

### 4. Backend variant (you)

- Real database, the repo's isolation strategy, tests pass in random order (`sequence.shuffle` in Vitest, `--randomize` in Jest) and twice in a row on the same DB.
- Happy path, then **the error flow for every write**: duplicate write, linked operations both-or-neither, and — when the slice has a limit, balance, lock or `FOR UPDATE` — the concurrent case. Models have no sense of time; they will not write it unless told.
- Concurrency pattern (code in [reference.md](reference.md)): seed to "one resource left"; one trust-expect on the fixture; N calls in `Promise.all` on `committedDb` (real competing connections — `testDb` is inside one transaction and cannot race); assert by **counting** outcomes (`exactly one rejected with reason sold_out`), never "the first one fails"; finish with a direct DB query on the counter.
- Checking state with a direct query is a strategy, not a compromise: the slice's tables are part of its contract. If the check repeats, extract `soldCount(db, tierId)` into the DB layer. No test-only backdoors in production code; the single exception is an auth path behind `NODE_ENV === 'test'`.

A prompt that worked. Swap paths and names; keep the constraints word for word:

```
Write an integration test for purchaseTickets from the file
packages/server/src/purchaseTickets.ts — use the real test database
(the Drizzle test client is already configured and available as testDb,
see the setup file in this same directory).
Save the test to packages/server/src/__tests__/purchaseTickets.test.ts.
Constraints:
- do not open or use other test files of the project;
- do not modify the function purchaseTickets itself.
Make the test green.
```

Add one line — "include the error flow: duplicate write, concurrent requests, consistency of linked operations" — and, when a limit or lock exists, the follow-up that worked:

```
I need tests for the concurrent ticket purchase.
```

In a real brownfield repo replace "do not open other test files" with a whitelist: "use `<file>` as the sample".

Race-condition instructions belong in a **directory-level** `CLAUDE.md` next to the code that can race ("When testing code in this directory, pay attention to potential race conditions" — that is enough), or in this skill. Never in the root `CLAUDE.md`/`AGENTS.md`: a model on high reasoning then starts guarding against impossible situations, tests grow, and you read more.

### 5. Frontend variant (you)

- Real component tree, **real store**, real selectors. The single substituted boundary is the network: an MSW handler for every request the tree makes on mount and on interaction. Browser APIs the test does not own (geolocation, clipboard) are stubbed too.
- Bring the store to the starting state through real calls: load via the fake network, dispatch actions. Preset state directly (`useCartStore.getState().setAvailability(...)`) only when the ceremony is unreasonable (a five-step wizard to test step five), say so in a comment, and own the claim that the state is reachable. A mocked store method is never the answer.
- Locators as the user finds things (`getByRole`, `getByText`); third-party widgets with no semantics get one shared helper file per project (`selectDate('12.08.2026')`), never an ad-hoc `querySelector` or XPath in the test.
- Assert two things: the **visible effect in the other component** (`await expect.element(page.getByText('Remaining: 4 seats')).toBeVisible()`) and the **outgoing request at the boundary** (the handler received `PATCH /notifications/:id` with the right body).
- No `setProps`/`rerender` with new props mid-test. Ask "who calls this line in real operation?" — with 80–90 % probability that block has to be unmocked and included. A new input state is a separate test.
- A dumb child (props only) is rendered real and unit-tested through its props elsewhere; do not mock requests or dispatch above it. A **self-sufficient child from another slice** (loads its own data, owns its own queries) is mocked at the module (`vi.mock('./ReviewsPanel')`) and the test asserts the props it received — code in [reference.md](reference.md).

A prompt that worked:

```
Write an integration test for the component tree TicketWidget
(TicketWidget → TierPicker → OrderSummary) from the file
packages/client/src/TicketWidget.tsx.
The test must check that when tickets are added to the cart the badge
"Remaining: N seats" in OrderSummary updates correctly.
Save the test to packages/client/src/__tests__/TicketWidget.integration.test.tsx.
Constraints:
- do not open or use other test files of the project;
- do not modify the components themselves.
Make the test green.
```

(As written, "updates correctly" is a stop-word under AGENTS.md §2 — before sending, give the value: "after adding one balcony ticket the badge shows Remaining: 4 seats instead of 5".)

If MSW is not in `package.json`, add: "mock only the network with MSW; the store and selectors stay real".

### 6. Validate the test with a toggled bug (you, then the human confirms)

Break the responsibility the test claims to cover and run: remove the transaction / the `FOR UPDATE` (backend); make the selector stop subtracting the cart (frontend). The test **must go red**. Restore with `git checkout`. A test that stays green under the toggled bug is verifying its own mocks — rewrite it. In a real session the mocked-store variant stayed green against the broken selector; the MSW + real store variant caught it.

### 7. Self-review (you), then the human reads it the same way

Read in this order: title → `expect`s → what is mocked → logic.
- Setup ≤ one screen.
- Answer "why could this test break, given that all other tests are green?" — the list must be short; a long list means the test grabbed too much.
- Nothing inside the slice is mocked; every `vi.mock` maps to a "neighbour" or "external" row of the table.
- Adjacent `expect`s that absorb each other (`toBeLessThanOrEqual(3)` then `toBe(2)`) — ask "what is the point of two such checks in a row?"; the model removes one itself.
- Report the decisions you made on your own (AGENTS.md §2): preset state, which neighbour was mocked and why, which branches the external fake carries.

## Done when

- The dependency table exists, every dependency sits in exactly one bucket, and the rows marked "inside" have no double in the test (`grep vi.mock` against the slice directory is empty).
- 3–5 entities; setup fits one screen.
- Backend: real DB; ≥1 storage-failure scenario per write operation; a concurrent test whenever a limit/lock/balance exists, asserted by counting plus a direct DB query; suite passes in random order, in parallel, and twice in a row.
- Frontend: no `vi.fn`/`vi.spyOn`/`vi.mock` on the store or selectors; MSW handlers cover every request of the tree with `onUnhandledRequest: 'error'`; assertions on the visible effect in the other component **and** the outgoing request; no `setProps` mid-test; any preset state is commented as a deliberate deviation.
- The toggled bug turned the test red and the code was restored.
- The prompt that produced the test named the level, the real parts, the substituted parts, "do not modify the function/components", and "make the test green".

## Red flags

- **Unit with a fake DB called "integration"**: repository/ORM client mocked, always returns success. Counter: real DB; the constraint, the recount and the race are the behaviour.
- **Happy path only against the real DB**: the agent sees the DB as a slow mock and never provokes failure. Counter: one line — "include the error flow".
- **No concurrent test** although a limit or lock exists; the agent "does not even mention it" (observed: 10 good tests, zero concurrent). Counter: the follow-up line; directory-level `CLAUDE.md`; toggled bug.
- **"The first one fails"** in a concurrent test. Counter: count outcomes with `filter`; completion order is not deterministic.
- **Store method or selector mocked** (`store.markRead = vi.fn()`, `selectRemainingForTier: vi.fn().mockReturnValue(7)`). Counter: "you just bit off part of the functionality and how it is wired to the whole store" — MSW on the network, real store; read such a test three times.
- **Preset state by default** because "I gave this state, so I can rely on it". Counter: "where is the guarantee this state is reachable at all? You wrote the state in through the back door" — bring the store there through real calls.
- **`setProps` mid-test**. Counter: who changes those props in reality → include that block, or make it a separate test.
- **Over-mocking the own slice** ("does not interest me yet"). Counter: unmock; only neighbours and externals may be doubles.
- **Two screens of setup / 6+ entities** — "AI is hyper-enthusiastic; two screens of setup cost it nothing". Counter: split or lift to E2E.
- **Backdoor endpoint "for tests"**. Counter: direct DB query; tests are not sufficient justification for production code.
- **Level inherited from the neighbouring file** instead of the task. Counter: name the level in the prompt; whitelist sample files.
- **The agent edits the function under test** to make testing easier. Counter: the constraint line; `git diff --name-only` outside test files must be empty.
- **XPath / `querySelector` in despair** on a third-party widget. Counter: the shared helper file — "when there is muck, put it in the muck basket so it does not litter the whole project".
- **"Think about race conditions" in the root `CLAUDE.md`**. Counter: move it to the directory that can race.
