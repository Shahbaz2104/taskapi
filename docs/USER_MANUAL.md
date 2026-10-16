# TaskAPI — User & Testing Manual

Everything below assumes the API runs at `http://localhost:3000` and all endpoints live under `/api/v1`.

---

## ⚡ Cheat sheet (copy-paste)

```bash
BASE=http://localhost:3000/api/v1

# Register → save tokens
curl -s $BASE/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"tester","email":"tester@example.com","password":"secret1"}'

# Login
curl -s $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"tester","password":"secret1"}'

# Use an access token (15 min TTL)
curl -s $BASE/me -H "Authorization: Bearer $ACCESS_TOKEN"

# Create a task
curl -s $BASE/tasks -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Try the API","priority":"high"}'

# List / filter
curl -s "$BASE/tasks?status=pending&sort=-priority&limit=5" -H "Authorization: Bearer $ACCESS_TOKEN"

# Stats (cached 60s)
curl -s $BASE/tasks/stats -H "Authorization: Bearer $ACCESS_TOKEN"

# Refresh (rotates the refresh token — old one dies)
curl -s $BASE/auth/refresh -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

---

## 1. Quick start

### Path A — Docker (recommended)

```bash
docker compose up --build
# API: http://localhost:3000 · Mongo + Redis included with healthchecks
```

### Path B — Local Node

Prerequisites: **Node.js 20.19+**, a MongoDB instance (local or Atlas). Redis is optional (the app soft-fails without it: no queues/cron, rate limits fall back to in-memory).

```bash
npm install
cp .env.example .env
# edit .env → set MONGO_URI and JWT_SECRET (min 32 random chars)
npm run dev          # tsx watch, http://localhost:3000
```

Verify: `curl -s http://localhost:3000/health` → `{"status":"OK"}`

### Path C — automated tests only

```bash
npm test             # 189 tests, in-memory Mongo, no external deps
npm run test:coverage
node scripts/boot-check.mjs   # boots compiled dist vs memory-mongo
```

### Email flows need a mail catcher (verify + reset)

Without SMTP configured, the API **drops emails** (you'll see `Email would be sent (SMTP not configured)` in logs — the link is not in the log). To click real verification/reset links locally, run [Mailpit](https://mailpit.axllent.org/):

```bash
docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Then in `.env`:

```bash
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=dummy          # required — transporter is disabled unless all three are set
SMTP_PASS=dummy
SMTP_FROM=TaskAPI <no-reply@localhost>
```

Restart the API. Open **http://localhost:8025** — every email (with clickable links) appears there.

---

## 2. Feature walkthrough (API)

### 2.1 Register, verify, login

```bash
# Register — returns { accessToken, refreshToken, userId }
curl -s $BASE/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"tester","email":"tester@example.com","password":"secret1"}'
```

- Usernames 3–30 chars, passwords 6–72 chars.
- A verification email is queued; open Mailpit (§1) and click the link, or extract the token and:

```bash
curl -s $BASE/auth/verify-email -H 'Content-Type: application/json' \
  -d '{"token":"<TOKEN_FROM_EMAIL>"}'
```

- Login: `POST /auth/login` with `{username, password}` → token pair.
- Refresh: `POST /auth/refresh` with `{refreshToken}` → **new pair; the old refresh token is dead**. Re-using a revoked token = theft detection → **all** sessions revoked (401 `reuse detected`).
- Logout: `POST /auth/logout` with `{refreshToken}` → 204.

**Rate limits:** login/register 10 req / 15 min per IP; forgot-password & 2FA challenge 5 / 15 min. Exceeding returns 429 with `Retry-After`.

### 2.2 Two-factor auth (TOTP)

1. **Setup** — `POST /me/2fa/setup` → `{ otpauthUri, qrDataUrl }`. Scan `qrDataUrl` (data-URL PNG) with any authenticator app (Google Authenticator, 1Password, Aegis…), or paste the `otpauthUri` manually.
2. **Enable** — `POST /me/2fa/enable` with `{ "token": "123456" }`. Response includes **8 recovery codes — shown once, store them**.
3. **Login with 2FA** — `POST /auth/login` now returns `{ requires2FA: true, challengeToken }` instead of tokens. Exchange it:

```bash
curl -s $BASE/auth/2fa/challenge -H 'Content-Type: application/json' \
  -d "{\"challengeToken\":\"$CHALLENGE\",\"code\":\"123456\"}"
