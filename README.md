# Piramida — Billiard Club Booking

Monorepo for a table-booking web app for a 5-table billiard club in Poland.
Localized in Ukrainian (default), Polish, and English.

## Business rules

- 5 tables, 40 zł/hour, minimum booking 1 hour
- Opening hours (Europe/Warsaw): Mon–Thu 16:00–21:00 · Fri 16:00–23:00 · Sat–Sun 15:00–23:00
- Food & drinks can be added at reservation time and to an ongoing session
- Active sessions can be extended (up to closing time), upcoming bookings can be cancelled
- Double-booking is impossible at the database level (Postgres `EXCLUDE` constraint on
  `tstzrange(starts_at, ends_at)` per table)

## Stack

- **API** (`apps/api`): Fastify + TypeBox, Drizzle ORM (1.0 RC) on PostgreSQL, runs on
  Node's native type stripping (no build step). Nginx reverse-proxies it on :8080.
- **Web** (`apps/web`): TanStack Start (SSR) + TanStack Query/Store/Form, HeroUI v3,
  Paraglide JS for i18n (uk default · pl · en; locale = cookie → browser language → uk).
- **Shared** (`packages/shared`): business rules (operating hours, pricing) and DTO types
  used by both sides.

## Run

```sh
cp .env.example .env
docker compose up -d        # postgres :5432 + nginx :8080
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                    # api :3001 + web :3000
```

## Production

```sh
pnpm build   # builds the web app (the API runs TS natively, no build step)
pnpm start   # api :3001 + web :3000 (srvx serving dist/ with SSR), both behind nginx :8080
```

`pnpm start:api` / `pnpm start:web` run them individually. Set real values for
`JWT_SECRET`, `ADMIN_TOKEN`, `ALLOWED_ORIGINS`, `VITE_SITE_URL` (build-time) and the
domain in `public/robots.txt` / `sitemap.xml` before deploying.

Checks: `pnpm typecheck` · `pnpm test` · `pnpm lint` · `pnpm fmt:check`
