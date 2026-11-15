#!/usr/bin/env node
/**
 * Cuts the small font files out of Google's big subsets: the Polish letters
 * (`*-pl.woff2`) and the language switcher's Ukrainian label.
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
 * The language switcher shows "УКР" on every page. On a Polish or English
 * page those three letters were the only Cyrillic in sight, and brought the
 * whole 21 kB Cyrillic Montserrat with them. They get a file of their own
 * under a family of its own ('Montserrat UKR'), which only that label asks
 * for: taken out of Montserrat itself, they would be set from another file
 * than their neighbours in every Ukrainian word, and lose their kerning.
 *
 * The results are committed: run this again only when a source file is
 * replaced or the label changes, and keep POLISH and UKR_LABEL in step with
 * the ranges in src/fonts.css.
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

/** LABELS.uk in src/components/LocaleSwitcher.tsx */
const UKR_LABEL = 'УКР';

const FONTS = fileURLToPath(new URL('../apps/web/public/fonts/', import.meta.url));
const CUTS = [
  { from: 'montserrat-latin-ext', to: 'montserrat-pl', text: POLISH },
  { from: 'montserrat-alternates-400-latin-ext', to: 'montserrat-alternates-400-pl', text: POLISH },
  { from: 'great-vibes-400-latin-ext', to: 'great-vibes-400-pl', text: POLISH },
  { from: 'montserrat-cyrillic', to: 'montserrat-ukr-label', text: UKR_LABEL }
];

const tools = mkdtempSync(join(tmpdir(), 'subset-fonts-'));
try {
  execSync(
    `npm install --prefix ${JSON.stringify(tools)} --no-save --ignore-scripts --no-audit --no-fund ${SUBSETTER}`,
    { stdio: 'inherit' }
  );
  const subsetFont = createRequire(pathToFileURL(join(tools, 'index.js')))('subset-font');

  for (const { from, to, text } of CUTS) {
    const source = readFileSync(join(FONTS, `${from}.woff2`));
    // Variation axes are kept as they are: Montserrat stays one file for
    // every weight from 400 to 700
    const subset = await subsetFont(source, text, { targetFormat: 'woff2' });
    writeFileSync(join(FONTS, `${to}.woff2`), subset);
    console.log(`${from}.woff2 ${source.length} B → ${to}.woff2 ${subset.length} B`);
  }
} finally {
  rmSync(tools, { recursive: true, force: true });
}
