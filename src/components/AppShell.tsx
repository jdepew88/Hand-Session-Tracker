import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from '../store/context'

const NAV = [
  { to: '/sessions', label: 'Sessions', end: true, icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/table', label: 'Table', end: false, icon: 'M3 12a9 5 0 1 0 18 0a9 5 0 1 0 -18 0' },
  { to: '/record', label: 'Record', end: false, icon: 'M12 5v14M5 12h14' },
  { to: '/hands', label: 'Hands', end: false, icon: 'M5 8h9v11H5zM10 5h9v11' },
  { to: '/settings', label: 'Settings', end: false, icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2m12 0h2M12 4v2m0 12v2' },
]

/**
 * Phone-first chrome: a thin title bar and a thumb-reachable tab bar.
 *
 * The tab bar is a real <nav> of links, so it is keyboard navigable and
 * announces the current page; the active tab is marked with text weight and a
 * rule, not colour alone.
 */
export function AppShell() {
  const { error } = useStore()

  return (
    <div className="flex min-h-dvh flex-col bg-room-950">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-felt-500 focus:px-3 focus:py-2 focus:text-room-950"
      >
        Skip to content
      </a>

      {error && (
        <p role="alert" className="bg-chip-red/15 px-3 py-2 text-sm text-chip-red">
          {error}
        </p>
      )}

      <main id="main" className="flex-1 pb-20">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-room-700 bg-room-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-2xl">
          {NAV.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-2 px-1 py-2 text-[0.7rem] ${
                    isActive
                      ? 'border-felt-400 font-semibold text-felt-200'
                      : 'border-transparent text-room-400'
                  }`
                }
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.icon} />
                </svg>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
