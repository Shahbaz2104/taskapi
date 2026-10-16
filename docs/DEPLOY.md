# Deployment Guide

Target architecture (per `docs/planning/CONTINUE.md`):

```
┌─────────────────┐         ┌──────────────────────────┐
│  Next.js client │  HTTPS  │  Express API             │
│  (Vercel)       │ ──────► │  (Render or Railway)     │
└─────────────────┘         │  + MongoDB Atlas         │
                            │  + Redis (Upstash)       │
                            │  + SMTP (any provider)   │
                            └──────────────────────────┘
```

The client deploys to **Vercel**. The API is a long-running Node process (BullMQ workers, cron jobs, SSE-free but connection-persistent) and does **not** fit Vercel's serverless function model — host it on **Render** or **Railway** (or any container host). A Dockerfile is included; both platforms support it.

---

## 1. MongoDB Atlas (free tier)

1. Create an account → **Build a Database** → **M0 (free)**.
2. **Database Access**: create a user with _Read and write to any database_; database name e.g. `taskapi`.
3. **Network Access**: add `0.0.0.0/0` (Render/Railway IPs change) or their current egress CIDRs if you prefer scoping.
4. **Connect → Drivers** → copy the URI:
   `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/taskapi?retryWrites=true&w=majority`
   This is your `MONGO_URI`.

## 2. Redis (Upstash, free tier) — optional but recommended

Without Redis the API still runs (soft-fail), but you lose: shared rate limits, stats cache, **all background jobs** (email, reminders, trash purge, webhook deliveries).

1. Upstash Console → **Create Database** (free tier, Redis REST or TCP).
2. For BullMQ use the **TLS TCP** URL: `rediss://default:<password>@<host>:<port>`.
3. Set it as `REDIS_URL`. Docker Compose healthchecks are irrelevant here — the app treats Redis as optional.

## 3. API on Render

1. **New → Web Service** → connect the GitHub repo.
2. Settings:
   - **Runtime**: Docker (uses the repo `Dockerfile`) — or _Node_ with build `npm ci && npm run build`, start `npm start`.
   - **Health Check Path**: `/ready`
3. **Environment** (all set in the dashboard — never commit secrets):

   | Variable                                                            | Value                                          |
   | ------------------------------------------------------------------- | ---------------------------------------------- |
   | `NODE_ENV`                                                          | `production`                                   |
   | `MONGO_URI`                                                         | Atlas URI from §1                              |
   | `JWT_SECRET`                                                        | 32+ random chars (`openssl rand -hex 32`)      |
   | `REDIS_URL`                                                         | Upstash URL from §2                            |
   | `CLIENT_BASE_URL`                                                   | `https://<your-client>.vercel.app`             |
   | `CORS_ORIGIN`                                                       | same as `CLIENT_BASE_URL`                      |
   | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | any SMTP provider (Resend, Postmark, Mailgun…) |
   | `SENTRY_DSN`, `POSTHOG_API_KEY`, `POSTHOG_HOST`                     | optional observability                         |
   | `TRASH_RETENTION_DAYS`                                              | optional, default `30`                         |

4. Deploy. Watch logs for `Server listening` — first boot builds indexes; failures at boot are almost always `MONGO_URI`/`JWT_SECRET` (fail-fast by design).

Railway equivalent: **New Project → Deploy from GitHub** → same env vars; set a custom healthcheck path `/ready`.

## 4. Client on Vercel

1. Vercel **Add New → Project** → import the repo → set **Root Directory** = `client` (important — the repo root is the API).
2. Build settings are auto-detected (Next.js). Environment:

   | Variable              | Value                                                                               |
   | --------------------- | ----------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_API_URL` | `https://<your-api>.onrender.com` (no trailing slash; the client appends `/api/v1`) |

3. Deploy → note the production domain (`https://<project>.vercel.app`).
4. **Back on the API**: set `CORS_ORIGIN` + `CLIENT_BASE_URL` to that exact domain and redeploy — the API defaults to `*` which works but is not production-grade.

> The GitHub integration auto-deploys previews on PRs and production on pushes to `main` (this is what the "Vercel" check on PRs does).

## 5. Post-deploy smoke test

```bash
API=https://<your-api>.onrender.com

curl -s $API/health                    # {"status":"OK"}
curl -s $API/ready                     # {"status":"ready",...} — DB + Redis both checked

# full flow against production
curl -s $API/api/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"smoke","email":"smoke@example.com","password":"secret1"}'
# → 201 + token pair; verification email should arrive via SMTP (or bounce to your provider's logs)
curl -s $API/api/v1/me -H "Authorization: Bearer <accessToken>"   # → 200 profile
```

Then open the client URL, register through the UI, create a task, and confirm `/api/v1/tasks/stats` reflects it.

## 6. Operational notes

- **Workers run inside the web process** (email/reminders/trash/webhooks start in `server.ts`). One service instance = workers active. Scale to **multiple replicas only after** moving rate limits to Redis (already) and accepting duplicate-cron risk — reminders/trash jobs are single-instance-safe only at N=1 (audit N-006/N-011 track graceful drain + Redis reconnect).
- **Graceful shutdown**: Render/Railway send SIGTERM; the app closes HTTP → Redis → Mongo with a 10 s watchdog. Known gap: workers are not drained yet (N-006).
- **Secrets**: rotate `JWT_SECRET` only with a logout-everyone plan (all access+challenge tokens die instantly; refresh tokens are DB-hashed and survive).
- **Custom domains**: set on both platforms; update `CLIENT_BASE_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`.
- **Not on Vercel, ever**: the API. Serverless would freeze BullMQ/cron between invocations and drop long-lived connections. If you outgrow Render/Railway, move to Fly.io/Railway containers — same Dockerfile.

## 7. Quick checklist

- [ ] Atlas M0 + DB user + `0.0.0.0/0`
- [ ] Upstash Redis URL
- [ ] API service deployed, `/ready` green, env matrix complete
- [ ] Client deployed with `NEXT_PUBLIC_API_URL`
- [ ] API `CORS_ORIGIN` + `CLIENT_BASE_URL` point at the client domain
- [ ] SMTP verified (send yourself a test reset link)
- [ ] Smoke test passed (§5)
- [ ] PostHog/Sentry projects wired (optional)
