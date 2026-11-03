import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUnits, decide } from '../lesson-triggers.mjs'

const topic = `---
name: lesson-code
---

## Ask before editing shared base components
Seen 2× — A-1, A-2

Base components are used app-wide.
**Trigger:** edit \`src/BaseComponent/**\` · remind

## Never run a formatter over whole files
Seen 3× — A-1

**Trigger:** bash \`/\\bprettier\\b|eslint\\s+.*--fix/\` · block

## Resize images before upload
**Trigger:** content \`/uploadFile|InsertPicture/\` · remind

## A rule without trigger
Nothing here.
`
const globalText = `intro
<!-- task-memory:global-lessons:start -->
- Never commit test-only config files — seen 2× · **Trigger:** bash \`/git (add|commit).*(\\.yarnrc\\.yml|ConfigBuild\\.ts)/\` · ask
- Plain rule — seen 1×
<!-- task-memory:global-lessons:end -->
- Outside the section **Trigger:** bash \`rm\` · block
`
const units = [...parseUnits(topic, 'lesson_code.md'), ...parseUnits(globalText, 'global')]
const store = () => { const s = new Set(); return { has: (i) => s.has(i), add: (i) => s.add(i) } }
const cwd = '/proj'

test('parses only rules that carry triggers, and only inside the global markers', () => {
  assert.deepEqual(units.map((u) => u.title), [
    'Ask before editing shared base components',
    'Never run a formatter over whole files',
    'Resize images before upload',
    'Never commit test-only config files',
  ])
})

test('edit glob reminds, once per session', () => {
  const st = store()
  const input = { cwd, tool_name: 'Edit', tool_input: { file_path: '/proj/src/BaseComponent/WaitingPage.tsx', new_string: 'x' } }
  const out = decide(input, units, st)
  assert.match(out.hookSpecificOutput.additionalContext, /Ask before editing shared base components/)
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined)
  assert.equal(decide(input, units, st), null)
})

test('edit glob does not fire for other paths', () => {
  const input = { cwd, tool_name: 'Edit', tool_input: { file_path: '/proj/src/Screens/X.tsx', new_string: 'x' } }
  assert.equal(decide(input, units, store()), null)
})

test('bash regex blocks every time', () => {
  const st = store()
  for (const command of ['npx prettier --write src/a.tsx', 'yarn eslint src --fix']) {
    const out = decide({ cwd, tool_name: 'Bash', tool_input: { command } }, units, st)
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /formatter/)
  }
  assert.equal(decide({ cwd, tool_name: 'Bash', tool_input: { command: 'npx tsc --noEmit' } }, units, st), null)
})

test('content regex matches Write and MultiEdit too', () => {
  const w = decide({ cwd, tool_name: 'Write', tool_input: { file_path: '/proj/a.ts', content: 'await uploadFile(uri)' } }, units, store())
  assert.match(w.hookSpecificOutput.additionalContext, /Resize images/)
  const m = decide({ cwd, tool_name: 'MultiEdit', tool_input: { file_path: '/proj/a.ts', edits: [{ new_string: 'InsertPicture(' }] } }, units, store())
  assert.match(m.hookSpecificOutput.additionalContext, /Resize images/)
})

test('global section triggers ask', () => {
  const out = decide({ cwd, tool_name: 'Bash', tool_input: { command: 'git add src/ConfigBuild.ts' } }, units, store())
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask')
  assert.equal(decide({ cwd, tool_name: 'Bash', tool_input: { command: 'rm -rf x' } }, units, store()), null)
})

test('strongest level wins when several rules match', () => {
  const out = decide({ cwd, tool_name: 'Bash', tool_input: { command: 'prettier --write . && git commit -am x .yarnrc.yml' } }, units, store())
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /test-only config/)
})

test('bad regex in a lesson is ignored rather than crashing', () => {
  const bad = parseUnits('## Broken\n**Trigger:** bash `/(/` · block\n', 'lesson_x.md')
  assert.equal(decide({ cwd, tool_name: 'Bash', tool_input: { command: '(' } }, bad, store()), null)
})
