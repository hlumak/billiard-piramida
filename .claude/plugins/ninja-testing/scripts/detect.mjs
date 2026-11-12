#!/usr/bin/env node
// ninja-testing — repository autodetect for /ninja-testing:init.
// Deterministic. Prints a JSON facts object; the skill turns facts into decisions (see assembly-rules.md).
// Usage: node detect.mjs [repoRoot]

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.argv[2] ? process.argv[2] : process.cwd();
const facts = { root, packages: [], deps: {}, sides: {}, runner: {}, frontend: {}, backend: {}, e2e: {}, mutation: {}, ci: {}, structure: {}, git: {}, tests: {}, signals: [] };

// ---------- package.json(s) ----------
const rootPkg = readJson(join(root, 'package.json')) || {};
const workspaces = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : rootPkg.workspaces?.packages || [];
const pkgDirs = [root, ...expandWorkspaces(workspaces)];
for (const d of pkgDirs) {
  const pkg = readJson(join(d, 'package.json'));
  if (!pkg) continue;
  facts.packages.push({ dir: rel(d), name: pkg.name, scripts: Object.keys(pkg.scripts || {}) });
  for (const k of ['dependencies', 'devDependencies', 'peerDependencies']) for (const [n, v] of Object.entries(pkg[k] || {})) facts.deps[n] = v;
}
const has = (...names) => names.some((n) => n in facts.deps);
const scripts = Object.assign({}, ...pkgDirs.map((d) => readJson(join(d, 'package.json'))?.scripts || {}));
facts.scripts = scripts;

