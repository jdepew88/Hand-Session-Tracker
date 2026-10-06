import type { ExpenseCategory } from '../../domain/results/models'

const PATHS: Record<ExpenseCategory, string> = {
  tips: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21',
  food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3.5 3.5-3.5 7s1.5 4 3.5 4',
  parking: 'M5 3h14v18H5zM10 17V8h3a2.5 2.5 0 0 1 0 5h-3',
  gas: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M5 10h10M15 8l3 3v6a1.5 1.5 0 0 0 3 0V9l-3-3',
  mileage: 'M5 20L9.5 4M19 20L14.5 4M12 6v2M12 11v2M12 16v2',
  rideshare: 'M4 16l2-5.5A2 2 0 0 1 7.9 9h8.2a2 2 0 0 1 1.9 1.5L20 16M4 16h16v3H4zM7 19v1.5M17 19v1.5',
  hotel: 'M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6M6.5 10.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  travel: 'M10 14l-6 2v-2l6-4V5a2 2 0 0 1 4 0v5l6 4v2l-6-2v4l2 1.5V21l-4-1-4 1v-1.5L10 18z',
  tournament: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6',
  other: 'M6 12h.01M12 12h.01M18 12h.01',
}

/** A small line icon per expense category. Always beside its label; never on its own. */
export function CategoryIcon({ category, className = 'h-4 w-4' }: { category: ExpenseCategory; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[category]} />
    </svg>
  )
}
