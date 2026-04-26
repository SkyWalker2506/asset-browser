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

## Run 15 — 2026-04-26

### D017: Scoring rubric expanded to 11 categories — ceiling reset
- **Karar:** Old 8-category rubric (D004) retired; new 11-category rubric adds A11y (5%), i18n (5%), PWA (4%), Observability (4%). Weights re-normalized to 100%: Mimari 10%, Güvenlik-hardening 12%, Güvenlik-CSP/headers 8%, Performans 12%, UX 12%, Code Quality 10%, DevOps 5%, Docs 5%, Features 8%, A11y 5%, i18n 5%, PWA 4%, Observability 4%.
- **Neden:** Old rubric hit 10.0/10 in Run 14 (ceiling). That reflects "no gaps visible in those 8 dimensions" — not "production perfect." Four real production gaps were unmeasured: assistive technology support (A11y), multi-language support (i18n), offline-first capability (PWA), and operational metrics/alerting (Observability). Adding these categories with honest scores (A11y ~7, i18n 0, PWA 0, Observability ~5) pulls the composite score to ~7.92 — which is the correct honest reflection of where the project stands.
- **Etkisi:** Effective score reset from 10.0 (old) to ~7.92 (new rubric start). Each run now has measurable upside in any of the 4 new categories. The ceiling is genuinely higher — earning 10.0 on the new rubric would require WCAG AAA compliance, a working i18n layer, a service worker with offline support, and a metrics/alerting stack.

### D018: Security header choices — specific values and rationale
- **Karar:** `vercel.json` sets 7 headers for all routes via `source: '/(.*)'`:
  1. `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` — 2-year HSTS with subdomain coverage and preload eligibility. Standard Vercel value, now explicitly set at application layer for auditability.
  2. `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing attacks where a browser tries to "guess" content type from content. Mandatory for any site serving user-uploaded files (which this does via the asset upload flow).
  3. `X-Frame-Options: DENY` — prevents clickjacking. DENY (not SAMEORIGIN) because no legitimate use case for framing this tool in another page. Redundant with CSP `frame-ancestors 'none'` but kept for older browser compatibility.
  4. `Referrer-Policy: strict-origin-when-cross-origin` — sends full referrer on same-origin navigations (useful for analytics), only the origin on cross-origin HTTPS, and nothing on cross-origin HTTP. Balances analytics usefulness with privacy.
  5. `Permissions-Policy: camera=(), microphone=(), geolocation=()` — explicitly locks out three sensor APIs that a game asset browser has no business accessing. Defence-in-depth against supply-chain XSS that tries to access hardware.
  6. `Cross-Origin-Opener-Policy: same-origin` — prevents other browsing contexts from retaining a reference to this window. Blocks window.opener cross-origin attacks. Required for some SharedArrayBuffer features (not used here, but correct posture).
  7. `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self';` — strict CSP. `script-src 'self'` with no unsafe-inline (all inline onclick attributes removed). `style-src 'unsafe-inline'` kept because all CSS is in a static `<style>` block in index.html — no XSS risk since style blocks don't execute. `img-src data: https:` needed for base64 image previews in upload flow and potential external CDN image sources in game assets.
- **Neden:** Set via `vercel.json` headers (not `<meta>` CSP tag) because (a) header-form CSP is stricter — `frame-ancestors` and `form-action` directives are ignored in meta-tag CSP; (b) headers apply to all routes including API routes, not just the HTML page; (c) vercel.json headers are auditable in source control with the same commit history as the code.
- **Alternatifler:** (a) Meta-tag CSP — weaker, can't set frame-ancestors; (b) Vercel middleware for dynamic nonce injection — enables removing style unsafe-inline too, but adds a cold-start edge function on every request for a static site; (c) Per-route header configuration — unnecessary complexity for a single-page app.
- **Etkisi:** All Vercel deployments of this template now get the full security header suite by default. The headers are tested via `api/_headers.test.js` (smoke test reads vercel.json and asserts header presence + CSP script-src correctness). Test count: 31 → 32.

## Run 16 — 2026-04-26

