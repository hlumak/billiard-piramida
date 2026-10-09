/**
 * Whether an editor's draft differs from what it was opened with. Drafts are
 * small plain objects built the same way on both sides, so the serialized
 * forms compare reliably.
 */
export function isDraftChanged<T>(draft: T, saved: T): boolean {
  return JSON.stringify(draft) !== JSON.stringify(saved);
}
