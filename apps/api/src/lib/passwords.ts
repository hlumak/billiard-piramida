import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEY_LENGTH = 64;

interface Cost {
  N: number;
  r: number;
  p: number;
}

/**
 * OWASP's scrypt guidance lists equivalent cost settings; N=2^15, r=8, p=3
 * is one of them and needs 32 MiB per hash instead of the 128 MiB that
 * N=2^17, p=1 would — kinder to a small VPS during a burst of logins.
 * Node's default (N=2^14, p=1, what the old `salt:hex` hashes used) is below it.
 */
const CURRENT: Cost = { N: 2 ** 15, r: 8, p: 3 };
const LEGACY: Cost = { N: 2 ** 14, r: 8, p: 1 };

function scryptAsync(password: string, salt: string, cost: Cost): Promise<Buffer> {
  const options: ScryptOptions = { ...cost, maxmem: 256 * cost.N * cost.r + 1024 * 1024 };
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Format: `scrypt$N$r$p$salt$hexkey` — the cost travels with the hash, so it can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, CURRENT);
  const { N, r, p } = CURRENT;
  return `scrypt$${N}$${r}$${p}$${salt}$${key.toString('hex')}`;
}

function parse(stored: string): { cost: Cost; salt: string; keyHex: string } | null {
  const parts = stored.split('$');
  if (parts.length === 6 && parts[0] === 'scrypt') {
    const [, n, r, p, salt, keyHex] = parts;
    const cost = { N: Number(n), r: Number(r), p: Number(p) };
    if (!salt || !keyHex || !Object.values(cost).every(Number.isSafeInteger)) return null;
    return { cost, salt, keyHex };
  }
  // Hashes written before the cost was recorded: `salt:hexkey` at Node's defaults
  const [salt, keyHex] = stored.split(':');
  return salt && keyHex ? { cost: LEGACY, salt, keyHex } : null;
}

export interface PasswordCheck {
  valid: boolean;
  /** True when the stored hash uses a weaker cost than today's: re-hash it now. */
  needsRehash: boolean;
}

export async function verifyPassword(password: string, stored: string): Promise<PasswordCheck> {
  const parsed = parse(stored);
  if (!parsed) return { valid: false, needsRehash: false };
  const key = await scryptAsync(password, parsed.salt, parsed.cost);
  const expected = Buffer.from(parsed.keyHex, 'hex');
  const valid = key.length === expected.length && timingSafeEqual(key, expected);
  const { N, r, p } = parsed.cost;
  const outdated = N !== CURRENT.N || r !== CURRENT.r || p !== CURRENT.p;
  return { valid, needsRehash: valid && outdated };
}
