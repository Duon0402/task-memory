---
name: lesson-code-style
description: Code style in shopapp — never run prettier on whole files
metadata:
  type: feedback
  seen: 1
  last_seen: 2026-09-12
---

## Never run prettier on whole files
Seen 1× — SHOP-48 · last 2026-09-12

Do not run prettier (or any formatter) over a whole file; it reformats unrelated lines and bloats the diff.
**Why:** User reverted a 400-line formatting diff on SHOP-48.
**How to apply:** Edit only the lines you change; leave existing formatting alone.
