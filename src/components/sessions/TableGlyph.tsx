import './sessions.css'

/**
 * A small table with one dot per chair: the table size at a glance, drawn
 * with the same seat placement as the full table (seat 1 at the dealer's
 * left, clockwise, a gap at the top for the dealer). Decorative; the table
 * size is always given in text alongside it.
 */
export function TableGlyph({ seats, className = '' }: { seats: number; className?: string }) {
  const dots = Array.from({ length: seats }, (_, index) => {
    const angle = ((-90 + (360 * (index + 1)) / (seats + 1)) * Math.PI) / 180
    return { cx: 20 + 16.5 * Math.cos(angle), cy: 16 + 12.5 * Math.sin(angle) }
  })
  return (
    <svg viewBox="0 0 40 32" className={className} aria-hidden="true" focusable="false">
      <ellipse className="sj-glyph__rail" cx="20" cy="16" rx="13" ry="9.5" />
      <ellipse className="sj-glyph__felt" cx="20" cy="16" rx="10.5" ry="7.2" />
      {dots.map((dot, index) => (
        <circle key={index} className="sj-glyph__seat" cx={dot.cx.toFixed(2)} cy={dot.cy.toFixed(2)} r="2" />
      ))}
    </svg>
  )
}
