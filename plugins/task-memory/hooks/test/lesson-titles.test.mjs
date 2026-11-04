import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRules } from '../lesson-triggers.mjs'
import { titleLines, showRules } from '../../skills/capture-lessons/scripts/lesson-titles.mjs'

const rules = parseRules(`---
name: lesson-ui
---

## Popup closes itself after reopening
Seen 1× — A-1

**How to apply:** give HModal a no-op onClose.

## Scanner fires several frames
Seen 3× — A-2

**How to apply:** guard the handler with a ref.
**Trigger:** content \`BarcodeScan\` · remind

## Rule without trigger or how
Seen 2× — A-3
`, 'lesson_ui.md')

test('every rule is listed one line each, highest Seen first, triggers or not', () => {
  assert.deepEqual(titleLines(rules), [
    '3× · lesson_ui.md § Scanner fires several frames',
    '2× · lesson_ui.md § Rule without trigger or how',
    '1× · lesson_ui.md § Popup closes itself after reopening',
  ])
})

test('grep finds a rule through How to apply or trigger even when the title does not name it', () => {
  assert.deepEqual(titleLines(rules, 'hmodal'), ['1× · lesson_ui.md § Popup closes itself after reopening'])
  assert.deepEqual(titleLines(rules, 'BarcodeScan'), ['3× · lesson_ui.md § Scanner fires several frames'])
  assert.deepEqual(titleLines(rules, 'nothing-like-this'), [])
})

test('show prints the whole rule only for the requested title', () => {
  const out = showRules(rules, 'popup closes')
  assert.equal(out.length, 1)
  assert.match(out[0], /no-op onClose/)
})

test('check counts matching files per trigger, flags wide ask/block triggers and broken regexes', async () => {
  const { checkTriggers } = await import('../../skills/capture-lessons/scripts/lesson-titles.mjs')
  const r = parseRules('## Wide\n**Trigger:** file `/onClose/` · ask\n\n## Narrow\n**Trigger:** file `/onCancel/` · ask\n\n## Broken\n**Trigger:** content `/(/` · remind\n', 'lesson_ui.md')
  const files = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`f${i}.tsx`, i === 0 ? 'onClose={onCancel}' : 'onClose={x}']))
  const out = checkTriggers(r, Object.keys(files), (f) => files[f])
  assert.match(out.find((l) => l.includes('Wide')), /^WIDE {3}· 8 files/)
  assert.match(out.find((l) => l.includes('Narrow')), /^ok {5}· 1 files/)
  assert.match(out.find((l) => l.includes('Broken')), /^BROKEN/)
})
