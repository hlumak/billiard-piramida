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

Node 26.12.1 (`.node-version` pins the major, v26), pnpm 12.14.0 (`packageManager`).

Installing pnpm on a dev machine: pnpm's standalone installer, pinned to the
project's version (without `PNPM_VERSION` it installs the latest):

```sh
# Linux / macOS
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.14.0 sh -
# Windows (PowerShell)
$env:PNPM_VERSION = "12.14.0"; Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
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

On a small server, pull the images CI publishes for each commit on `main`
instead of building them there. Set in `.env`:

```sh
API_IMAGE=ghcr.io/hlumak/piramida-api:main
WEB_IMAGE=ghcr.io/hlumak/piramida-web:main
```

and deploy a commit of `main` once CI has published its images:

```sh
scripts/deploy.sh <full commit sha>
```

It checks out that commit, pulls the images tagged with its sha, dumps the
database to `/root/backups` if migrations changed (keeping the last 10 such
dumps), migrates, brings the stack up, restarts nginx and checks
`/health/ready` and the home page. If the new version is not healthy, it puts
the previous commit back and fails. A commit older than the live one is
skipped. Logs: `/var/log/piramida-deploy/`.

nginx restarts on every deploy: `nginx/default.conf` is mounted as a single
file, so a version the checkout just replaced is not the one the running
container sees, and nginx resolved the `api` and `web` containers' addresses
once, when it started, not when they were recreated.

`docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}'`
names the commit an image was built from.

### Automatic deploys

`.github/workflows/deploy.yaml` runs the script for every commit on `main` whose
CI passed. A commit message containing `[skip deploy]` is left out (for a
migration better run at night, say); deploy it later with "Run workflow" on the
Deploy page, which takes a full sha or defaults to the latest `main`.

The workflow connects with a key that may run only the script. On the server, in
`/root/.ssh/authorized_keys`:

```
restrict,command="/root/billiard-piramida/scripts/deploy.sh" ssh-ed25519 AAAA… github-actions-deploy
```

`restrict` turns off the shell, port forwarding and the rest; the forced command
receives what the client asked to run as `SSH_ORIGINAL_COMMAND` and accepts only
a full sha of a commit on `main`. The GitHub environment `production` holds three
secrets: `DEPLOY_HOST` (the server's address), `DEPLOY_KNOWN_HOSTS` (its line
`<address> ssh-ed25519 …`) and `DEPLOY_SSH_KEY` (the private key). The address
stays out of this repository because Cloudflare hides the origin. To replace
the key, swap the public half on the server and the secret.

nginx listens on `127.0.0.1:8080`; put the TLS-terminating proxy in front of it.
The API and web containers run as an unprivileged user on read-only filesystems;
staff uploads live in the `uploads` volume, the database in `pgdata`. A staging
deploy can set `ROBOTS_DISALLOW_ALL=1`.

## Checks

`pnpm lint` · `pnpm fmt:check` · `pnpm typecheck` · `pnpm test` (the API tests need
the Postgres container) · `pnpm build` — all run in CI (`.github/workflows/ci.yaml`).

## Search Console report

`pnpm gsc` prints clicks, queries, pages, near-page-one queries and the index status of
every sitemap URL for `sc-domain:billiard-piramida.pl` (read-only). It signs in as a
service account that was added to the property as a Restricted user; point
`GSC_KEY_FILE` at its JSON key, which stays outside the repo. Options: `--days 90`,
`--out <dir>` (saves the raw answers), `--no-inspect`.
