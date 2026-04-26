# Forge Run 20 Summary

**Date:** 2026-04-26
**Theme:** Backup/restore + audit log + trash retention (operational integrity)
**Score before:** ~9.42 → **after:** ~9.48

## Implementation

| File | Change |
|---|---|
| `api/backup.js` | New — admin-only GET, returns full manifest snapshot as downloadable JSON, asset listing per source dir |
| `api/restore.js` | New — admin-only POST, schema validation, dry-run by default, atomic write on `?confirm=1` |
| `api/_audit.js` | New — `auditLog(action, fields)` appends NDJSON to `audit.log`; `readAuditLog({limit, since})`; auto-rotate at 10 MB |
| `api/audit.js` | New — admin-only GET, returns recent audit entries |
| `api/_trash-util.js` | Added `sweepExpiredTrash({maxAgeDays, dryRun})` — purges trash items older than 30d (configurable via `TRASH_RETENTION_DAYS`) |
| `api/trash.js` | Lazy-sweep on every GET; adds `expires_in_days` to each item |
| Mutating endpoints | All wired with `auditLog(...)` calls — delete, restore, clear, missing-patch, bulk-tags, review, upload, asset-delete |
| Tests (4 new files) | `_backup.test.js`, `_restore.test.js`, `_audit.test.js`, `_trash-retention.test.js` — 15 new tests |
| `.gitignore` | Added `audit.log`, `audit.log.*` |
| Locales | New keys `trash.expires_in`, `trash.auto_purge_warning` |

**Tests:** 62 → 77 (+15). All pass.
**JS budget:** 79.61 / 80 KB (OK).
**audit.log:** local-only, gitignored.

## Score Breakdown

| Category | Weight | Before | After | Δ |
|---|---:|---:|---:|---:|
| Mimari | 10% | 9.0 | 9.2 | +0.2 — three operational subsystems with clean separation |
| Güvenlik (hardening) | 12% | 9.8 | 9.9 | +0.1 — restore is dry-run-by-default, audit log makes admin actions traceable |
| Observability | 4% | 8.5 | 9.0 | +0.5 — actions now logged to a queryable trail with privacy-preserving ip_hash |
| Features | 8% | 9.9 | 10.0 | +0.1 — backup/restore is a critical operational feature |

Composite: ~9.42 → **~9.48** (+0.06)

## Lessons

- **`mock.method(global, 'fetch', ...)` is the correct pattern for ESM fetch mocks.** Plain reassignment didn't propagate due to ESM live-binding semantics.
- **Lazy sweep beats cron.** Vercel doesn't have native cron without extra setup. Sweeping on `GET /api/trash` runs only when admins look at the trash — exactly when they care about retention. Worst case: nobody looks at trash, items accumulate indefinitely. Acceptable: trash growth is bounded by user activity.
- **Audit log file rotation at 10 MB is generous.** ~50,000 entries before rotation. For an admin tool, that's months/years of activity.

## Run 21 Suggestion

**Collections + saved views + search history** — UX/feature stream.

- Collections: tag a set of assets as a named collection; appears as new chip type. ~4-6 KB JS, eager (or lazy if budget tight).
- Saved views: persist current filter/search/sort/tab combo to URL query params; shareable links.
- Search history: last 10 searches in a popover under the search input.

Expected delta: Features 10.0 stays, UX 9.9→10.0 (+0.012 weighted), Mimari +0.05. Composite ~9.51.
