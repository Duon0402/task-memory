---
name: lesson-code-style
description: Code style — no whole-file formatting
metadata:
  type: feedback
---

## Never run a formatter or auto-fixer over whole files
Seen 3× — SHOP-48, SHOP-66, SHOP-80 · last 2026-11-05 · slipped 1×

The existing files are not prettier-formatted; running prettier or eslint --fix (or npm run format) reformats every line and buries the real change.
**Why:** User reverted formatting-only diffs three times.
**How to apply:** Before running any formatter, don't. Match the surrounding file's style by hand on the lines you add.
