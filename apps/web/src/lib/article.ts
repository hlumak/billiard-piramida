import { isSafeUrl } from '@repo/shared';

/**
 * The light markup staff write news articles in. Deliberately tiny — a
 * receptionist should be able to learn it from the one-line hint under the
 * field — and hand-parsed so the site takes on no markdown dependency:
 *
 *   blank line            paragraph break
 *   ## Heading            subheading
 *   - item                bullet list (consecutive lines)
 *   ![caption](url)       picture on a line of its own (a bare image URL works too)
 *   **bold**  [text](url) inline emphasis and links
 *
 * Everything else is text. Nothing here is ever interpreted as HTML: the
 * renderer emits React elements from these blocks, and every URL passes
 * `isSafeUrl` or is shown as plain text instead.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'link'; text: string; href: string };

/** `line` is the 1-based source line the block starts on: its identity for React keys. */
export type Block = { line: number } & (
  | { type: 'heading'; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; items: Inline[][] }
  | { type: 'image'; src: string; caption: string }
);

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const BARE_IMAGE_URL = /^(?:\/|https?:\/\/)\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?$/i;
const HEADING_LINE = /^#{1,3}\s+(.+)$/;
const LIST_LINE = /^[-*]\s+(.+)$/;
const INLINE = /\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function parseInlines(text: string): Inline[] {
  const inlines: Inline[] = [];
  // Adjacent text runs (e.g. a rejected link followed by plain words) merge
  const pushText = (value: string) => {
    const last = inlines.at(-1);
    if (last?.type === 'text') last.text += value;
    else inlines.push({ type: 'text', text: value });
  };
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index;
    if (start > cursor) pushText(text.slice(cursor, start));
    const [whole, strong, linkText, href] = match;
    if (strong !== undefined) {
      inlines.push({ type: 'strong', text: strong });
    } else if (linkText !== undefined && href !== undefined && isSafeUrl(href)) {
      inlines.push({ type: 'link', text: linkText, href });
    } else {
      // A link to javascript:/data: shows its source, harmlessly, as text
      pushText(whole);
    }
    cursor = start + whole.length;
  }
  if (cursor < text.length) pushText(text.slice(cursor));
  return inlines;
}

function imageOf(line: string, lineNumber: number): Block | null {
  const explicit = IMAGE_LINE.exec(line);
  const src = explicit ? explicit[2] : BARE_IMAGE_URL.test(line) ? line : undefined;
  if (src === undefined || !isSafeUrl(src)) return null;
  return { type: 'image', src, caption: explicit?.[1]?.trim() ?? '', line: lineNumber };
}

export function parseArticle(source: string): Block[] {
  const blocks: Block[] = [];
  // The paragraph or list being collected, and the source line it began on
  let text: string[] = [];
  let textLine = 0;
  let list: Inline[][] = [];
  let listLine = 0;

  const flush = () => {
    if (list.length > 0) {
      blocks.push({ type: 'list', items: list, line: listLine });
      list = [];
    }
    if (text.length > 0) {
      blocks.push({ type: 'paragraph', inlines: parseInlines(text.join('\n')), line: textLine });
      text = [];
    }
  };

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  for (const [index, raw] of lines.entries()) {
    const lineNumber = index + 1;
    const line = raw.trim();
    if (line === '') {
      flush();
      continue;
    }
    const image = imageOf(line, lineNumber);
    if (image) {
      flush();
      blocks.push(image);
      continue;
    }
    const heading = HEADING_LINE.exec(line);
    if (heading?.[1] !== undefined) {
      flush();
      blocks.push({ type: 'heading', inlines: parseInlines(heading[1]), line: lineNumber });
      continue;
    }
    const item = LIST_LINE.exec(line);
    if (item?.[1] !== undefined) {
      // A list interrupts a paragraph, but list items stay together
      if (text.length > 0) flush();
      if (list.length === 0) listLine = lineNumber;
      list.push(parseInlines(item[1]));
      continue;
    }
    if (list.length > 0) flush();
    if (text.length === 0) textLine = lineNumber;
    text.push(line);
  }
  flush();
  return blocks;
}
