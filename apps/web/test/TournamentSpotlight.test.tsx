import type { ReactNode } from 'react';
import type { TournamentDto } from '@repo/shared';
import { cleanup, render, screen } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router';
import { afterEach, expect, test } from 'vitest';
import { TournamentSpotlight } from '../src/components/home/TournamentSpotlight';

afterEach(cleanup);

const tournament: TournamentDto = {
  id: 2,
  slug: 'autumn-cup',
  title: 'Autumn Cup',
  summary: 'Two brackets, races to three',
  details: null,
  imageUrl: null,
  status: 'registration',
  startsOn: '2026-12-15',
  startHour: 12,
  registrationDeadline: '2026-12-14',
  entryFeeGrosz: 20000,
  minPlayers: 16,
  maxPlayers: 16,
  confirmedCount: 8,
  pendingCount: 4,
  registrationState: 'open'
};

/** The card needs a router for its links; the pages they lead to stay empty. */
async function renderOnHome(card: ReactNode) {
  const root = createRootRoute();
  const page = (path: string, component?: () => ReactNode) =>
    createRoute({ getParentRoute: () => root, path, component });
  const router = createRouter({
    routeTree: root.addChildren([
      page('/', () => card),
      page('/tournaments'),
      page('/tournaments/$slug')
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] })
  });
  render(<RouterProvider router={router} />);
  return screen.findByRole('article');
}

test('the card is a region named by the tournament, with the way in', async () => {
  const card = await renderOnHome(<TournamentSpotlight tournament={tournament} />);
  expect(card).toBe(screen.getByRole('article', { name: 'Autumn Cup' }));
  const links = screen.getAllByRole('link').map(link => link.getAttribute('href'));
  expect(links).toContain('/tournaments/autumn-cup');
});

test('the card adds no heading: on a phone it stands above the page title', async () => {
  // A heading here came before the h1 and made the outline start at level 2
  await renderOnHome(<TournamentSpotlight tournament={tournament} />);
  expect(screen.queryAllByRole('heading')).toEqual([]);
});
