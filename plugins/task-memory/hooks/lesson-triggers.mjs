#!/usr/bin/env node
// PreToolUse hook: surfaces a recorded lesson at the moment Claude is about to
// repeat the action it warns about. Lessons stay in the user's own memory files;
// this script only reads their `**Trigger:**` lines (format.md §2).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const TRIGGER = /\*\*Trigger:\*\*\s*(edit|bash|content|file)\s+`([^`]+)`\s*·\s*(remind|ask|block)/g
const GLOBAL_START = '<!-- task-memory:global-lessons:start -->'
const GLOBAL_END = '<!-- task-memory:global-lessons:end -->'
const RANK = { remind: 0, ask: 1, block: 2 }
const CHECKPOINT = /\*\*Checkpoint:\*\*\s*([a-z][a-z ,|]*)/i
// Moments where rules that need judgment (no code pattern to match) are listed
// by title, every time: before a commit, before opening/updating an MR or PR,
// and before replying to review.
const CHECKPOINT_EVENTS = {
  commit: /\bgit\s+commit\b/,
  mr: /\b(glab\s+mr\s+(create|update)|gh\s+pr\s+(create|edit))\b/,
  review: /\bglab\s+(api\b[^\n]*\/discussions|mr\s+note)\b|\bgh\s+pr\s+(review|comment)\b/,
}
const CODE_FILE = /\.(tsx?|jsx?|mjs|cjs|vue|cs|py|java|kt|swift|dart|go|rb|php|css|scss)$/i

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
    const slipped = /slipped \d+×/i.test(body)
    const checkpoints = ((body.match(CHECKPOINT) || [])[1] || '').split(/[\s,|]+/).filter((c) => c in CHECKPOINT_EVENTS)
    units.push({ id: `${source}#${title}`, source, title, body, seen, slipped, triggers, checkpoints })
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
  return parseRules(text, source).filter((u) => u.triggers.length || u.checkpoints.length)
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
  /(^|[^0-9&>=-])>>?\s*(?!&|\/dev\/null)[^\s|&;]/,
  /\bsed\s+(-[a-zA-Z]*i|--in-place)/,
  /\bperl\s+-[a-zA-Z]*i/,
  /\btee\b/,
  /\bopen\([^)]*['"][wa]\+?['"]/,
  /\.write\(|\bwrite_text\(|\bwriteFileSync?\(/,
  /\bgit\s+apply\b|\bpatch\s+-/,
]

// Heredoc bodies are data (file content, a script), not the command being run:
// bash triggers and checkpoints look at the command without them.
export function withoutHeredocs(command) {
  const lines = command.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i])
    const tags = [...lines[i].matchAll(/<<-?\s*(['"]?)([\w-]+)\1/g)].map((m) => m[2])
    for (const tag of tags) {
      while (i + 1 < lines.length && lines[i + 1].trim() !== tag) i++
      i++
    }
  }
  return out.join('\n')
}

export function bashWrites(command) {
  return WRITES.some((re) => re.test(command))
}

function relative(file, cwd) {
  return file && cwd && file.startsWith(cwd + '/') ? file.slice(cwd.length + 1) : file
}

const PATH_TOKEN = /(?:^|[\s'"`(=>])((?:\.{0,2}\/|~\/)?[\w.@-]+(?:\/[\w.@-]+)+|[\w.@-]+\.[a-z]{1,5})(?=$|[\s'"`);|&<])/gi

function readSmall(file) {
  try {
    return fs.statSync(file).size < 512 * 1024 ? fs.readFileSync(file, 'utf8') : ''
  } catch {
    return ''
  }
}

// cp/mv/rsync/install put an existing file's content at a new path: the
// destination is matched against edit triggers, the source content against
// content triggers.
function copies(command, cwd) {
  const files = []
  const content = []
  for (const part of command.split(/&&|\|\||;|\n/)) {
    const m = part.trim().match(/^(?:sudo\s+)?(cp|mv|rsync|install)\s+(.*)$/)
    if (!m) continue
    const args = m[2].split(/\s+/).filter((a) => a && !a.startsWith('-')).map((a) => a.replace(/^['"]|['"]$/g, ''))
    if (args.length < 2) continue
    const dest = args.pop()
    for (const src of args) {
      files.push(relative(dest.endsWith('/') ? dest + path.basename(src) : dest, cwd))
      content.push(readSmall(path.resolve(cwd || '.', src)))
    }
  }
  return { files, content: content.join('\n') }
}

// The file as it will be after an Edit/MultiEdit/Write: `file` triggers look at
// all of it, so a mistake already sitting in old code is caught when the file is
// touched for something else.
function fileAfter(input) {
  const t = input.tool_input || {}
  if (input.tool_name === 'Write') return t.content || ''
  let text = readSmall(path.resolve(input.cwd || '.', t.file_path || ''))
  const edits = input.tool_name === 'MultiEdit' ? t.edits || [] : [t]
  for (const e of edits) {
    if (!e.old_string) continue
    text = e.replace_all ? text.split(e.old_string).join(e.new_string ?? '') : text.replace(e.old_string, () => e.new_string ?? '')
  }
  return text
}

function subject(input) {
  const t = input.tool_input || {}
  const cwd = input.cwd || ''
  const command = t.command || ''
  if (input.tool_name === 'Bash') {
    const copied = copies(command, cwd)
    const writes = bashWrites(command)
    const paths = writes ? [...command.matchAll(PATH_TOKEN)].map((m) => relative(m[1], cwd)) : []
    // The command text counts as written code only when it writes a code file,
    // so `echo "<HModal>" > notes.txt` does not raise the HModal lesson.
    const codePaths = paths.filter((f) => CODE_FILE.test(f))
    const content = [codePaths.length ? command : '', copied.content].filter(Boolean).join('\n')
    const existing = codePaths.map((f) => readSmall(path.resolve(cwd || '.', f.replace(/^~\//, os.homedir() + '/'))))
    return {
      tool: 'Bash',
      files: [...copied.files, ...paths],
      command: withoutHeredocs(command),
      content,
      fileContent: [content, ...existing].filter(Boolean).join('\n'),
    }
  }
  const file = relative(t.file_path || '', cwd)
  const content = [t.new_string, t.content, ...(t.edits || []).map((e) => e.new_string)].filter(Boolean).join('\n')
  return { tool: input.tool_name, files: file ? [file] : [], command, content, fileContent: file ? fileAfter(input) : '' }
}

export function matches(trigger, s) {
  if (trigger.kind === 'bash') {
    const re = toRegExp(trigger.pattern)
    return s.tool === 'Bash' && !!re && re.test(s.command)
  }
  if (trigger.kind === 'edit') return s.files.some((f) => globToRegExp(trigger.pattern).test(f))
  const text = trigger.kind === 'file' ? s.fileContent : s.content
  if (!text) return false
  const re = toRegExp(trigger.pattern)
  return !!re && re.test(text)
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
  const where = unit.source === 'global' ? '~/.claude/CLAUDE.md (global lessons)' : unit.source
  return [`• ${unit.title}`, action && `  ${action}`, except && `  ${except}`, `  ↳ ${where}`].filter(Boolean).join('\n')
}

// Reminders are shown once per session per rule: after that the rule is
// already in context, and repeating it on every edit would only cost tokens.
// A rule that has slipped (the mistake recurred although it was recorded) is
// shown once per file instead: being in context once was not enough for it.
function storeFile(sessionId) {
  return path.join(os.tmpdir(), `task-memory-${(sessionId || 'nosession').replace(/[^\w-]/g, '')}.json`)
}

function seenStore(sessionId) {
  const file = storeFile(sessionId)
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

export function checkpointEvents(s) {
  return s.tool === 'Bash' ? Object.keys(CHECKPOINT_EVENTS).filter((e) => CHECKPOINT_EVENTS[e].test(s.command)) : []
}

export function decide(input, units, store) {
  const s = subject(input)
  const hits = []
  for (const u of units) {
    const hit = u.triggers.filter((t) => matches(t, s)).sort((a, b) => RANK[b.level] - RANK[a.level])[0]
    if (hit) hits.push({ unit: u, level: hit.level })
  }
  const key = (u) => (u.slipped && s.files.length ? `${u.id}@${s.files[0]}` : u.id)
  const shown = hits.filter((h) => h.level !== 'remind' || !store?.has(key(h.unit)))
  // Checkpoint rules are listed by title every time their moment comes: a list
  // of titles is cheap, and these rules have no pattern that could raise them earlier.
  const events = checkpointEvents(s)
  const listed = units.filter((u) => u.checkpoints.some((c) => events.includes(c)) && !shown.some((h) => h.unit === u))
  if (!shown.length && !listed.length) return null
  const level = shown.reduce((a, h) => (RANK[h.level] > RANK[a] ? h.level : a), 'remind')
  const parts = shown.map((h) => summary(h.unit))
  if (listed.length) {
    parts.push(
      `Checkpoint before ${events.join('/')} — confirm each of these was respected (open the file only if unsure):\n` +
        listed.map((u) => `• ${u.title} (${u.source === 'global' ? 'global' : u.source})`).join('\n')
    )
  }
  const text = parts.join('\n\n')
  for (const h of shown) if (h.level === 'remind') store?.add(key(h.unit))
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
  // SessionStart after compaction: reminders given before were summarised away,
  // so forget them and let each rule be raised again.
  if (process.argv.includes('--session-start')) {
    try {
      fs.unlinkSync(storeFile(input.session_id))
    } catch {}
    return
  }
  const out = decide(input, loadUnits(memoryDir(input)), seenStore(input.session_id))
  if (out) process.stdout.write(JSON.stringify(out))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
