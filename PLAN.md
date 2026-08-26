# PLAN.md — Secrets → TypeScript → Ship

> **Branch:** `feat/typescript-esm`
> **Last updated:** 2026-08-26 (session 2)
> **Status:** Steps 1–2 + 3a complete, committed. **Next: Step 3b (`src/types/` + `src/errors/` + DTOs).**
> Supersedes the earlier TaskForge mega-plan. `features.txt` is shelved — do not
> reopen it unless a future goal demands one specific feature from it.

---

## ⚡ RESUME HERE

Start session by reading this file, then:

```bash
git log --oneline -5        # confirm session-1 commits exist
git status                  # should be clean
```

Then execute **Step 3b (`src/types/` + `src/errors/`)** below. Do not skip
ahead; each step ends with the full test suite green and a commit.

---

## 0. Manual prerequisites (USER — not agent)

| #   | Action                                                          | Status                 |
| --- | --------------------------------------------------------------- | ---------------------- |
| 0.1 | Rotate MongoDB Atlas user password                              | ☐ **VERIFY WITH USER** |
| 0.2 | New `JWT_SECRET` (`openssl rand -base64 48`) in local `.env`    | ☐ **VERIFY WITH USER** |
| 0.3 | Repo stays private until history purge (see `docs/SECURITY.md`) | ongoing                |

## Decisions (locked — do not relitigate)

- **Zod consolidation**: all 19 express-validator chains replaced during conversion; schemas in `src/schemas/` are single source of truth (`z.infer` types)
- **Vitest** replaces Jest (native TS+ESM); coverage thresholds unchanged (statements 80 / branches 60 / functions 70 / lines 82)
- **Keep jsonwebtoken** (Argon2id, jose, and all other hardening = shelved, see §Shelf)
- **`client/` frozen** — Next.js app untouched; API response shapes must never break
- Conventional commits; tests green at every commit; convert in place, no restructure

---

## Step 1 — Repo hygiene ✅ DONE

- [x] Branch `feat/typescript-esm`
- [x] `git rm --cached .env`
- [x] `docs/SECURITY.md` — rotation steps + git-filter-repo purge instructions
- [x] `.gitignore`: prompt.txt / features.txt ignored (local spec files)
- [x] Commits: `chore: stop tracking .env` + `docs: security notice …`

## Step 2 — Tooling foundation ✅ DONE

- [x] `package.json`: `"type": "module"` — **DEFERRED to cutover** (end of Step 4): flipping now breaks all Jest CJS runs, so dual-stack instead — legacy JS keeps running under Jest while `src/**/*.ts` grows via tsx/vitest; flag flips together with script swap + jest/nodemon removal so every intermediate commit stays green (user-approved deviation)
- [x] devDeps add: `typescript@6`, `tsx`, `vitest@4`, `@vitest/coverage-v8`, `typescript-eslint@8` (unified pkg incl. plugin+parser), `@types/{node,express,jsonwebtoken,nodemailer,qrcode,supertest,cors,compression,swagger-ui-express}` + `@types/swagger-jsdoc` (plan gap, added)
- [ ] devDeps remove: `jest`, `nodemon` → **moved to cutover**; deps remove: `express-validator` (after middleware step), keep bcryptjs/zod/etc.
- [x] `tsconfig.json` strict: strict, noImplicitAny, noImplicitReturns, noUncheckedIndexedAccess, exactOptionalPropertyTypes, NodeNext, isolatedModules, esModuleInterop, skipLibCheck; relative imports use `.js` extensions (ESM rule). Note: rootDir/outDir live in build config so future `tests/` typecheck without TS6059
- [x] `tsconfig.build.json` (rootDir src, outDir dist, excludes tests + vitest.config.mts)
- [x] ESLint flat config → `eslint.config.mjs` (ESM-safe before flag flip); typescript-eslint **strict preset explicitly scoped to `**/*.ts` + `**/*.mts`** (v8 presets are NOT auto-scoped — unscoped they error on every legacy `require()`); legacy JS block preserved verbatim; Prettier unchanged
- [x] `vitest.config.mts` (.mts avoids Vite ESM-in-CJS warning): node env, `tests/**/*.test.ts`, coverage thresholds identical (80/60/70/82); sanity spec verified pipeline then removed
- [x] Scripts: `typecheck`=`tsc --noEmit` added now; `dev`/`build`/`start`/`test` swap happens at cutover

