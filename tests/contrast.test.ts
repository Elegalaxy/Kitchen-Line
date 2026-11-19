// (Lives in tests/ because it needs node:fs, which src/ui's type-check does not allow.)
// WCAG contrast of the colour tokens in styles.css (plan Step 18, UI/UX guide). The test reads
// the custom properties from the real stylesheet, so a token change that breaks AA fails here.
// Text tokens need 4.5:1 on both surfaces; --focus is a UI component colour and needs 3:1.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Read with fs: Vitest does not process stylesheets, so a ?raw import comes back empty.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(ROOT, 'src', 'ui', 'styles.css'), 'utf8')

const SURFACES = ['--surface', '--surface-raised'] as const
const TEXT_TOKENS = ['--text', '--text-muted', '--text-faint', '--good', '--bad', '--warn', '--info', '--money'] as const
const UI_TOKENS = ['--focus'] as const

function tokens(): Record<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css)
  if (root === null) throw new Error('no :root block in styles.css')
  const out: Record<string, string> = {}
  for (const m of root[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2]
  return out
}

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('colour token contrast', () => {
  const t = tokens()

  it('reads every token used below', () => {
    for (const name of [...SURFACES, ...TEXT_TOKENS, ...UI_TOKENS]) expect(t[name], name).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('computes known ratios correctly', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })

  for (const surface of SURFACES) {
    for (const name of TEXT_TOKENS) {
      it(`${name} on ${surface} is at least 4.5:1`, () => {
        const ratio = contrast(t[name], t[surface])
        console.log(`[DEBUG contrast] ${name} on ${surface}: ${ratio.toFixed(2)}`)
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }
    for (const name of UI_TOKENS) {
      it(`${name} on ${surface} is at least 3:1`, () => {
        expect(contrast(t[name], t[surface])).toBeGreaterThanOrEqual(3)
      })
    }
  }

  it('dark text on the filled controls (surface on info) is at least 4.5:1', () => {
    // .btn[aria-pressed], .btn-primary and the speed control draw --surface text on --info.
    expect(contrast(t['--surface'], t['--info'])).toBeGreaterThanOrEqual(4.5)
  })
})
