// SPDX-License-Identifier: Apache-2.0
//
// Prints docs/deck/index.html to docs/deck/stock-and-foil-deck.pdf, one 1920x1080
// page per slide. Run from the repository root:
//
//   node docs/deck/build-pdf.mjs
//
// Pass --shots to also write a PNG of every slide into docs/deck/.shots/ — that
// directory is scratch, for looking at the typography, and is not committed.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const page_url = 'file:///' + join(here, 'index.html').replace(/\\/g, '/');
const shots = process.argv.includes('--shots');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(page_url, { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 });
await page.waitForTimeout(400);

const count = await page.evaluate(() => document.querySelectorAll('.slide').length);

// A slide that overflows its sheet collides with the footer, so report it rather than print it.
const overflow = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.slide').forEach((slide, i) => {
    const sheet = slide.querySelector('.sheet');
    if (!sheet) return;
    const box = sheet.getBoundingClientRect();
    const bottom = Math.max(...[...sheet.querySelectorAll('*')].map((el) => el.getBoundingClientRect().bottom));
    if (bottom - box.bottom > 2) out.push(`slide ${i + 1}: content runs ${Math.round(bottom - box.bottom)}px past the sheet`);
  });
  return out;
});
if (overflow.length) console.warn(overflow.join('\n'));

if (shots) {
  const dir = join(here, '.shots');
  mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= count; i++) {
    await page.evaluate((n) => { location.hash = '#' + n; }, i);
    await page.waitForTimeout(160);
    await page.screenshot({ path: join(dir, `slide-${String(i).padStart(2, '0')}.png`), clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  }
  console.log(`wrote ${count} slide screenshots to ${dir}`);
}

const pdf = join(here, 'stock-and-foil-deck.pdf');
await page.pdf({
  path: pdf,
  width: '1920px',
  height: '1080px',
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  preferCSSPageSize: false,
});
await browser.close();
console.log(`wrote ${pdf} (${count} slides)`);
