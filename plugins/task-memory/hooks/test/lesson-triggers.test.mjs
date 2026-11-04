import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUnits, decide, bashWrites } from '../lesson-triggers.mjs'

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

test('reminder is compact: title, How to apply, Except and where the rule lives — no Why', () => {
  const rule = parseUnits(`## HModal onClose fires 250ms late
Seen 3× — A-1

Long description of the trap.
**Why:** a long story that should stay in the file.
**How to apply:** pass a no-op onClose to HModal.
**Except:** modals whose visible prop is not state-driven.
**Trigger:** content \`/<HModal\\b/\` · remind
`, 'lesson_ui.md')
  const out = decide({ cwd, tool_name: 'Edit', tool_input: { file_path: '/proj/a.tsx', new_string: '<HModal visible' } }, rule, store())
  const text = out.hookSpecificOutput.additionalContext
  assert.match(text, /pass a no-op onClose/)
  assert.match(text, /\*\*Except:\*\* modals/)
  assert.match(text, /↳ lesson_ui\.md$/m)
  assert.equal(text.split('HModal onClose fires 250ms late').length, 2)
  assert.doesNotMatch(text, /long story|Long description|Seen 3/)
})

test('rule without How to apply falls back to its first sentence', () => {
  const r = decide({ cwd, tool_name: 'Bash', tool_input: { command: 'npx prettier --write a.ts' } }, units, store())
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /• Never run a formatter over whole files\n  ↳ lesson_code\.md\n?$/)
})

test('Bash commands that write files are matched against content and edit triggers', () => {
  const py = `python3 - <<'X'\np='src/a.tsx'\ns=open(p).read().replace('a','InsertPicture(')\nopen(p,'w').write(s)\nX`
  assert.match(decide({ cwd, tool_name: 'Bash', tool_input: { command: py } }, units, store()).hookSpecificOutput.additionalContext, /Resize images/)
  const heredoc = `cat > src/BaseComponent/WaitingPage.tsx <<'X'\nexport default 1\nX`
  assert.match(decide({ cwd, tool_name: 'Bash', tool_input: { command: heredoc } }, units, store()).hookSpecificOutput.additionalContext, /shared base components/)
  const sed = `sed -i '' 's/a/b/' /proj/src/BaseComponent/FlowBaseFC.tsx`
  assert.match(decide({ cwd, tool_name: 'Bash', tool_input: { command: sed } }, units, store()).hookSpecificOutput.additionalContext, /shared base components/)
})

test('read-only Bash commands do not raise content or edit triggers', () => {
  for (const command of ['grep -rn "InsertPicture(" src', 'cat src/BaseComponent/WaitingPage.tsx', "sed -n '1,20p' src/BaseComponent/a.tsx", 'npx tsc --noEmit 2>&1 | grep InsertPicture > /dev/null']) {
    assert.equal(decide({ cwd, tool_name: 'Bash', tool_input: { command } }, units, store()), null, command)
  }
})

test('a slipped rule is reminded once per file, a normal rule once per session', () => {
  const rules = parseUnits(`## Slipped rule
Seen 3× — A-1 · last 2026-01-01 · slipped 1×
**How to apply:** do X.
**Trigger:** content \`/<HModal\\b/\` · remind

## Normal rule
Seen 1× — A-1
**How to apply:** do Y.
**Trigger:** content \`BarcodeScan\` · remind
`, 'lesson_ui.md')
  const st = store()
  const edit = (file, text) => decide({ cwd, tool_name: 'Edit', tool_input: { file_path: `/proj/${file}`, new_string: text } }, rules, st)
  assert.match(edit('a.tsx', '<HModal />').hookSpecificOutput.additionalContext, /Slipped rule/)
  assert.equal(edit('a.tsx', '<HModal />'), null)
  assert.match(edit('b.tsx', '<HModal />').hookSpecificOutput.additionalContext, /Slipped rule/)
  assert.match(edit('a.tsx', '<BarcodeScan />').hookSpecificOutput.additionalContext, /Normal rule/)
  assert.equal(edit('b.tsx', '<BarcodeScan />'), null)
})

const judgment = parseUnits(`## Keep project-wide patterns even when review points at them
Seen 2× — A-1 · slipped 1×
**How to apply:** grep for precedent first.
**Checkpoint:** commit, review

## Check MR description
**How to apply:** open the MR after creating it.
**Checkpoint:** mr
`, 'lesson_code.md')