// ---------- runner / bundler ----------
facts.runner = {
  vitest: has('vitest'), jest: has('jest', 'ts-jest', '@jest/core'), rstest: has('@rstest/core'), mocha: has('mocha'), nodeTest: !has('vitest', 'jest', 'mocha', '@rstest/core') && /node\s+--test/.test(JSON.stringify(scripts)),
  bundler: has('vite') ? 'vite' : has('@rspack/core', '@rsbuild/core') ? 'rspack' : has('webpack') ? 'webpack' : has('esbuild') ? 'esbuild' : has('next') ? 'next' : null,
  configFiles: findFiles(root, /^(vitest|vite|jest|rstest)\.config\.[cm]?[jt]s$|^jest\.config\.json$/, 3),
};
const vitestCfg = facts.runner.configFiles.filter((f) => /vitest|vite/.test(f)).map((f) => safeRead(join(root, f))).join('\n');
facts.runner.jsdom = /environment:\s*['"](jsdom|happy-dom)['"]/.test(vitestCfg) || has('jsdom', 'happy-dom');
facts.runner.browserMode = /browser:\s*\{[^}]*enabled:\s*true/s.test(vitestCfg) || has('@vitest/browser', 'vitest-browser-react', 'vitest-browser-vue', 'vitest-browser-svelte');
facts.runner.coverage = has('@vitest/coverage-v8', '@vitest/coverage-istanbul') || /coverage/.test(JSON.stringify(scripts));
facts.runner.fastCheck = has('fast-check');

// ---------- sides ----------
const fe = {
  react: has('react'), vue: has('vue'), angular: has('@angular/core'), svelte: has('svelte'), solid: has('solid-js'), next: has('next'), nuxt: has('nuxt'),
  store: has('zustand') ? 'zustand' : has('pinia') ? 'pinia' : has('@reduxjs/toolkit', 'redux') ? 'redux' : has('mobx') ? 'mobx' : has('@ngrx/store') ? 'ngrx' : has('jotai') ? 'jotai' : null,
  rtl: has('@testing-library/react', '@testing-library/vue', '@testing-library/svelte', '@testing-library/dom'),
  vueTestUtils: has('@vue/test-utils'), storybook: has('storybook', '@storybook/react', '@storybook/vue3'),
  i18n: has('i18next', 'react-i18next', 'vue-i18n', '@formatjs/intl', 'react-intl'),
};
fe.framework = fe.react ? 'react' : fe.vue ? 'vue' : fe.angular ? 'angular' : fe.svelte ? 'svelte' : fe.solid ? 'solid' : null;
// a bundled client without a framework (plain DOM + Vite) is still a frontend
fe.vanillaClient = !fe.framework && (has('vite') || has('@rsbuild/core')) && findFiles(root, /^index\.html$/, 3).some((f) => /(client|web|frontend|app)\//.test(f) || f === 'index.html');
if (fe.vanillaClient) fe.framework = 'vanilla';
facts.frontend = fe;
const be = {
  express: has('express'), fastify: has('fastify'), nest: has('@nestjs/core'), hono: has('hono'), koa: has('koa'), nextApi: has('next'),
  orm: has('drizzle-orm') ? 'drizzle' : has('@prisma/client', 'prisma') ? 'prisma' : has('knex') ? 'knex' : has('typeorm') ? 'typeorm' : has('sequelize') ? 'sequelize' : has('mongoose') ? 'mongoose' : has('kysely') ? 'kysely' : null,
  db: has('pg', 'postgres', 'drizzle-orm', '@prisma/client') && !has('mongoose') ? 'postgres' : has('mysql2') ? 'mysql' : has('better-sqlite3', 'sqlite3', 'libsql', '@libsql/client') ? 'sqlite' : has('mongoose', 'mongodb') ? 'mongo' : null,
  redis: has('ioredis', 'redis'), testcontainers: has('testcontainers', '@testcontainers/postgresql'), pglite: has('@electric-sql/pglite'), supertest: has('supertest'),
  dockerCompose: findFiles(root, /^(docker-)?compose(\.\w+)?\.ya?ml$/, 2).length > 0,
  di: has('@nestjs/core', '@angular/core', 'inversify', 'tsyringe', 'awilix'),
  effect: has('effect', '@effect/schema'),
};
facts.backend = be;
const hasFrontend = !!fe.framework || fe.rtl || facts.runner.browserMode || fe.vanillaClient;
const hasBackend = be.express || be.fastify || be.nest || be.hono || be.koa || !!be.orm || !!be.db || be.supertest;
facts.sides = { frontend: hasFrontend, backend: hasBackend, fullstack: hasFrontend && hasBackend, confident: hasFrontend !== hasBackend }; // refined after structure detection
if (!hasFrontend && !hasBackend) facts.signals.push('sides:unknown');

// ---------- network / contracts / doubles ----------
facts.doubles = { msw: has('msw'), sinon: has('sinon'), nock: has('nock'), axiosMockAdapter: has('axios-mock-adapter'), axios: has('axios'), zod: has('zod'), effectSchema: has('@effect/schema', 'effect'), openapi: findFiles(root, /openapi|swagger/i, 3).length > 0 };

// ---------- e2e ----------
facts.e2e = { playwright: has('@playwright/test'), cypress: has('cypress'), dir: ['e2e', 'tests/e2e', 'playwright', 'cypress'].find((d) => existsSync(join(root, d))) || null, config: findFiles(root, /^playwright\.config\.[cm]?[jt]s$|^cypress\.config\./, 2) };

// ---------- mutation ----------
facts.mutation = { stryker: has('@stryker-mutator/core'), config: findFiles(root, /^stryker(\.[\w-]+)?\.(config|conf)\.(json|[cm]?[jt]s)$/, 3), script: Object.entries(scripts).find(([, v]) => /stryker/.test(v))?.[0] || null };

// ---------- CI ----------
facts.ci = { github: findFiles(join(root, '.github', 'workflows'), /\.ya?ml$/, 1).some((f) => /^\s*jobs\s*:/m.test(safeRead(join(root, f)))), gitlab: /^\s*\w[\w-]*\s*:\s*$/m.test(safeRead(join(root, '.gitlab-ci.yml'))) && /script\s*:/.test(safeRead(join(root, '.gitlab-ci.yml'))), circle: existsSync(join(root, '.circleci')), other: findFiles(root, /^(bitbucket-pipelines\.yml|azure-pipelines\.yml|Jenkinsfile)$/, 1).length > 0, preCommit: existsSync(join(root, '.husky')) || has('husky', 'lefthook', 'simple-git-hooks') };
facts.ci.any = facts.ci.github || facts.ci.gitlab || facts.ci.circle || facts.ci.other;

// ---------- structure ----------
const topDirs = safeList(root).filter((d) => !d.startsWith('.') && d !== 'node_modules' && isDir(join(root, d)));
facts.structure = {
  monorepo: workspaces.length > 0 || existsSync(join(root, 'pnpm-workspace.yaml')) || existsSync(join(root, 'turbo.json')) || existsSync(join(root, 'nx.json')),
  topDirs, srcDirs: findDirs(root, /^(src|packages|apps|libs|server|client|backend|frontend|web|api)$/, 2),
  fsdLike: findDirs(root, /^(features|entities|widgets|pages|shared|processes)$/, 4).length >= 3,
  modulesLike: findDirs(root, /^(modules|domains|slices)$/, 4).length > 0,
  testsBeside: findFiles(root, /\.(test|spec)\.[cm]?[jt]sx?$/, 6).some((f) => !/__tests__|\/tests?\//.test(f)),
  testsDir: findDirs(root, /^(tests?|__tests__)$/, 4).length > 0,
  typescript: has('typescript') || existsSync(join(root, 'tsconfig.json')),
};

if (facts.sides.fullstack) {
  const dirs = facts.structure.srcDirs.join(' ');
  facts.sides.confident = facts.packages.length > 1 || (/(client|frontend|web|apps\/\w*(web|client))/.test(dirs) && /(server|api|backend)/.test(dirs));
}

// ---------- tests present ----------
const testFiles = findFiles(root, /\.(test|spec)\.[cm]?[jt]sx?$/, 7);
facts.tests = { count: testFiles.length, sample: testFiles.slice(0, 15), integrationHints: testFiles.filter((f) => /integration|\.int\./i.test(f)).length, characterization: testFiles.filter((f) => /characteri[sz]ation|pinning/i.test(f)).length };
facts.tests.uses = {
  testId: grepCount(testFiles, /getByTestId|data-testid/), querySelector: grepCount(testFiles, /querySelector|\.closest\(/), snapshots: grepCount(testFiles, /toMatchSnapshot|toMatchInlineSnapshot/), fetchMock: grepCount(testFiles, /(global|globalThis|window)\.fetch\s*=|vi\.stubGlobal\(['"]fetch/), objectFixtures: grepCount(testFiles, /export\s+const\s+\w*(Fixture|Mock|Data)\s*=\s*\{/), toHaveBeenCalled: grepCount(testFiles, /toHaveBeenCalled/), mswUse: grepCount(testFiles, /setupServer|setupWorker|http\.(get|post)\(/),
};

// ---------- git ----------
try {
  facts.git.available = true;
  facts.git.commitsLastYear = Number(execSync('git rev-list --count --since="12 months ago" HEAD', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  const churn = execSync('git log --since="12 months ago" --name-only --pretty=format: -- . ":(exclude)*.test.*" ":(exclude)*.spec.*" ":(exclude)**/__tests__/**"', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n').map((s) => s.trim()).filter((s) => /\.[cm]?[jt]sx?$/.test(s) && !/\.(test|spec)\./.test(s) && !/\.config\.|\.d\.ts$|^(vite|vitest|jest|playwright|stryker|eslint|prettier)|^(demo-bugs|battle|scripts|docs|e2e)\//.test(s));
  const counts = {};
  for (const f of churn) counts[f] = (counts[f] || 0) + 1;
  facts.git.hotFiles = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([file, changes]) => ({ file, changes, hasTest: testFiles.some((t) => t.includes(basenameNoExt(file))) }));
  facts.git.hotUntested = facts.git.hotFiles.filter((h) => !h.hasTest).slice(0, 10);
} catch { facts.git.available = false; }

// ---------- signals for the interview ----------
if (facts.runner.jest && facts.runner.bundler && facts.runner.bundler !== 'webpack') facts.signals.push('runner:jest-with-bundler');
if (facts.runner.jsdom && hasFrontend) facts.signals.push('frontend:jsdom');
if (fe.rtl && !facts.runner.browserMode) facts.signals.push('frontend:rtl-no-browser-mode');
if (hasBackend && be.db && !be.testcontainers && !be.pglite) facts.signals.push('backend:db-without-test-db');
if (hasBackend && be.redis) facts.signals.push('backend:cache-shared-resource');
if (facts.doubles.axios && !facts.doubles.msw && !facts.doubles.axiosMockAdapter) facts.signals.push('network:axios-no-msw');
if (!facts.doubles.msw && (hasFrontend || has('node-fetch', 'undici', 'got', 'ky'))) facts.signals.push('network:no-msw');
if (!facts.mutation.stryker) facts.signals.push('mutation:no-stryker');
if (!facts.ci.any) facts.signals.push('ci:none');
if (facts.tests.count === 0) facts.signals.push('tests:none');
if (facts.tests.count > 0 && facts.git.hotUntested?.length && (facts.git.commitsLastYear || 0) >= 10) facts.signals.push('tests:hot-untested-files');
if (facts.tests.uses.snapshots) facts.signals.push('tests:snapshots-present');
if (facts.tests.uses.testId || facts.tests.uses.querySelector) facts.signals.push('tests:testid-or-css-locators');
if (facts.tests.uses.fetchMock) facts.signals.push('tests:fetch-mocked');
if (facts.tests.uses.objectFixtures) facts.signals.push('tests:object-fixtures');
if (!facts.structure.fsdLike && !facts.structure.modulesLike && hasBackend) facts.signals.push('structure:slices-not-explicit');
if (be.di) facts.signals.push('doubles:di-framework');
if (be.effect) facts.signals.push('doubles:effect');

process.stdout.write(JSON.stringify(facts, null, 2) + '\n');

// ---------- helpers ----------
function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }
function safeRead(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }
function safeList(p) { try { return readdirSync(p); } catch { return []; } }
function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
function rel(p) { return relative(root, p) || '.'; }
function basenameNoExt(f) { return f.split('/').pop().replace(/\.[cm]?[jt]sx?$/, ''); }
function expandWorkspaces(globs) {
  const out = [];
  for (const g of globs) {
    const base = g.replace(/\/?\*+.*$/, '');
    const dir = join(root, base);
    if (!isDir(dir)) continue;
    if (g.includes('*')) for (const d of safeList(dir)) { if (isDir(join(dir, d)) && existsSync(join(dir, d, 'package.json'))) out.push(join(dir, d)); }
    else out.push(dir);
  }
  return out;
}
function walk(dir, depth, onEntry, d = 0) {
  if (d > depth) return;
  for (const name of safeList(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'build' || name === 'coverage' || name === '.next') continue;
    const p = join(dir, name);
    const isD = isDir(p);
    onEntry(p, name, isD);
    if (isD) walk(p, depth, onEntry, d + 1);
  }
}
function findFiles(base, re, depth) { const out = []; walk(base, depth, (p, name, isD) => { if (!isD && re.test(name)) out.push(rel(p)); }); return out; }
function findDirs(base, re, depth) { const out = []; walk(base, depth, (p, name, isD) => { if (isD && re.test(name)) out.push(rel(p)); }); return out; }
function grepCount(files, re) { let n = 0; for (const f of files) if (re.test(safeRead(join(root, f)))) n++; return n; }
