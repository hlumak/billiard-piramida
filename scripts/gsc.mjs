#!/usr/bin/env node
/**
 * Read-only Google Search Console report for billiard-piramida.pl.
 *
 *   GSC_KEY_FILE=~/.secrets/<key>.json pnpm gsc [--days 28] [--out <dir>] [--no-inspect]
 *
 * Authenticates as a service account that was added to the Search Console
 * property as a (Restricted) user, so the key never needs a browser sign-in.
 * The key stays outside the repo; nothing here writes to Search Console.
 *
 * Prints totals, devices, top queries and pages, "striking distance" queries
 * (average position 8–20, the quickest ranking wins) and the index status of
 * every URL in the live sitemap. `--out` also saves the raw API answers.
 *
 * No dependencies: the service-account JWT is signed with node:crypto.
 */
import { sign } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const SITE = process.env.GSC_SITE ?? 'sc-domain:billiard-piramida.pl';
const ORIGIN = 'https://billiard-piramida.pl';
const WEBMASTERS = 'https://www.googleapis.com/webmasters/v3';
const INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

const { values: args } = parseArgs({
  options: {
    days: { type: 'string', default: '28' },
    out: { type: 'string' },
    'no-inspect': { type: 'boolean', default: false }
  }
});

const keyFile = process.env.GSC_KEY_FILE;
if (!keyFile) {
  console.error('Set GSC_KEY_FILE to the service-account JSON key (kept outside the repo).');
  process.exit(1);
}
const key = JSON.parse(
  readFileSync(
    keyFile.replace(/^~(?=[/\\])/, process.env.HOME ?? process.env.USERPROFILE ?? '~'),
    'utf8'
  )
);

const base64url = value =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: key.token_uri,
    iat: now,
    exp: now + 3600
  })}`;
  const signature = sign('RSA-SHA256', Buffer.from(unsigned), key.private_key).toString(
    'base64url'
  );
  const response = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`
    })
  });
  const body = await response.json();
  if (!body.access_token)
    throw new Error(`Token request failed: ${body.error_description ?? body.error}`);
  return body.access_token;
}

const token = await accessToken();

async function api(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json();
  if (!response.ok)
    throw new Error(`${method} ${url}: ${response.status} ${json.error?.message ?? ''}`);
  return json;
}

const raw = {};
const site = encodeURIComponent(SITE);
const isoDay = date => date.toISOString().slice(0, 10);
// Search data lags 2–3 days; 'all' includes the fresh, not yet final days
const endDate = isoDay(new Date(Date.now() - 86_400_000));
const startDate = isoDay(new Date(Date.now() - Number(args.days) * 86_400_000));

const searchAnalytics = async dimensions => {
  const result = await api('POST', `${WEBMASTERS}/sites/${site}/searchAnalytics/query`, {
    startDate,
    endDate,
    dimensions,
    rowLimit: 5000,
    dataState: 'all'
  });
  raw[`search-${dimensions.join('-')}`] = result;
  return result.rows ?? [];
};

const short = url => url.replace(ORIGIN, '') || '/';
const pct = value => `${(value * 100).toFixed(1)}%`;
const table = (rows, label) =>
  console.table(
    rows.map(row => ({
      [label]: short(row.keys.at(-1)),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: pct(row.ctr),
      position: Number(row.position.toFixed(1))
    }))
  );

console.log(`Search Console ${SITE}, ${startDate} → ${endDate}\n`);

const days = await searchAnalytics(['date']);
const clicks = days.reduce((sum, row) => sum + row.clicks, 0);
const impressions = days.reduce((sum, row) => sum + row.impressions, 0);
console.log(
  `Clicks ${clicks}, impressions ${impressions}, CTR ${pct(impressions ? clicks / impressions : 0)}, ${days.length} days with data`
);

const devices = await searchAnalytics(['device']);
console.log(
  `Devices: ${devices.map(row => `${row.keys[0].toLowerCase()} ${row.clicks}/${row.impressions}`).join(', ')}\n`
);

const queries = await searchAnalytics(['query']);
console.log('Top queries by impressions');
table(queries.toSorted((a, b) => b.impressions - a.impressions).slice(0, 25), 'query');

console.log('Striking distance (position 8–20, 2+ impressions)');
table(
  queries.filter(row => row.position >= 8 && row.position <= 20 && row.impressions >= 2),
  'query'
);

console.log('Pages');
table(await searchAnalytics(['page']), 'page');
await searchAnalytics(['query', 'page']);

const sitemaps = await api('GET', `${WEBMASTERS}/sites/${site}/sitemaps`);
raw.sitemaps = sitemaps;
for (const entry of sitemaps.sitemap ?? []) {
  // `indexed` in this answer is a deprecated field that always reads 0
  const submitted = entry.contents?.map(content => content.submitted).join('+');
  console.log(
    `Sitemap ${entry.path}: ${submitted} URLs, last read ${entry.lastDownloaded?.slice(0, 10)}, ${entry.errors} errors, ${entry.warnings} warnings`
  );
}

if (!args['no-inspect']) {
  // URL Inspection quota is 2000 a day per property; the sitemap is far smaller
  const sitemapXml = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
  const urls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  const inspections = [];
  for (const url of urls) {
    const result = await api('POST', INSPECT, {
      inspectionUrl: url,
      siteUrl: SITE,
      languageCode: 'en'
    });
    inspections.push({ url, ...result });
  }
  raw.inspections = inspections;
  console.log('\nIndex status of sitemap URLs');
  console.table(
    inspections.map(({ url, inspectionResult }) => {
      const status = inspectionResult?.indexStatusResult ?? {};
      return {
        url: short(url),
        verdict: status.verdict,
        coverage: status.coverageState,
        canonical:
          status.googleCanonical === undefined
            ? ''
            : status.googleCanonical === url
              ? 'self'
              : short(status.googleCanonical),
        crawled: status.lastCrawlTime?.slice(0, 10) ?? '',
        rich:
          inspectionResult?.richResultsResult?.detectedItems
            ?.map(item => item.richResultType)
            .join(', ') ?? ''
      };
    })
  );
}

if (args.out) {
  mkdirSync(args.out, { recursive: true });
  for (const [name, data] of Object.entries(raw)) {
    writeFileSync(join(args.out, `${name}.json`), `${JSON.stringify(data, null, 1)}\n`);
  }
  console.log(`\nRaw answers saved to ${args.out}`);
}
