import {
  SUPPORTED_LOCALES,
  type NewsItemDto,
  type TournamentDto,
  type VenueConfigDto
} from '@repo/shared';
import { m } from '../paraglide/messages.js';
import { baseLocale, getLocale, locales } from '../paraglide/runtime.js';
import { formatHour, weekdayName } from './format';
import { clampDescription, localizedPageUrl, tournamentDescription } from './seo';
import { isOver, whenLabel } from './tournaments';
import { VENUE, VENUE_ADDRESS } from './venue';
import { groupWeeklyHours } from './venue-config';

/** Each language named in itself, as the switcher names them. */
const LANGUAGE_NAMES = { uk: 'Українська', pl: 'Polski', en: 'English' } as const;

/** How many tournaments and articles the file lists: an index, not an archive. */
const LIST_LIMIT = 10;

/**
 * Where the llms.txt for a page lives: each language of the site has its own,
 * beside that language's pages ("/uk/llms.txt" for everything under "/uk/").
 */
export function llmsTxtPath(pathname: string): string {
  const prefixed = locales.find(
    locale =>
      locale !== baseLocale && (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`))
  );
  return prefixed === undefined ? '/llms.txt' : `/${prefixed}/llms.txt`;
}

/**
 * The Link header that announces a page's llms.txt (llmstxt.org v2: found by
 * relation, not by guessing the path). The document's <head> says the same.
 */
export function llmsLinkHeader(pathname: string): string {
  return `<${llmsTxtPath(pathname)}>; rel="describedby"; type="text/markdown"`;
}

/** Staff text as one line that cannot close the link or start a heading. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
const linkText = (text: string) => oneLine(text).replaceAll('[', '(').replaceAll(']', ')');

function link(title: string, path: string, about: string | null): string {
  const url = localizedPageUrl(path, getLocale());
  const note = about === null || about.trim() === '' ? '' : `: ${clampDescription(about)}`;
  return `- [${linkText(title)}](${url})${note}`;
}

/**
 * What to say about a tournament: when it is played, then the staff's own
 * line. An assistant asked "when is the next tournament" reads this file, not
 * the page, so the date cannot be left to the summary. A summary that is
 * empty or only repeats the title gives way to the built description, which
 * already carries the date.
 */
function tournamentNote(tournament: TournamentDto): string {
  const when = whenLabel(tournament);
  const summary = tournament.summary?.trim() ?? '';
  const repeatsTitle = summary.toLocaleLowerCase() === tournament.title.trim().toLocaleLowerCase();
  if (summary === '' || repeatsTitle) return tournamentDescription(tournament);
  return when === null ? summary : `${when}. ${summary}`;
}

/** "poniedziałek – czwartek 16:00–21:00; piątek 16:00–23:00": the contacts page's rows as one line. */
function openingHours(config: VenueConfigDto): string {
  return groupWeeklyHours(config.hours)
    .map(group => {
      const first = group.weekdays[0] ?? 0;
      const last = group.weekdays.at(-1) ?? first;
      const days =
        first === last ? weekdayName(first) : `${weekdayName(first)} – ${weekdayName(last)}`;
      const hours = group.closed
        ? m.hours_closed()
        : `${formatHour(group.hours.open)}–${formatHour(group.hours.close)}`;
      return `${days} ${hours}`;
    })
    .join('; ');
}

/**
 * /llms.txt: a short index of the site for AI assistants, in the format of
 * llmstxt.org — the name, a one-line summary, the facts people ask for, and
 * links to the public pages in this language. Built per request from the live
 * content and opening hours, so it cannot drift from what the pages say.
 * Private app pages (booking, profile, staff panel) are left out: robots.txt
 * closes them.
 */
export function llmsTxt({
  news,
  tournaments,
  config
}: {
  news: Pick<NewsItemDto, 'slug' | 'title' | 'body' | 'hasArticle'>[];
  tournaments: TournamentDto[];
  config: VenueConfigDto;
}): string {
  const locale = getLocale();
  const articles = news.filter(item => item.hasArticle).slice(0, LIST_LIMIT);
  // Only what is still ahead: a played tournament listed here reads as an invitation
  const events = tournaments.filter(item => !isOver(item)).slice(0, LIST_LIMIT);
  const section = (title: string, lines: string[]) =>
    lines.length === 0 ? [] : [`## ${title}`, '', ...lines, ''];

  return [
    `# ${m.app_title()}`,
    '',
    `> ${m.seo_desc_home()}`,
    '',
    `- ${m.address_label()}: ${VENUE_ADDRESS}`,
    `- ${m.phone_contact_label()}: ${VENUE.phone}`,
    `- ${m.opening_hours()}: ${openingHours(config)}`,
    '',
    ...section(m.footer_club(), [
      link(m.menu_prices(), '/prices', m.seo_desc_prices()),
      link(m.nav_contacts(), '/contacts', m.seo_desc_contacts()),
      link(m.menu_tournaments(), '/tournaments', m.seo_desc_tournaments()),
      link(m.menu_news(), '/news', m.seo_desc_news())
    ]),
    ...section(
      m.menu_tournaments(),
      events.map(item =>
        link(item.title, `/tournaments/${encodeURIComponent(item.slug)}`, tournamentNote(item))
      )
    ),
    ...section(
      m.menu_news(),
      articles.map(item => link(item.title, `/news/${encodeURIComponent(item.slug)}`, item.body))
    ),
    ...section(
      m.language(),
      SUPPORTED_LOCALES.filter(other => other !== locale).map(
        other => `- [${LANGUAGE_NAMES[other]}](${localizedPageUrl('/llms.txt', other)})`
      )
    )
  ].join('\n');
}
