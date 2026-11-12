---
name: external-contract
description: Runtime contract (zod) + network fake for an external API from all sources, with a gap/conflict report and a separate drift-check job; or one schema verified per side when two sides are built in parallel. Use for "mock/fake service X", "fixture for the response", "front and back in parallel".
argument-hint: "<service name or endpoint> [--external | --two-sides] [--sources docs,openapi,typings,samples]"
user-invocable: false
---

# External contract

A delivery service returned `warehouseId` in every sample the agent was shown, so the agent declared the field required. In production the field is `null` while the label is printed but the parcel has not been handed over yet. Every test was green. The same failure from the other direction: backend and frontend of "change member role" built in parallel from one API document — backend returns `role: 'editor'`, frontend reads `permissionLevel` (a number someone proposed in a draft discussion once). Both suites green; on the shared stand the screen silently stays as it was.

> A contract is a recorded, measurable promise between two or more sides.

Both stories are one problem: a side was verified against its own understanding of the boundary, not against a fixed, checkable promise. The agent's two weaknesses here are specific. It **fills gaps it should not fill** — it generalises a contract from whatever samples it saw and cannot tell an accidental feature of the samples from a guarantee. And **it does not work with time** — it solves the task here and now, never assumes the contract will drift, and has never once built a drift-control mechanism on its own.

## When to use

- **(A) A fake for a service the team does not own** (payment, risk scoring, delivery, geo): "mock RiskShield", "write a fixture for the Stripe response", a new external HTTP/gRPC dependency appears in a slice you are testing. Note: "mock" here means `fake` in AGENTS.md §5 terms — a small working implementation at the network boundary, not a `vi.fn()` on the client module.
- **(B) Two sides of one boundary built in parallel** — frontend and backend, two teams, two agents, or two sandboxes on one machine: "implement `POST /api/orders` and its client", "the frontend team starts before the endpoint exists".

Do **not** use it when:

- the boundary is an internal module that can be refactored without any externally visible change — that is a unit or integration concern (`integration-boundaries`), and a "contract" there is an abstraction with one implementation (AGENTS.md §5).
- one person implements both sides sequentially — types suffice; a contract test is optional.
- you are choosing the level of a test or which dependency to fake → `integration-boundaries` first, then come back here for the fake itself.

## Inputs

**For (A)** — collect every source that exists before the agent writes a line. The agent's default is level 0: google the docs, take the examples from them. Docs love to be out of date. Give it:

1. The service's documentation (with its examples, marked as *documentation examples*).
2. The OpenAPI / JSON Schema / gRPC schema if the service publishes one.
3. The service's npm package with TypeScript typings — even if the project does not use the package. Typings are a source, not a dependency.
4. Real responses fetched with an auth token, for **several ids in different states**: normal, rejected/blocked, manual review, cancelled, "label printed but not handed over" — every branch the domain owner can name. Two samples is the most common failure; aim for a hundred, and think about variability before volume.
5. The list of branches in *our* code that read the response (which fields, under which status).

**For (B)** — the prose task for each side, the canonical scenarios with expected values (`evt-ok` → confirmed, `evt-blocked` → rejected with reason), who the coordinator is (human at the keyboard or an orchestrating agent), and the stack of each side (JS/TS both sides → zod or Effect Schema; different languages → JSON Schema / OpenAPI / gRPC).

Missing an auth token or real samples → ask for them; do not substitute documentation examples silently. Missing the state list → ask the domain owner which states exist; do not enumerate them yourself.

## Procedure

### A. Contract and fake for an external service

1. **You: inventory the sources.** Produce a table: source → what it says about each field (type, optional, nullable, enum values). Pick the strongest representation available: runtime schema (zod / Effect Schema — which one does not matter) > JSON Schema > OpenAPI / gRPC > hand-written `.d.ts`. Runtime schema wins because it is a stricter check than types can express ("points awarded cannot exceed participants × 100" has no type).
2. **You: derive the schema and report gaps and conflicts — before writing the fake.** The report is the deliverable, not a by-product. For every field state the confirming source. Two mandatory sections:
   - *Gaps*: which fields are optional or nullable and **how you know** ("optional in OpenAPI", "`warehouseId: string | null` in the typings", "null in sample #7, status `label_printed`"). A field seen in all samples is **not** evidence it is required.
   - *Conflicts*: docs vs typings vs real responses ("docs say `status`, samples return `resultCode`"). Report; never pick a side silently. The human resolves conflicts, usually in favour of the real response.

   > How do I know this? Because I know it. The model has no way to check it — it is an assumption based on examples.

   Invariants between fields (`manualReviewRequired: true` only when `riskScore: null`) are exactly what you cannot verify. List them as assumptions for the human.
