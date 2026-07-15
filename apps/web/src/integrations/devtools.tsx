import { lazy } from 'react';

/**
 * Dev-only devtools shell, lazy-imported so none of the devtools packages
 * land in the production bundle (parse/execute cost on mobile).
 */
export const DevTools = lazy(async () => {
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
});