## Step 3 — Layer-by-layer conversion (commit per layer)

Order & notes (from completed code audit):

- [x] **3a `src/config/`** ✅ — all 8 modules ported + `env.ts` (Zod schema covers **all 20 repo-wide keys**, not just config's own — later layers import `env.*` directly); fail-fast on MONGO_URI/JWT_SECRET at parse time; `import "dotenv/config"` lives INSIDE env.ts so ordering is safe regardless of import graph (legacy index.js loads dotenv AFTER requiring config — a latent footgun the port kills). `constants.ts` uses `as const` tuples + exported unions (`TaskStatus`, `Role`, …) ready for 3c models & 3f zod enums. Caveats carried forward: swagger `apis` glob still `"./controllers/*.js"` (retarget when controllers migrate in 3f); db/logger keep `console.*` (parity; FIND-007 console→pino swap happens 3d per plan). Jest now ignores `/tests/` (default testMatch was double-running vitest specs). First real Vitest suite: `tests/unit/env.test.ts` 7/7
- [ ] **3b `src/types/` + `src/errors/` + DTOs** — Express Request augmentation (`req.user`); AppError hierarchy (ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, RateLimitError, DatabaseError, ExternalServiceError) replacing ~10× `Object.assign(new Error, {status})`; DTOs so passwordHash/totpSecret/recoveryCodeHash/webhookSecret/refreshTokenHash never leak
- [ ] **3c `src/models/`** — InferSchemaType/HydratedDocument/Model typing; schemas+indexes identical. Watch: `Schema.Types.Mixed` ×2 (idempotency body, activity meta → type as unknown-record shapes); tags custom validator closure; recurrence enum includes null; users pre-save async hash hook + comparePassword method; webhooks enum fed by inline require (move to constants import)
- [ ] **3d `src/middleware/`** — auth/rbac/error_handler (pino req.log replaces console.error — FIND-007 rides along)/zodValidate(schema, source) generic; DELETE validate.js after routes migrated
- [ ] **3e `src/services/`** — typed contracts; tasks.service (584L: aggregation pipeline, stats $facet, CSV/iCal builders, RFC4180 parser, import idempotency w/ E11000 replay), auth.service (rotation/theft-detection/TOTP/recovery/feed tokens; otplib authenticator.options monkey-patch at load → configure explicitly), webhooks.service (kill per-call `new Queue()`), collab (loadTaskWithAccess chokepoint), email (module-load transporter → lazy init), analytics (PostHog seam)
- [ ] **3f `src/controllers/` + `routes/` + `src/schemas/`** — thin controllers; schemas/{auth,tasks,bulk,imports,webhooks,comments,sharing,sessions,admin}.ts mirroring existing EV rules exactly (behavior-preserving!); kill lazy require in collab_controller:276; HTTP status audit while touching each route
- [ ] **3g `src/jobs/`** — typed payloads (SendEmailJob{to,subject,body}, WebhookDeliveryJob{webhookId,url,secret,event,rawBody}, empty-data crons), shared ioredis connection via getClient() everywhere, QUEUES constants replace hardcoded "emails"/"reminders"/"trash-cleanup"
- [ ] **3h `src/app.ts` + `src/server.ts`** — app = Express construction only (Supertest imports without boot); server.ts = env check, redis init, workers, listen, graceful shutdown (SIGINT/SIGTERM already implemented — port it); kills index.js module-scope connectDB side-effect that server_test depends on; delete all root-level JS + old dirs

Interop care (CJS packages under ESM): default-callables (pino, swagger-jsdoc,
nodemailer.createTransport, Redis ctor, express()); property-access objects
(swagger-ui-express serve/setup, prom-client register, Sentry.*, QRCode.toDataURL);
named destructure OK (bullmq Queue/Worker dual-published). No __dirname/__filename
usage exists; no .json imports; no circular deps.

## Step 4 — Tests → Vitest

- [ ] 11 suites `__tests__/*.js` → `tests/unit|integration/*.test.ts`
- [ ] Mechanics: `jest.mock("posthog-node", factory)` → `vi.mock` (top-level hoisting); lazy requires inside beforeAll → static imports with env set in `vitest.setup.ts` BEFORE app imports (fixes sessions/webhooks env-timing hacks); `global.fetch = jest.fn()` ×3 → `vi.stubGlobal`; `jest.setTimeout(30000)` → config testTimeout
- [ ] server_test rebuilt against clean app/server split (no `require("../index.js")` side effects)
- [ ] Coverage thresholds identical in vite config; add **100-concurrent same-Idempotency-Key → exactly 1 task created**
- [ ] Self-assembled-app pattern (8 suites build their own express() + memory mongo) can be kept initially or unified via a shared `tests/helpers/buildApp.ts` — helper preferred

## Step 5 — Ship prep

- [ ] README: stack bullets (TS/ESM/Vitest), folder structure section, commands table
- [ ] Dockerfile multi-stage verified against tsc output (note: `.gitignore` already ignores `dist`)
- [ ] CI: add typecheck + build steps to Node 20/22 matrix; coverage upload unchanged
- [ ] Local verify: `npm run build` ✓ · `docker build` ✓ · full suite ✓ · lint ✓ · `/health` `/ready` ✓ · swagger loads ✓
- [ ] Final commit + push branch

---

## 🗄️ The Shelf (explicitly OUT — revisit only with a concrete reason)

Argon2id migration · purpose-tag reset/verify JWTs · webhook SSRF guards · TTL indexes · per-account login throttle · cursor pagination · search bounds · monorepo/pnpm · multi-tenancy/orgs · AI/MCP/CLI/Terraform/S3 · any client changes · TaskForge anything.

Small wins allowed anytime: fix client P7 e2e (`page.goto("/dashboard")` at top of serial tests 2–7 per CONTINUE.md).

## Session protocol

1. Read this file top-to-bottom · 2. `git log --oneline -5` · 3. Execute next unchecked box · 4. Tests green → commit → tick box here · 5. Update "Last updated" + RESUME HERE · 6. Never leave repo red.

## Progress Log

- **2026-08-25 (session 1):** Audited repo fully (54 JS files, ~7.8k LOC, 149 tests green). Wrote plan, got approvals (Zod consolidation, Vitest). Created branch, untracked `.env`, wrote docs/SECURITY.md, ignored local spec files. Stopped before Step 2.
- **2026-08-26 (session 2):** Step 2 done as dual-stack (user approved deferring `type: module` to cutover): TS6/Vitest4/typescript-eslint8 + all @types installed; tsconfig(.build).json strict NodeNext; eslint.config.mjs with strict preset scoped to TS globs (unscoped preset errors on legacy require()); vitest.config.mts with identical coverage thresholds; `typecheck` script added. Env repair: cached mongod 8.2.1 binary was a truncated ELF (the known sandbox SIGSEGV) — re-extracted from cached tgz, jest back to green. Gates: lint ✓ typecheck ✓ prettier ✓ vitest sanity ✓ jest 149/149 ✓. Next: 3a.
- **2026-08-26 (session 2, cont.):** Step 3a done — `src/config/` fully ported + env.ts (20 keys, fail-fast core, self-loading dotenv). Strict-TS friction solved en route: ioredis `call(cmd, args[])` overload + `RedisReply` cast for rate-limit-redis sendCommand; tsx eval snippets are CJS under commonjs package (no top-level await). Jest/vitest overlap fixed via jest testPathIgnorePatterns `/tests/`. Runtime smoke-tested under tsx. Gates: typecheck ✓ lint ✓ prettier ✓ vitest 7/7 ✓ jest 11 suites 149/149 ✓. Next: 3b.
