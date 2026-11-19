// A money amount for tight spots: compact above $1M ("$1.2M") with the full value in a title
// and for screen readers; below that it is plain text. Tabular figures come from the parent's
// `.num` class (the compact text is still digits, a dot and a letter).

import { formatMoney, formatMoneyCompact } from './format.ts'

export default function Money({ cents }: { cents: number }) {
  const short = formatMoneyCompact(cents)
  const full = formatMoney(cents)
  if (short === full) return <>{full}</>
  return (
    <span title={full}>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{full}</span>
    </span>
  )
}
