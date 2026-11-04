---
name: capture-lessons
description: End-of-task retrospective that turns what a task taught — mistakes Claude made (corrections from the user, bugs caught in code/MR review, work that had to be redone) and approaches that worked (a non-obvious solution the user confirmed, a fix that took digging to find) — into reusable lessons in memory, merges them with lessons already recorded (bumping a "seen N×" counter instead of duplicating), updates the task's working notes, and keeps the always-loaded memory index within a fixed size budget. Use when the user asks to capture/save/record lessons, do a retro, "remember this for next time", or to clean up, compact or reorganise memory / MEMORY.md. Also offer it (one short question, not automatically) right after a task milestone — the user says the work is committed, pushed, the MR/PR is opened or merged, or review fixes are done — but only if this task produced new corrections since the last capture.
---

# capture-lessons

Two aims: the next task should not repeat this task's mistakes nor rediscover
what this task had to work out the hard way, and the memory
that makes that possible must stay small, because part of it is loaded into
every session. When in doubt, prefer fewer, sharper lessons over more.

Size is controlled here, on every run — there is no separate cleanup job. Each
run leaves the always-loaded parts (the `MEMORY.md` index and the global
section of `~/.claude/CLAUDE.md`) within budget, so memory cannot creep.

Read `references/format.md` first; it defines where each kind of memory lives
and the exact file shapes. Reply to the user in whatever language they are
using; write memory content in the language the existing memory files already
use (fall back to the user's language).

## When to offer it unprompted

At a milestone (commit, push, MR opened, review fixes pushed, merged), ask one
short question offering to capture lessons — only if something in this task
actually went wrong and got corrected since the last capture (`last_capture`
in the task file). A task that is pushed five times should not be asked five
times. If nothing was corrected, stay quiet.

## Steps

### 1. Identify the task

Find the task id (format.md §5) and open `task_<id>.md` if it exists. When the
user only asked for a cleanup, there may be no current task; skip to step 6.

### 2. Gather candidate lessons

1. **This session** — every point where the user corrected you, rejected an
   approach, undid something you did, or where review (human or tool) found a
   defect in your work. Recall the actual moment; vague memories make vague
   rules.
   Also the **approaches that worked**: a non-obvious choice the user
   confirmed ("yes, do it that way"), or a solution that took several attempts
   or real investigation to find. These are easy to miss because nothing went
   wrong — but rediscovering them next time costs as much as a mistake.
2. **The inbox** — loose `feedback`/`project` files that auto-memory wrote
   (format.md §3). They carry corrections from earlier sessions of a
   multi-session task that this session cannot see.
3. **The task file** — anything noted there as a correction or gotcha.

### 3. Filter: would this happen again on a different task?

Keep a candidate only if a *different* future task could plausibly hit the
same mistake or need the same approach. Judge by the cause, not the subject:

- "Ran prettier and it reformatted unrelated lines" → keep (any task can).
- "Backend-imported rows can lack the name field; show the code as fallback" →
  keep (any screen over that data can hit it).
- "Reading the backend command's source settled the field names; the desktop
  client's model was misleading" → keep (an approach every integration task
  can reuse).
- "The approve button on screen X should be green" → drop (this screen only).
- "User picked option B for this report's layout" → not a lesson; it is a
  decision, and belongs in the task file.

Dropping is a good outcome. A lesson file full of one-off trivia trains the
reader to skim.

### 4. Decide scope

- **Global** (format.md §7) when the rule says nothing about this codebase,
  stack or team — how the user likes commits, reply language, asking before
  risky actions.
- **Project** (a topic file) otherwise.

### 5. Merge, don't append

For each lesson, look for existing rules in the same area — in topic files,
the archive and the global section. Shortlist from titles first, then read only
the shortlisted rules in full:

```bash
node "<this skill's base directory>/scripts/lesson-titles.mjs" --archive            # every rule, one line each
node "<this skill's base directory>/scripts/lesson-titles.mjs" --archive --grep "HModal|onClose"
node "<this skill's base directory>/scripts/lesson-titles.mjs" --show "HModal"       # full text of the matches
```

`--grep` searches title, How to apply, Except and trigger patterns, so grep
for the component, command or path the candidate is about, not only its
wording. Shortlist generously — every title in the candidate's topic plus every
grep hit — and open each shortlisted rule; the same mistake is often worded
differently, and a title alone never settles whether two rules are the same. Most real cases are *similar but not
identical*, so classify each candidate against the closest rule by asking:
**had the existing rule been followed exactly as written, would it have
prevented this?**

| Answer | Example (existing rule: "never run prettier on whole files") | Action |
|---|---|---|
| Yes — same mistake | prettier run on a whole file again | Same rule; see the bullets below (count, slip, strengthen) |
| No, but same root cause | `eslint --fix` reformatted a whole file | **Generalise** the rule ("never run a formatter or auto-fixer over whole files"), keep both tools as examples, bump `Seen`. Not a slip — the rule was too narrow, not ignored |
| No — the rule needs an exception | "resize before upload" broke signature images, which must stay sharp | Add an `Except:` line to the rule; do not bump `Seen` |
| No — different cause, same area | uploads failed because the file-count limit was missed | New rule in the same topic file |

