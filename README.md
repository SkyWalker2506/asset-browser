# asset-browser

Reusable asset browser for game/creative projects. Scans project asset dirs, generates a searchable/filterable web UI, handles "missing assets" workflow with prompts + upload + review. Static site + Vercel serverless API + GitHub-backed storage — no database.

## Features

### Browse
- Grid of all assets across configured source directories
- Smart search with operators: `cat:building tag:hd type:animasyon !tag:idle`
- Auto-derived tags (size class, frame count, semantic patterns)
- Sort by name / size / dimension / date
- IntersectionObserver lazy load + sprite-anim parking for fast galleries
- Animation strip preview (auto-detects N-frame layouts from filename + dim)
- Saved filters bar — name your favorite combos, one-click apply

### Missing-asset workflow
- Tabs: Mevcut, Eksik, Bekleyen, Reddedilen, Çöp
- Per-item prompt copy + upload (PNG/WebP/GIF/JPEG, 20 MB cap)
- Review status: todo → in-progress → waiting-for-review → approved/denied
- Trash with restore (15s undo + permanent restore from Çöp tab)
- Bulk operations: shift-click range, Ctrl+A, bulk delete/restore/clear (5-way concurrent)
- Duplicate filename warning on upload

### Keyboard
- `/` focus search · `Esc` clear/close · `?` help
- `j`/`k` navigate · Enter open · `x` select
- `g h/t/w/d` switch tabs · `dd` delete selected
- `Ctrl+Shift+T` toggle admin mode

## Accessibility

- **Skip link**: Press Tab on page load to reveal "İçeriğe geç" — jumps directly to the asset grid
- **Landmarks**: `<header role="banner">` and `<main>` wrapping grid + filters; modals use `role="dialog" aria-modal="true"`
- **Grid navigation**: Arrow keys move between asset cards (roving tabindex pattern); Home/End jump to row start/end; Ctrl+Home/End to first/last card
- **Screen reader announcements**: Filter result counts, selection counts, and bulk action outcomes are announced via `aria-live="polite"` region (200 ms throttle)
- **Keyboard shortcuts**: Full chord system (j/k, g h/g t/d d) documented in `?` help overlay
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables sprite animations and CSS transitions
- **ARIA labels**: All interactive controls (search, filters, select elements, checkboxes) carry `aria-label` attributes
- **Selection state**: Asset cards carry `aria-selected="true/false"` updated on each selection change

## Security
- Strict input validation on every API endpoint (name regex, filename whitelist, size cap)
- Path traversal hardening: reject-on-invalid, segment validation, restore re-checks against `config.sources`
- Admin token in sessionStorage by default (localStorage opt-in via prompt)
- GitHub token never leaks into error responses
- ETag/304 free hits on `/api/missing` and `/api/uploaded`
- Per-IP rate limiting on every endpoint (token-bucket): 30 uploads/min, 10 destructive ops/min, 240 reads/min, 120/min default. 429 + `Retry-After` on overflow. Admin token bypasses (logged). Set `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) and `npm i @upstash/redis` to opt into a shared sliding-window store across instances; otherwise per-instance in-memory is used.
- Security headers: `vercel.json` sets HSTS, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy, COOP, and a strict Content Security Policy (CSP) with no `unsafe-inline` for scripts.

### A11y
- Modal focus trap (Tab cycle), ARIA dialog roles, aria-labels on filters
- `prefers-reduced-motion` disables sprite anims + transitions
- Visible keyboard focus ring on cards (`j`/`k` navigation)

## Install into a project

```bash
cd ~/Projects/asset-browser
./install.sh /path/to/YourProject YourGitHubUser/YourRepo
```

This creates `YourProject/asset-browser/` with `config.json`, scripts, api, public. Edit `config.json` to point at your asset dirs.

## Per-project config

`config.json`:
```json
{
  "title": "My Game",
  "projectRoot": "..",
  "sources": [
    { "dir": "public/assets", "category": "Runtime", "tag": "game" },
    { "dir": "assets/raw", "category": "Raw", "tag": "raw" }
  ],
  "github": { "owner": "user", "repo": "repo", "branch": "main" },
  "uploadPath": "asset-browser/data/uploads"
}
```

## Deploy

```bash
cd YourProject/asset-browser
npm run build
vercel --prod
vercel env add GITHUB_TOKEN production   # token with `Contents: read+write`
vercel env add ADMIN_TOKEN production    # any random string for trash purge
vercel --prod                            # redeploy with env
```

## Develop / Test

```bash
npm run dev          # build manifest + serve public/ on :5174
npm test             # node:test (validators + rate-limit + module split, 26 tests)
npm run lint         # syntax check all api/* + scripts/*
npm run validate     # JSON shape check on manifest + missing + config
npm run smoke        # E2E smoke test (status codes + content)
npm run perf         # Check size budgets for all assets
npm run ci           # lint + test + validate + smoke + perf (run by GitHub Actions)

- [Performance](./docs/PERFORMANCE.md)
- [Architecture](./AGENTS.md)
```

### Client structure

`public/index.html` carries only the markup + inline CSS (~350 lines). All
JavaScript lives in `public/js/*.js` as native ES modules loaded via
`<script type="module">`. Modules: `state` · `util` · `api` · `search`
· `stats` · `modal` · `grid` · `upload` · `actions` · `selection`
· `keyboard` · `main` (entrypoint). No bundler — modern browsers load the
graph natively.

### Optional: AVIF variants

`npm run build -- --avif` (or `ASSET_AVIF=1 npm run build`) produces an `.avif`
sibling for every asset using `sharp` (pixel-art settings: q75 / effort 4 /
4:4:4 chroma). The client emits a `<picture>` element with AVIF first and the
original as fallback. AVIF cuts payloads ~20–30% vs. WebP in our benchmarks
but adds an encode step at build time, so it stays opt-in. `sharp` is NOT a
package.json dependency — install it on the build host (`npm i -D sharp`)
when enabling.

CI runs on every PR and push to `main` — see `.github/workflows/ci.yml`.

## API endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/missing` | GET | — | Live missing.json (ETag-aware) |
| `/api/uploaded?file=` | GET | — | Proxy uploaded image (with stale-while-revalidate) |
| `/api/upload` | POST | — | Upload base64 file + flip status to waiting-for-review |
| `/api/review` | POST | — | approve / deny / reopen |
| `/api/missing-patch` | POST | — | Patch status / uploadedFile / denyReason |
| `/api/delete` | POST | — | Move uploaded + runtime files to trash |
| `/api/asset-delete` | POST | — | Move a single runtime asset to trash |
| `/api/clear` | POST | — | Remove an entry from missing.json (asset stays) |
| `/api/trash` | GET | — | List trash (public, metadata stripped) |
| `/api/trash` | POST | restore: — / purge: admin | Restore or hard-delete |

All POST endpoints require `name` to match `^[a-z0-9][a-z0-9_-]{0,99}$/i`. Filenames are whitelisted to alphanumeric + `._-` only; no slashes, no `..`. Admin endpoints require `X-Admin-Token` or `?admin=` matching `ADMIN_TOKEN` env.

## Missing items schema (`data/missing.json`)

```json
{
  "items": [{
    "name": "fire_loop_6f",
    "kind": "FX",
    "type": "Animasyon",
    "priority": "P0",
    "status": "todo",
    "notes": "short human note",
    "prompt": "Full GPT prompt to generate this asset…"
  }]
}
```

Status enum: `todo | in-progress | waiting-for-review | approved | denied | blocked`. When `denied`, add `denyReason`.