3. **Human: reviews the report.** Resolves each conflict, confirms or rejects each nullable/invariant assumption, adds the states nobody sampled. Only then does the schema become the contract.
4. **You: write the fixture as a configurable factory typed from the schema.** Shape from the contract, no literals from the samples, all branches. The sequence of corrections that works when the first draft is a pasted constant — apply the same corrections to your own draft:
   - *"Now I want this fixture to be a function."*
   - *"Describe the type of this fixture next to it."* — the first type is always too narrow: it misses the field it never saw (`manualReviewRequired`) and the null branch (`riskScore: number | null`).
   - *"Now read `<schema / fake / typings>` and fix your assumptions."*
   - *"This type is too general / too specific: the fake service was made for a demo — do not hard-code the reasons, keep only the most precise description of the possible response shape."* — no `12 | 88`, no `('velocity_abuse' | …)[]`.
   - *"Now make a fixture generator that is properly configurable."* — `makeRiskShieldResponse({ riskScore: null })` returns the manual-review branch; the factory encodes the invariant, the caller only picks the state.

   Rules from AGENTS.md §6 apply: factory over `structuredClone` of defaults, a few typical fixtures (success / rejected / pending) with overrides, the type is imported from the contract, never redeclared in the fixture file. Skeleton in [reference.md](reference.md).
5. **You: put the fake at the network, not at the client module.** MSW handlers on the service's endpoints (`onUnhandledRequest: 'error'`), on the server and in the browser alike; the fake answers from the factory by input (id → state), so it is a `fake`, not a stub with one hard-coded reply. Never `vi.mock('./riskShieldClient')`, never mock `fetch`/`axios` — that ties the test to how the request is made and lets a request you do not know about slip through (AGENTS.md §5). Every fake-served response passes through the same schema `parse` as production traffic, so a fixture that drifts from the contract fails immediately.
6. **You: validate at the boundary in production code.** `Schema.parse(json)` in the API layer, type inferred from the schema. No soft handling — a missing field must not turn into an empty value and a page that "still works". The fear "better a small thing breaks than the whole page" produces silently broken micro-features that only an E2E would catch, and on that project there was none.
7. **You: build the drift-check job — a separate CI job, not the main run.** The agent will not propose this; require it. The job fetches the current docs / OpenAPI / typings and real responses (same ids, same auth), retries on unavailability, then compares against the committed schema and reports per field. Daily is a reasonable cadence; the comparison may be AI-assisted: *"here are the docs, the OpenAPI schema and the real responses — check that none of this diverges from the contract we have written; propose an update to the contract"*. A red contract job may only fail for two reasons — the service was down (retry) or the contract really diverged (update the schema, then the fixture). It must never make people press "Retry" on the main suite.

   > If you start losing faith in your tests, what are such tests for?

8. **You: check coverage of branches.** Every branch of our code that reads the response is exercised by a fixture variant in some test (the `pending_review` branch that no fixture ever produced has coverage zero — that is the detector). Then `mutation-loop` on the logic that interprets the response.

### B. One contract for two sides built in parallel

