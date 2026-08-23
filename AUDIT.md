# 🔍 TaskAPI — Full Audit Report

> **Date:** 2026-08-23 · **Scope:** security, code quality, architecture, tests, config · **Mode:** document-only (findings recorded; no retroactive fixes — remediation happens only where upcoming features touch the same code)
>
> **Baseline at audit time:** lint ✅ clean · prettier ✅ clean · `npm audit` ✅ 0 vulnerabilities · tests ✅ 83/83 passing (~49s) · coverage gates ✅ met (statements ~82%, lines ~85%)

---

## Executive Summary

The codebase is well-structured for its scale — clean layering (`routes → controllers → services → models`), sensible conventions, real security thinking (token rotation + theft detection, idempotent writes, anti-enumeration responses), solid Dockerfile, and enforced quality gates. However, there is **one critical operational security issue**: a live `.env` containing MongoDB Atlas credentials and the JWT signing secret is committed to git history **and already pushed to GitHub**, where this project is headed for publication.

| Severity | Count |
| -------- | ----- |
| Critical | 1 |
| High     | 1 |
| Medium   | 4 |
| Low      | 6 |
| Info     | 4 |

---

## Findings

### 🔴 FIND-001 — Live secrets committed and pushed to GitHub (Critical)

- **Location:** `.env` (tracked file), first committed in `282650d`, present through `HEAD` → pushed to `origin/main` (`github.com/Shahbaz2104/taskapi`)
- **Evidence:** `git ls-files --error-unmatch .env` succeeds; `git show HEAD:.env` contains a full Atlas connection string with embedded username/password and `JWT_SECRET`
- **Impact:** Anyone who can clone the repo obtains database credentials and the JWT signing secret. With the JWT secret, valid access tokens for *any* user can be forged. `.gitignore` lists `.env`, but the entry was added after tracking began, so ignore never applied.
- **Remediation (in order):**
  1. Rotate now: change the Atlas user password and generate a new `JWT_SECRET` — treat both as compromised regardless of repo visibility
  2. `git rm --cached .env` so future changes stop being committed
  3. Purge history (`git filter-repo --path .env --invert-paths`) or squash into a fresh initial commit before the repo goes public
  4. Verify no forks/clones exist once public

### 🟠 FIND-002 — Password-reset tokens are accepted as access tokens (High)

- **Location:** `services/auth.service.js` (`forgotPassword`: `jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30m" })`) vs `middleware/auth_middleware.js:12` (`jwt.verify(token, process.env.JWT_SECRET)`)
- **Description:** Access, password-reset, and email-verification tokens all share one secret and carry no purpose/audience claim. A reset token has exactly the payload shape (`{ userId }`) that `protect()` accepts, so any leaked reset link (they travel through email) doubles as a 30-minute bearer credential.
- **Impact:** Email pipeline compromise (or a curious mail client/link-preview bot fetching the reset URL) yields authenticated API access.
- **Remediation:** Purpose-tag every JWT at signing (`{ userId, purpose: "access" | "password_reset" | "email_verify" }`) and assert the expected `purpose` at each verify site. (Note: the planned 2FA challenge token will introduce purpose-scoped signing as part of its implementation.)

### 🟡 FIND-003 — Regex injection in admin user search (Medium)

- **Location:** `controllers/admin_controller.js:33-38` — `req.query.search` passed unescaped into `{ $regex }` on `username`/`email`
- **Impact:** Crafted patterns (e.g., `(a+)+$`) enable catastrophic-backtracking ReDoS against the admin listing route; broad `.*` patterns enable cheap full-collection scans. Admin-only reachability keeps this at Medium.
- **Remediation:** Escape user input before `$regex`, or anchor-and-escape, or use `$expr`/collation-based matching.

### 🟡 FIND-004 — Compose/deploy config weaknesses (Medium)

