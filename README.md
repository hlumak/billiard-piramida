# Piramida — Billiard Club Booking

Monorepo for the booking site of a billiard club in Poland: nine billiard tables
(9ft in hall 1, 12ft in hall 2) and two dartboards. Localized in Polish
(default), Ukrainian and English.

## Business rules

- Bookable spots, hourly rates and opening hours are staff-editable (admin →
  settings); the seed starts at 50 zł/h (9ft), 70 zł/h (12ft), 30 zł/h (darts) and
  Mon–Thu 16:00–21:00 · Fri 16:00–23:00 · Sat–Sun 15:00–23:00 (Europe/Warsaw)
- Bookings are 1–8 hours, up to 14 days ahead; a phone number may hold 3 upcoming
  bookings at a time
- Each booking is managed with a secret returned when it is made (kept by the
  browser and in the booking page's link) or by the signed-in account that made it
- Food & drinks can be added at reservation time and to an ongoing session;
  active sessions can be extended (up to closing time), upcoming ones cancelled
- Double-booking is impossible at the database level (Postgres `EXCLUDE` constraint
  on `tstzrange(starts_at, ends_at)` per table)

## Stack

- **API** (`apps/api`): Fastify + TypeBox, Drizzle ORM (1.0 RC) on PostgreSQL 18,
  runs on Node's native type stripping (no build step)
- **Web** (`apps/web`): TanStack Start (SSR) + TanStack Query/Store/Form, HeroUI v3,
  Paraglide JS for i18n (pl default · uk · en; locale = cookie → browser language → pl)
- **Shared** (`packages/shared`): business rules (hours, pricing, venue) and DTO types

Node 26.11.1 (`.node-version`), pnpm 12.10.1 (`packageManager`).

Installing pnpm on a dev machine: pnpm's standalone installer, pinned to the
project's version (without `PNPM_VERSION` it installs the latest):

```sh
# Linux / macOS
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.10.1 sh -
# Windows (PowerShell)
$env:PNPM_VERSION = "12.10.1"; Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
```

Servers need no pnpm: everything builds inside Docker, and the runtime images
contain only Node and the built output.

## Local development

```sh
cp .env.example .env
docker compose up -d          # Postgres on 127.0.0.1:5432
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                      # API :3001 + web :3000 → open http://localhost:3000
```

## Production (containers)

Set at least `POSTGRES_PASSWORD`, `ADMIN_TOKEN` and `JWT_SECRET` (32+ characters:
`openssl rand -hex 32`) and `VITE_SITE_URL` (the public https URL) in `.env`, then:

```sh
docker compose --profile app up -d --build   # postgres, migrations, API, web, nginx
docker compose --profile app run --rm migrate node src/db/seed.ts   # first deploy only
```

nginx listens on `127.0.0.1:8080`; put the TLS-terminating proxy in front of it.
The API and web containers run as an unprivileged user on read-only filesystems;
staff uploads live in the `uploads` volume, the database in `pgdata`. A staging
deploy can set `ROBOTS_DISALLOW_ALL=1`.

## Checks

`pnpm lint` · `pnpm fmt:check` · `pnpm typecheck` · `pnpm test` (the API tests need
the Postgres container) · `pnpm build` — all run in CI (`.github/workflows/ci.yml`).
