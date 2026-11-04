#!/usr/bin/env node
// Lists lesson rules one line each (seen · file § title) so a session can scan
// every rule cheaply and open only the ones that look related.
//
//   lesson-titles.mjs                    all rules, highest Seen first per file
//   lesson-titles.mjs --grep "HModal|Barcode"
//   lesson-titles.mjs --show "HModal"     print the full rule(s) whose "file § title" contains the text
//   options: --archive (include lesson_archive.md), --dir <memory dir>
//
// --grep matches title, How to apply, Except and trigger patterns but prints only
// the title: a rule worded differently is still found through the component,
// command or path it names, while the output stays one line per rule.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { memoryDir, parseRules } from '../../../hooks/lesson-triggers.mjs'

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

export function loadRules(dir, { archive = false, globalFile } = {}) {
  let files = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith('lesson_') && f.endsWith('.md') && f !== 'lesson_stats.md')
  } catch {}
  if (!archive) files = files.filter((f) => f !== 'lesson_archive.md')
  const rules = files.sort().flatMap((f) => parseRules(read(path.join(dir, f)), f))
  if (globalFile) rules.push(...parseRules(read(globalFile), 'global'))
  return rules
}

export function searchable(rule) {
  const keep = rule.body.split('\n').filter((l) => /^\*\*(How to apply|Except|Trigger):\*\*/.test(l.trim()))
  return [rule.title, ...keep].join('\n')
}

export function titleLines(rules, grep) {
  const re = grep ? new RegExp(grep, 'i') : null
  const picked = rules.filter((r) => !re || re.test(searchable(r)))
  const bySource = new Map()
  for (const r of picked) bySource.set(r.source, [...(bySource.get(r.source) || []), r])
  const out = []
  for (const [source, list] of bySource) {
    for (const r of list.sort((a, b) => b.seen - a.seen)) out.push(`${r.seen}× · ${source} § ${r.title}`)
  }
  return out
}

export function showRules(rules, text) {
  const needle = text.toLowerCase()
  return rules
    .filter((r) => `${r.source} § ${r.title}`.toLowerCase().includes(needle))
    .map((r) => `## ${r.title}  (${r.source})\n${r.body.trim()}`)
}

function main(argv) {
  const opt = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const dir = opt('--dir') || process.env.TASK_MEMORY_DIR || memoryDir({ cwd: process.cwd() })
  const globalFile = process.env.TASK_MEMORY_GLOBAL || path.join(process.env.HOME || '', '.claude', 'CLAUDE.md')
  const rules = loadRules(dir, { archive: argv.includes('--archive'), globalFile })
  const show = opt('--show')
  const lines = show ? showRules(rules, show) : titleLines(rules, opt('--grep'))
  process.stdout.write((lines.length ? lines.join(show ? '\n\n' : '\n') : '(no matching rule)') + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
