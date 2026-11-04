# task-memory

A Claude Code plugin that turns what a task taught — mistakes Claude made and
approaches that worked — into reusable lessons, so the next task does not
repeat them. Memory stays small: the always-loaded index is kept within a
fixed budget on every run, so no periodic cleanup is needed.

## Install

```
/plugin marketplace add Duon0402/task-memory
/plugin install task-memory@task-memory-marketplace
```

## Use

- Run `/task-memory:capture-lessons` at the end of a task (or say "capture
  lessons", "retro this task", "clean up memory").
- After a commit/push/merge, Claude offers it once, and only when the task
  produced new corrections.

Each run:

1. Collects corrections, review findings and confirmed approaches from the
   session, from loose files that Claude Code's auto-memory wrote, and from
   the task's notes.
2. Drops what only applies to that one task.
3. Merges the rest into topic files (`lesson_<topic>.md`) with a
   `Seen N× — <tasks>` counter. A rule that was already recorded but still got
   broken is marked `slipped` and rewritten so it works next time.
4. Retires notes for tasks whose branch is merged, keeps the index at about 30
   lines or fewer (archiving instead of deleting), and moves
   project-independent rules to `~/.claude/CLAUDE.md`.

## Lessons applied while coding

A lesson only helps if it is in front of Claude at the moment it matters. The
plugin ships a `PreToolUse` hook that runs before every Edit, Write and Bash
call. Any rule in your lesson files that carries a trigger line is checked
against what Claude is about to do:

```markdown
**Trigger:** edit `src/BaseComponent/**` · ask
**Trigger:** bash `/\bprettier\b/` · block
**Trigger:** content `/uploadFile|InsertPicture/` · remind
```

- `remind` adds the rule to Claude's context, once per session.
- `ask` pauses and asks you.
- `block` refuses the action and tells Claude why.

Code written through Bash counts too: a command that writes files (heredoc,
`sed -i`, a script that opens a file for writing) is matched against `content`
and `edit` triggers, while read-only commands (`grep`, `cat`, `sed -n`) are not.
A reminder carries only the rule's title, How to apply, any Except and the
file it lives in, so it costs a few lines; the Why stays in the file. It is
shown once per session, or once per file for a rule that has slipped, and
again after the context is compacted. Rules that need judgment carry a
`**Checkpoint:** commit|mr|review` line instead of a trigger; the hook lists
them by title before every commit, MR or review reply.

`skills/capture-lessons/scripts/lesson-titles.mjs` lists every rule one line
each (`seen · file § title`, `--grep` to filter, `--show` to print one in
full), so a session can shortlist by title before reading rule bodies.

`capture-lessons` adds triggers to rules that point at a concrete path, command
or code pattern. Rules that need judgment have no trigger and stay in the
`MEMORY.md` index. The hook needs `node` on your `PATH`. It only reads your
lesson files, and when nothing matches it does nothing.

## Where the data lives

This repo ships only the mechanism. Lessons stay on your machine, in Claude
Code's own memory locations:

| What | Where |
|---|---|
| Project lessons, task notes | `~/.claude/projects/<project>/memory/` |
| Lessons for all projects | a marked section in `~/.claude/CLAUDE.md` |

Nothing is written into your repositories. Each machine and each project
builds up its own lessons; installing the plugin starts you with none.

The file formats are in
[`plugins/task-memory/skills/capture-lessons/references/format.md`](plugins/task-memory/skills/capture-lessons/references/format.md).

## Tests

`plugins/task-memory/skills/capture-lessons/evals/` and `effect-evals/` contain
test fixtures only: a fictional project ("shopapp", tasks `SHOP-xx`) with
made-up lessons. They are never installed into anyone's memory.

- `evals/`: checks that the skill records lessons correctly. Run with
  `claude plugin eval plugins/task-memory/skills/capture-lessons --allow-tools Write,Edit,Bash --scaffold`.
- `plugins/task-memory/hooks/test/`: unit tests for the trigger hook. Run with
  `node --test plugins/task-memory/hooks/test/*.test.mjs` (hook and lesson-titles).
- `effect-evals/`: checks that recorded lessons change behaviour on a later
  task (with vs without memory); see `effect-evals/cases.md`.

## License

MIT