- **Location:** `docker-compose.yml`
  - `JWT_SECRET: ${JWT_SECRET:-change-me-to-a-long-random-string}` — an insecure default silently ships to production if the env var is unset (the app itself fail-fasts on empty, but the compose fallback defeats that guard)
  - `redis` runs with no password, no healthcheck; `depends_on` uses `service_started` (not `service_healthy`)
- **Related boot race:** `index.js` calls `initRedis()` once at startup; if Redis isn't reachable at that moment, the process **permanently** falls back to in-memory rate limiting/stats cache even after Redis recovers. Rate limiting silently degrades from shared-per-cluster to per-instance (limits multiply ×N replicas).
- **Remediation:** Remove the JWT fallback (require the host env), add a Redis healthcheck + `service_healthy`, add reconnect/re-init logic or a `/ready` failure mode when Redis was configured but is down.

### 🟡 FIND-005 — Stats cache never invalidated (Medium)

- **Location:** `controllers/tasks_controller.js` (`stats:${userId}`, TTL 60s)
- **Impact:** After create/update/delete, stats are stale up to 60s; completing the final task still shows old completion rate. Acceptable as documented trade-off, but invalidation is one `del(cacheKey)` away on each mutation path.
- **Remediation:** Invalidate on task mutations, or shorten TTL and label the endpoint "eventually consistent" in Swagger.

### 🟡 FIND-006 — Recurrence spawn race window (Medium)

- **Location:** `services/tasks.service.js` (`updateTask` — reads `existing.status !== "completed"`, then spawns next occurrence, then updates)
- **Impact:** Two concurrent `PUT`s transitioning the same recurring task to `completed` can both observe "not completed" and spawn two successor tasks. Unlikely at personal scale; unbounded at API scale.
- **Remediation:** Spawn via a conditional update (`findOneAndUpdate({ _id, status: { $ne: "completed" } }, ...)`) and treat a null result as lost-race, or wrap in a transaction.

### 🔵 FIND-007 — Error handler bypasses structured logging (Low)

- **Location:** `middleware/error_handler.js:2` — `console.error(err.stack)`
- **Impact:** 5xx errors lose pino's request IDs, serialization, and log-level routing; breaks the observability story everywhere else.
- **Remediation:** `req.log.error({ err })` (pino-http attaches `req.log`) and drop the stack from console.

### 🔵 FIND-008 — Refresh-token rows accumulate forever (Low)

- **Location:** `models/token_models.js` — `expiresAt`/`revokedAt` have no TTL index; rows are only bulk-deleted on account deletion
- **Impact:** Table grows monotonically (every login + every 15-min rotation adds a row). Also relevant to the upcoming sessions/devices UI.
- **Remediation:** TTL index on `expiresAt` (Mongo purges lazily) plus keeping revoked docs briefly for reuse-detection forensics, or a daily BullMQ cleanup job.

### 🔵 FIND-009 — Weak-ish credential parameters (Low)

- **Locations:** `models/users_models.js` — password `minlength: 6`; bcrypt rounds `10`
- **Impact:** Below current OWASP guidance (min 8–15, cost 10–12 acceptable but 12 preferred for a low-traffic API). Migration note: raising rounds affects only new/changed passwords under the pre-save hook.
- **Remediation:** Raise minimums at the validation layer; optionally bump rounds to 12.

### 🔵 FIND-010 — Account-deletion cascades miss Idempotency records (Low)

- **Locations:** `controllers/user_controller.js` (`deleteMe`), `controllers/admin_controller.js:129-132` (`deleteUser`) — cascade `Task` + `Token` but not `Idempotency`
- **Impact:** Orphan rows for ≤24h until their TTL expires. Cosmetic.
- **Remediation:** Add `Idempotency.deleteMany({ user })` to both cascades.

### 🔵 FIND-011 — Register response echoes verification URL when SMTP is unset (Low)

- **Location:** `controllers/auth_controller.js` (`register` returns `verificationUrl` when `!SMTP_HOST`)
- **Impact:** In a production deployment with a misconfigured/missing SMTP block, email-verification tokens leak directly in API responses. Dev convenience feature without a `NODE_ENV` guard.
- **Remediation:** Gate the echo on `NODE_ENV === "development"` (or absence of production), not merely on SMTP_HOST.

