import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HeroTable } from '../components/home/HeroTable'
import { SiteHeader } from '../components/home/SiteHeader'
import { WorkflowSteps } from '../components/home/WorkflowSteps'
import '../components/home/home.css'

const STEPS_ID = 'how-it-works'

/**
 * Smooth-scroll to the four steps and move focus there, so keyboard and
 * screen-reader users land where the page scrolled to. Without JavaScript the
 * plain fragment link still works.
 */
function scrollToSteps(event: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById(STEPS_ID)
  if (!target) return
  event.preventDefault()
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}

const VALUES: readonly { title: string; detail: string; icon: ReactNode }[] = [
  {
    title: 'Quick to use',
    detail: 'Log hands in seconds',
    icon: (
      <>
        <circle cx="12" cy="13.5" r="7.5" />
        <path d="M12 9.5v4l2.5 1.5M10 3h4M12 3v3" />
      </>
    ),
  },
  {
    title: 'Track your results',
    detail: "See what's working",
    icon: <path d="M5 20V13M10 20V8M15 20v-5M20 20V5" />,
  },
  {
    title: 'Built for live play',
    detail: 'Designed for the table',
    icon: (
      <>
        <ellipse cx="12" cy="12" rx="9.5" ry="5.5" />
        <ellipse cx="12" cy="12" rx="5.5" ry="2.6" />
      </>
    ),
  },
  {
    title: 'Your data',
    detail: 'Stays on your device',
    icon: (
      <>
        <rect x="5" y="10.5" width="14" height="10" rx="2" />
        <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
      </>
    ),
  },
]

export function HomePage() {
  return (
    <div className="hf-home min-h-dvh overflow-x-clip bg-room-950 text-bone-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-felt-500 focus:px-3 focus:py-2 focus:text-room-950"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main">
        <section aria-labelledby="hero-title" className="hf-room relative">
          <div className="mx-auto grid max-w-[1360px] gap-x-12 gap-y-10 px-4 pb-14 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:px-10 lg:pb-20 lg:pt-16 xl:gap-x-16">
            <div className="self-end lg:col-start-1 lg:row-start-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-room-300">
                Live poker. Real memories.
              </p>
              <h1
                id="hero-title"
                className="mt-4 text-[2.3rem] font-semibold leading-[1.03] tracking-[-0.035em] sm:text-6xl lg:text-[2.9rem] xl:text-[3.5rem] 2xl:text-[3.9rem]"
              >
                <span className="block">Remember the hand.</span>
                <span className="block">
                  <span className="text-felt-400">Rebuild</span> the action.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-room-300 sm:text-lg">
                A fast session and hand tracker for live poker. Record positions, stacks, action, board
                cards, showdown hands, results and profit while the details are still fresh.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/sessions/new" className="btn-primary h-12 rounded-xl px-6 text-[0.95rem]">
                  Start a session
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
                <a
                  href={`#${STEPS_ID}`}
                  onClick={scrollToSteps}
                  className="btn h-12 rounded-xl border border-white/15 px-6 text-[0.95rem] text-bone-50 hover:border-white/25 hover:bg-white/[0.04]"
                >
                  See how it works
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M6 13l6 6 6-6" />
                  </svg>
                </a>
              </div>
            </div>

            <div className="-mx-3 self-center sm:mx-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <HeroTable />
            </div>

            <ul className="grid grid-cols-2 gap-x-6 gap-y-6 self-start sm:grid-cols-4 lg:col-start-1 lg:row-start-2 lg:grid-cols-2 lg:pt-2 xl:grid-cols-4">
              {VALUES.map((value) => (
                <li key={value.title}>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-6 w-6 text-room-300"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {value.icon}
                  </svg>
                  <p className="mt-2.5 text-sm font-medium text-bone-50">{value.title}</p>
                  <p className="mt-0.5 text-[0.8rem] text-room-400">{value.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id={STEPS_ID}
          aria-labelledby="steps-title"
          tabIndex={-1}
          className="scroll-mt-28 border-t border-white/[0.06] bg-gradient-to-b from-room-900/70 to-room-950 focus:outline-none md:scroll-mt-20"
        >
          <div className="mx-auto max-w-[1360px] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
            <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-room-300">
                  From memory to hand history
                </p>
                <h2 id="steps-title" className="mt-3 text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
                  Reconstruct a hand in four simple steps
                </h2>
              </div>
              <p className="max-w-md text-room-300 lg:pb-1">
                Turn your memories into a clear, organized hand history in just a few quick questions.
              </p>
            </div>

            <div className="mt-10 lg:mt-12">
              <WorkflowSteps />
            </div>
          </div>
        </section>

        <section aria-labelledby="cta-title" className="border-t border-white/[0.06]">
          <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-10">
            <div>
              <h2 id="cta-title" className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">
                Remember the next hand before it disappears.
              </h2>
              <p className="mt-2 text-sm text-room-400">
                No account needed. Sessions and hands are stored in this browser and export as JSON.
              </p>
            </div>
            <Link to="/sessions/new" className="btn-primary h-12 shrink-0 self-start rounded-xl px-6 text-[0.95rem] md:self-auto">
              Start a session
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-room-500 sm:px-6 lg:px-10">
          <span>SessionTracker — live hand reconstruction for No-Limit Hold&rsquo;em.</span>
          <Link to="/sessions" className="text-room-400 hover:text-bone-50">
            Your sessions
          </Link>
        </div>
      </footer>
    </div>
  )
}
