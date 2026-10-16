// SPDX-License-Identifier: Apache-2.0
//
// The pages a reviewer reads rather than drives: the landing page has to name who benefits and
// answer the cold-start objection, the changelog has to separate what shipped from what did not,
// and nothing anywhere may claim mainnet, a sponsorship or a federation read that does not exist.
import { expect, test } from '@playwright/test';

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

test('the cold-start objection is answered on the page, without faking a live check', async ({ page }) => {
  await page.goto('/');
  const fed = page.locator('#federation');
  await expect(fed.getByRole('heading', { name: 'It does not need a consortium.' })).toBeVisible();

  // Three independent registries, one lender, one marker.
  const svg = fed.locator('.fed-svg');
  await expect(svg).toBeVisible();
  for (const label of ['Registry A', 'Registry B', 'Registry C']) await expect(svg).toContainText(label);
  await expect(svg).toContainText('One lender. One marker.');

  // And it says plainly that nothing has been read from anybody else's registry.
  await expect(fed.locator('.fed-seam')).toContainText('Not wired up in this build');
  await expect(fed.locator('.fed-seam')).toContainText('Nothing above is a result');
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

  // Unshipped work says so, and is not linked to as though it existed.
  await expect(page.getByRole('heading', { name: 'Declared, and not shipped.' })).toBeVisible();
  await expect(open.first()).toContainText('Not shipped yet');

  // Every shipped item links to the thing itself.
  for (let i = 0; i < (await shipped.count()); i += 1) {
    await expect(shipped.nth(i).locator('.change-links a')).not.toHaveCount(0);
  }
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
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});
