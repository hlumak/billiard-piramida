---
paths:
{{BACKEND_PATHS}}
---
# Backend integration tests (real database)

Applies when testing services, routes and repositories on the server side. AGENTS.md §7 is the contract.

## The database is part of the contract

- Integration tests for a slice that owns data run against a **real** database: {{DB_SETUP}}. A mocked repository that always returns success is a unit test with a fake database, not an integration test.
- Constraints, unique indexes, transactions and recounts are behaviour. Assert them: duplicate write → rejected; two linked writes → both or neither; recount happens with the write.
- Checking state with a direct query in the test is a deliberate strategy, not a compromise. Extract a small query helper (`soldCount(db, tierId)`) in the DB layer when it repeats. No test-only backdoors in production code (the single accepted exception is a test auth path behind `NODE_ENV === 'test'`).

## Isolation

- Strategy in this repo: {{ISOLATION_STRATEGY}}.
- Every test starts from a known state and never relies on rows left by another test, file or run. Tests pass in random order and in parallel.
- After loading a reusable seed, one `expect` on its state ("trust the fixture") is the only tolerated deviation from Arrange-Act-Assert.
- Cache in front of the DB (Redis etc.) is a shared resource too — isolate it or run the affected files sequentially.

## Failure paths are mandatory

For every write operation the file must contain at least one storage failure scenario: repeated write (uniqueness), concurrent requests, consistency of linked operations. One line in the prompt — "include the error flow" — is what separates a real integration test from a happy-path demo.

## Concurrency

- Models have no sense of time. When the slice has a limit, a balance, a lock or a `SELECT … FOR UPDATE`, write a concurrent test: seed to "one resource left", fire N calls with `Promise.all` on {{COMMITTED_DB}}, assert the outcome by counting (`exactly one rejected with reason sold_out`), then check the final counter directly in the DB. Order of completion is not deterministic — never assert "the first one fails".
- Validate the test with a toggled bug (remove the transaction) — it must go red.

## External services

Anything the team does not own is faked **at the network level** (MSW `setupServer`), never by mocking the client module. The fake is built from the contract (see `external-contract` skill), returns all known branches (`null` fields, manual review, rejection) and is verified by a separate contract job — not in the main run.

## Plumbing

Authorization and everything that runs before the business logic is stubbed in slice tests (`user with all permissions`, `can → true`) unless the test is about permissions.
