# 🚀 TaskAPI Web Client

A design-forward **Next.js 16 (App Router) + React 19 + TypeScript** web client for
the TaskAPI backend (repo root). "Mission Control" dark theme — amber accent,
constellation task hero, shadcn-style primitives, motion discipline.

## Stack

- **Next.js 16** (App Router, Turbopack pinned to `client/`) · TypeScript strict
- **Tailwind CSS v4** + token system in `globals.css` (shadcn var bridge)
- **TanStack Query** — query keys, optimistic mutations, pure page reducers
- **Zod + React Hook Form** — forms mirroring backend validation
- **three / @react-three/fiber + drei** — isolated R3F constellation hero
- **Phosphor icons** · `motion` (Framer Motion) · `lenis` smooth scroll
- **Vitest** (unit) + **Playwright** (e2e, local-only)

## Getting started

The backend API is expected on `http://localhost:3000` (repo root):

```bash
cd client
npm install
npm run dev          # Next dev on http://localhost:5173
```

Point the client at a deployed API with `NEXT_PUBLIC_API_URL` (defaults to
`http://localhost:3000`).

## Scripts

| Command         | Description                              |
| --------------- | ---------------------------------------- |
| `npm run dev`   | Next dev on :5173                        |
| `npm run build` | Production build (`next build`)          |
| `npm start`     | Serve the build (PORT-able)              |
| `npm run lint`  | oxlint                                   |
| `npm test`      | Vitest unit suite (src only)             |
| `npm run e2e`   | Playwright smoke (local-only, see below) |

## E2E (local-only)

`npx playwright test` boots two servers via `playwright.config.ts`:

- `scripts/e2e-api.mjs` — in-memory MongoDB (pinned 7.0.14) + the real Express
  API (`tsx src/server.ts`) on :3000
- `next dev` on :5173

`auth.setup.ts` registers a fresh user → storage state at
`e2e/.auth/user.json` (gitignored). `smoke.spec.ts` runs one continuous
flight: create → complete → trash → undo → restore → settings → sign out, using
the worker-scoped `sharedPage` fixture (`e2e/fixtures.ts`).

E2E intentionally stays out of CI (needs a mongod binary + Chromium).

## Pages

`/` landing · `/login` · `/register` · `/two-factor` · `/verify-email` ·
`/forgot-password` · `/reset-password` · `/dashboard` · `/dashboard/task/[id]` ·
`/trash` · `/settings` · `/shared`

## API contracts

`src/lib/api.ts` — fetch wrapper with single-flight silent refresh (access token
in memory, refresh token in localStorage, rotation syncs `sessionId`). Backend
route/contract details live in the repo-root `README.md`.
