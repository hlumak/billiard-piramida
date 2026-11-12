---
paths:
{{FRONTEND_PATHS}}
---
# Component and frontend integration tests ({{FRONTEND_FRAMEWORK}})

AGENTS.md §7 is the contract. This file is the browser-side detail.

## Environment

- Component tests run in a **real browser**: {{BROWSER_MODE}}. jsdom/happy-dom do not apply external CSS, so `toBeVisible()` lies there. jsdom is acceptable only when the whole browser run exceeds ~15 s and a human has agreed to the trade-off.
- Locale is fixed in the setup file; tests are written for one locale.
- Time in the browser cannot be faked freely: assert monotonic change, not exact values; never wait real seconds.

## Locators — as the user finds things

1. Visible text / label / placeholder (`getByText`, `getByLabelText`)
2. ARIA role (`getByRole('button', { name: 'Start trip' })`)
3. `data-testid` — last resort, and only after trying to fix the markup (add a role/label). `querySelector`, `closest`, CSS classes — never.

The argument "text changes" is dead: updating a string in a test costs nothing now. Visibility is `toBeVisible()`, never a CSS class check.

## What is real, what is substituted

- Real: the component tree under test, **the real store**, selectors, routing inside the slice.
- Substituted: the network (MSW `setupWorker` in the browser, `setupServer` in node; `onUnhandledRequest: 'error'`), browser APIs the test does not own (geolocation, clipboard), and self-sufficient child components from *other* slices (mock the module, assert the props they received).
- Mocking a store method or a selector is a red flag — read the test three times. Bring the store to the needed state through real calls (load via fake network, dispatch actions). Preset state directly (`store.getState().setX()`) only for deep components where the ceremony is unreasonable, and you are responsible for that state being reachable.
- `setProps`/`rerender` with new props in the middle of an integration test: find who changes those props in reality and include it, or make it a separate test.
- Dumb components (props only) are unit-tested through props; do not mock requests or dispatch above them.
- Third-party widgets you cannot query semantically: one shared helper file per project (`selectDate(...)`), no ad-hoc `querySelector` in tests.

## Naming levels

Component + its own store = unit. Several components through a shared store = integration. Rendering components is never E2E — E2E opens a page.

## Where the logic lives

Business logic does not live in components or hooks. If you need `renderHook` to test something, move that logic into a store or a pure function and test it there; test the component as a whole for the visible behaviour. The frontend is full of business logic (validation, pricing display, eligibility) — test it as seriously as the server.

## Mutation testing

Stryker cannot instrument browser-mode tests. Keep the logic in pure modules that have their own unit tests and are mutated there; browser tests verify wiring and visible behaviour.