test('checkpoint rules are listed by title at their moment, every time', () => {
  const st = store()
  const commit = { cwd, tool_name: 'Bash', tool_input: { command: 'git add a.ts && git commit -m "fix: x"' } }
  for (let i = 0; i < 2; i++) {
    const text = decide(commit, judgment, st).hookSpecificOutput.additionalContext
    assert.match(text, /Checkpoint before commit/)
    assert.match(text, /• Keep project-wide patterns even when review points at them \(lesson_code\.md\)/)
    assert.doesNotMatch(text, /grep for precedent|Check MR description/)
  }
  const review = decide({ cwd, tool_name: 'Bash', tool_input: { command: 'glab api -X POST "projects/x/merge_requests/1/discussions/abc/notes" -f body=ok' } }, judgment, st)
  assert.match(review.hookSpecificOutput.additionalContext, /Checkpoint before review[\s\S]*Keep project-wide/)
  assert.match(decide({ cwd, tool_name: 'Bash', tool_input: { command: 'glab mr create --title x' } }, judgment, st).hookSpecificOutput.additionalContext, /Check MR description/)
  assert.equal(decide({ cwd, tool_name: 'Bash', tool_input: { command: 'git status' } }, judgment, st), null)
})

test('a mistake-shaped trigger at ask level stops only the wrong code', () => {
  const rule = parseUnits('## HModal onClose\n**How to apply:** no-op onClose.\n**Trigger:** content `/<HModal\\b[^>]*onClose=\\{(?!HMODAL_ON_CLOSE_RONG\\})/` · ask\n', 'lesson_ui.md')
  const write = (content) => decide({ cwd, tool_name: 'Write', tool_input: { file_path: '/proj/a.tsx', content } }, rule, store())
  assert.equal(write('<HModal visible={v} onClose={props.onCancel}>').hookSpecificOutput.permissionDecision, 'ask')
  assert.equal(write('<HModal visible={v} onClose={HMODAL_ON_CLOSE_RONG}>'), null)
})

test('Bash text counts as content only when it writes a code file', () => {
  assert.equal(decide({ cwd, tool_name: 'Bash', tool_input: { command: 'echo "InsertPicture(" > notes.txt' } }, units, store()), null)
  assert.match(decide({ cwd, tool_name: 'Bash', tool_input: { command: "cat > A.tsx <<'X'\nInsertPicture(\nX" } }, units, store()).hookSpecificOutput.additionalContext, /Resize images/)
})

test('cp/mv match the destination against edit triggers and the source content against content triggers', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-'))
  fs.writeFileSync(path.join(dir, 'tpl.tsx'), 'const a = InsertPicture(x)')
  const cp = decide({ cwd: dir, tool_name: 'Bash', tool_input: { command: `cp tpl.tsx ${dir}/src/BaseComponent/New.tsx` } }, units, store())
  const text = cp.hookSpecificOutput.additionalContext
  assert.match(text, /shared base components/)
  assert.match(text, /Resize images/)
})

test('bash triggers and checkpoints ignore heredoc bodies', () => {
  const body = "cat >> notes.md <<'X'\nnpx prettier --write . && git commit -m x\nX\necho done"
  assert.equal(decide({ cwd, tool_name: 'Bash', tool_input: { command: body } }, [...units, ...judgment], store()), null)
  const real = "cat > a.md <<'X'\nhello\nX\nnpx prettier --write src"
  assert.equal(decide({ cwd, tool_name: 'Bash', tool_input: { command: real } }, units, store()).hookSpecificOutput.permissionDecision, 'deny')
})

test('file triggers see the whole file after the edit, including old code the edit does not touch', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-'))
  const rule = parseUnits('## HModal onClose\n**How to apply:** no-op onClose.\n**Trigger:** file `/<HModal\\b[^>]*onClose=\\{(?!NOOP\\})/` · ask\n', 'lesson_ui.md')
  const f = path.join(dir, 'Km.tsx')
  fs.writeFileSync(f, '<HModal visible={v} onClose={props.onCancel}>\n  <Input a />\n</HModal>')
  const addProp = { cwd: dir, tool_name: 'Edit', tool_input: { file_path: f, old_string: '  <Input a />', new_string: '  <Input km />\n  <Input a />' } }
  assert.equal(decide(addProp, rule, store()).hookSpecificOutput.permissionDecision, 'ask')
  const fix = { cwd: dir, tool_name: 'Edit', tool_input: { file_path: f, old_string: 'onClose={props.onCancel}', new_string: 'onClose={NOOP}' } }
  assert.equal(decide(fix, rule, store()), null)
  assert.equal(decide(addProp, parseUnits('## X\n**Trigger:** content `/<HModal/` · ask\n', 'l.md'), store()), null)
})

test('arrows are not redirects', () => {
  assert.equal(bashWrites('grep -n "=> {}" src/a.tsx'), false)
  assert.equal(bashWrites('grep "a -> b" src/a.tsx'), false)
  assert.equal(bashWrites('echo x > src/a.tsx'), true)
})