### D019: A11y CI check — lightweight static structural test, not axe-core + Playwright
- **Karar:** `api/a11y.test.js` uses plain `node:test` + `fs.readFileSync('public/index.html')` + regex assertions to verify structural ARIA presence (skip-link, landmarks, dialog roles, live region, aria-labels). No Playwright, no jsdom, no axe-core at runtime.
- **Neden:** axe-core requires a browser runtime (Playwright/Puppeteer/jsdom) to execute — adding it would (a) add 30-80 MB of dev deps, (b) require a headless browser in CI (adds ~30s build time), (c) catch the same structural issues that static regex can catch, plus dynamic issues (contrast, focus order) that we can't fix without a visual renderer anyway. The static check covers ~80% of the value: it gates against regressions in landmark presence, role attributes, and aria-label existence. Dynamic A11y coverage (colour contrast, keyboard focus order correctness, live region actual firing) is left for manual testing or a future dedicated a11y CI job.
- **Alternatifler:** (a) `@axe-core/playwright` — correct, but adds Playwright as dev dep and a headless Chrome process to CI; (b) `axe-core` + jsdom — jsdom doesn't render CSS so contrast checks fail silently; (c) `pa11y-ci` — requires a running HTTP server, adds network hop; (d) no CI check at all — regresses on every refactor.
- **Etkisi:** 8 new tests in `api/a11y.test.js` run as part of `npm run test` (now 40 total). Also available standalone via `npm run a11y`. Future runs can upgrade to Playwright axe-core when the CI environment supports it — the test file is the extension point.

## Run 17 — 2026-04-26

