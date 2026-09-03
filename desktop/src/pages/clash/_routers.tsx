import { createMemoryRouter, type RouteObject } from 'react-router'

import Layout from './_layout'
import { hiddenNavItems, navItems } from './_navigation'

const clashRoutes: RouteObject[] = [
  {
    path: '/',
    Component: Layout,
    children: [...navItems, ...hiddenNavItems].map(
      (item) =>
        ({
          path: item.path,
          Component: item.Component,
        }) as RouteObject,
    ),
  },
]

/**
 * Memory router so Clash navigation does not rewrite the Workbench window URL.
 * @param initialPath - First Clash island route (`/` home, `/logs`, …).
 * @returns Clash router instance.
 */
export function createClashRouter(initialPath = '/') {
  return createMemoryRouter(clashRoutes, { initialEntries: [initialPath] })
}
