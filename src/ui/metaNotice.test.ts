// Markup test for the corrupt franchise-progress banner (MetaNotice.tsx).

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MetaNotice from './MetaNotice.tsx'

describe('MetaNotice', () => {
  it('shows the problem, the reason and a dismiss button', () => {
    const html = renderToStaticMarkup(createElement(MetaNotice, { reason: 'meta save is not text', onDismiss: () => {} }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('Could not load your franchise progress')
    expect(html).toContain('meta save is not text')
    expect(html).toContain('Dismiss')
  })
})