### 🔵 FIND-012 — Per-IP-only throttling on auth routes (Low)

- **Location:** `routes/auth_routes.js` limiters (login 10/15min per IP)
- **Impact:** Distributed-IP credential stuffing against one account is unthrottled; bcrypt cost is the only brake. No account lockout/exponential backoff exists.
- **Remediation:** Add per-account counters (e.g., temporary cooldown keyed by username+IP hash) or CAPTCHA escalation; document residual risk.

### ℹ️ FIND-013 — `protect()` performs a DB lookup on every request (Info)

- **Location:** `middleware/auth_middleware.js:13` — `User.findById` per authenticated call
- **Notes:** Contradicts the README's "self-validating JWTs / fully stateless" framing, but buys instant revocation when users are deleted and always-current roles for RBAC. Reasonable trade-off — should be documented as intentional. If latency ever matters, cache user existence/role for 30–60s.

### ℹ️ FIND-014 — Assorted minor notes (Info)

- Text index on `{ title, description }` has no weights/language options — relevance ranking is Mongo defaults
- Skip/limit pagination (documented trade-off; cursor pagination already on roadmap)
- Swagger `servers` lists only `http://localhost:3000`; no production URL yet
- CORS defaults `*` — acceptable for a Bearer-token API (no cookies), worth pinning in production

---

## Test Coverage Observations

Weakest areas align with infra/async edges (harder to test, currently untested by design):

| Area | Lines | Gap |
| ---- | ----- | --- |
| `config/redis.js` | 33% | connect/fail paths unexercised |
| `jobs/reminders.js` | 38% | reminder query/dispatch logic |
| `jobs/email_worker.js` | 54% | worker failure handler |
| `services/email.service.js` | 52% | queue enqueue/direct-send branches |

The roadmap's Mailhog-in-CI item would close the email-service gap. Reminder logic is pure enough to unit-test with an in-memory Mongo run — good candidate alongside upcoming features.

---

## What's Done Well

- **Layered architecture** — controllers stay HTTP-thin; business logic (rotation, recurrence, stats, CSV) is unit-testable in services
- **Refresh-token rotation + reuse detection** implemented correctly (revoked-token replay nukes all sessions)
- **Idempotency-key reservation** via unique index insert-first — genuinely race-safe design
- **Soft-fail Redis** everywhere (`isAvailable()` guards) — the app degrades rather than dies
- **Dockerfile** — multi-stage, non-root `USER node`, healthcheck against `/ready`
- **Anti-enumeration** generic forgot-password response; generic 5xx masking in the error handler
- **Validation discipline** — express-validator chains terminate in `handleValidation` on every mutating route
- **CI gates** — lint + format + coverage thresholds enforced on two Node versions

---

## Prioritized Remediation Plan

| # | Finding | When |
| - | ------- | ---- |
| 1 | FIND-001 rotate secrets + untrack `.env` + purge history | **Immediately, before repo goes public** (user action required for rotation) |
| 2 | FIND-002 purpose-scoped JWTs | Lands naturally with 2FA challenge tokens (Phase 4); retrofit remaining issuers then |
| 3 | FIND-008 TTL/cleanup for tokens | With Sessions/devices phase (Phase 3) |
| 4 | FIND-005 stats-cache invalidation | Opportunistic during Bulk/trash phase (Phase 5) |
| 5 | FIND-006 race-safe recurrence spawn | Opportunistic during Phase 5 |
| 6 | FIND-007 pino in error handler | Trivial; bundle with any Phase touching middleware |
| 7 | FIND-003 regex escape | Small standalone fix; candidate for a hardening commit |
| 8 | FIND-009..014 | Backlog / documentation |

> Per the agreed audit mode, nothing above is fixed retroactively in this pass — items marked "opportunistic" get folded in only when a feature phase touches the same files anyway.
