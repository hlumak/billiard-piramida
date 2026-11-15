#!/usr/bin/env node
/**
 * Cuts the Polish-only font files (`*-pl.woff2`) out of the latin-ext ones.
 *
 *   node scripts/subset-fonts.mjs
 *
 * Google's latin-ext subset carries several hundred glyphs for every language
 * of central Europe and beyond; the site's own text needs sixteen of them.
 * A Polish page downloaded 68 kB of Montserrat and 46 kB of Great Vibes for
 * those sixteen letters — more than the stylesheet and the hero photo put
 * together. The cut files are 2–5 kB each. The full latin-ext files stay, with
 * the Polish letters taken out of their `unicode-range` (src/fonts.css), so a
 * Czech or Lithuanian name still gets its own glyphs, on demand.
 *
 * The results are committed: run this again only when a latin-ext source file
 * is replaced, and keep POLISH in step with the ranges in src/fonts.css.
 *
 * The subsetter (HarfBuzz compiled to WebAssembly) is a tool for this one job,
 * not something the app or its build needs, so it is not a workspace
 * dependency: the pinned version is fetched into a temporary folder.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SUBSETTER = 'subset-font@2.9.0';

/** Every Polish letter outside basic Latin (ó and Ó are in the latin file) */
const POLISH = 'ĄąĆćĘęŁłŃńŚśŹźŻż';

const FONTS = fileURLToPath(new URL('../apps/web/public/fonts/', import.meta.url));
const FACES = ['montserrat', 'montserrat-alternates-400', 'great-vibes-400'];

const tools = mkdtempSync(join(tmpdir(), 'subset-fonts-'));
try {
  execSync(
    `npm install --prefix ${JSON.stringify(tools)} --no-save --ignore-scripts --no-audit --no-fund ${SUBSETTER}`,
    { stdio: 'inherit' }
  );
  const subsetFont = createRequire(pathToFileURL(join(tools, 'index.js')))('subset-font');

  for (const face of FACES) {
    const source = readFileSync(join(FONTS, `${face}-latin-ext.woff2`));
    // Variation axes are kept as they are: Montserrat stays one file for
    // every weight from 400 to 700
    const subset = await subsetFont(source, POLISH, { targetFormat: 'woff2' });
    writeFileSync(join(FONTS, `${face}-pl.woff2`), subset);
    console.log(`${face}-latin-ext.woff2 ${source.length} B → ${face}-pl.woff2 ${subset.length} B`);
  }
} finally {
  rmSync(tools, { recursive: true, force: true });
}