# or: -d "{\"challengeToken\":\"$CHALLENGE\",\"recoveryCode\":\"<one-time-code>\"}"
```

→ full token pair. Recovery codes are single-use (hash-compared, consumed on success).

4. **Disable** — `POST /me/2fa/disable` with `{ "password": "...", "code": "123456" }` → 2FA off, all sessions must re-login.

> Security check worth trying (regression for audit N-001): use the `challengeToken` itself as `Authorization: Bearer …` on `GET /me` → must be **401**.

### 2.3 Sessions / devices

```bash
curl -s $BASE/me/sessions -H "Authorization: Bearer $ACCESS_TOKEN"   # { sessions: [...] }
curl -X DELETE $BASE/me/sessions/<sessionId> -H "Authorization: Bearer $ACCESS_TOKEN"
```

Each login records IP + user agent. Revoking a session kills its refresh token.

### 2.4 Tasks

```bash
# Create (idempotent if you pass Idempotency-Key)
curl -s $BASE/tasks -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-1' \
  -d '{"title":"Ship the audit","description":"Post PR","priority":"high","dueDate":"2026-11-01","tags":["work"],"recurrence":"weekly"}'

# List — filters: status, search, sort (prefix - for desc), page, limit (max 100)
curl -s "$BASE/tasks?status=pending&search=audit&sort=-dueDate&page=1&limit=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Update (owner or editor on a shared task)
curl -X PUT $BASE/tasks/<id> -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"completed"}'

# One task (yours or shared with you)
curl -s $BASE/tasks/<id> -H "Authorization: Bearer $ACCESS_TOKEN"

# Delete → soft-delete into trash (owner only)
curl -X DELETE $BASE/tasks/<id> -H "Authorization: Bearer $ACCESS_TOKEN"
```

Field rules: `status` ∈ `pending | in_progress | completed`; `priority` ∈ `low | medium | high`; `recurrence` ∈ `daily | weekly | monthly`. Completing a recurring task spawns the next occurrence (race-safe).

**Stats:** `GET /tasks/stats` → counts by status/priority, overdue, completion rate (Redis-cached 60s; invalidated on create/delete/bulk/import — not on update).

### 2.5 Trash & bulk

```bash
curl -s $BASE/tasks/trash -H "Authorization: Bearer $ACCESS_TOKEN"          # list
curl -X PATCH $BASE/tasks/bulk -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"ids":["<id1>","<id2>"],"action":"trash"}"                           # complete|trash|restore|purge|priority
curl -X DELETE $BASE/tasks/trash -H "Authorization: Bearer $ACCESS_TOKEN"   # empty trash (permanent)
```

Bulk accepts 1–100 IDs. Trashed tasks are purged permanently by a daily job after `TRASH_RETENTION_DAYS` (default 30).

### 2.6 Import / export

```bash
# CSV export
curl -s $BASE/tasks/export -H "Authorization: Bearer $ACCESS_TOKEN" -o tasks.csv

# Import JSON (CSV works the same with Content-Type: text/csv; ≤500 rows)
curl -s $BASE/tasks/import -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: import-1' \
  -d '{"tasks":[{"title":"Imported A"},{"title":"Imported B","priority":"low"}]}'
# → { imported: 2, failed: [] }  (partial success per row)
```

### 2.7 iCal calendar feed

```bash
curl -s $BASE/me/calendar-feed -H "Authorization: Bearer $ACCESS_TOKEN"
# → { url: "http://localhost:3000/api/v1/tasks/calendar.ics?token=…" }
```

Open the URL in any calendar app (Google Calendar → "From URL", Thunderbird, Apple Calendar). If leaked: `POST /me/calendar-feed/rotate` → old URL dies instantly.

### 2.8 Sharing, comments, activity

Use a **second account** (`bob`) to see RBAC:

```bash
# As owner (alice): grant bob editor access by username
curl -s $BASE/tasks/<id>/shares -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' -d '{"username":"bob","role":"editor"}'

