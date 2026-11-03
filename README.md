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

## Where the data lives

This repo ships only the mechanism. Lessons stay on your machine, in Claude
Code's own memory locations:

| What | Where |
|---|---|
| Project lessons, task notes | `~/.claude/projects/<project>/memory/` |
| Lessons for all projects | a marked section in `~/.claude/CLAUDE.md` |

Nothing is written into your repositories. If you want to sync lessons across
machines, put those directories under version control yourself.

The file formats are in
[`plugins/task-memory/skills/capture-lessons/references/format.md`](plugins/task-memory/skills/capture-lessons/references/format.md).

## License

MIT
