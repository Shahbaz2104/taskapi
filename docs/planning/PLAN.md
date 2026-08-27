# PLAN.md — Secrets → TypeScript → Ship

> **Branch:** `feat/typescript-esm` — merged to `main` via PR #2 (`203aeab`)
> **Location:** `docs/planning/PLAN.md` — start sessions HERE
> **Last updated:** 2026-08-26 (session close)
> **Status:** ✅ SHIPPED — Steps 1–5 complete, ESM cutover landed, CI green on `main` after lockfile hotfix (`4c54d0e`). Nothing pending except FIND-001 rotation (user) and post-deploy follow-ups in PROJECT_STATUS.md.
> Supersedes the earlier TaskForge mega-plan. `features.txt` is shelved — do not
> reopen it unless a future goal demands one specific feature from it.

---

## ⚡ STATUS: SHIPPED

Migration shipped 2026-08-26 via **PR #2** (merge `203aeab`; branch
`feat/typescript-esm` may be deleted). Post-merge CI failure was a stale
lockfile entry (`yaml`) — fixed by regeneration in `4c54d0e`; pipeline is
green on `main` (typecheck · lint · format · vitest coverage · build,
Node 20 & 22).

Nothing pending from this plan. Live project items live in
`docs/PROJECT_STATUS.md`: FIND-001 credential rotation, first real
Docker/deploy build, Swagger annotations re-add, cursor pagination.

---

## 0. Manual prerequisites (USER — not agent)

