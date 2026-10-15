/**
 * Cloudflare Turnstile: the bot check in front of the forms anyone can send
 * without an account (booking, sign-up, tournament seat). The browser solves
 * the widget and sends its token in a header; only this server ever talks to
 * Siteverify, with the secret, and the token counts only when Cloudflare says
 * it was solved for the same action on one of our hostnames.
 *
 * Cloudflare documents tokens as single-use, but its Siteverify answered
 * success to the same token again and again (checked live on 2026-10-16), so
 * the one-use rule is enforced here: SpentTokens below.
 */

import { createHash } from 'node:crypto';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** The header the web client puts the widget's token in. */
export const TURNSTILE_HEADER = 'x-turnstile-token';

/** Cloudflare documents tokens of up to 2048 characters; anything longer is junk. */
const MAX_TOKEN_LENGTH = 2048;

/** Siteverify answers in well under a second; a form must not hang on it. */
const SITEVERIFY_TIMEOUT_MS = 5_000;

/** One check per form, so a token minted for one cannot be spent on another. */
export type TurnstileAction = 'booking' | 'register' | 'tournament';

export interface TurnstileOptions {
  secret: string;
  /** Hostnames a token may come from; null accepts any (local dev). */
  hostnames: string[] | null;
  /**
   * Cloudflare's published test secrets answer without an action or hostname,
   * flagged `result_with_testing_key`. Accepted only outside production, so a
   * dev setup with test keys can exercise the whole flow.
   */
  acceptTestingKeys: boolean;
  /** Injected by the tests; the global fetch otherwise. */
  fetch?: typeof fetch | undefined;
}

interface SiteverifyResponse {
  success?: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
  metadata?: { result_with_testing_key?: boolean };
}

export type TurnstileVerdict = { ok: true } | { ok: false; reason: string };

export async function verifyTurnstile(
  options: TurnstileOptions,
  token: string | undefined,
  action: TurnstileAction,
  remoteIp: string
): Promise<TurnstileVerdict> {
  if (token === undefined || token === '') return { ok: false, reason: 'missing_token' };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'token_too_long' };

  let result: SiteverifyResponse;
  try {
    const response = await (options.fetch ?? fetch)(SITEVERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret: options.secret, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS)
    });
    result = (await response.json()) as SiteverifyResponse;
  } catch {
    // Fail closed: an unverifiable token is not a verified one
    return { ok: false, reason: 'siteverify_unreachable' };
  }

  if (result.success !== true) {
    return { ok: false, reason: result['error-codes']?.join(',') || 'not_successful' };
  }
  if (result.metadata?.result_with_testing_key === true) {
    return options.acceptTestingKeys ? { ok: true } : { ok: false, reason: 'testing_key' };
  }
  if (result.action !== action) return { ok: false, reason: 'action_mismatch' };
  if (
    options.hostnames !== null &&
    (result.hostname === undefined || !options.hostnames.includes(result.hostname))
  ) {
    return { ok: false, reason: 'hostname_mismatch' };
  }
  return { ok: true };
}

/** A token stays valid for five minutes after it is solved. */
const TOKEN_LIFETIME_MS = 5 * 60_000;

/**
 * Tokens already presented, kept (as hashes) for as long as they could still
 * pass Siteverify. A token is claimed before it is verified, so two requests
 * racing with one token cannot both get through, and a token that failed
 * stays spent too. In memory: one API process, and a restart only forgets
 * tokens that expire within five minutes anyway.
 */
export class SpentTokens {
  private readonly expiresAt = new Map<string, number>();

  /** True the first time a token is seen, false on every later attempt. */
  claim(token: string, now = Date.now()): boolean {
    for (const [hash, expiry] of this.expiresAt) {
      // Insertion order is expiry order, so the first live entry ends the sweep
      if (expiry > now) break;
      this.expiresAt.delete(hash);
    }
    const hash = createHash('sha256').update(token).digest('base64url');
    if (this.expiresAt.has(hash)) return false;
    this.expiresAt.set(hash, now + TOKEN_LIFETIME_MS);
    return true;
  }
}

/** Cloudflare's dummy secrets (always pass / always fail / already spent). */
export function isTestingSecret(secret: string): boolean {
  return /^[123]x0{30,}AA$/.test(secret);
}
