import { Fragment } from 'react';
import { Link } from '@tanstack/react-router';
import { isExternalUrl } from '@repo/shared';
import { resolveAssetUrl } from '../lib/api';
import { parseArticle, type Inline } from '../lib/article';

/**
 * Inline runs have no ids, but they do have a place: their character offset
 * within the parent text is unique (no run is empty) and stays put across
 * renders of the same source, which is all a key needs.
 */
function Inlines({ inlines }: { inlines: Inline[] }) {
  let offset = 0;
  return inlines.map(inline => {
    const key = offset;
    offset += inline.text.length;
    switch (inline.type) {
      case 'strong':
        return (
          <strong key={key} className="font-semibold text-creme">
            {inline.text}
          </strong>
        );
      case 'link':
        return isExternalUrl(inline.href) ? (
          <a
            key={key}
            href={inline.href}
            target="_blank"
            rel="noreferrer"
            className="text-golden underline decoration-golden/50 hover:text-golden-hover"
          >
            {inline.text}
          </a>
        ) : (
          <Link
            key={key}
            to={inline.href}
            className="text-golden underline decoration-golden/50 hover:text-golden-hover"
          >
            {inline.text}
          </Link>
        );
      default: {
        // Single newlines inside a paragraph are soft breaks; each line is keyed
        // by where it starts in the run
        let lineStart = 0;
        return inline.text.split('\n').map(line => {
          const lineKey = `${key}:${lineStart}`;
          const first = lineStart === 0;
          lineStart += line.length + 1;
          return (
            <Fragment key={lineKey}>
              {first ? null : <br />}
              {line}
            </Fragment>
          );
        });
      }
    }
  });
}

/**
 * Renders staff-authored article markup — see `parseArticle` for the syntax.
 * Blocks are keyed by the source line they start on: unique within one article
 * and stable for as long as the text is.
 */
export function ArticleBody({ source, className }: { source: string; className?: string }) {
  const blocks = parseArticle(source);
  return (
    <div className={`flex flex-col gap-4 text-creme/85 ${className ?? ''}`}>
      {blocks.map(block => {
        switch (block.type) {
          case 'heading':
            return (
              <h2 key={block.line} className="mt-2 text-xl font-semibold text-golden">
                <Inlines inlines={block.inlines} />
              </h2>
            );
          case 'list': {
            // Items are consecutive lines, so the first item's line plus its
            // position in the list is the line it sits on
            let itemLine = block.line;
            return (
              <ul
                key={block.line}
                className="flex list-disc flex-col gap-1 pl-5 marker:text-golden"
              >
                {block.items.map(item => (
                  <li key={itemLine++}>
                    <Inlines inlines={item} />
                  </li>
                ))}
              </ul>
            );
          }
          case 'image':
            return (
              <figure key={block.line}>
                <img
                  src={resolveAssetUrl(block.src)}
                  alt={block.caption}
                  loading="lazy"
                  className="w-full rounded-[10px] bg-club-green-light"
                />
                {block.caption ? (
                  <figcaption className="mt-1 text-center text-sm text-grey-cool">
                    {block.caption}
                  </figcaption>
                ) : null}
              </figure>
            );
          default:
            return (
              <p key={block.line}>
                <Inlines inlines={block.inlines} />
              </p>
            );
        }
      })}
    </div>
  );
}
