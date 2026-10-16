// SPDX-License-Identifier: Apache-2.0
//
// The pages a reviewer reads rather than drives: the landing page has to name who benefits, run
// the cross-registry check for real and say what that check cannot do, the changelog has to
// separate what shipped from what did not, and nothing anywhere may claim mainnet.
//
// Every test here stubs the Midnight preview indexer. The panel really does read two deployed
// contracts in production — that is the point of it — but a test that depends on a public
// testnet being up is a test that fails for reasons that have nothing to do with this code. The
// fixture is the real state of both registries, captured once and trimmed to the state data the
// panel actually decodes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Route } from '@playwright/test';

const INDEXER = '**/indexer.preview.midnight.network/**';

const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/preview-registries.json', import.meta.url)), 'utf8'),
) as { block: { height: number; timestamp: number }; states: Record<string, string> };

const REGISTRY_A = '74fe0bf972edc0c6c1edcec7fd41dfa09c52b1920511a29c416b3245918a0fad';
const REGISTRY_B = '2d8f8f23b311b9596354b92c4ac01805a8921cc9bd54daa950e49877890cccbd';
/** Pledged in A; offered in B afterwards, which is the finding the panel owns up to. */
const MARKER_PLEDGED = 'f563d3877ef55c73c2c2f23e36260d4b552218890b9b86a66c0f1dd5f1b069ca';
/** Never offered, never pledged, anywhere. */
const MARKER_FREE = 'bfc2fda848f76b7069dff5d73f378c75a4b727c879b1ffdaa8f0f162bf1ab044';

/** Answers the two queries the panel makes, from the captured fixture. */
async function serveFixture(route: Route): Promise<void> {
  const query = String((route.request().postDataJSON() as { query?: string } | null)?.query ?? '');
  if (query.includes('block {')) {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { block: FIXTURE.block } }) });
    return;
  }
  const address = Object.keys(FIXTURE.states).find((candidate) => query.includes(candidate));
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data: { contractAction: address ? { state: FIXTURE.states[address] } : null } }),
  });
}

const stubIndexer = (page: Page) => page.route(INDEXER, serveFixture);

/** Brings the live panel into view, which is what triggers its first read. */
async function openCheck(page: Page) {
  const panel = page.getByTestId('fed-check');
  await panel.scrollIntoViewIfNeeded();
  return panel;
}

const verdictOf = (page: Page, peer: 'a' | 'b') =>
  page.locator(`[data-testid="fed-row"][data-peer="${peer}"] [data-testid="fed-verdict"]`);

test.beforeEach(async ({ page }) => {
  await stubIndexer(page);
});