1. **Coordinator (human or orchestrating agent): fix the contract before any work starts.** One schema file — literally one `orderResult.schema.ts` with a zod union — is the single source of truth. Two independent readings of the same prose diverge: in a real session the weaker model returned `totalAmount` where the schema said `totalCents`, renamed `orderId`, dropped `reason`; a stronger model happened to converge — luck, not a guarantee. The more precisely the contract is written, the less the model improvises.
2. **Coordinator: give the contract to both implementers as input.** In working mode both sides import the same file. Prompts, constraints verbatim: *"Write only the implementation, no tests."* — *"Do not read files outside the current directory."* — *"Do not try to run the implementation, only write it. Do not write tests."* — *"The contract may be changed only by the parent; if you need a change, report it, do not edit the schema."* Without the run/test prohibition the agent goes looking for infrastructure and climbs out of its directory.
3. **Coordinator: isolate the implementers physically.** Separate directories, `git init` in each, moved out of the repo tree (`/tmp/battle/agent-backend`) if the agent keeps reading upward; nothing of the other side, no README with hints. The agent "tries to get more information than it is entitled to" — a tool log with paths outside cwd is the detector.
4. **You: run the contract check per side, independently, against the schema — never side against side.**
   - Backend: bring up the agent's route with `supertest` on top of the real collaborators (`orderEligibility`), call the canonical scenarios, `parse` the raw JSON with the schema, compare values.
   - Frontend: feed the **official wire JSON** produced from the same schema through the network boundary (an MSW handler for the endpoint; a one-off contract-check script may mock `postOrder` directly — acceptable in that script, not in the test suite, where the boundary stays MSW as in step A5), call `checkoutSubmit`, `parse` the returned object with the same schema.
   - Report per side: pass/fail and, per field, missing / extra / renamed. Skeleton in [reference.md](reference.md).
5. **Coordinator: change the contract only from the top.** A side that "improves" a field name has broken the contract even if its own tests are green. Modern models are paranoid enough to notice a divergence at their final check — do not rely on it. If the coordinator is you and the keyboard, telling the other side is your job; if it is an orchestrator model, it is its job. There is no magic.

## Done when

**(A)**
- Every field of the schema has a named confirming source; no field is required only because it was present in all samples.
- The gap/conflict report exists and every conflict has a human decision recorded.
- The fixture is a factory typed from the contract, contains no literal values copied from samples, and can produce every state in the state list (normal, rejected, manual review, null fields).
- The fake is served by MSW handlers with `onUnhandledRequest: 'error'`; no `vi.mock` of the client module, no `fetch`/`axios` mock (Jest: same rule with MSW's node setup).
- Production code `parse`s responses with the schema at the boundary; no default-on-missing.
- A separate CI job (not the main workflow) compares docs / schema / real responses to the contract on a schedule, with retry, and is documented with its two failure meanings.
- Every code branch reading the response is executed by some fixture variant.

**(B)**
- One schema file, committed before implementation began; both sides import it.
- Contract check passes for each side separately with a per-field report; canonical scenarios yield the expected values.
- No implementer edited the schema; every contract change is a coordinator commit.

## Red flags

- **Contract from one to three samples** — a schema with no `optional`/`nullable` while the OpenAPI has them → add the missing sources, regenerate, demand the gap report.
- **Contract from documentation examples only** — no real responses were fetched → get a token and several ids in different states before trusting the shape.
- **Silent choice between conflicting sources** — the agent picked the docs' field name without saying the samples disagree → require the conflict section; the human decides.
- **Literals from samples in the type or factory** (`riskScore: 12 | 88`, a specific reason string as an enum) → "keep only the most precise description of the possible shape".
- **A second `interface` for the response inside the fixture file** → delete; import the schema-inferred type.
- **`vi.mock('./client')` or a mocked `fetch` standing in for the service** → MSW handlers at the network; `onUnhandledRequest: 'error'`.
- **Soft handling on the frontend** — `response.field ?? ''`, `try/catch` around parsing with an empty fallback → `parse` and fail loudly.
- **Contract check inside the main test job** — a flaky external host reddens the whole pipeline, people press "Retry" and stop believing the suite → separate job with retry.
- **A fake written once, nobody checking it** — no drift job, fixture last touched a year ago; "they lie a little, which is probably even worse" → build the daily comparison job; the agent will not volunteer it.
- **Two sides implemented from prose with no shared schema** in the repo, or the frontend mock of the response not validated by the backend's schema → one schema file, contract check per side.
- **Implementer reading outside its directory, running the code, writing its own tests** → the three prohibitions in the prompt; `git init` in the sandbox; move to `/tmp`.
- **A side edited the schema** → revert; "the contract may be changed only by the parent".
