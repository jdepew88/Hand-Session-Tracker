import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Standard page frame: a back link, a title, an optional action, then content. */
export function Page({
  title,
  subtitle,
  back,
  action,
  wide = false,
  children,
}: {
  title: string
  subtitle?: ReactNode
  back?: { to: string; label: string }
  action?: ReactNode
  /** Dashboards (Results) use the wider frame on large screens. */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className={`mx-auto w-full px-3 pt-3 ${wide ? 'max-w-6xl sm:px-5 lg:pt-6' : 'max-w-2xl'}`}>
      <header className="mb-4">
        {back && (
          <Link
            to={back.to}
            className="mb-2 inline-flex items-center gap-1 text-sm text-room-300 hover:text-room-50"
          >
            <span aria-hidden="true">&#8592;</span> {back.label}
          </Link>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <div className="mt-0.5 text-sm text-room-400">{subtitle}</div>}
          </div>
          {action}
        </div>
      </header>
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="card-surface px-4 py-10 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-room-400">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
