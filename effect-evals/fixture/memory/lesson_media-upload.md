---
name: lesson-media-upload
description: Media upload — resize before upload
metadata:
  type: feedback
---

## Resize/compress images before upload
Seen 2× — SHOP-66, SHOP-80 · last 2026-11-05

Every photo goes through resizeImage() from src/utils/image.ts before uploadFile().
Except: signature images stay original PNG.
**Why:** Review caught 8 MB uploads.
**How to apply:** Whenever a screen uploads a photo, call resizeImage first.
