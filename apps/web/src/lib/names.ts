/**
 * A booking is made in the guest's full name: first and last, so the desk can
 * match it to the person at the counter. Two words of at least two letters
 * each, in any script; hyphens and apostrophes inside a word are fine
 * ("Anna-Maria", "O'Neil", "Мар'яна").
 */
const WORD = /^\p{L}[\p{L}\p{M}'’-]*[\p{L}\p{M}]$/u;

export function isFullName(value: string): boolean {
  // Composed first: a pasted "й" can arrive as "и" plus a combining breve
  const words = value.normalize('NFC').trim().split(/\s+/);
  return words.length >= 2 && words.every(word => WORD.test(word));
}
