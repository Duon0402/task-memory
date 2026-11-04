#!/usr/bin/env node
// PreToolUse hook: surfaces a recorded lesson at the moment Claude is about to
// repeat the action it warns about. Lessons stay in the user's own memory files;
// this script only reads their `**Trigger:**` lines (format.md §2).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const TRIGGER = /\*\*Trigger:\*\*\s*(edit|bash|content)\s+`([^`]+)`\s*·\s*(remind|ask|block)/g
const GLOBAL_START = '<!-- task-memory:global-lessons:start -->'
const GLOBAL_END = '<!-- task-memory:global-lessons:end -->'
const RANK = { remind: 0, ask: 1, block: 2 }

export function memoryDir(input) {
  if (process.env.TASK_MEMORY_DIR) return process.env.TASK_MEMORY_DIR
  if (input.transcript_path) return path.join(path.dirname(input.transcript_path), 'memory')
  const cwd = input.cwd || process.cwd()
  return path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[/.]/g, '-'), 'memory')
}

function globalFile() {
  return process.env.TASK_MEMORY_GLOBAL || path.join(os.homedir(), '.claude', 'CLAUDE.md')
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

// A rule is a `## ` block in a topic file, or one `- ` line in the global
// section. Triggers attach to the rule they appear in.
export function parseRules(text, source) {
  const units = []
  const push = (title, body) => {
    const triggers = [...body.matchAll(TRIGGER)].map(([, kind, pattern, level]) => ({ kind, pattern, level }))
    const seen = Number((body.match(/seen (\d+)×/i) || [])[1] || 0)
    units.push({ id: `${source}#${title}`, source, title, body, seen, triggers })
  }
  if (source === 'global') {
    const start = text.indexOf(GLOBAL_START)
    const end = text.indexOf(GLOBAL_END)
    if (start < 0 || end < start) return units
    for (const line of text.slice(start, end).split('\n')) {
      if (line.startsWith('- ')) push(line.slice(2).split(' — ')[0], line)
    }
    return units
  }
  for (const block of text.split(/^## /m).slice(1)) {
    const [title, ...rest] = block.split('\n')
    push(title.trim(), rest.join('\n'))
  }
  return units
}

export function parseUnits(text, source) {
  return parseRules(text, source).filter((u) => u.triggers.length)
}

export function loadUnits(dir) {
  const units = []
  let files = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith('lesson_') && f.endsWith('.md') && f !== 'lesson_archive.md')
  } catch {}
  for (const f of files) units.push(...parseUnits(read(path.join(dir, f)), f))
  units.push(...parseUnits(read(globalFile()), 'global'))
  return units
}

function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*'
      i++
      if (glob[i + 1] === '/') i++
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`(^|/)${re}$`)
}

function toRegExp(pattern) {
  const m = pattern.match(/^\/(.*)\/([a-z]*)$/)
  try {
    return m ? new RegExp(m[1], m[2]) : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  } catch {
    return null
  }
}

