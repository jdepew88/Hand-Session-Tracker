/**
 * All monetary values in HandForge are integer **cents**.
 *
 * Floating point dollars silently corrupt pot math (0.1 + 0.2 !== 0.3), and a
 * poker tracker that is off by a cent after twelve actions is worthless. Every
 * amount that crosses the engine boundary is an integer; formatting to dollars
 * happens only at the UI edge.
 */
export type Cents = number

export const CENTS_PER_DOLLAR = 100

/** Parse a user-entered dollar string ("12.50", "$12.50", "12") into cents. */
export function parseDollars(input: string | number): Cents | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null
    return Math.round(input * CENTS_PER_DOLLAR)
  }
  const cleaned = input.replace(/[$,\s]/g, '')
  if (cleaned === '') return null
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * CENTS_PER_DOLLAR)
}

/** Format cents as a display string. Whole dollars drop the ".00". */
export function formatCents(cents: Cents, opts: { sign?: boolean } = {}): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / CENTS_PER_DOLLAR)
  const remainder = abs % CENTS_PER_DOLLAR
  const body =
    remainder === 0
      ? `$${dollars.toLocaleString('en-US')}`
      : `$${dollars.toLocaleString('en-US')}.${String(remainder).padStart(2, '0')}`
  if (negative) return `-${body}`
  if (opts.sign && cents > 0) return `+${body}`
  return body
}

/** Format cents for an editable text input ("12.50", "12"). */
export function centsToInput(cents: Cents): string {
  const abs = Math.abs(cents)
  const remainder = abs % CENTS_PER_DOLLAR
  const dollars = Math.floor(abs / CENTS_PER_DOLLAR)
  const sign = cents < 0 ? '-' : ''
  return remainder === 0 ? `${sign}${dollars}` : `${sign}${dollars}.${String(remainder).padStart(2, '0')}`
}

export const isValidAmount = (value: unknown): value is Cents =>
  typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)