# As bob: the task appears in your shared inbox
curl -s $BASE/me/shared -H "Authorization: $BOB_TOKEN"   # Authorization: Bearer …

# Bob can PUT the task (200) but DELETE stays owner-only (404) — documented policy
# Comments (any member; posting requires editor+)
curl -s $BASE/tasks/<id>/comments -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' -d '{"body":"Looks good"}'
# Activity trail (append-only)
curl -s $BASE/tasks/<id>/activity -H "Authorization: Bearer $BOB_TOKEN"
```

Roles: `viewer` (read-only) / `editor` (update + comment). Non-members get 404s indistinguishable from nonexistent tasks.

### 2.9 Webhooks

```bash
# Register — point at a public echo service for testing
curl -s $BASE/me/webhooks -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://web.site/<your-uuid>","events":["task.created","task.completed"]}'

# Test ping (signed delivery to your URL)
curl -X POST $BASE/me/webhooks/<id>/ping -H "Authorization: Bearer $ACCESS_TOKEN"
```

Events: `task.created`, `task.completed`, `task.trashed`. Your endpoint receives:

```
X-TaskAPI-Event: task.created
X-TaskAPI-Timestamp: 1730000000000
X-TaskAPI-Signature: sha256=<hmac_sha256(secret, "{timestamp}.{rawBody}")>
```

Verify by recomputing HMAC-SHA256 over `${timestamp}.${rawBody}` with the endpoint secret (returned once at registration) and constant-time-comparing. Failed deliveries retry 5× with exponential backoff; **10 consecutive failures** auto-disables the endpoint until you `PATCH` it active again.

> For local servers use a tunnel: `ngrok http 3000` or [webhook.site](https://webhook.site).

### 2.10 Account management

```bash
curl -s $BASE/me -H "Authorization: Bearer $ACCESS_TOKEN"
curl -X PATCH $BASE/me -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' -d '{"username":"tester2"}'
curl -X PUT $BASE/me/password -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"secret1","newPassword":"secret2"}'    # revokes all sessions

# Password reset flow (needs Mailpit)
curl -s $BASE/auth/forgot-password -H 'Content-Type: application/json' \
  -d '{"email":"tester@example.com"}'                        # always 200 (no user enumeration)
# click link in Mailpit, then:
curl -s $BASE/auth/reset-password -H 'Content-Type: application/json' \
  -d '{"token":"<TOKEN_FROM_EMAIL>","password":"secret3"}'

# Delete account + all data (permanent, no confirmation payload)
curl -X DELETE $BASE/me -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 2.11 Admin

No env var bootstraps an admin — promote yourself in Mongo:

```js
// mongosh
use taskapi
db.users.updateOne({ email: "tester@example.com" }, { $set: { role: "admin" } })
```

Then log in again (role is embedded in the JWT) and:

```bash
curl -s "$BASE/admin/users?page=1&limit=10&search=tester" -H "Authorization: Bearer $ACCESS_TOKEN"
curl -X PATCH $BASE/admin/users/<id> -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' -d '{"role":"user"}'      # cannot change yourself
curl -X DELETE $BASE/admin/users/<id> -H "Authorization: Bearer $ACCESS_TOKEN"
curl -s "$BASE/tasks/all?page=1&limit=10" -H "Authorization: Bearer $ACCESS_TOKEN"  # every task
```

### 2.12 Observability

```bash
curl -s http://localhost:3000/health          # liveness
curl -s http://localhost:3000/ready           # readiness (DB + Redis state)
curl -s http://localhost:3000/metrics         # Prometheus
open http://localhost:3000/api-docs           # Swagger UI (metadata only — paths pending, N-008)
```

---

## 3. Web console (client)

```bash
cd client
npm install
npm run dev        # http://localhost:5173
```

The client targets `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`). Create a `.env.local` in `client/` only if your API is elsewhere.

Page tour:

