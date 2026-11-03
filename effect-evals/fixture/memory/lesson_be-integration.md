---
name: lesson-be-integration
description: BE integration — model on BE cmd, fallback for missing names
metadata:
  type: feedback
---

## Read the backend command before modelling fields
Seen 2× — SHOP-12, SHOP-70 · last 2026-11-03

Model mobile types on the BE command's fields (source in ../shop-api/src/cmd), not on shop-desktop — desktop names differ.
**Why:** Desktop-based models got field names wrong.
**How to apply:** Open the cmd source first and copy its field names.

## Fall back to the code when a name is missing
Seen 1× — SHOP-70 · last 2026-11-03

Batch-imported rows can have a null name; render itemName ?? itemCode, never undefined or blank.
**Why:** UI showed 'undefined'.
**How to apply:** Any name/label from BE data gets a code fallback.