test('the landing page names who benefits, above the fold and below it', async ({ page }) => {
  await page.goto('/');

  // The claim stays exactly as it is.
  await expect(page.getByRole('heading', { level: 1, name: 'Every invoice can be pledged once.' })).toBeVisible();

  // The hero says who it is for before it says what it does, and names the seats.
  const lede = page.locator('.lede').first();
  await expect(lede).toContainText('For the people who lend money against unpaid invoices.');
  await expect(page.locator('.lede-who')).toContainText('Credit officers');

  const who = page.locator('#who');
  await expect(who.getByRole('heading', { name: 'Who stands to benefit.' })).toBeVisible();
  await expect(who.locator('.who-card')).toHaveCount(4);
  for (const name of ['The credit officer', 'The CFO', 'The accounts-payable team', 'The insolvency practitioner']) {
    await expect(who.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  // Every seat says what it gets and what it stops sending.
  await expect(who.getByText('What they get')).toHaveCount(4);
  await expect(who.getByText('What they stop sending')).toHaveCount(4);
});

test('the cold-start objection is answered on the page, and the gap it leaves is admitted', async ({ page }) => {
  await page.goto('/');
  const fed = page.locator('#federation');
  await expect(fed.getByRole('heading', { name: 'It does not need a consortium.' })).toBeVisible();

  // Three independent registries, one lender, one marker.
  const svg = fed.locator('.fed-svg');
  await expect(svg).toBeVisible();
  for (const label of ['Registry A', 'Registry B', 'Registry C']) await expect(svg).toContainText(label);
  await expect(svg).toContainText('One lender. One marker.');

  // And the thing a single ledger cannot do is stated, with the transaction that shows it.
  const own = fed.locator('.fed-own');
  await expect(own).toContainText('Harbour accepted a receivable that was already pledged in Stock & Foil.');
  await expect(own).toContainText('one ledger cannot see another');
  await expect(own.getByRole('link', { name: /block 1322275/ })).toHaveAttribute(
    'href',
    /preview\.midnightexplorer\.com\/transactions\//,
  );
  await expect(own).toContainText('ALREADY_ENCUMBERED');
});

test('the federation panel reads both registries and prints one bit', async ({ page }) => {
  await page.goto('/');
  const panel = await openCheck(page);

  // Both deployed registries are named, with their addresses linked to the explorer.
  await expect(panel).toContainText('Stock & Foil');
  await expect(panel).toContainText('Harbour');
  for (const address of [REGISTRY_A, REGISTRY_B]) {
    await expect(panel.locator(`a[href$="${address}"]`)).toBeVisible();
  }

  // The receivable pledged in A is encumbered, and B says so too because it took the offer later.
  await expect(verdictOf(page, 'a')).toHaveText('ENCUMBERED');
  await expect(verdictOf(page, 'b')).toHaveText('ENCUMBERED');
  await expect(page.getByTestId('fed-bit-word')).toHaveText('ENCUMBERED');
  await expect(page.getByTestId('fed-bit')).toContainText('not for how much');
  await expect(panel).toContainText('2 of 2 registries answered');
  // Each registry reports the peer it declared on chain, read from its own state.
  await expect(panel.getByText('declares the other a peer')).toHaveCount(2);

  // The control receivable is free in both, which is the other half of the claim.
  await panel.getByRole('button', { name: 'Invoice #772002' }).click();
  await expect(verdictOf(page, 'a')).toHaveText('FREE');
  await expect(verdictOf(page, 'b')).toHaveText('FREE');
  await expect(page.getByTestId('fed-bit-word')).toHaveText('FREE');

  // A pasted marker is checked, not trusted: 64 hex characters or nothing is read.
  await panel.getByRole('textbox').fill('not-a-marker');
  await panel.getByRole('button', { name: /Read both registries/ }).click();
  await expect(panel).toContainText('A pledge marker is 64 hexadecimal characters');
  await expect(page.getByTestId('fed-bit-word')).toHaveText('FREE');

  // A well-formed marker nobody has pledged is read, and comes back free.
  await panel.getByRole('textbox').fill(`0x${'ab'.repeat(32)}`);
  await panel.getByRole('button', { name: /Read both registries/ }).click();
  await expect(page.getByTestId('fed-bit-word')).toHaveText('FREE');
  await expect(verdictOf(page, 'a')).toHaveText('FREE');
});

test('an indexer that does not answer produces no verdict at all', async ({ page }) => {
  await page.unroute(INDEXER);
  await page.route(INDEXER, (route) => route.abort('failed'));

  await page.goto('/');
  await openCheck(page);

  await expect(verdictOf(page, 'a')).toHaveText('NO ANSWER');
  await expect(verdictOf(page, 'b')).toHaveText('NO ANSWER');
  const bit = page.getByTestId('fed-bit');
  await expect(page.getByTestId('fed-bit-word')).toHaveText('NO ANSWER');
  await expect(bit).toContainText('An unread registry is not a free one');
  // Nothing anywhere in the panel reports an encumbrance it could not have read.
  await expect(page.getByTestId('fed-check')).toContainText('0 of 2 registries answered');
  await expect(page.locator('[data-testid="fed-row"][data-verdict="free"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="fed-row"][data-verdict="encumbered"]')).toHaveCount(0);
});

test('a slow indexer says it is reading, and never guesses', async ({ page }) => {
  await page.unroute(INDEXER);
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(INDEXER, async (route) => {
    await held;
    await serveFixture(route);
  });

  await page.goto('/');
  const panel = await openCheck(page);

  // While the reads are in flight the panel says so, and prints no verdict.
  await expect(panel.locator('.fed-answers')).toHaveAttribute('aria-busy', 'true');
  await expect(verdictOf(page, 'a')).toHaveText('asking…');
  await expect(page.getByTestId('fed-bit-word')).toHaveText('…');

  release?.();
  await expect(verdictOf(page, 'a')).toHaveText('ENCUMBERED');
  await expect(panel.locator('.fed-answers')).toHaveAttribute('aria-busy', 'false');
});

test('the sponsorship section links the transaction a wallet with no DUST made', async ({ page }) => {
  await page.goto('/');
  const section = page.locator('#sponsorship');
  await expect(section.getByRole('heading', { name: 'Nobody has to buy a token first.' })).toBeVisible();
  await expect(section).toContainText('0 SPECK');
  await expect(section.getByRole('link', { name: /^0xa46d2c3a01/ })).toHaveAttribute(
    'href',
    'https://preview.midnightexplorer.com/transactions/a46d2c3a01b49d1ebca0ef7c9bb65d0f3c5927623cfedad116550daeffd06e07',
  );
  // No sponsor endpoint ships with the public build, and the page says that rather than implying one.
  await expect(section).toContainText('No sponsor endpoint is hosted with this site');
});

test('the changelog separates what shipped from what did not, and quotes the review', async ({ page }) => {
  await page.goto('/whats-new');
  await expect(page.getByRole('heading', { level: 1, name: 'What changed in Wave 2.' })).toBeVisible();

  const shipped = page.locator('.change[data-status="shipped"]');
  const open = page.locator('.change[data-status="in-flight"]');
  expect(await shipped.count()).toBeGreaterThan(2);
  expect(await open.count()).toBeGreaterThan(0);

  // Three items answer a Wave 1 note, quoted.
  expect(await page.locator('.judge').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.judge').first()).toContainText('who stands to benefit');

  // The four things that landed this wave are listed as shipped, not as intentions.
  for (const title of [
    'Fee sponsorship, so a first-time user needs no DUST',
    'Peer registration, batch acceptance and case-scoped disclosure',
    'A second registry, run by somebody else',
    'The cross-registry check, running in the visitor’s browser',
  ]) {
    await expect(shipped.filter({ hasText: title })).toHaveCount(1);
  }
  // Mainnet is the one thing still outstanding, and it stays outstanding until it is not.
  await expect(open).toHaveCount(1);
  await expect(open).toContainText('The registry on Midnight mainnet');

  // Unshipped work says so, and is not linked to as though it existed.
  await expect(page.getByRole('heading', { name: 'Declared, and not shipped.' })).toBeVisible();
  await expect(open.first()).toContainText('Not shipped yet');

  // Every shipped item links to the thing itself.
  for (let i = 0; i < (await shipped.count()); i += 1) {
    await expect(shipped.nth(i).locator('.change-links a')).not.toHaveCount(0);
  }
});

test('the proof page reports both registries, their peers and the sponsored transaction', async ({ page }) => {
  await page.goto('/proof');

  await expect(page.getByRole('heading', { name: /Registry A — Stock & Foil, on preview/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Registry B — Harbour, on preview/ })).toBeVisible();
  await expect(page.getByText('Peers declared on chain')).toHaveCount(2);

  const federation = page.locator('section').filter({ hasText: 'Two registries, and the question a lender puts to both' });
  await expect(federation.getByText('Keyed identically by both')).toBeVisible();
  await expect(federation).toContainText(MARKER_PLEDGED);
  await expect(federation).toContainText(MARKER_FREE);
  await expect(federation).toContainText('Encumbered somewhere.');
  await expect(federation).toContainText('Free everywhere asked.');
  // The acceptance that a single ledger could not refuse is in the record, not hidden.
  await expect(federation).toContainText('ACCEPTED, and that is the finding');

  const sponsored = page.locator('section').filter({ hasText: 'A party holding zero DUST transacted anyway' });
  await expect(sponsored.getByText('Its DUST before')).toBeVisible();
  await expect(sponsored).toContainText('0 SPECK');
  await expect(sponsored.getByRole('link', { name: /^0xa46d2c3a01/ })).toBeVisible();

  // And the limit that goes with it is stated where the limits are stated.
  await expect(page.locator('.seelist')).toContainText('One registry cannot see another.');
});

test('nothing on the site claims mainnet', async ({ page }) => {
  await page.goto('/proof');
  const body = await page.locator('body').innerText();
  await expect(page.getByText('Nothing is deployed to Midnight mainnet.')).toBeVisible();
  // The gate that was removed on 2026-09-28 is no longer given as the reason.
  expect(body).not.toMatch(/mainnet deployment goes through the Foundation/i);
  expect(body).not.toMatch(/gated by the Foundation/i);
  // Every mention of mainnet on this page is a denial, never a claim.
  for (const line of body.split(/\r?\n/).filter((l) => /mainnet/i.test(l))) {
    expect(line, `unqualified mainnet mention: ${line}`).toMatch(/\b(no|not|nothing|never)\b/i);
  }
});

test('the pages a reviewer reads do not scroll sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/whats-new', '/proof']) {
    await page.goto(route);
    if (route === '/') await openCheck(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});
