import { Link, NavLink } from 'react-router-dom'

/**
 * Marketing pages that are planned but not built. They render as inert labels,
 * not links, so nothing leads to a dead end; swap each for a NavLink when its
 * page exists.
 */
const PLANNED = ['About', 'Features', 'Screenshots'] as const

export function Logo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 shrink-0">
      <rect width="32" height="32" rx="7" fill="#121a1e" />
      <rect x="5.5" y="6" width="12" height="17" rx="2.5" fill="#e6edf0" transform="rotate(-9 11.5 14.5)" />
      <rect x="14" y="8" width="12" height="17" rx="2.5" fill="#2fbd83" />
      <path
        d="M20 12.2l3.4 4.1c.6.8.1 1.9-.9 1.9h-1.3v2.2h-2.4v-2.2h-1.3c-1 0-1.5-1.1-.9-1.9z"
        fill="#0a1013"
      />
    </svg>
  )
}

function NavItems() {
  return (
    <ul className="flex items-center gap-5 text-sm lg:gap-7">
      <li>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `relative inline-flex min-h-10 items-center transition-colors ${
              isActive
                ? 'font-semibold text-bone-50 after:absolute after:inset-x-0 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-felt-400'
                : 'text-room-300 hover:text-bone-50'
            }`
          }
        >
          Home
        </NavLink>
      </li>
      {PLANNED.map((label) => (
        <li key={label}>
          <span
            aria-disabled="true"
            title="Coming soon"
            className="inline-flex min-h-10 cursor-default items-center text-room-400"
          >
            {label}
            <span className="sr-only"> (coming soon)</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The homepage's top bar. Compact on purpose: on a phone it is a logo, the
 * primary action and one short row of links -- no menu drawer to open.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-room-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center gap-8 px-4 sm:px-6 lg:px-10">
        <Link to="/" className="flex items-center gap-2.5 rounded-md text-[1.15rem] font-semibold tracking-tight text-bone-50">
          <Logo />
          SessionTracker
        </Link>

        <nav aria-label="Site" className="hidden md:block">
          <NavItems />
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link to="/sessions" className="btn-ghost hidden sm:inline-flex">
            Your sessions
          </Link>
          <Link to="/sessions/new" className="btn-primary rounded-full px-5">
            Start a session
          </Link>
        </div>
      </div>

      <nav aria-label="Site" className="border-t border-white/[0.04] md:hidden">
        <div className="mx-auto flex max-w-[1360px] items-center gap-4 overflow-x-auto px-4 sm:px-6">
          <NavItems />
          <Link
            to="/sessions"
            className="ml-auto inline-flex min-h-10 shrink-0 items-center text-sm text-room-300 hover:text-bone-50 sm:hidden"
          >
            Sessions
          </Link>
        </div>
      </nav>
    </header>
  )
}