When generalising, keep the concrete examples in the rule. A rule abstracted
into "be careful with formatting" no longer tells anyone what to do.

Then:

- **An approach already recorded, used again** → bump `Seen` and add the task
  id. That it was reused is the signal it is worth keeping near the top.
- **A mistake already recorded before this task started** → the rule did not
  prevent the mistake. Bump `Seen`, add the task id, bump `slipped`, and *strengthen*
  it: rewrite **How to apply** as a concrete trigger ("before running any
  formatter…"), and if the action is concrete enough give it a `**Trigger:**`
  line (format.md §2) — a slip is the clearest sign that being written down was
  not enough. When the wrong code itself has a recognisable shape, add a second,
  *mistake-shaped* trigger at `ask` that matches only the wrong form (e.g.
  `content \`/<HModal\b[^>]*onClose=\{(?!HMODAL_ON_CLOSE_RONG\})/\` · ask`):
  correct code passes silently, wrong code stops for the user. A slip with no
  code pattern gets a `**Checkpoint:**` line instead (below); spell it out in its
  index hook as well. If it is a global-type
  rule living in a project file, move it to the global section, which is always
  loaded in full.
- **Found in the archive** → move it back to its topic file; it is a slip.
- **First recorded during this same task** → same occurrence; do not
  double-count.
- **No match** → add it to the best-fitting existing topic file; create a new
  topic file only when none fits.

Keep rules ordered by `Seen` and update each file's `seen` / `last_seen`.

Write every title so that it can be judged without the body: name the concrete
component, command or path, the trap, and the fix ("HModal: onClose fires 250ms
after close — pass a no-op onClose"). Titles are what the shortlist step and
the hook reminder show; a vague title ("modal bug") makes the rule unfindable.

For every new or changed rule, ask whether it is tied to a concrete file path,
command or code pattern. If so, add a `**Trigger:**` line (format.md §2) so the
hook can raise it while Claude is coding — that is what turns a recorded lesson
into one that is actually applied. Default to `remind`; use `block` only when
the user has said "never". List triggers you added in the report.

A rule that needs judgment and has no code pattern (keep project-wide patterns,
verify each review point, ask before committing) gets a `**Checkpoint:**` line
naming the moment it must be checked — `commit`, `mr` and/or `review`. The hook
lists checkpoint rules by title every time that moment comes, so they no longer
depend on being remembered from the index.

### 6. Housekeeping (every run)

This is what keeps memory from growing, so do it even when step 3 kept nothing.

- **Digest the whole inbox**, not only this task's files. Lessons go through
  steps 3–5; task notes go into the matching `task_<id>.md`; durable facts
  become `type: reference`; delete each loose file once its content has a home.
- **Retire merged tasks.** For each task file, check whether its branch is
  merged into the default branch (e.g. `git branch -a --merged <default>`,
  or the task id appearing in `git log <default>`). For each merged one,
  extract anything reusable (format.md §5), then delete it. If git cannot
  tell, ask rather than guess.
- **Fix misplaced scope** — project-independent rules sitting in project
  memory move to the global section.

The first run on an existing memory dir may have a lot to digest. When the
plan touches more than a handful of files, show it and get a yes before
applying.

### 7. Rebuild the index and enforce budgets

Rewrite `MEMORY.md` per format.md §6. Then check the budgets (format.md §8). If
the index or global section is over, bring it under by, in order: merging
overlapping topics or entries, then archiving the rules with the lowest `Seen`
and oldest `last_seen`. Never archive a rule that slipped in this run.

### 8. Update the task file

Bring `task_<id>.md` up to date (commits, what is pending, decisions) and set
`last_capture` to today. Add to `corrections` the number of times since the
last capture that the user or a reviewer had to fix something Claude got
wrong — including ones dropped as task-specific. A new preference or decision
("make the button green") is not a correction, and neither is a bug Claude
found and fixed on its own. Over many tasks this is how the user sees whether
mistakes are actually going down.

Before deleting a merged task file, append one line for it to
`lesson_stats.md` (format.md §5) so the trend survives the task.

### 9. Report

A compact summary, one line per change:

```
+ lesson_code-style: "Never run prettier on the whole file" (new)
↑ lesson_media-upload: "Resize/compress images before upload" 2× → 3×, slipped — hook strengthened
⇄ lesson_code-style: "prettier on whole files" → generalised to "any formatter/auto-fixer on whole files" (+eslint --fix), 1× → 2×
± lesson_media-upload: "Resize before upload" — Except: signature images
⚑ lesson_code-style: trigger bash `/\bprettier\b/` · block
→ global: "No Co-Authored-By trailer" moved from project memory
- inbox: feedback_prettier.md (merged)
- task_ABC-12 (merged, deleted; repo location kept as reference)
skipped: "approve button colour" (task-specific)
index: 34 → 27 lines
```

## Confirmation

If the user asked for this, apply the changes and show the summary — they can
tell you to undo any line (except the large first-run case above). If you
offered at a milestone, wait for a yes before writing anything. Changes to
`~/.claude/CLAUDE.md` are always named explicitly in the summary, since they
affect every project.