| #   | Action                                                        | Status                                                                                                              |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 0.1 | Rotate MongoDB Atlas user password                            | ✅ DONE 2026-08-27                                                                                                  |
| 0.2 | New `JWT_SECRET` (`openssl rand -base64 48`) in local `.env`  | ✅ DONE 2026-08-27                                                                                                  |
| 0.3 | Repo stays private until history purge (see `../SECURITY.md`) | ✅ DONE 2026-08-27 — `.env` + `client/e2e/.auth/user.json` purged via `git filter-repo`, force-pushed, export-ready |

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
- [x] **3b `src/types/` + `src/errors/` + DTOs** ✅ — `src/errors/index.ts`: AppError base (status via `new.target.name`) + all 8 subclasses; mapped from the 13 real `Object.assign(new Error,{status})` sites (400×3, 401×6, 404×2, 409×2) + forward-stubs for 403/429/500/502 consumers in later layers; `isAppError` guard for the 3d handler. `src/types/auth.ts`: discriminated `SignedJwtPayload` (access vs challenge via `purpose?: undefined` trick) + `RequestUser {userId: Types.ObjectId, role}` matching auth_middleware:17 exactly. `src/types/express.d.ts`: global `req.user?`. `src/dto/user.dto.ts`: `PublicUser` mirrors the /me wire byte-for-byte — verified against user_controller getMe (`select("-password")`, no transforms → includes totpEnabled + `__v` passthrough); `toPublicUser()` serializer makes leaks unrepresentable; secret fields covered by negative tests. Vitest suites now 3 files / 13 tests
- [x] **3c `src/models/`** ✅ — 8 files: `task.ts user.ts token.ts webhook.ts idempotency.ts activity.ts comment.ts taskShare.ts` (legacy `_models.js` suffix dropped — src tree uses clean singular names). InferSchemaType attrs + `type XDocument = HydratedDocument<...>` aliases (NOT empty interfaces — tseslint `no-empty-object-type` bans them; and interface-extension can't narrow Mixed-inferred `any`, TS2320 → use `HydratedDocument<Attrs, Overrides>` generic for the two Mixed fields typed as `Record<string, unknown> | null`). Enums now sourced from constants (`[...TASK_STATUSES]` etc., spread because readonly tuples); webhook inline require replaced by constants import per plan. users: pre-save hash hook + `comparePassword` via `UserMethods` + explicit `this:` annotations; partial unique calendarFeedToken index ported verbatim. **Latent quirk found & preserved bug-for-bug:** `{type:[String], enum}` does NOT validate array elements in mongoose 9 (verified against legacy model — both accept `events:["nope"]` at doc level); real enforcement lives upstream in validators → ensure 3f zod schemas validate events strictly. ShareRole union exported from taskShare. Runtime smoke under tsx proved defaults/casting/method wiring identical.
- [x] **3d `src/middleware/`** ✅ — `auth.ts` (protect: Bearer parse w/ noUncheckedIndexedAccess guard on split[1]; decoded-payload narrowing to DecodedAccessToken; TokenExpiredError vs invalid; attaches typed RequestUser), `rbac.ts` (authorize(...roles); missing req.user → 403 fallback instead of legacy TypeError-500 — unreachable-after-protect, defensive only), `error_handler.ts` (FIND-007 done: pino `req.log` with logger fallback so unit tests don't need pinoHttp; status extraction via structural `{status?: unknown}` narrow — accepts AppError AND legacy-style `.status` carriers; >=500 mask preserved verbatim), `zod.ts` (zodValidate(schema, source) — ported the EXISTING middleware/zod_validate.js contract byte-for-byte: direct 400 `{error:"body.<path>: <msg>"}` first-issue label, parsed body written back, query/params read-only). Legacy validate.js NOT deleted yet (routes migrate at 3f). Tests: supertest-driven express apps — errorHandler status/message matrix ×4, zodValidate coercion + failure labels ×4, rbac ×3 = vitest now 24 tests / 4 files. Strict-TS friction solved: RequestHandler vs 4-arg ErrorRequestHandler contravariance → single cast at call site; supertest query values URL-serialize to strings (don't "test" numeric rejection via query).
- [x] **3e `src/services/`** ✅ — all 6 ported. `tasks.service.ts`: aggregation `$facet` results typed via `aggregate<FacetRow>` generics + safe `rows[0]` guards (noUncheckedIndexedAccess); RFC4180 parser char-access guarded (`src[i] ?? ""`); import row validator returns `{doc}|{error}` union with exact legacy messages; 400/409 throws → ValidationError/ConflictError; `csvEscape` keeps legacy quirk (CR not escaped — noted, not fixed, behavior-preserving). `auth.service.ts`: all 8 Object.assign throws → AppError classes; challenge tokens typed via `satisfies ChallengeTokenPayload` + `String(userId)` at sign (ObjectId→string serialization made explicit); recovery-code entry typed via `NonNullable<UserAttrs["recoveryCodes"]>[number]`; otplib `window:1` configured explicitly. `webhooks.service.ts`: **per-call `new Queue()` KILLED** → lazy singleton `Queue<WebhookDeliveryJob>`; `event: WebhookEvent` typing forced one behavior-identical query rewrite (`events: event` → `events: {$in:[event]}` — mongoose FilterQuery rejects bare string on [Enum] path; Mongo semantics unchanged). `email.service.ts`: **module-load transporter → lazy `getTransporter()`** (import now side-effect-free); queue name from QUEUES constant; typed `EmailJobPayload`. `collab.service.ts`: loadTaskWithAccess chokepoint fully typed w/ AccessResult discriminated union; populated-lean rows via explicit LeanShareRow interface cast. `analytics.service.ts`: seam preserved, null-safe getClient?.(). Pure-function vitest coverage added (parser/builders/validators/sort — no DB needed): **37 tests / 5 files**. Strict-TS lessons: unknown-typed params poison FilterQuery → use `Id = string|Types.ObjectId` everywhere; lean() loses _id in v9 types → boundary casts; EOT needs explicit `| undefined` on optional props assigned conditionally.
- [x] **3f `src/controllers/` + `routes/` + `src/schemas/`** ✅ — thin controllers; schemas/{auth,tasks,bulk,imports,webhooks,comments,sharing,sessions,admin}.ts mirroring existing EV rules exactly (behavior-preserving!); kill lazy require in collab_controller:276; HTTP status audit while touching each route
- [x] **3g `src/jobs/`** ✅ — typed payloads (SendEmailJob{to,subject,body}, WebhookDeliveryJob{webhookId,url,secret,event,rawBody}, empty-data crons), shared ioredis connection via getClient() everywhere, QUEUES constants replace hardcoded "emails"/"reminders"/"trash-cleanup"
- [x] **3h `src/app.ts` + `src/server.ts`** ✅ — app = Express construction only (Supertest imports without boot); server.ts = env check, redis init, workers, listen, graceful shutdown (SIGINT/SIGTERM already implemented — port it); kills index.js module-scope connectDB side-effect that server_test depends on; delete all root-level JS + old dirs

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

- [x] README: stack bullets (TS/ESM/Vitest), folder structure section, commands table
- [ ] Dockerfile multi-stage verified against tsc output (note: `.gitignore` already ignores `dist`)
- [ ] CI: add typecheck + build steps to Node 20/22 matrix; coverage upload unchanged
- [x] Local verify: `npm run build` ✓ · full suite ✓ · lint ✓ · `/health` `/ready` ✓ · dist boot-check PASSED (`scripts/boot-check.mjs`) · swagger loads ✓ — docker build deferred (no daemon; first deploy proves it)
- [x] Final commit + push branch — merged via PR #2; lockfile hotfix `4c54d0e` pushed straight to main

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
- **2026-08-26 (session 2, cont. 2):** Step 3b done — errors hierarchy (8 classes mapped from the 13 real throw sites), JWT payload union, global `req.user` augmentation, PublicUser DTO with serializer + leak tests. Gates: typecheck ✓ lint ✓ vitest 13/13 ✓ jest 149/149 ✓. Then consolidated docs: AUDIT.md + PROJECT_STATUS.md → docs/, PLAN.md + CONTINUE.md → docs/planning/, local prompt/features specs → docs/local-specs/ (gitignored by name, still untracked); SECURITY.md cross-ref stays valid as sibling; root now has README.md only. Next: 3c.
- **2026-08-26 (session 2, cont. 3):** Step 3c done — all 8 models typed (InferSchemaType + HydratedDocument aliases + overrides-generic for Mixed fields). Strict-TS lessons: empty interfaces banned by lint; narrowing Mixed needs HydratedDocument<Attrs, Overrides>, not interface extends. Webhook events enum quirk verified bug-for-bug (mongoose [String]+enum never validated elements; flagged for strict zod coverage in 3f). Runtime smoke green under tsx; legacy suite untouched. Gates: typecheck ✓ lint ✓ prettier ✓ vitest 13/13 ✓ jest 149/149 ✓. Next: 3d.
- **2026-08-26 (session 2, cont. 4):** Step 3d done — auth/rbac/error_handler/zod ported; FIND-007 (console.error → pino req.log w/ fallback) landed here. zodValidate preserves existing zod_validate.js contract exactly. Vitest suite doubled to 24 tests across 4 files (supertest-driven). Gates: typecheck ✓ lint ✓ prettier ✓ vitest 24/24 ✓ jest 149/149 ✓. Next: 3e.
- **2026-08-26 (session 2, cont. 5):** Step 3e done — all 6 services typed; webhooks queue singleton (per-call Queue killed); email transporter lazy (import side-effect-free, proven via tsx smoke of all 6 modules); auth throws → AppError classes; tasks.service facets/parser/import fully typed + 13 new pure-function tests. Gates: typecheck ✓ lint ✓ prettier ✓ vitest 37/37 ✓ jest 149/149 ✓. Next: 3f (controllers+routes+schemas — biggest remaining layer).

- **2026-08-26 (session 2, AFK stretch):** Steps 3f+3g+3h ALL DONE in one autonomous run. 3f: 8 zod schema files mirror every EV rule message-for-message (two porting bugs CAUGHT by the new integration suite and fixed: bulk priority + update status missing .optional()); 6 controllers + 4 routes; requireUser helper (currentUser) added to middleware/auth. 3g: 4 jobs with typed payloads, QUEUES constants, no hardcoded queue strings; trash worker error reporting via worker.on('error'). 3h: createApp()/boot split — NO module-scope connectDB; graceful shutdown preserved; metrics registered once via flag. NEW: tests/integration/app.test.ts boots the ENTIRE new tree against memory-mongo — register/validation/me/tasks CRUD/bulk trash-restore/login/refresh-rotation-reuse-detection all green (10 tests). Strict-TS lessons this stretch: mongoose v9 + EOT rejects undefined-valued keys in create() AND query filters (compact() helper / `as never` on optional-var filters); express-rate-limit v8 exports required-Options but rateLimit() takes Partial<Options>; bullmq repeat opts need cast; FilterQuery not exported from mongoose root in v9. Gates at every step: typecheck+lint+prettier clean, vitest 47/47 (6 files), jest legacy 149/149 untouched-green.

- **2026-08-26 (session 2, break point):** Step 4 batch 1 committed. env.ts redesigned as live proxy (string keys re-read process.env — required for suite parity with lazy legacy reads); vitest harness gains setup file + 30s timeouts; 4 suites ported + server_test rebuilt on clean split; swagger-ui restored in app.ts; PORT=0 lines dropped (zod rejects port 0). unit_tests.js officially superseded by tests/unit superset. vitest 74/74 (10 files) · jest 149/149 · all static gates green. NEXT on resume: port trash → collab → webhooks → twofa → import_ical → tasks(985L), then cutover checklist (see RESUME HERE).

- **2026-08-26 (session 2 finale):** Step 4 finished (tasks_test.ts 65 cases — biggest file — plus import_ical 11; parity fix: zodValidate params-source answers bare message like EV param chains; NodeNext dynamic-import namespace quirk handled with double-cast at mounts; analytics mock via vi.hoisted). CUTOVER EXECUTED: type=module, scripts swapped, jest/nodemon/express-validator removed, ALL legacy JS deleted (git rm of 9 paths incl. index.js/**tests**), eslint TS-only, swagger glob → src/controllers/*.ts (annotations gap accepted & documented). Interop fixes under real ESM: ioredis named `Redis` import; pino-http runtime `.default` unwrap. VERIFIED: tsc build clean → node dist/server.js boot-check PASSED against memory-mongo (health 200 / ready db:connected / register→token roundtrip) via scripts/boot-check.mjs. Dockerfile rebuilt multi-stage (build→deps→runner, CMD dist/server.js); .dockerignore gains dist; ci.yml adds Typecheck+Build steps and uses test:coverage. FINAL GATES: typecheck 0 · lint clean · prettier clean · vitest 184/184 · build ✓ · boot ✓ (docker build pending daemon — run locally). Only Step 5 ship-prep remains.

- **2026-08-26 (shipment):** Pushed branch → PR #2 opened & MERGED (`203aeab`). Post-merge CI failed at npm ci: lockfile carried an invalid `yaml@2.0.0-1` where vitest→vite required ^2.4.2 (mid-migration churn; local node_modules masked it). Hotfix: regenerated package-lock from empty tree → `4c54d0e` pushed straight to main → CI GREEN (59s). Also this close: Step 5 docs (README/PROJECT_STATUS refresh), boot-check script, Dockerfile multi-stage, CI gates. INCIDENT NOTE: during Step-5 doc edits PLAN.md was accidentally overwritten with PROJECT_STATUS content (landed in a9e894c); restored from aabf2e4 and re-applied finale edits in this commit — history preserved above is authoritative.
