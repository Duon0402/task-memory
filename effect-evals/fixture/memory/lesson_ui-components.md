---
name: lesson-ui-components
description: UI components — don't touch shared base components
metadata:
  type: feedback
---

## Never modify shared base components without asking
Seen 1× — SHOP-59 · last 2026-10-20

Base components in src/components/Base* are used app-wide; changing them breaks other screens.
**Why:** User rejected an edit to a shared component.
**How to apply:** Solve it in the screen (wrap, compose) or ask before editing the base component.