// Code is often written through Bash (heredoc, python/node script, sed -i) as
// well as Edit/Write. A command that writes files is matched against content and
// edit triggers too; a read-only one (grep, cat, sed -n) is not, so searching for
// a pattern does not raise the lesson about writing it.
const WRITES = [
  /(^|[^0-9&>])>>?\s*(?!&|\/dev\/null)[^\s|&;]/,
  /\bsed\s+(-[a-zA-Z]*i|--in-place)/,
  /\bperl\s+-[a-zA-Z]*i/,
  /\btee\b/,
  /\bopen\([^)]*['"][wa]\+?['"]/,
  /\.write\(|\bwrite_text\(|\bwriteFileSync?\(/,
  /\bgit\s+apply\b|\bpatch\s+-/,
]

export function bashWrites(command) {
  return WRITES.some((re) => re.test(command))
}

function relative(file, cwd) {
  return file && cwd && file.startsWith(cwd + '/') ? file.slice(cwd.length + 1) : file
}

function subject(input) {
  const t = input.tool_input || {}
  const cwd = input.cwd || ''
  const command = t.command || ''
  if (input.tool_name === 'Bash') {
    const writes = bashWrites(command)
    const paths = writes ? [...command.matchAll(/(?:^|[\s'"`(=])((?:\.{0,2}\/|~\/)?[\w.@-]+(?:\/[\w.@-]+)+)/g)].map((m) => relative(m[1], cwd)) : []
    return { tool: 'Bash', files: paths, command, content: writes ? command : '' }
  }
  const file = relative(t.file_path || '', cwd)
  const content = [t.new_string, t.content, ...(t.edits || []).map((e) => e.new_string)].filter(Boolean).join('\n')
  return { tool: input.tool_name, files: file ? [file] : [], command, content }
}

export function matches(trigger, s) {
  if (trigger.kind === 'bash') {
    const re = toRegExp(trigger.pattern)
    return s.tool === 'Bash' && !!re && re.test(s.command)
  }
  if (trigger.kind === 'edit') return s.files.some((f) => globToRegExp(trigger.pattern).test(f))
  if (!s.content) return false
  const re = toRegExp(trigger.pattern)
  return !!re && re.test(s.content)
}

// The reminder carries only what is needed to act — title, How to apply and any
// Except — plus where the rule lives. Why and history stay in the file and are
// read only when a case needs judgment, so a reminder costs a few lines.
export function summary(unit) {
  const lines = unit.body.replace(TRIGGER, '').split('\n').map((l) => l.trim())
  const pick = (label) => lines.find((l) => l.startsWith(`**${label}:**`))
  const how = pick('How to apply')
  const except = pick('Except')
  const action = how
    ? how.replace(/^\*\*How to apply:\*\*\s*/, '')
    : lines.find((l) => l && !/^seen \d/i.test(l) && !l.startsWith('**')) || ''
  const where = unit.source === 'global' ? '~/.claude/CLAUDE.md (global lessons)' : `${unit.source} § ${unit.title}`
  return [`• ${unit.title}`, action && `  ${action}`, except && `  ${except}`, `  ↳ ${where}`].filter(Boolean).join('\n')
}

// Reminders are shown once per session per rule: after that the rule is
// already in context, and repeating it on every edit would only cost tokens.
function seenStore(sessionId) {
  const file = path.join(os.tmpdir(), `task-memory-${(sessionId || 'nosession').replace(/[^\w-]/g, '')}.json`)
  let seen = []
  try {
    seen = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {}
  return {
    has: (id) => seen.includes(id),
    add: (id) => {
      seen.push(id)
      try {
        fs.writeFileSync(file, JSON.stringify(seen))
      } catch {}
    },
  }
}

export function decide(input, units, store) {
  const s = subject(input)
  const hits = []
  for (const u of units) {
    const hit = u.triggers.filter((t) => matches(t, s)).sort((a, b) => RANK[b.level] - RANK[a.level])[0]
    if (hit) hits.push({ unit: u, level: hit.level })
  }
  const shown = hits.filter((h) => h.level !== 'remind' || !store?.has(h.unit.id))
  if (!shown.length) return null
  const level = shown.reduce((a, h) => (RANK[h.level] > RANK[a] ? h.level : a), 'remind')
  const text = shown.map((h) => summary(h.unit)).join('\n\n')
  for (const h of shown) if (h.level === 'remind') store?.add(h.unit.id)
  const header = 'Recorded lesson (task-memory) for what you are about to do (open the rule at ↳ only if you need its Why):'
  if (level === 'remind') {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `${header}\n\n${text}` } }
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: level === 'block' ? 'deny' : 'ask',
      permissionDecisionReason: `${header}\n\n${text}`,
    },
  }
}

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return
  }
  const out = decide(input, loadUnits(memoryDir(input)), seenStore(input.session_id))
  if (out) process.stdout.write(JSON.stringify(out))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
