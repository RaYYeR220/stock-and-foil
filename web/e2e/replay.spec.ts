// SPDX-License-Identifier: Apache-2.0
//
// The guided replay, end to end, against the real compiled circuits in a real browser. The three
// First Brands frauds must be refused with the contract's own codes, the proceeds must reach the
// financier rather than the supplier, and the sealed record must open and verify itself.
import { expect, test, type Page } from '@playwright/test';

/** Steps that must be refused, in order, with the code the contract emits. */
const REFUSALS: Record<string, string> = {
  'Fraud 1 — a forged invoice': 'NOT_ACKNOWLEDGED',
  'Fraud 2 — the same invoice, ten times the value': 'NOT_ACKNOWLEDGED',
  'Fraud 3 — the same receivable, a second lender': 'ALREADY_ENCUMBERED',
  'Fraud 4 — the supplier reaches for the proceeds': 'NOT_PAYEE',
  'An overstated borrowing base': 'BELOW_FLOOR',
};

async function runCurrentStep(page: Page): Promise<{ title: string; outcome: string; code?: string }> {
  const card = page.getByTestId('step-card');
  const title = (await card.locator('h2').first().innerText()).trim();
  await page.getByTestId('run-step').click();
  await expect(page.getByTestId('next-step')).toBeVisible();
  const outcome = (await card.getAttribute('data-outcome')) ?? 'pending';
  const codeLocator = page.getByTestId('refusal-code');
  const code = (await codeLocator.count()) > 0 ? (await codeLocator.innerText()).trim() : undefined;
  return { title, outcome, code };
}

test('the guided replay refuses the three frauds and opens a verified disclosure', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/app/replay');
  await expect(page.getByRole('heading', { name: 'The First Brands replay.' })).toBeVisible();
  // The contract constructor runs in the tab before anything can be replayed.
  await expect(page.getByTestId('run-step')).toBeEnabled({ timeout: 60_000 });

  const stepCount = await page.locator('.stepnav button').count();
  expect(stepCount).toBeGreaterThanOrEqual(17);

  const seen: Array<{ title: string; outcome: string; code?: string }> = [];
  for (let i = 0; i < stepCount; i += 1) {
    const result = await runCurrentStep(page);
    seen.push(result);
    expect(result.outcome, `step "${result.title}" failed to run`).not.toBe('error');
    if (REFUSALS[result.title]) {
      expect(result.outcome, `step "${result.title}" should have been refused`).toBe('refused');
      expect(result.code).toBe(REFUSALS[result.title]);
    } else {
      expect(result.outcome, `step "${result.title}" should have been accepted`).toBe('ok');
    }
    if (i < stepCount - 1) await page.getByTestId('next-step').click();
  }

  // Every refusal the replay claims to demonstrate actually fired.
  for (const [title, code] of Object.entries(REFUSALS)) {
    const step = seen.find((s) => s.title === title);
    expect(step, `missing step "${title}"`).toBeDefined();
    expect(step?.code).toBe(code);
  }

  // The last step opened the sealed record and it proved itself against the ledger.
  const facts = page.getByTestId('facts');
  await expect(facts).toContainText('Disclosure verified');
  await expect(facts).toContainText('Record id recomputes');
  await expect(facts.locator('dd').filter({ hasText: /^yes$/ }).first()).toBeVisible();
  await expect(facts).toContainText('$2,300.00');

  await expect(page.locator('.progress')).toContainText(`${stepCount} of ${stepCount} run`);

  // The replay admitted each party exactly once: step one starts from the contract as deployed.
  await page.getByRole('link', { name: 'Public ledger', exact: true }).click();
  await expect(page.locator('.counts div').nth(0)).toContainText('1Debtors');
  await expect(page.locator('.counts div').nth(1)).toContainText('2Financiers');
  await expect(page.locator('.counts div').nth(2)).toContainText('3Acknowledgments');

  expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
});

