# Forge Decisions Log

Append-only record of non-obvious technical choices.

## Run 1 — 2026-04-26

### D001: Shared `_handler.js` wrapper, not a router framework
- **Karar:** Each Vercel function stays a default export; we share helpers via a thin `handler({method},fn)` wrapper instead of pulling in Express/Hono.
- **Neden:** Vercel discovers functions by file path. A router framework would force per-request cold-start of the routing layer with no benefit for 10 endpoints.
- **Alternatifler:** Single catch-all `[...slug].js` (loses Vercel's per-function cold-start isolation), Express (overkill).
- **Etkisi:** All endpoints rely on `_handler.js`; touching it touches all of them. Acceptable because validation should be uniform.

### D002: Filename validator rejects, sanitizer regex retired
- **Karar:** Replace `file.replace(/[^A-Za-z0-9._-]/g, '')` with `validateFilename(file)` that returns boolean. Reject on fail.
- **Neden:** Strip-based sanitization is implicit; a malicious `..%2f` becomes `..` which is still dangerous when interpolated. Reject-on-invalid is the only correct path-traversal posture.
- **Risk:** Existing trash/upload files with characters outside `[A-Za-z0-9._-]` will 400 on access. None known in current data.

### D003: Restore re-validates originDir against config.sources
- **Karar:** Trash restore reads `meta.json.originDir`, but only honors it if it matches an entry in `config.sources`. Falls back to `sources[0]` otherwise.
- **Neden:** The meta sidecar is on GitHub. If an attacker ever forged it, they could restore a file into an arbitrary repo path. Re-validation neutralizes this.

### D004: Scoring methodology — weighted by effort to move
- **Karar:** Run scores are weighted: Security 25%, Mimari 15%, Code Quality 15%, Performans 15%, UX 15%, Features 10%, DevOps 5%, Docs 5%.
- **Neden:** Security failures have unbounded downside; features cap at user-visible ROI. Polish (docs) plateaus fast.
- **Etkisi:** A +2 in Security (5.5→7.5) ≈ +0.5 weighted; same shift in Docs ≈ +0.1. Reflected in run reports.

## Run 2 — 2026-04-26

### D005: Module split deferred — keep monolithic index.html
- **Karar:** Skip the planned `js/grid.js` / `js/modal.js` extraction. Stay in single `public/index.html`.
- **Neden:** 805 lines is uncomfortable but not painful. The site is deployed; module-split refactor risks regression and gives ~+0.4 weighted points for ~5 hours of work. Same hours into perf/feature give >+1.0.
- **Risk:** If file grows past ~1500 lines with later runs, revisit. For now monolith wins on ship-velocity.

### D006: Admin token in sessionStorage by default, localStorage opt-in
- **Karar:** Promote sessionStorage as default; explicit "remember" prompt to copy into localStorage.
- **Neden:** XSS leak on localStorage persists across browser restarts. SessionStorage limits blast radius to one tab session. User can opt-in for the trade-off knowingly.
- **Side benefit:** Visible admin badge gives users situational awareness — they always know when they have purge powers.

## Run 7-9 — 2026-04-26

### D007: node:test, no test framework dependency
- **Karar:** Use Node 20+ built-in `node:test` runner instead of Vitest/Jest.
- **Neden:** Adding a test framework drags in 80+ MB of dev deps for 9 simple validator tests. `node:test` is built in, has TAP output, runs in 100ms.
- **Trade-off:** No `describe`/`it` nesting, no auto-mocking. Acceptable — our tests are flat unit tests.

### D008: CI tolerates missing manifest in template state
- **Karar:** `npm run validate` exits with `|| true` in CI workflow.
- **Neden:** This repo is a template; downstream installations populate `public/manifest.json`. Hard-failing CI on missing manifest would block merges in the template repo itself.
- **Hardening:** Production deployments should add `npm run validate` to their build step (without `|| true`) — covered in README.

## Run 10 — 2026-04-26

### D009: Stop at 9.4, do not chase 9.7+ in this cycle
- **Karar:** Forge cycle ends after Run 10 meta-analysis.
- **Neden:** Forge skill's 9.0+ threshold rule (D004 weighting). Diminishing returns curve: each next 0.1 costs more than the last. The remaining gaps (module split, drag-drop upload, AVIF) earn ~+0.1 each at non-trivial cost.
- **Re-entry signal:** Open a new forge run when (a) production telemetry shows a hot-path (b) a new asset category or workflow is added (c) the index.html crosses 2000 lines.

## Run 11 — 2026-04-26

### D010: Drag counter pattern + paste handler scoped to upload modal lifecycle
- **Karar:** Use the +1/-1 dragenter/dragleave counter (`_dropCounter`) to manage the `.over` highlight class, and bind the global `paste` listener only while the upload modal is open (added on `uploadFor`, removed in `cleanup()`).
- **Neden:** (a) `dragenter`/`dragleave` bubble like `mouseover`/`mouseout` — child elements (the "Gözat" button inside the drop zone) fire spurious leave events that would otherwise un-highlight the target. The counter neutralizes child-event noise without DOM-relative geometry checks. (b) A persistent global paste listener would steal Ctrl+V from text inputs (search, prompts) — scoping it to modal lifetime keeps clipboard paste predictable elsewhere.
- **Alternatifler:** `pointer-events:none` on children (breaks the browse button); `e.relatedTarget` check (browser inconsistencies); persistent global paste handler (UX regression).
- **Etkisi:** Drop-zone highlight is stable under any child-element hover. Paste from clipboard works only when an upload modal is the active context, which matches user mental model ("I clicked upload, now Ctrl+V means here").

## Run 12 — 2026-04-26

### D011: Rate-limit storage = in-memory `Map` per Vercel instance, not Vercel KV / Redis
- **Karar:** Use a process-local `Map<string,bucket>` token-bucket store in `api/_ratelimit.js`. Periodic sweep cleans stale entries; hard-cap at 5000 keys defends against IP-spoof flooding.
- **Neden:** A shared store (Vercel KV, Upstash Redis) would make the limit *correct* across concurrent function instances, but adds (a) a paid dependency, (b) a cold-start network hop on every request, (c) a new auth secret to manage. For a single-team admin tool with low concurrency, in-memory is "good enough for spec'd attack" — even at N concurrent instances the upload limit (30/min × N) caps the GitHub PUT throughput well below abuse thresholds. Documented the trade-off inline.
- **Alternatifler:** Vercel KV (correct, costs $$, +20-50ms p50), Upstash Redis (correct, +network), `@vercel/firewall` SDK (Vercel-only, ties us to platform), Edge Middleware (overhead for 10 routes).
- **Etkisi:** A motivated attacker rotating IPs can bypass — but that's true of any IP-keyed limit. The bucket store, headers, and policy table are stable; swapping in a shared store later is a one-file change to the `check()` body.

### D012: AVIF encoding settings tuned for pixel art (q75, effort 4, 4:4:4)
- **Karar:** Sharp AVIF settings: `quality: 75, effort: 4, chromaSubsampling: '4:4:4'`. Skip AVIF if larger than source.
- **Neden:** (a) `4:4:4` preserves hard 1-px boundaries critical for sprites — `4:2:0` smears edges. (b) `effort: 4` is libvips' new default (Sharp #4227) — effort 9 is 4-5× slower for ~5% size savings. (c) `quality: 75` hits the WebP-parity sweet spot per the OpenAVIF community benchmarks; `lossless: true` would be cleaner but blows file sizes past WebP for game-ready 256×256 sprites. (d) Skip-if-bigger keeps tiny icons (which compress poorly to AVIF) at their original WebP/PNG.
- **Alternatifler:** `lossless: true` (preferable for true pixel-perfect, but ~3× larger than lossy 75/4:4:4); `chromaSubsampling: '4:2:0'` (broader player support but blurs sprite edges); `effort: 9` (~5% smaller, 4× slower — kills build perf).
- **Etkisi:** Encoded AVIFs sit alongside originals as `.avif` siblings; manifest carries `avifSrc + avifSize`; `<picture>` chooses AVIF on supporting browsers, falls back to original. Pipeline is opt-in via `--avif` flag (D012 + D011 both stay zero-dep by default).

## Run 13 — 2026-04-26

### D013: Module split — native ES modules, no bundler, shared `state.js`
- **Karar:** Split `public/index.html` (1823 lines) into `index.html` (354 lines, CSS + markup only) + 12 ES modules under `public/js/`. Loaded via a single `<script type="module" src="js/main.js">`. State is a single mutable `store` object exported from `state.js` and mutated in place by other modules (no event bus, no proxies). The inline-onclick contract (`onclick="reviewAction(...)"` strings emitted by render templates) is preserved by `Object.assign(window, {...})` in `main.js` exposing exactly the 17 functions needed.
- **Neden:** D005 deferred this until ~1500 lines as monolith ship-velocity beat split-cost. We crossed the threshold (1812). Native modules ship in every modern browser; a bundler would add 80+ MB of devDeps and complicate the deploy. Keeping `store` mutable mirrors the legacy global-pinned model — the safest refactor (zero behaviour change). A reactive store is a future migration when the surface justifies the API design cost.
- **Alternatifler:** (a) Vite/esbuild bundler (build step + lockfile churn for ~10 modules), (b) per-module event bus / signals (would force every read to go through accessors — invasive), (c) classes per module (overkill for stateless renderers).
- **Etkisi:** Module surface is now greppable (`grid.js` 337 lines, all others ≤252). Inline onclick remains because the alternative (rewriting render to attach listeners) would have doubled the diff. Future runs can migrate inline onclick → delegated event handler bindings on `#grid` once render is itself in a module — small follow-up.

### D014: Optional shared rate-limit store via Upstash Redis REST, env-detected
- **Karar:** Add a second backend to `_ratelimit.js`: when `KV_REST_API_URL` + `KV_REST_API_TOKEN` (legacy Vercel KV env names retained after the Dec 2024 Upstash migration) or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are present, use `@upstash/redis` via `createRequire` to do an `INCR` + `EXPIRE` per (route, ip, windowStart) key. `@upstash/redis` is NOT in `package.json` — install on the host that opts in. Sliding window is approximated by per-window-bucket counters (one key per minute), which is precise enough for IP rate limiting and avoids the cost of full sliding logs. On any KV error we fail open to the in-memory store.
- **Neden:** D011 documented the in-memory caveat ("effective rate ≈ N × configured under high concurrency"). For an admin tool that's fine; for production deploys with multiple instances, a shared store is correct. `@vercel/kv` was deprecated Dec 2024 with all stores migrated to Upstash Redis, so `@upstash/redis` is the canonical choice. Keeping it as an optional peer dep means zero cost when not used. The middleware exposes both `applyRateLimit` (sync, in-memory) and `applyRateLimitAsync` (KV-aware) so endpoints can opt in without breaking the existing handler chain.
- **Alternatifler:** (a) `@upstash/ratelimit` package — would force the dep + duplicate our policy table; (b) hard-require `@upstash/redis` — kills the zero-dep template promise; (c) full sliding-log algorithm (Sorted Sets) — 4× the Redis ops per check for marginal accuracy on a 1-minute window.
- **Etkisi:** Production deploys add two env vars + one `npm i @upstash/redis` to get cluster-correct rate limits. Existing tests stay green (in-memory path unchanged); 4 new KV-mock tests cover the shared-store happy/error paths. `_handler.js` still calls the synchronous `applyRateLimit` — switching to `applyRateLimitAsync` is a one-line change when an operator turns KV on.

## Run 14 — 2026-04-26

### D015: `/api/health` shape — degraded only on missing_count > 0; detail gate behind admin token
- **Karar:** `status: "degraded"` is triggered only when `assets.missing_count > 0` (at least one missing asset). The `?detail=1` query parameter unlocks verbose output (env key names, full POLICIES table, `process.memoryUsage()`) but only when the request also passes `isAdmin()` check (valid `X-Admin-Token` header or `?admin=` param). Without admin, `?detail=1` is silently ignored — no error, just no `details` key.
- **Neden:** (a) Missing assets are the only business-meaningful health signal in this system — a non-zero count means the game has unresolved asset gaps. Other degraded signals (KV network blip, cold start) are transient and shouldn't pollute the status. (b) Env key names (not values) are safe to expose to an admin — useful for debugging "is UPSTASH_REDIS_REST_URL set?" without a Vercel dashboard visit. Exposing values would be a secret leak. (c) Silent ignore on `?detail=1` without admin is intentional: returning 403 would tell attackers that the `detail` param exists; returning normal output leaks nothing.
- **Alternatifler:** (a) Degrade on KV error — rejects transient network issues as structural failures; (b) Expose env values — obvious secret leak; (c) Return 403 on unauthorized detail request — reveals endpoint capability to probers.
- **Etkisi:** `GET /api/health` is safe to call from public monitoring (no secrets, no sensitive internals). `GET /api/health?detail=1&admin=TOKEN` gives ops teams full state in one call.

### D016: Claude-Gemini model split — Claude orchestrates, Gemini implements
- **Karar:** Run 14 used a two-model split: Claude Sonnet 4.6 (Jarvis) handled context reading, web research, prompt engineering, verification, and commit; Gemini CLI (`gemini -y`) handled all file reads, code writes, and self-correction during implementation.
- **Neden:** Gemini CLI runs in YOLO mode (`-y`) with direct filesystem access — it can read multiple files autonomously, write changes, run tests, and self-correct without a human in the loop. This is faster than orchestrating Claude sub-agents for implementation tasks where the spec is fully defined upfront. Claude's value is in the research + planning + verification layer, not in the mechanical file editing.
- **Trade-offs observed:** (a) Gemini self-corrected two issues internally (manifest path, ESM mock pattern) — these would have required explicit retry prompts if Gemini were less capable. (b) Gemini's test mocking approach (mocking `node:fs` synchronous methods to intercept `readConfig`) is slightly fragile — if `_config.js` switches to async I/O, the mock breaks. Documented. (c) Single invocation was sufficient; the full spec in one prompt worked better than iterative prompting.
- **Etkisi:** This pattern (Claude researches + plans, Gemini implements) is viable for well-scoped features where the spec can be written as a complete prompt. Not suitable for exploratory work where requirements emerge during implementation.
