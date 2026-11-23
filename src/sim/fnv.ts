// Text hash for the chain stage (GAME_DESIGN 8.1): FNV-1a with a final avalanche, the same pattern as
// trend.ts and critic.ts. Pure and stateless: it uses NO random stream, so no draw count or order changes.

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

/** An unsigned 32-bit hash of `text`. */
export function hashText(text: string): number {
  let hash = FNV_OFFSET
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  return hash >>> 0
}
