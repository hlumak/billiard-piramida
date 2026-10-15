import { renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import { useSubmitOnce } from '../src/lib/use-submit-once';

test('a second submit is refused until the first is released', () => {
  const { result } = renderHook(() => useSubmitOnce());
  expect(result.current.claim()).toBe(true);
  expect(result.current.claim()).toBe(false);
  result.current.release();
  expect(result.current.claim()).toBe(true);
});

test('the claim survives a re-render, as the form re-renders while it sends', () => {
  const { result, rerender } = renderHook(() => useSubmitOnce());
  expect(result.current.claim()).toBe(true);
  rerender();
  expect(result.current.claim()).toBe(false);
});
