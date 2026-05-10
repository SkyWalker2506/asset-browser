# Image Editor — Integration Guide

`public/lib/image-editor.js` is a self-contained, non-destructive in-browser sprite editor for game assets.
It ships with a companion `video-to-strip.js` for extracting animation strips from video files.

## Files

| File | Purpose |
|------|---------|
| `public/lib/image-editor.js` | Core editor (v0.5.3) — crop, resize, slice, anim-cell editor |
| `public/lib/image-editor.css` | Styles (load before the JS) |
| `public/lib/video-to-strip.js` | Optional: video-to-sprite-strip mode |

## Quick start

```html
<link rel="stylesheet" href="lib/image-editor.css">
<script src="lib/image-editor.js"></script>
<script src="lib/video-to-strip.js"></script> <!-- optional -->
```

```js
const editor = window.ImageEditor.mount({
  container: document.getElementById('editor-host'),
  src: '/assets/my-sprite.png',
  assetName: 'my-sprite',
  onApply(edits) {
    // edits.canvas  — HTMLCanvasElement with result
    // edits.edits   — compact edit descriptor array
  },
  onSliceApply(slices) {
    // slices — array of { name, canvas, x, y, w, h }
  },
  onCancel() { /* user dismissed */ }
});

// Later:
editor.destroy();
```

## Key features (v0.5.3)

- Crop / resize / flip / hue-shift / brightness / contrast (non-destructive stack)
- Slice mode: auto-grid or manual per-cell drag handles
  - Apply shows inline status "Applied N slices" for 3 s then auto-hides
- Animation-cell editor: drag left edge of a cell now guards against overlapping the previous cell (`prev.x + 1 + paddingX` minimum), fixing off-by-one collapse
- Video-to-strip: record or load a video, pick frame range, export as sprite strip

## Changelog

### v0.5.3
- `slice apply` shows inline success status label for 3 s
- drag-resize left edge: `minX = prev.x + 1 + animPaddingX` guard prevents prev-cell collapse
- recompute only cells AFTER `cellIdx` on left-edge drag (was recomputing from index 1, overwriting the just-set `x`)

### v0.5.2
- (previous release in fork)

### v0.4.0
- `mountVideoToStrip` companion API added
