import { lazy } from 'react';

/**
 * Dev-only devtools shell, lazy-imported so none of the devtools packages
 * land in the production bundle (parse/execute cost on mobile).
 */
export const DevTools = import.meta.env.DEV
  ? lazy(async () => {
      const [{ TanStackDevtools }, { TanStackRouterDevtoolsPanel }, { default: queryDevtools }] =
        await Promise.all([
          import('@tanstack/react-devtools'),
          import('@tanstack/react-router-devtools'),
          import('./tanstack-query/devtools')
        ]);

      function DevToolsImpl() {
        return (
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[
              { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
              queryDevtools
            ]}
          />
        );
      }

      return { default: DevToolsImpl };
    })
  : // Production: no devtools at all. Inside the DEV branch, the lazy() call and
    // its dynamic imports are dropped by the bundler; a module-level lazy() kept
    // every devtools chunk (and the SSR bundle's imports of the devtools
    // packages) in production builds even though nothing rendered them.
    () => null;
