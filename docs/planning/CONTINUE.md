# CONTINUE.md — where we left off

> **Read this first next session. Update it at the end of every session.**

_Last updated: 2026-10-16 (end of audit + security-fix session)_

## Current state (2026-10-16)

- **`main` is green and merged**: PR #3 (P7 client ship + audit pass + N-001/N-010 fixes, merged by user as `e85a1ba`) and PR #4 (USER_MANUAL + DEPLOY.md + lockfile fix, merged as `0d3224b`). CI success on main (Node 20 + 22); `npm audit` 0; **189/189** tests.
- **Vercel**: Production deployment created from `0d3224b` (15:07 UTC). Client project root = `client/`. Dashboard needs `NEXT_PUBLIC_API_URL` → live API URL once the API is hosted.
- **API hosting**: NOT yet done — still localhost/Docker only. Plan = Render/Railway + Atlas + Upstash, walkthrough in **`docs/DEPLOY.md`** (§ env matrix + smoke test). Requires user's account logins.
- **Docs on main**: `docs/AUDIT-2026-10.md` (41 findings, remediation plan), `docs/USER_MANUAL.md` (test walkthrough), `docs/DEPLOY.md`, refreshed README (portfolio).
- **Untracked**: `new_plan.md` at repo root (private master spec — deliberately NOT committed).

## What this session did (2026-10-16)

1. **Audit pass 2026-10** (report-only): 41 findings — 2C/7H/27M/4L/1I; reconciled FIND-001..014; master-plan coverage table; doc-drift trail (7 false doc claims, corrected in README/PROJECT_STATUS).
2. **N-001 FIXED** (`a2acde7`): `protect()` enforces `purpose === "access"` (allow-list); all 4 JWT signers tag purpose (`access`/`2fa_challenge`/`password_reset`/`email_verify`); reset/verify endpoints assert their own purpose; 5 regression tests in `tests/integration/app.test.ts`.
3. **N-010 FIXED** (`44db66d`): `npm audit fix` + nodemailer 9→10 → 0 vulns.
4. **Lockfile fix** (`e0b0f6f`): explicit `yaml@^2.9.1` devDep — breaks the npm ci dedupe deadlock (swagger-jsdoc pins `yaml@2.0.0-1` exactly; vite needs ^2.4.2; npm collapsed them into an invalid tree). Stable across `npm install` AND `npm ci`.
5. User manual + deploy guide + portfolio README refresh; Vercel production deploy triggered.

## TODO — next session (in order)

### 1. API hosting (user + assistant)

- Follow `docs/DEPLOY.md`: Atlas M0 → Upstash → Render/Railway web service (Docker or `npm ci && npm run build && npm start`, healthcheck `/ready`) → set env matrix.
- Then wire: client Vercel env `NEXT_PUBLIC_API_URL=https://<api>`; API `CORS_ORIGIN`/`CLIENT_BASE_URL` = Vercel domain; re-deploy both; run DEPLOY.md §5 smoke test.
- Note: workers (email/reminders/trash/webhooks) run in-process at N=1 only (see audit N-006/N-011).

### 2. Audit remediation (next priorities from `docs/AUDIT-2026-10.md` Part 5)

- **Availability cluster** — N-002/N-032 (Redis command timeout / `passOnStoreError` / cache fallback) + N-011 (Redis reconnect supervisor; `/ready` should fail when REDIS_URL set but unreachable). Effort M.
- **N-003** — verify-email `as never` type guard (S).
- **N-004** — webhook SSRF guards: scheme/DNS/private-range/redirect:manual + body cancel (M). Mandated by new_plan.md §12.
- **N-008** — OpenAPI path annotations or zod-to-openapi; `servers` from `API_PUBLIC_URL` (M) — currently `/api-docs` is an empty shell.
- **N-009** — client hardening: HttpOnly refresh cookie via Next BFF + CSP + session epoch (M–L).
- Remaining Mediums/Lows in backlog table (audit Part 5 rows 12–17).

### 3. Smaller leftovers

- **N-040**: path-filtered client CI job in ci.yml (lint/test/build in `client/`).
- README screenshots/GIFs of landing + deck + 2FA (cosmetic, portfolio).
- `npm audit` in CI (audit currently manual).
- Consider gitleaks/trufflehog in CI (audit Part 6 tooling note).

## Key contracts (current)

- API base: `${NEXT_PUBLIC_API_URL:-http://localhost:3000}/api/v1`; set `CORS_ORIGIN` in production (default `*`).
- **JWT purposes (N-001, new)**: access tokens carry `purpose:"access"`; challenge `2fa_challenge`; reset `password_reset`; verify `email_verify`. `protect()` rejects anything else. Pre-fix tokens (no purpose) are rejected — clients recover via refresh; old emailed links must be re-requested.
- Login: `{username,password}` → pair OR `{requires2FA:true, challengeToken}` → POST `/auth/2fa/challenge {challengeToken, code|recoveryCode}`; enable-2FA body is `{token}` (6-digit), change-password is `{currentPassword,newPassword}`, `DELETE /me` takes no body.
- Tasks list `{tasks,total,page,limit,totalPages}`; bulk `{ids[1..100], action}`; stats cached 60s (invalidate-on-update still missing — FIND-005/N-017).
- Errors always `{error}`; Mongo `_id` everywhere.

## Gotchas learned (don't rediscover)

1. **swagger-jsdoc@6.3.0 pins `yaml@2.0.0-1` exactly** — never remove the root `yaml@^2.9.1` devDep; npm dedupe will re-break `npm ci` (symptom: `Missing: yaml@2.9.1 from lock file`). A global `overrides: {yaml}` breaks swagger-jsdoc at runtime (`keepCstNodes` error) — the devDep inversion is the working fix.
2. **gh pr edit fails on this repo** (classic-Projects GraphQL deprecation) — use `gh api -X PATCH repos/.../pulls/N -f title=... -f body=...`.
3. nodemailer v9→v10 is safe here (only `createTransport`/`sendMail` used); v10 requires Node ≥20.
4. JWT contract: `jwt.sign({userId})` without `satisfies` type breaks typecheck once `purpose` is required — use `String(userId)` + `satisfies Payload`.
5. Client gotchas (still valid): sessionStorage-in-initializer breaks prerender; useSearchParams needs Suspense; Turbopack root pinned to `client/`; e2e local-only (pinned MONGOMS 7.0.14 + chromium), worker fixture goes in the worker generic slot.
6. `npm install` may leave an "extraneous" yaml under vitest — harmless; `npm ci` from the committed lock is the source of truth.

## Commands cheat-sheet

```bash
# backend (repo root)
npm test                    # vitest, 189 tests
npm run typecheck | lint | format:check
npm audit                   # must stay 0
docker compose up --build   # app+mongo+redis for manual testing
docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit   # email catcher (see USER_MANUAL §1)

# client
cd client && npm run dev    # :5173, needs API on :3000
cd client && npm run lint | test | build

# ops
gh pr checks 4; gh run list --limit 3
```

Start next session here → `git log --oneline -8` → pick up TODO §1 (API hosting) or §2 (audit remediation, N-002/N-011 cluster first).
