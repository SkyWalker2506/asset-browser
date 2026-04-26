# Performance

This project enforces strict performance and size budgets to ensure a fast, lightweight experience even on low-end devices.

## 1. Automated Budgets

Size budgets are enforced automatically in CI via `npm run perf`.

### Hard Budgets (Fail CI)

| Category | Threshold |
|---|---|
| Single JS file | ≤ 25 KB raw |
| Total `public/js/*.js` | ≤ 80 KB raw |
| `public/index.html` | ≤ 35 KB |
| Single locale JSON | ≤ 8 KB |
| `public/sw.js` | ≤ 8 KB |

### Soft Warnings

| Category | Threshold |
|---|---|
| Any single asset (image, icon) | > 50 KB |
| Total `public/` directory | > 1 MB |

## 2. Lighthouse CI

We use Lighthouse CI for deep performance, accessibility, and PWA audits.

### Manual Run

Lighthouse is NOT a project dependency to keep the install footprint zero. You can run it manually if you have `@lhci/cli` installed globally:

```bash
npm i -g @lhci/cli
lhci autorun
```

The configuration is located in `lighthouserc.json`.

## 3. Applied Optimizations

- **AVIF Support**: Optional high-efficiency image encoding for sprites.
- **Lazy Loading**: Native `loading="lazy"` on grid images.
- **Service Worker**: Cache-first strategy for static shell (JS, CSS, Icons, Locales).
- **ES Modules**: Native ESM avoids bundler overhead and enables fine-grained caching.
- **Zero Dependencies**: Zero runtime and zero development npm dependencies (except for optional dev tools like Lighthouse).
- **No Bundler**: Ships raw optimized files directly, reducing build complexity and time.
