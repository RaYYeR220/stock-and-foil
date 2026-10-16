// SPDX-License-Identifier: Apache-2.0
//
// Where the repository is, and where the one credential this console needs comes from.
//
// The Blockfrost project token is read **here, in the Vite dev server**, and never anywhere
// else. It is not injected into the bundle, not put in `define`, not handed to the page and
// not written into any file this repository tracks: the browser talks to `/bf`, the dev server
// attaches the token on the way out, and `redact()` scrubs it from anything that could be
// printed. The only two places it may live are `BLOCKFROST_PROJECT_ID_MAINNET` in the
// operator's environment and an untracked `.env.local` at the repository root (`.env.*` is in
// `.gitignore`).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Environment variable the mainnet indexer token is read from. See `sdk/src/backend/endpoints.ts`. */
export const TOKEN_ENV_VAR = 'BLOCKFROST_PROJECT_ID_MAINNET';

/** Every mainnet project id Blockfrost issues starts with this; a preprod one does not. */
export const TOKEN_PREFIX = 'nightmainnet';

/**
 * The repository root, found by walking up from the working directory.
 *
 * Not derived from `import.meta.url`: Vite bundles its config (and everything this file is
 * imported from) into a temporary module beside `vite.config.ts`, so a path relative to this
 * source file is not where this source file lives.
 */
export function findRepoRoot(from: string = process.cwd()): string {
  let dir = resolve(from);
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string };
        if (parsed.name === 'stock-and-foil') return dir;
      } catch {
        // an unreadable package.json on the way up is not this one
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `could not find the stock-and-foil repository root above ${from}. Start the console with ` +
          '`npm run console` from the repository root.',
      );
    }
    dir = parent;
  }
}

/** `KEY=value` lines of a dotenv file. No interpolation, no export keyword, no multi-line values. */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export interface TokenLookup {
  token?: string;
  /** Where it came from, for the console to show without showing the value. */
  source: 'environment' | '.env.local' | 'absent';
  /** False when a token is present but is not a mainnet one — a preprod id fails with a bare 403. */
  prefixOk: boolean;
}

/**
 * The mainnet Blockfrost token, from the process environment first and `.env.local` second.
 *
 * Returns the value because the proxy needs it; everything that reports on it reports
 * `source` and `prefixOk` instead, never the token.
 */
export function blockfrostMainnetToken(repoRoot: string): TokenLookup {
  const fromEnv = process.env[TOKEN_ENV_VAR]?.trim();
  if (fromEnv) return { token: fromEnv, source: 'environment', prefixOk: fromEnv.startsWith(TOKEN_PREFIX) };

  const dotEnv = join(repoRoot, '.env.local');
  if (existsSync(dotEnv)) {
    const value = parseDotEnv(readFileSync(dotEnv, 'utf8'))[TOKEN_ENV_VAR]?.trim();
    if (value) return { token: value, source: '.env.local', prefixOk: value.startsWith(TOKEN_PREFIX) };
  }
  return { source: 'absent', prefixOk: false };
}

/**
 * Removes the token from anything about to be printed.
 *
 * The dev server's own proxy errors carry the outbound URL, and that URL carries the token,
 * so every log line this plugin emits goes through here first.
 */
export const redact = (text: string, token?: string): string => {
  const withoutQuery = text.replace(/project_id=[^&\s"']+/gi, 'project_id=REDACTED');
  return token ? withoutQuery.split(token).join('REDACTED') : withoutQuery;
};