### D020: Three-stream parallel Gemini brief (i18n + PWA + observability) in one invocation
- **Karar:** Single Gemini CLI invocation with one combined brief covering three independent feature streams. No separate per-stream agents.
- **Neden:** The streams touched mostly disjoint files (locales/*, sw.js, _logger.js are entirely new; index.html and main.js were the only shared touchpoints). Splitting into three Gemini processes would have caused merge conflicts on index.html (manifest link + offline banner + lang switcher + data-i18n attributes) and main.js (i18n + pwa imports). One brief, one pass, one diff is faster and conflict-free.
- **Alternatifler:** (a) Three sequential Gemini calls — works but 3× the orchestration overhead; (b) Three parallel Gemini processes — file conflicts on shared files; (c) Manual orchestration — slower and forgoes Gemini's autonomous read-many-files capability.
- **Etkisi:** 8 modified + 13 added files in one diff, 51/51 tests pass on first run, no rework. Pattern reusable for future runs whose work streams have low file overlap (≤2 shared files).

### D021: i18n missing-key fallback returns the key, warns once
- **Karar:** `t('foo.bar.missing')` returns the literal `'foo.bar.missing'` and console.warns once per missing key (not per call). No throw, no empty string.
- **Neden:** Returning the key keeps the UI rendering (so the bug is visible but the page doesn't crash). One warn per key keeps the console signal-to-noise high — repeated calls don't spam. An empty string would silently delete UI text, making the bug invisible.
- **Alternatifler:** (a) Throw on miss — crashes the UI for any production string drift; (b) Empty string fallback — silent UI degradation; (c) Warn every call — console flood.
- **Etkisi:** New strings without locale entries surface immediately in dev (visible key in UI, console warning) but degrade gracefully in production (no crash).

### D022: SW cache name uses `ab-v1` semver, activate purges everything not matching
- **Karar:** `CACHE_VERSION = 'ab-v1'` constant. Install precaches into that name. Activate iterates `caches.keys()` and deletes any name starting with `ab-` that doesn't equal CACHE_VERSION. Foreign cache names (other apps on the same origin) are left alone.
- **Neden:** Bumping CACHE_VERSION (to `ab-v2` etc) on a SW logic change is the canonical way to force-purge stale caches. Restricting purge to `ab-` prefix means we don't accidentally delete other apps' caches if the asset-browser is one of several PWAs on the same origin.
- **Alternatifler:** (a) Static cache name — old caches accumulate forever; (b) Date-based name — every deploy invalidates everything (kills cache benefit); (c) Delete all caches on activate — destructive to other apps.
- **Etkisi:** SW logic changes need a CACHE_VERSION bump (manual but obvious). One-line change. Old caches removed on first activate after the bump.

### D023: Observability — privacy-preserving IP hash with daily salt
- **Karar:** `hashIp(ip)` returns `sha256(ip + DAILY_SALT).slice(0, 8)` where `DAILY_SALT = String(Date.UTC(year, month, date))`. Same IP same UTC day = same hash (useful for "is this 1 user or 100?"). Different day = different hash. No long-term correlation.
- **Neden:** GDPR-compliant default. We get rate-limit-style "unique requestor" insight without storing or logging actual IPs. Daily rotation prevents historical tracking — even if logs are exfiltrated, yesterday's hash can't be cross-referenced with today's.
- **Alternatifler:** (a) Log raw IPs — privacy violation, GDPR risk; (b) Truncate IP /24 — still associative across time; (c) Fixed salt — historical tracking remains; (d) Per-request random salt — destroys correlation needed for analytics.
- **Etkisi:** Logs are safe to ship to any aggregation tool. Rate-limit analytics work within the day. Cross-day analytics (cohort retention etc.) would need a different scheme — not supported by current logger.

## Run 18 — 2026-04-26

### D024: Zero-dep E2E smoke runner instead of Playwright
- **Karar:** `scripts/smoke.mjs` uses Node built-in `http.createServer` (port 0 = OS-assigned) and `http.request` for 12 route assertions. No Playwright, no Puppeteer, no jsdom.
- **Neden:** Playwright is 300+ MB across browser binaries; forces ARM/x86 multi-arch concerns; needs CI runners with display capabilities. The smoke runner catches the regressions we actually have: missing manifest link, broken module exports, wrong MIME types, missing data-i18n attributes, 404 on critical files. Render-time issues (focus order, animation timing, contrast) require a visual renderer and aren't worth the dep cost for this team-sized tool.
- **Alternatifler:** (a) Playwright — gold standard, dep-heavy; (b) jsdom + http — gets you DOM but not CSS rendering, so half a Playwright at half the value; (c) curl + bash assertions — works but harder to maintain than `node --test` patterns.
- **Etkisi:** Smoke runs in <1s, no CI environment requirements, blocks broken-build merges. Future runs that need browser-driven assertions will need a separate optional script (not gated in CI by default).

### D025: Hard size budget — total public/js at 80KB cap
- **Karar:** `scripts/perf-budget.mjs` enforces total `public/js/*.js` ≤ 80 KB raw (current: 76.30 KB). Single file ≤ 25 KB. Locale JSON ≤ 8 KB each. index.html ≤ 35 KB. sw.js ≤ 8 KB.
- **Neden:** With zero bundling, every JS module is a separate HTTP request — but our SW precaches the shell so 1st-load is the only request that matters. 80 KB raw transfers ~25 KB gzipped, well under the 100 KB JS-on-mobile target. Hard cap (vs. soft warn) means the next regression (e.g. accidentally bundling a 50 KB lib) auto-fails CI rather than slowly bloating over months.
- **Alternatifler:** (a) Soft warn only — silently bloats; (b) Bundle + report — adds bundler dep, defeats Run 13 zero-dep architecture; (c) gzip-aware budget — requires running a real compressor in the test step.
- **Etkisi:** New features must fit in the remaining ~3.7 KB or earn a budget bump. A heavy feature (canvas drawing, audio playback) should land as a lazy `js/feature.js` loaded on demand — kept out of the shell budget. Budget bumps are a deliberate decision, recorded here.

### D026: Lighthouse as documentation, not as a CI dependency
- **Karar:** `lighthouserc.json` and `docs/PERFORMANCE.md` give users a one-command Lighthouse run (`npx -y @lhci/cli autorun`) with strict assertions (perf ≥0.9, a11y ≥0.95, best-practices ≥0.95). Not added to package.json deps or `npm run ci`.
- **Neden:** Lighthouse needs a real Chrome — adds 200+ MB to install. CI already has perf via `scripts/perf-budget.mjs` (size-based). Lighthouse is the "deep dive" before a release; the budget gate is the "every commit" check. Combining them puts the deep dive on every commit which is wasteful for a small team.
- **Alternatifler:** (a) `@lhci/cli` as devDep + GH Action — costs extra CI minutes for marginal post-fact info; (b) skip Lighthouse entirely — leaves a category gap in the analysis layer; (c) make Lighthouse `npm run perf:full` separate from `npm run perf` — hides the cost without addressing the dep weight.
- **Etkisi:** Performance posture is auditable: budget gate stops bloat regressions, Lighthouse audit (manually run) scores cross-cutting metrics. Both live in the repo, neither is a build-time dep.

## Run 19 — 2026-04-26

### D027: Heavy feature modules MUST be lazy-loaded after Run 19
- **Karar:** New JS modules whose user-flow is "open this specific dialog" or "preview this specific asset type" must be loaded via dynamic `import('./mod.js')` on first need, not eager-imported from main.js. Eager imports are reserved for shell modules required on every page load (state, api, grid, modal-shell, search, util, i18n, pwa, keyboard).
- **Neden:** The 80 KB shell budget (D025) is at 79.09 KB after Run 19 (~99% utilization). Bulk tag editor (4.8 KB) and sprite preview (4.1 KB) had to be lazy or the budget breached. Future runs adding any feature ≥3 KB to public/js/ will breach unless they go lazy. Lazy-loading also gives a perf win — first-paint stays minimal, heavy code only downloads when the user invokes the feature.
- **Alternatifler:** (a) Bump the budget — defers the conversation, eventually the bundle balloons; (b) Bundler with tree-shake — adds bundler dep, defeats Run 13 zero-dep architecture; (c) Inline everything — kills cache reuse and hurts first paint.
- **Etkisi:** From now on, any new feature module is reviewed against the eager/lazy split: if the feature's median user touches it once per session, lazy. If every page render needs it, eager. Modal sprite preview = lazy (only fires on sprite-sheet assets). Bulk tag editor = lazy (only on `t` chord with selection). Future bulk operations follow the same rule.

### D028: Server-side `/api/bulk-tags` endpoint instead of N parallel client patches
- **Karar:** Added `api/bulk-tags.js` accepting `{names: [...], addTags: [...], removeTags: [...]}` in one POST. Mutates manifest-level tags in a single GitHub commit. Client calls this once instead of N parallel `/api/missing-patch` calls.
- **Neden:** N parallel patches create N GitHub commits — noisy git log, N rate-limit consumption, race-condition window between patches if same asset is touched twice. Server-side bulk mutation is one commit, atomic, rate-limited as one operation.
- **Alternatifler:** (a) N parallel client patches — works but commits floods, race-prone; (b) sequential client patches — slower (N × roundtrip); (c) GraphQL-style "mutate many" generic endpoint — overkill for one operation type.
- **Etkisi:** Bulk tag editing on 50 assets = 1 commit, 1 rate-limit slot. Bulk tag failures roll back all-or-nothing because the manifest mutation is one write. Future bulk operations (bulk delete already exists, bulk move/category if added later) should follow the same single-endpoint pattern.

## Run 20 — 2026-04-26

### D029: Audit log = local NDJSON file, not committed, rotated at 10 MB
- **Karar:** `audit.log` is appended in repo root via fs.appendFile, gitignored. NDJSON one-line-per-action format. Auto-rotate when file exceeds 10 MB (rename to audit.log.1 + start fresh).
- **Neden:** External log services (Sentry, Datadog) cost money and add deploy-time deps. Local NDJSON is grep-able and tail-able, instantly diagnose-able. Keeping it local-only means admin-action history doesn't leak into git history (PRs would expose ip_hashes if committed). The 10 MB cap means even a chatty year stays bounded.
- **Alternatifler:** (a) GitHub commit log as audit trail — already happens for mutations, but mixes ops with code; (b) external service — costs $; (c) commit audit.log to repo — leaks operational metadata, large diffs.
- **Etkisi:** Admins inspect via `tail -100 audit.log` or `GET /api/audit?limit=N&since=ISO`. Rotation keeps the file size predictable. Aggregating across instances would need ship-to-cloud — not done here.

### D030: Trash retention via lazy sweep on GET, not cron
- **Karar:** `sweepExpiredTrash()` runs at the start of every `GET /api/trash`. Items with `deletedAt` older than `TRASH_RETENTION_DAYS` (default 30) are deleted along with their meta sidecar. Each purge is audit-logged.
- **Neden:** Vercel cron costs extra and adds platform coupling. The trash list is only meaningful to admins, who look at it when they want to recover something — exactly when stale entries should already be gone. Sweep cost = walk N meta files + parse + Date.compare; cheap even at N=1000.
- **Alternatifler:** (a) Vercel cron job — works, costs $$, platform-coupled; (b) manual purge button — error-prone, retention guarantee lost; (c) sweep on every API call — overkill.
- **Etkisi:** A trash item's max lifespan is `30 days + (time-until-next-trash-list-call)`. For active deployments this is effectively 30 days. For dormant deployments items linger until the next admin visit — fine because dormant deployments don't accumulate either way.

### D031: Restore is dry-run by default; ?confirm=1 actually applies
- **Karar:** `POST /api/restore` returns `{would_apply: {missing_to_add: N, missing_to_remove: M}}` without writing. Adding `?confirm=1` triggers the atomic temp-write + rename.
- **Neden:** Restore is destructive — overwrites missing.json. A typo in the URL or accidental double-submit would silently destroy current state. Dry-run-by-default makes the operator see the diff first. The `?confirm=1` opt-in is one keystroke for legitimate use, blocks accidental destruction.
- **Alternatifler:** (a) Apply by default — destructive; (b) two-step "submit then confirm" — extra UI; (c) require `?dryRun=0` instead of `?confirm=1` — same effect, but `?confirm=1` reads naturally as intentional opt-in.
- **Etkisi:** Both human admins and any future scripted restore must explicitly pass `?confirm=1`. CI/CD scripts that do this should also set `?confirm=1` (standard pattern, not undocumented).
