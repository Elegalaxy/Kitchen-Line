// Dollars <-> integer cents for text inputs (the sim only ever sees cents). Accepts "3",
// "3.5", "3.50", "$3.50" and ".5" (optional spaces around); rejects empty text, letters,
// signs, thousands separators and more than two decimals ("3.555"). `formatMoney` in
// format.ts is the other direction for display ("$3.50"); `centsToInput` is the bare
// number for an input's value.

export type ParsedMoney = { ok: true; cents: number } | { ok: false; error: string }

const MONEY_PATTERN = /^\$?\s*(\d+)?(?:\.(\d{1,2}))?$/

/** Parse a dollar amount typed by the player into integer cents. */
export function parseDollars(text: string): ParsedMoney {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false, error: 'Enter a price' }
  if (/^[-+]/.test(trimmed) || /^\$\s*[-+]/.test(trimmed)) return { ok: false, error: 'Price cannot be negative' }
  const m = MONEY_PATTERN.exec(trimmed)
  if (m === null || (m[1] === undefined && m[2] === undefined)) {
    return { ok: false, error: /\.\d{3,}/.test(trimmed) ? 'Use at most 2 decimals' : 'Enter a price like 3.50' }
  }
  const dollars = m[1] === undefined ? 0 : Number(m[1])
  const frac = m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0'))
  const cents = dollars * 100 + frac
  if (!Number.isSafeInteger(cents)) return { ok: false, error: 'Enter a price like 3.50' }
  return { ok: true, cents }
}

/** Bare dollars text for an input value: 350 -> "3.50". */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}
