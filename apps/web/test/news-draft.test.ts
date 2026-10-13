import { expect, test } from 'vitest';
import { checkNewsDraft, newsDraftFrom, type NewsDraft } from '../src/components/admin/news-draft';

function draft(overrides: Partial<NewsDraft> = {}): NewsDraft {
  return {
    ...newsDraftFrom(null),
    titles: { uk: '', pl: 'Turniej', en: '' },
    ...overrides
  };
}

test('a Polish headline is enough; blank languages and URLs are left out', () => {
  const check = checkNewsDraft(
    draft({ imageUrl: '  ', bodies: { uk: '', pl: ' Zapisy ', en: '' } })
  );
  expect(check).toEqual({
    ok: true,
    input: {
      imageUrl: null,
      linkUrl: null,
      sortOrder: 0,
      translations: [{ locale: 'pl', title: 'Turniej', body: 'Zapisy', content: null }]
    },
    slug: null
  });
});

test('a typed slug is kept for create; a bad URL or missing Polish copy is refused', () => {
  const withSlug = checkNewsDraft(draft({ slug: ' spring-cup ' }));
  expect(withSlug.ok && withSlug.slug).toBe('spring-cup');
  expect(checkNewsDraft(draft({ linkUrl: 'javascript:alert(1)' }))).toEqual({
    ok: false,
    problem: 'invalid_url'
  });
  expect(checkNewsDraft(draft({ titles: { uk: 'Турнір', pl: ' ', en: '' } }))).toEqual({
    ok: false,
    problem: 'incomplete'
  });
  expect(checkNewsDraft(draft({ sortOrder: '-1' }))).toEqual({ ok: false, problem: 'incomplete' });
});