| Page                 | What to test                                                                            |
| -------------------- | --------------------------------------------------------------------------------------- |
| Sign up / Sign in    | register, login, 2FA challenge appears automatically when enabled                       |
| Overview (dashboard) | stats cards, create task, filters, search, sort                                         |
| Task detail          | edit fields, complete (watch recurrence spawn), comments, activity trail, sharing panel |
| Trash                | list, restore, purge; verify bulk actions                                               |
| Shared               | tasks other users shared with you, your role                                            |
| Settings → Profile   | update username/email, change password (logs you out everywhere)                        |
| Settings → 2FA       | setup QR, enable, recovery codes (copy them!), disable                                  |
| Settings → Sessions  | list devices, revoke one, verify it dies client-side                                    |
| Settings → Calendar  | feed URL + rotate                                                                       |
| Settings → Webhooks  | create endpoint, toggle active, ping, copy secret (shown once)                          |

---

## 4. Suggested test script (15 minutes)

1. `docker compose up` (or Path B) + Mailpit — hit `/health` and `/ready`.
2. Register → verify via Mailpit link → login. Save both tokens.
3. Create 3 tasks (one recurring weekly, one due yesterday = overdue, one with tags). Check `/tasks/stats`.
4. Filter/search/sort combos on `GET /tasks`; export CSV; import a 5-row CSV; confirm counts.
5. Trash one task → restore via bulk → empty trash.
6. Enable 2FA → logout → login → challenge flow with authenticator + one recovery code. Try the challenge token on `GET /me` (must 401).
7. Register a second user; share a task as viewer (verify PUT fails) then upgrade to editor (PUT works, DELETE still 404); comment + read activity.
8. Register a webhook against webhook.site → ping → then complete a task → confirm signed delivery arrives; verify the HMAC signature manually.
9. Rotate the calendar feed token; confirm the old URL 401s.
10. Revoke a session from another device; refresh with its token → 401.
11. Forgot-password via Mailpit → reset → login with new password.
12. Flip role to admin in Mongo → admin users list + role change.
13. `docker compose down` mid-request → confirm soft-fail (API answers, queues/rate-limits degrade, no crash) — restart and check `/ready` again after a minute (known gap N-011: no auto-reconnect until restart).

---

## 5. Troubleshooting

| Symptom                                             | Cause / fix                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Email would be sent (SMTP not configured)` in logs | SMTP trio (`SMTP_HOST/USER/PASS`) not all set — emails dropped. Use Mailpit (§1).                                                                        |
| Register works but "verify" never arrives           | Mailpit not running, or API not restarted after editing `.env`. Check http://localhost:8025.                                                             |
| 401 on every request after deploy                   | Access tokens are 15-min; refresh via `/auth/refresh`. If refresh returns `reuse detected`, all sessions were revoked by theft detection — log in again. |
| 2FA challenge token rejected as Bearer              | **By design** (audit N-001 fix) — exchange it at `/auth/2fa/challenge`.                                                                                  |
| Rate-limited (429) while testing                    | Limits are per-IP, 10/15 min on login/register. Wait for `Retry-After`, or restart the API to clear the in-memory window.                                |
| Webhook never delivered                             | Endpoint must be publicly reachable (webhook.site/ngrok). 10 consecutive failures auto-disable — re-`PATCH` `active: true`.                              |
| Redis errors in logs / no emails sent               | Redis down = soft-fail: API stays up, but queues (email/webhooks), shared rate limits and stats cache degrade. Fix Redis, restart.                       |
| `/ready` stays degraded after Redis blip            | Known gap (N-011): Redis init is one-shot — restart the app after Redis recovers.                                                                        |
| CORS errors from the web console                    | Set `CORS_ORIGIN=http://localhost:5173` in the API `.env` and restart.                                                                                   |
| `npm test` fails on Mongo download                  | First run downloads mongodb-memory-server binaries; allow network or pre-seed the cache.                                                                 |

---

## 6. Reference

- **Full endpoint tables:** [`README.md`](../README.md)
- **Security audit & findings:** [`AUDIT-2026-10.md`](AUDIT-2026-10.md)
- **Env vars:** `.env.example` (server fails fast if `MONGO_URI` or `JWT_SECRET` missing)
- **Token lifetimes:** access 15 min (`ACCESS_TOKEN_TTL=900`) · refresh 7 d (rotating, hashed in Mongo) · 2FA challenge 5 min · reset 30 min · email-verify 24 h
