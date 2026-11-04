# task-memory data format

Used by `capture-lessons`. Everything here layers on top of
Claude Code's built-in auto-memory (one directory per project, a `MEMORY.md`
index loaded into every session, one file per memory with YAML frontmatter).
Keep the frontmatter keys that system already uses (`name`, `description`,
`metadata.type`) so built-in recall keeps working; add only the keys below.

## Contents
1. Where things live
2. Lesson topic files
3. The inbox (loose auto-memory files)
4. The archive
5. Task files
6. The MEMORY.md index
7. Global lessons in ~/.claude/CLAUDE.md
8. Size budgets

---

## 1. Where things live

| Kind | Location |
|---|---|
| Project memory dir | The directory named in the system prompt line "You have a persistent file-based memory at `...`". If that line is missing, use `~/.claude/projects/<cwd with every "/" and "." replaced by "-">/memory/`. |
| Project lessons | `<memory dir>/lesson_<topic>.md` |
| Archive | `<memory dir>/lesson_archive.md` (not listed in the index) |
| Task memory | `<memory dir>/task_<task-id>.md` |
| Trend log | `<memory dir>/lesson_stats.md` (not listed in the index) |
| Inbox | any other `type: feedback` or `type: project` file in the memory dir |
| Index | `<memory dir>/MEMORY.md` |
| Global lessons | A marked section inside `~/.claude/CLAUDE.md` |

If the user explicitly names a memory dir or a global file to use, use those
paths instead.

Never write lessons into a repository's own `CLAUDE.md` or anywhere inside the
working tree — lessons can contain internal hostnames, branch names or people,
and the working tree gets committed.

Files of type `user` and `reference` are long-lived facts, not lessons; leave
them where they are.

## 2. Lesson topic files

One file per *topic*, not per lesson and not per task. A topic is an area of
work where mistakes and hard-won approaches cluster, e.g. `mr-review`, `be-integration`, `code-style`,
`git-workflow`, `ui-components`, `media-upload`. Derive names from what the
project actually does; reuse an existing topic whenever one fits.

```markdown
---
name: lesson-<topic>
description: <one line: the area + its 2-3 most important rules as keywords>
metadata:
  type: feedback
  seen: <sum of the rule counters below>
  last_seen: <YYYY-MM-DD, most recent of the rules below>
---

## <Rule as a short imperative>
Seen <N>× — <task-id>, <task-id> · last <YYYY-MM-DD>[ · slipped <K>×]

<The rule in one or two sentences, concrete enough to act on.>
**Why:** <what went wrong, or what made this approach the right one — lets a future session judge edge cases>
**How to apply:** <the trigger: when about to do X / when facing Y, do Z>
```

