import { Link } from '@tanstack/react-router';
import { PageLayout } from './site/PageLayout';
import { m } from '../paraglide/messages.js';

/** Router-level 404 for unknown URLs — localized, styled like every other page. */
export function NotFound() {
  return (
    <PageLayout script="404" title={m.not_found()} width="narrow">
      <div className="flex flex-col items-center gap-6 py-10 text-center">
        <p className="text-cream-soft">{m.not_found()}</p>
        <Link to="/" className="btn-gold h-12 px-6">
          {m.go_home()}
        </Link>
      </div>
    </PageLayout>
  );
}