test('resetting the replay puts the registry back to an empty ledger', async ({ page }) => {
  await page.goto('/app/replay');
  await expect(page.getByTestId('run-step')).toBeEnabled({ timeout: 60_000 });

  await page.getByTestId('run-step').click();
  await expect(page.getByTestId('next-step')).toBeVisible();
  await page.getByTestId('next-step').click();
  await page.getByTestId('run-step').click();
  await expect(page.getByTestId('next-step')).toBeVisible();

  await page.getByTestId('reset').click();
  await expect(page.locator('.progress')).toContainText('0 of');
  await expect(page.getByTestId('run-step')).toBeEnabled();

  // An empty registry says so and offers the replay, rather than showing a row of zeros.
  await page.getByRole('link', { name: 'Public ledger', exact: true }).click();
  await expect(page.getByTestId('first-run')).toBeVisible();
  await expect(page.getByTestId('counts')).toHaveCount(0);

  // Membership went with it: the reset returns the contract to the state it deployed in.
  await page.getByRole('link', { name: 'Workspaces', exact: true }).click();
  await expect(page.locator('.work .kv').last()).toContainText('Debtors admitted0');
});

test('the world survives a reload, and a page opened by its URL', async ({ page }) => {
  await page.goto('/app/replay');
  await expect(page.getByTestId('run-step')).toBeEnabled({ timeout: 60_000 });
  // admit → acknowledge → offer → accept
  for (let i = 0; i < 4; i += 1) {
    await page.getByTestId('run-step').click();
    await expect(page.getByTestId('next-step')).toBeVisible();
    if (i < 3) await page.getByTestId('next-step').click();
  }

  // A deep link, not an in-app navigation: this loads a new document, so the registry is rebuilt
  // from what the tab stored rather than carried over in memory.
  await page.goto('/app/ledger');
  await expect(page.getByTestId('counts')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.counts div').nth(3)).toContainText('1Pledge markers');
  await expect(page.locator('.rec').first()).toContainText('PLEDGED');
  const marker = (await page.locator('.rec .id').first().innerText()).trim();

  await page.reload();
  await expect(page.locator('.rec').first()).toContainText('PLEDGED', { timeout: 60_000 });
  // The same marker, not merely a marker: the keys behind the world came back with the ledger.
  await expect(page.locator('.rec .id').first()).toHaveText(marker);
  await expect(page.getByTestId('first-run')).toHaveCount(0);

  // And resetting clears what was stored, so a reload cannot bring it back.
  await page.getByRole('button', { name: 'Reset registry' }).click();
  await expect(page.getByTestId('first-run')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('first-run')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.rec')).toHaveCount(0);
});

test('an empty ledger offers the replay, and the link runs it', async ({ page }) => {
  await page.goto('/app/ledger');
  const invitation = page.getByTestId('first-run');
  await expect(invitation).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('counts')).toHaveCount(0);
  await expect(invitation).toContainText('no acknowledgment, no pledge marker, no sealed record');

  await invitation.getByRole('link', { name: 'Run the guided replay' }).click();
  await expect(page.getByRole('heading', { name: 'The First Brands replay.' })).toBeVisible();
  // Arriving from that link runs the replay: nothing else is clicked here.
  await expect(page.getByTestId('step-card')).toHaveAttribute('data-outcome', 'ok', { timeout: 60_000 });
});

test('the public explorer shows what the chain holds after a pledge', async ({ page }) => {
  await page.goto('/app/replay');
  await expect(page.getByTestId('run-step')).toBeEnabled({ timeout: 60_000 });
  // admit → acknowledge → offer → accept
  for (let i = 0; i < 4; i += 1) {
    await page.getByTestId('run-step').click();
    await expect(page.getByTestId('next-step')).toBeVisible();
    if (i < 3) await page.getByTestId('next-step').click();
  }

  await page.getByRole('link', { name: 'Public ledger', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pledge markers.' })).toBeVisible();
  await expect(page.locator('.rec').first()).toContainText('PLEDGED');
  await expect(page.locator('.rec').first()).toContainText('Available to finance');
  await expect(page.getByText('A second offer against this marker cannot be proved').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What cannot be derived from any of this' })).toBeVisible();
});