A rule is either an *avoid* (a mistake not to repeat) or a *do* (an approach
that worked and should be reused). Both use this shape; write the title so the
kind is obvious ("Never run prettier on whole files", "Read the backend command
before modelling fields").

Rules inside a file are ordered by `Seen`, highest first.

**Counting.** A task counts at most once per rule, however many times the
mistake happened or the approach was used inside it. With no task id (ad-hoc session), use the date.

**Slipped.** Increment `slipped` when the mistake happened *although the rule
was already recorded*. That means the rule exists but is not working — its
wording or its placement failed. A slipped rule must be strengthened, not just
counted (see the capture skill). Omit `slipped` while it is zero.

**Trigger.** A rule tied to a concrete action can carry one or more trigger
lines. The plugin's PreToolUse hook reads them and puts the rule in front of
Claude at the moment it is about to take that action, so the rule no longer
depends on Claude remembering to open this file:

```markdown
**Trigger:** edit `src/BaseComponent/**` · remind
**Trigger:** bash `/\bprettier\b|eslint\s.*--fix/` · block
**Trigger:** content `/uploadFile|InsertPicture/` · remind
```

| Kind | Matches | Pattern |
|---|---|---|
| `edit` | the path of a file being edited or written, relative to the project root — by Edit/Write, or by a Bash command that writes files | glob (`*`, `**`, `?`) |
| `bash` | a shell command about to run | `/regex/flags`, or a plain substring |
| `file` | the whole file as it will be after the Edit/Write (existing code included), or the code files a Bash command writes — but only a match within `near` lines (default 40) of the lines being edited | `/regex/flags`, or a plain substring |

A `file` trigger may end with `· near <lines>` to widen or narrow that window
(`file \`/…/\` · ask · near 80`). Editing a far-away part of a file that still
holds old bad code stays quiet.
| `content` | the code being written by Edit/Write, or the text of a Bash command that writes files (heredoc, `sed -i`, a script that opens a file for writing) | `/regex/flags`, or a plain substring |

Read-only commands (`grep`, `cat`, `sed -n`) never match `content` or `edit`,
so searching for a pattern does not raise the lesson about writing it.

The reminder shows only the title, **How to apply**, any **Except** and the
file the rule lives in; Why and history stay in the file. A `remind` rule is
shown once per session, except a rule marked `slipped`, which is shown once per
file — its mistake recurred while it was in context, so keep its How to apply
short. A rule
whose How to apply is missing falls back to its first sentence, so keep How to
apply self-sufficient.

| Level | Effect | Use for |
|---|---|---|
| `remind` | adds the rule to Claude's context, once per session (once per file for a slipped rule); nothing is blocked | rules with legitimate exceptions |
| `ask` | pauses and asks the user, showing the rule — until the user allows one such action on that file in the session (a denied action that is retried is asked again) | rules where the user decides case by case |
| `block` | refuses the action and tells Claude why, every time | rules with no exceptions |

After adding or changing a `content`/`file` trigger, run
`node "<skill dir>/scripts/lesson-titles.mjs" --check` in the project: it
prints how many code files each trigger matches today and flags `WIDE` for an
`ask`/`block` trigger matching more than 5 files (it would stop most edits of
that kind) and `BROKEN` for a regex that does not compile (it would never fire).
Narrow every `WIDE` trigger to the actual mistake before saving.

Add a trigger only when the action is unambiguous; a pattern that fires on
unrelated work teaches Claude to ignore it. Prefer `remind`, and use `block`
only for rules the user has stated as absolute. A rule that has slipped and
whose wrong code has a recognisable shape can also carry a *mistake-shaped*
trigger at `ask`, matching only the wrong form, so correct code is never
interrupted. Use `file`, not `content`, when the mistake can already sit in old
code: `content` sees only the lines being written, so adding a prop to a file
whose existing `<HModal onClose={props.onCancel}>` is wrong would pass unseen.

**Checkpoint.** Rules that need judgment ("keep project-wide patterns", "verify
each review point") have no pattern to match. Give them a checkpoint instead:

```markdown
**Checkpoint:** commit, review
```

| Moment | Raised before |
|---|---|
| `commit` | `git commit` |
| `mr` | `glab mr create/update`, `gh pr create/edit` |
| `review` | replying to review: `glab api …/discussions`, `glab mr note`, `gh pr review/comment` |

At that moment the hook lists every matching checkpoint rule by title, every
time (titles only, so it stays cheap). Heredoc bodies in a command are ignored
when matching `bash` triggers and checkpoints — they are data, not the command.

Reminders already given are forgotten when the context is compacted
(`SessionStart` with source `compact`), so each rule can be raised again after
the summary dropped it.

`cp`/`mv`/`rsync`/`install` match their destination against `edit` triggers and
the source file's content against `content` triggers. The text of a command
counts as written code only when the command writes a code file, so
`echo "<HModal>" > notes.txt` raises nothing.

## 3. The inbox (loose auto-memory files)

Claude Code's built-in auto-memory saves a correction the moment it happens, as
its own file (often named `feedback_<slug>.md` or `project_<slug>.md`). That is
useful — it survives across sessions and context compaction — but left alone it
produces one file and one index line per fact, which is exactly the growth this
plugin exists to prevent.

So treat those loose files as an inbox: raw material that every
`capture-lessons` run folds into topic files, task files or the global section, deleting the loose file once its
content has a home. Do not fight auto-memory or try to stop it; just digest
what it collects.

A loose file whose content turns out to be a durable fact rather than a lesson
(a repo location, a person's role) should become `type: reference` and stay.

## 4. The archive

`lesson_archive.md` holds rules that are not currently pulling their weight in
the index but might matter again. Same rule format as a topic file, grouped
under `# <topic>` headings, plus an `Archived <YYYY-MM-DD> — <reason>` line.

A rule that has not recurred for a long time has most likely been *working* —
that is not a reason to delete it. Archive instead: it leaves the index (no
context cost) but is not lost. Delete outright only when the rule is obsolete —
the project dropped the library, the process changed, the user reversed the
preference.

If an archived rule's mistake happens again, move it back into its topic file
and count it as a slip.

## 5. Task files

Short-lived working notes so the next session can pick a task up.

```markdown
---
name: task-<task-id>
description: <task title> — <current status in a few words>
metadata:
  type: project
  task: <task-id>
  branch: <branch name>
  status: in-progress | local-commit | pushed | in-review | merged
  updated: <YYYY-MM-DD>
  last_capture: <YYYY-MM-DD or never>
  corrections: <integer, running total for this task>
---

- Commits: <sha — what, pushed or not>
- Waiting on: <BE change, reviewer, user test, ...>
- Decided with user: <decisions that should not be re-asked>
- Next: <what remains>
```

Task id: take it from the branch name when it contains a ticket-like token
(`ABC-123`), otherwise from what the user called the task; ask if neither works.

Before deleting a merged task file, pull out anything reusable beyond the task
(a backend repo location, a recurring workflow) into a lesson or a reference
memory. Only the task-specific remainder is deleted.

Then append the task's line to `lesson_stats.md` (not listed in the index),
which is the only long-term record of whether mistakes are going down:

```markdown
# Corrections per task
<YYYY-MM-DD merged> · <task-id> · corrections <N> · new rules <n> · slips <k>
```

One line per task, so it stays tiny. When the user asks how the trend looks,
read this file and compare recent tasks with older ones.

## 6. The MEMORY.md index

One line per file, at most ~30 lines. Order:

1. Lesson topics, by `seen` descending — most frequent mistakes first.
2. Other long-lived memories (user, reference).
3. Task files, most recently updated first.

```markdown
- [<Topic title> (×<seen>)](lesson_<topic>.md) — <top rules as a terse hook>
- [Task <id>](task_<id>.md) — <status, e.g. "MR !31 waiting review">
```

The index is always loaded but the files behind it are opened only when a
session judges them relevant, so the hook must let a session decide from the
line alone. Name the concrete rules ("resize images before upload; never touch
shared base components"), never a category ("misc lessons"). A rule that has
slipped should be spelled out in the hook itself — unless it has a trigger,
which already surfaces it at the right moment. Keep each hook under ~150
characters; when one grows past that, rules are being crammed into the index
instead of getting triggers.

## 7. Global lessons in ~/.claude/CLAUDE.md

Lessons that apply in any project (how the user wants commits made, reply
language, general working habits) live in one section of the user's personal
`~/.claude/CLAUDE.md`, delimited so the skills can rewrite it without touching
anything else in that file:

```markdown
<!-- task-memory:global-lessons:start -->
## Lessons learned (all projects)
- <Rule> — seen <N>× · last <YYYY-MM-DD>[ · **Trigger:** <kind> `<pattern>` · <level>]
<!-- task-memory:global-lessons:end -->
```

One line per entry; this file is loaded in every session of every project. If
the markers are missing, append the section at the end of the file; if the
file does not exist, create it with just this section.

A rule found in a project memory dir that is really project-independent (it
says nothing about this codebase, stack or team) belongs here instead — it is
invisible to every other project where it is now.

## 8. Size budgets

Budgets are enforced on every write, not by a periodic cleanup: the only
memory that costs tokens in every session is what is always loaded (the index
and the global section), so as long as each run leaves those within budget,
nothing grows.

| Thing | Budget | When exceeded |
|---|---|---|
| MEMORY.md | ~30 lines | merge overlapping topics; archive the least-seen rules |
| Global lessons section | ~15 lines | merge overlapping entries; archive the least-seen |
| Rules per topic file | ~10 | merge similar rules, archive, or split the topic |
| Task file | ~15 lines | trim to what the next session needs |
