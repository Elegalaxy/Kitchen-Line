// Review text templates (plan Step 12), keyed by the main reason behind a rating. The sim
// picks one variant per rating on the `reviews` stream and fills `{dish}` (the dish ordered)
// and `{pref}` (the customer's first choice). The first variant of each reason is the plan's
// wording. Wording only; no numbers.

import type { ReviewReason } from '../sim/types.ts'

export const REVIEW_TEMPLATES: Record<ReviewReason, string[]> = {
  waitedLong: ['Waited forever for {dish}', 'The {dish} took far too long'],
  overpriced: ['{dish} was overpriced', 'Too expensive for {dish}'],
  notFirstChoice: ['Wanted {pref}, got {dish}', 'No {pref} today, settled for {dish}'],
  noMatch: ['Nothing I wanted at a price I liked', 'Nothing on the menu for me at that price'],
  queueFull: ["Couldn't even order, the queue was full", 'Too crowded, I could not get in line'],
  gaveUp: ['Left before my {dish} came', 'Gave up waiting for {dish}'],
  great: ['{dish} was fast and fresh', 'Fresh {dish}, no wait'],
}
