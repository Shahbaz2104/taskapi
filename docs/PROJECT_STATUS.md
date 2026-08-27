# Project Status

Last updated: 2026-08-26 (post TypeScript migration — shipped to `main`)

## Snapshot

- **Stack: TypeScript (strict, native ESM) · Vitest** — legacy CJS/Jest tree fully deleted
- **184 tests passing** across 16 files (full-app integration + unit); typecheck, ESLint, Prettier, coverage thresholds and a compiled-dist boot smoke all green
- **Shipped via PR #2** (`203aeab`) with lockfile hotfix (`4c54d0e`); CI pipeline green on `main`: typecheck · lint · format · tests-with-coverage · build (Node 20 & 22)
- Multi-stage Docker build (tsc → prod deps → slim runner); first real image build happens at deploy time
- `npm audit`: 0 vulnerabilities at last run

## What shipped (in commit order)

| Phase | Commit                | Scope                                                                                                                                                                                                                                              |
| ----- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | `53cca9e`             | Document-only security & quality audit → `AUDIT.md` (14 findings, severity-rated)                                                                                                                                                                  |
| 1+2   | `f0faf4b`             | PostHog analytics via soft-fail capture seam + shared constants module                                                                                                                                                                             |
| 3     | `eeba963`             | Session/device management (IP + user-agent tracking, list/revoke)                                                                                                                                                                                  |
| 4     | `d89982a`             | TOTP two-factor auth with QR provisioning + 8 single-use recovery codes                                                                                                                                                                            |
| 5     | `01ad6f6`             | Bulk operations + soft-delete trash with retention job; race-safe recurrence spawn; stats-cache invalidation                                                                                                                                       |
| —     | —                     | Sentry error tracking + zod validation layer for new endpoints                                                                                                                                                                                     |
| 6     | `e2066b8`             | CSV/JSON import (partial success, idempotent) + token-authenticated iCal feed                                                                                                                                                                      |
| 7     | `a9ccabb`             | Signed webhooks with retries, circuit breaker, test ping                                                                                                                                                                                           |
| 8     | `c1fcb0a`             | Task sharing (viewer/editor), comments, append-only activity trail                                                                                                                                                                                 |
| 9     | `feat/typescript-esm` | Full TypeScript/ESM conversion (config→types→models→middleware→services→controllers/routes/schemas→jobs→app/server), zod schemas as single validation source, Jest→Vitest port with zero behavior drift, ESM cutover, multi-stage tsc Docker build |

## Audit follow-ups

Findings and remediation mapping live in `AUDIT.md`. Highlights:

- **FIND-001 (critical) RESOLVED 2026-08-27** — Atlas password + `JWT_SECRET` rotated; `.env` and `client/e2e/.auth/user.json` purged from all history via `git filter-repo` and force-pushed. Repo is export-ready; collaborators must re-clone.
- FIND-002 (token-type confusion) mitigated by purpose-scoped 2FA challenge tokens.
- FIND-005/FIND-006 fixed opportunistically during the trash phase (stats-cache invalidation; race-safe recurrence spawning).
- FIND-007 (console.error in request paths) fixed during the TS migration — central handler logs via pino `req.log`.
- Remaining low-severity items documented in `AUDIT.md`.

## Deliberate design decisions

- Audit was document-only: no retroactive rewrites outside feature scope.
- Bulk complete intentionally does **not** spawn recurring successors.
- Collaboration uses a single access chokepoint (`loadTaskWithAccess`); non-members get indistinguishable 404s. Delete/share-management stay owner-only.
- Webhook enqueueing is best-effort: queue outages never fail product requests.
- All request validation is **zod** (`src/schemas/`) — single source of truth after the TS migration.

## Known limitations

- Pagination is skip/limit (fine at personal scale; keyset pagination on roadmap).
- Collaborator updates attribute recurrence spawning/analytics to the owner's account scope.
- iCal feed exposes all live tasks of a user via a bearer-equivalent URL token — rotate it if leaked (`POST /me/calendar-feed/rotate`).

## Known gaps after the migration

- `/api-docs` renders Swagger UI but endpoint annotations are not yet re-added to the new `src/controllers` (spec shows metadata only). Tracked in docs/planning/PLAN.md.

## Suggested next steps

1. ~~Rotate leaked credentials + purge git history~~ **DONE 2026-08-27** (`docs/SECURITY.md`).
2. Deploy behind a live URL; wire real PostHog/Sentry projects.
3. Re-add Swagger annotations to `src/controllers`.
4. Cursor pagination.
5. Frontend `client/` P7 ship remainder: path-filtered CI client job, DEPLOY.md, README web-client section + GIFs (e2e is green and stays local-only — see `docs/planning/CONTINUE.md`).
