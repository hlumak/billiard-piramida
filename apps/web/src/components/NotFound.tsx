import { Link } from '@tanstack/react-router';
import { PageHeader } from './AppHeader';
import { m } from '../paraglide/messages.js';

/** Router-level 404 for unknown URLs — localized, styled like every other page. */
export function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="404" />
      <main className="mt-8 flex flex-1 flex-col items-center justify-center gap-4 py-16">
        <p className="text-grey-cool">{m.not_found()}</p>
        <Link to="/" className="font-semibold text-golden">
          {m.go_home()}
        </Link>
      </main>
    </div>
  );
}
