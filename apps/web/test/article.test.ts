import { describe, expect, test } from 'vitest';
import { parseArticle, parseInlines } from '../src/lib/article';

describe('parseArticle', () => {
  test('blank lines split paragraphs; single newlines stay inside one', () => {
    expect(parseArticle('First line\nsecond line\n\nNext paragraph')).toEqual([
      { type: 'paragraph', inlines: [{ type: 'text', text: 'First line\nsecond line' }], line: 1 },
      { type: 'paragraph', inlines: [{ type: 'text', text: 'Next paragraph' }], line: 4 }
    ]);
  });

  test('headings, lists and pictures each stand on their own', () => {
    expect(
      parseArticle(
        '## What changed\n- Tables 6–9 online\n- Own entrance\n![Second hall](/api/uploads/abc.webp)\nhttps://cdn.example/photo.jpg\nClosing words'
      )
    ).toEqual([
      { type: 'heading', inlines: [{ type: 'text', text: 'What changed' }], line: 1 },
      {
        type: 'list',
        items: [
          [{ type: 'text', text: 'Tables 6–9 online' }],
          [{ type: 'text', text: 'Own entrance' }]
        ],
        // A list is identified by the line its first item is on
        line: 2
      },
      { type: 'image', src: '/api/uploads/abc.webp', caption: 'Second hall', line: 4 },
      { type: 'image', src: 'https://cdn.example/photo.jpg', caption: '', line: 5 },
      { type: 'paragraph', inlines: [{ type: 'text', text: 'Closing words' }], line: 6 }
    ]);
  });

  test('windows line endings and stray whitespace are tolerated', () => {
    expect(parseArticle('  Hello \r\n\r\n  ## Title  \r\n')).toEqual([
      { type: 'paragraph', inlines: [{ type: 'text', text: 'Hello' }], line: 1 },
      { type: 'heading', inlines: [{ type: 'text', text: 'Title' }], line: 3 }
    ]);
  });

  test('a picture with an unsafe URL is shown as text, never rendered', () => {
    expect(parseArticle('![x](javascript:alert(1))')).toEqual([
      { type: 'paragraph', inlines: [{ type: 'text', text: '![x](javascript:alert(1))' }], line: 1 }
    ]);
  });
});

describe('parseInlines', () => {
  test('bold and links, with everything else as text', () => {
    expect(parseInlines('Book a **table** on the [booking page](/book) today')).toEqual([
      { type: 'text', text: 'Book a ' },
      { type: 'strong', text: 'table' },
      { type: 'text', text: ' on the ' },
      { type: 'link', text: 'booking page', href: '/book' },
      { type: 'text', text: ' today' }
    ]);
  });

  test('links to unsafe schemes degrade to their source text', () => {
    expect(parseInlines('[click](javascript:alert(1)) and [ok](https://example.com)')).toEqual([
      { type: 'text', text: '[click](javascript:alert(1)) and ' },
      { type: 'link', text: 'ok', href: 'https://example.com' }
    ]);
  });
});
