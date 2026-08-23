# CONTINUE.md — where we left off

_Last updated: 2026-08-23 (end of Phase 4 session)_
_Read this first next session. Update it at the end of every phase._

## Mission

Build a design-forward **Next.js web client** (`client/`) for the TaskAPI
backend, using the full design toolkit: shadcn/ui registry, React Bits-style
primitives (`src/components/bits/`), KokonutUI-style pieces
(`src/components/kokonut/`), Phosphor icons, R3F constellation hero, Lenis
smooth scroll, and motion discipline from Emil Kowalski's philosophy
(functional UI ≤300ms ease-out; delight budget only on landing/first-run).

Design direction locked: **dark "Mission Control"** — base `#0a0e14`,
amber `#f5a623` accent used sparingly, Clash Display / Instrument Sans /
JetBrains Mono. Signature element = task-node constellation (hero echo:
tiny amber pulse dot for live sync).

## Done (commits on `origin/main`, all pushed)

| Commit    | What                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `6226e83` | P0 foundation: Next 16 + React 19 + TS scaffold, token system in `globals.css` (incl. shadcn var bridge), `api.ts` silent-refresh wrapper (single-flight, retry-once), AuthProvider (boot restore, proactive exp-based refresh, logout), Button/Input primitives, root repo scoping (eslint ignores client/**, jest skips client paths)                                                                                                        |
| `ef0335a` | P1 landing: R3F constellation hero (48 nodes, completion edges w/ travelling amber pulses, damped pointer parallax, three.js isolated 868K lazy chunk via dynamic ssr:false + ErrorBoundary + fine-pointer/reduced-motion gates); SplitText/CountUp/Marquee/Reveal/SpotlightCard bits; GridPattern/ShimmerButton kokonut pieces; SiteNav; stats band; 3 scroll chapters (2FA mock / team panel / webhook terminal); stack marquee; CTA; footer |
| `26c7ed6` | P2 auth: `(auth)` route group — login (**username** not email!), `/two-factor` w/ paste-split OtpInput + recovery toggle (challengeToken via sessionStorage `taskapi.challenge`), register (backend returns pair → `adopt()`; dev verificationUrl banner), verify-email/forgot/reset with Suspense-wrapped searchParams; zod schemas in `lib/schemas.ts`; error shake                                                                          |
| `1d10486` | P3 tasks core: query-key factory + optimistic mutations w/ pure page reducers (identity-preserving patch); TaskDialog (shadcn Dialog + RHF + zod mirroring backend rules); TaskRow (animated complete circle, priority chips, dayjs relative overdue, hover menu); dashboard board w/ status tabs, debounced search, 6 sorts, pagination, skeletons, empty states                                                                              |
| `520c89e` | P4 trash+stats+export: `apiText()`, trash/bulk/stats/export API fns, useTrash/useTrashMutations/useStats, dashboard stat cards (CountUp) + recharts priority-mix bar + CSV blob download + delete-toast **Undo→restore**, `/trash` page (restore/purge/empty behind AlertDialogs), AppNav Deck/Trash active links. Hand-wrote alert-dialog primitive after CLI flaked                                                                          |
| `aa4fa82` | P5 collaboration: collab-api contracts; use-collab hooks (optimistic comment prepend w/ "sending…" marker, optimistic revoke); `/dashboard/task/[id]` detail w/ Tabs Comments/Activity/Access (Access owner-only, viewer 403 → read-only hint), SharePanel grant/revoke, ActivityTimeline rail, `/shared` inbox w/ role badges; TaskRow titles link in; nav "Shared"                                                                           |

Backend untouched this whole stretch (149 tests). Client gates each phase:
oxlint clean (only known fast-refresh warnings), vitest 12/12, `next build`
clean, prettier via root.

## Key contracts (verified against backend code)

- API base: `${NEXT_PUBLIC_API_URL:-http://localhost:3000}/api/v1`; CORS defaults `*`
- Login: POST `/auth/login {username,password}` → pair OR `{requires2FA:true, challengeToken}` → POST `/auth/2fa/challenge {challengeToken, code|recoveryCode}`
- Register returns the pair (+ dev-only `verificationUrl`)
- Tasks list: `{tasks,total,page,limit,totalPages}`; sorts `-createdAt|createdAt|-updatedAt|dueDate|-dueDate|-priority`; status enum `pending|in_progress|completed`
- Trash: GET `/tasks/trash`; restore/purge via PATCH `/tasks/bulk {ids[1..100], action: complete|trash|restore|purge}`; empty via DELETE `/tasks/trash` → `{deleted}`
- Stats: `{total, byStatus{pending,in_progress,completed}, byPriority{low,medium,high}, overdue}` (Redis-cached)
- Export: GET `/tasks/export` → text/csv attachment
- Errors always `{error}` → ApiError; Mongo `_id` everywhere

## Gotchas learned (don't rediscover)

1. `sessionStorage` in useState initializer breaks prerender — read inside useEffect.
2. useSearchParams needs `<Suspense>` wrapper or build fails on static pages.
3. RTL auto-cleanup is OFF without vitest globals — `cleanup()` lives in `src/test/setup.ts`.
4. RHF+zod transform schema: don't give useForm an explicit input generic; cast defaultValues instead (`as TaskFormIn`).
5. oxlint purity/refs/immutability rules are strict: no Math.random during render (useFrame callbacks OK), mutable GPU buffers live in a lazy `simRef` touched only in useFrame, geometries attached imperatively via element refs.
6. shadcn CLI can half-fail mid-add (button overwrite prompt) — primitives are hand-writable; check `ls src/components/ui`.
7. Turbopack root pinned to `client/` in next.config.ts (parent has backend lockfile).
8. Backend loginLimiter etc irrelevant client-side; NODE_ENV=test behaviors don't apply to client.

## TODO — next phases

### P6 settings hub (next up)

- Sessions/devices: GET `/me/sessions` (list w/ ip/userAgent/current flag),
  DELETE `/me/sessions/:sessionId`, revoke-all exists too — check user_controller
- 2FA wizard: POST `/auth/2fa/setup` (returns QR dataURL + secret?) → verify code →
  enable shows recovery codes ONCE (copy/download) ; disable w/ password+code;
  exact shapes: read auth_controller lines ~200-360 before building
- Calendar feed: GET `/me/calendar-feed` → `{token,url}`, POST rotate;
  copy button + rotate confirm (old URL dies)
- Webhooks manager: CRUD `/me/webhooks` + ping; secret shown-once banner;
  events checkboxes from config/constants WEBHOOK_EVENTS (task.created,
  task.completed, task.trashed, test.ping)
- Password change endpoint? check `/me/password` existence in user_routes

### P7 ship

- Route-level splitting audit (three.js already isolated), bundle analyze
- Lighthouse ≥90 perf on landing
- Playwright smoke: register→create→complete→delete→restore→logout (needs API running; script it)
- Deploy: Vercel (client) + Render/Railway (API) + Atlas + Upstash; set
  NEXT_PUBLIC_API_URL + API CORS_ORIGIN to Vercel domain
- README: screenshots/GIFs of landing + deck + 2FA, cross-link section,
  update PROJECT_STATUS.md
- CI: add path-filtered client job (npm ci/lint/test/build in client/) to ci.yml

### Standing items

- FIND-001 (user action): rotate Atlas password + JWT_SECRET; .env still tracked in history
- Root README mentions old stack facts? Recheck after P7 deploy URLs exist

## Commands cheat-sheet

```bash
cd client && npm run dev        # Next dev on :5173 (API expected on :3000)
cd client && npm run lint | test | build
npx prettier --write client     # from repo root, then commit
# backend: npm test (jest, 149) — runs from repo root
```

Start next session by reading this file, then `git log --oneline -8`,
then begin P5 with a contract-verification grep of collab controller/routes
(exactly like every phase so far).
