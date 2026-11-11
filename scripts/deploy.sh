#!/usr/bin/env bash
# Puts one commit of main live on this server: the images CI published for it
# (tagged with its sha), plus its compose file and nginx config.
#
# The Deploy workflow calls it over SSH with a key that can run nothing else
# (README, "Automatic deploys"). By hand, on the server:
#   scripts/deploy.sh <full commit sha>
#
# A commit older than the live one is skipped. If migrations changed, the
# database is dumped to /root/backups first. If the new version does not come up
# healthy, the previous commit's images go back up and the script fails.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")/.."

LOG_DIR=/var/log/piramida-deploy
BACKUP_DIR=/root/backups

compose() { docker compose --profile app "$@"; }
say() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
die() {
  say "FAILED: $*"
  exit 1
}

env_value() { sed -n "s/^$1=//p" .env | tail -n 1; }

# The image names from .env without their tag (normally :main)
image_bases() {
  API_BASE=$(env_value API_IMAGE)
  WEB_BASE=$(env_value WEB_IMAGE)
  [[ $API_BASE == *:* && $WEB_BASE == *:* ]] ||
    die "set API_IMAGE and WEB_IMAGE in .env to the images CI publishes"
  API_BASE=${API_BASE%:*}
  WEB_BASE=${WEB_BASE%:*}
}

# Overrides .env for this run only: compose prefers the environment
use_images() { export API_IMAGE="$API_BASE:$1" WEB_IMAGE="$WEB_BASE:$1"; }

healthy() {
  local host=$1 i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fs -o /dev/null -H "Host: $host" http://127.0.0.1:8080/health/ready &&
      curl -fs -o /dev/null -H "Host: $host" http://127.0.0.1:8080/; then
      return 0
    fi
    sleep 3
  done
  return 1
}

# Keeps the last 10 of these dumps; the ones made by hand are left alone
backup() {
  local file
  file="$BACKUP_DIR/piramida-deploy-$(date -u +%Y%m%dT%H%M%SZ)-$1.dump"
  mkdir -p "$BACKUP_DIR"
  # shellcheck disable=SC2016 # expanded inside the container
  if ! compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' >"$file"; then
    rm -f "$file"
    return 1
  fi
  chmod 600 "$file"
  say "database saved to $file"
  find "$BACKUP_DIR" -maxdepth 1 -name 'piramida-deploy-*.dump' -printf '%T@ %p\n' |
    sort -rn | tail -n +11 | cut -d' ' -f2- | xargs -r rm --
}

run() {
  local sha=$1 old host
  exec 9>/run/lock/piramida-deploy.lock
  flock -w 900 9 || die "another deploy has held the lock for 15 minutes"

  image_bases
  host=$(env_value VITE_SITE_URL)
  host=${host#*://}
  host=${host%%/*}

  git fetch -q origin main
  git merge-base --is-ancestor "$sha" origin/main 2>/dev/null ||
    die "${sha:0:7} is not a commit on main"
  old=$(git rev-parse HEAD)
  if [[ $sha != "$old" ]] && git merge-base --is-ancestor "$sha" "$old"; then
    say "${old:0:7} is live and newer than ${sha:0:7}; nothing to do"
    return 0
  fi
  git diff --quiet HEAD -- ||
    die "the checkout on the server has local changes; commit or discard them first"

  say "deploying ${sha:0:7} (live: ${old:0:7})"
  git reset -q --hard "$sha"
  use_images "$sha"
  # Only our images (migrate carries the api image). Pulling postgres and nginx
  # too would fetch Docker Hub's rebuilds of the same tags and restart the
  # database on an ordinary deploy; a new tag in compose is still pulled by `up`.
  if ! compose pull -q migrate web; then
    git reset -q --hard "$old"
    die "could not pull the images for ${sha:0:7}; nothing changed"
  fi

  if ! git diff --quiet "$old" "$sha" -- apps/api/drizzle && ! backup "${sha:0:7}"; then
    git reset -q --hard "$old"
    die "could not back up the database before migrating; nothing changed"
  fi
  if ! compose run --rm migrate; then
    git reset -q --hard "$old"
    die "migrations failed; ${old:0:7} is still live"
  fi

  # nginx resolved the api/web addresses when it started, and the conf is a
  # single-file mount, so it restarts on every deploy (about a second of 502s)
  if compose up -d --wait && compose restart nginx && healthy "$host"; then
    docker image prune -f >/dev/null
    say "live: ${sha:0:7}"
    return 0
  fi

  say "${sha:0:7} did not come up healthy; putting ${old:0:7} back"
  git reset -q --hard "$old"
  use_images "$old"
  if compose pull -q migrate web && compose up -d --wait && compose restart nginx && healthy "$host"; then
    die "rolled back to ${old:0:7}"
  fi
  die "the rollback did not come up healthy either; the server needs a look by hand"
}

# The deploy runs in its own session, so a dropped connection or a cancelled
# job cannot stop it halfway; this side only streams its log back.
start() {
  local sha=$1 log pid
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || die "expected a full commit sha, got '${sha:0:80}'"
  mkdir -p "$LOG_DIR"
  find "$LOG_DIR" -name '*.log' -mtime +60 -delete
  log="$LOG_DIR/$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:7}.log"
  setsid "$0" --run "$sha" >"$log" 2>&1 </dev/null &
  pid=$!
  tail -n +1 -f --pid="$pid" "$log"
  wait "$pid"
}

main() {
  if [[ ${1:-} == --run ]]; then
    run "$2"
  else
    # Over SSH the forced command gets the sha as the client's command
    start "${1:-${SSH_ORIGINAL_COMMAND:-}}"
  fi
}

# Parsed whole before it runs: the deploy replaces this file mid-way
main "$@"
exit
