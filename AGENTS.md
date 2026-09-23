# Digit Store project guide

## Scope

Digit Store is a digital storefront delivered as a React SPA and a Hono API on Cloudflare Workers. Keep application behavior unchanged during infrastructure work unless the requested operation requires a code change.

## Stack

- React 19, React Router 7, Vite 6, Tailwind CSS 4, TypeScript
- Hono 4 running in a Cloudflare Worker (`src/index.ts`)
- Cloudflare Worker Assets serving `dist/`
- Cloudflare D1 (`DB`), R2 (`FILES_BUCKET`), and KV (`RATE_LIMIT_KV`)
- Vitest for tests; npm with the committed `package-lock.json` is the package-manager source of truth
- Node.js 22+ (required by the locked Wrangler/Miniflare versions)

## Working agreements

- Never print, commit, or copy values from `.env`, `.dev.vars`, CI secrets, Wrangler auth, or production bindings. Use placeholders in reports.
- Do not run production deploys, remote D1 migrations, secret changes, DNS changes, resource deletion, or credential rotation without explicit confirmation for that operation.
- Preserve the existing JSONC Wrangler configuration, migration history, CI workflow, and local conventions unless the user asks for a change.
- Treat `schema.sql` as a baseline and `migrations/` as ordered changes. Inspect the target database migration state before applying anything remotely; do not blindly run the baseline plus every migration against an existing database.
- Keep `bun.lock` as user-owned state unless the user explicitly chooses Bun. Use `npm ci` for reproducible setup and CI.

## Skills and workflows

For Cloudflare code or configuration, read these verified skills before editing:

1. `/home/eryrizal/.agents/skills/cloudflare/SKILL.md`
2. `/home/eryrizal/.agents/skills/wrangler/SKILL.md`
3. `/home/eryrizal/.agents/skills/workers-best-practices/SKILL.md`
4. `/home/eryrizal/.codex/skills/cloudflare-deploy/SKILL.md` for deploy/hosting/provisioning requests
5. `/home/eryrizal/.codex/skills/security-best-practices/SKILL.md` for an explicitly requested security review or secure-by-default change

Use `.github/agents/cloudflare-stack-operator.agent.md` for Cloudflare operations and deployment planning. For storefront UI work, read `.agents/skills/ui-styling/SKILL.md` and consult `ui-ux-pro-max` when the task needs visual direction. Before UI work, follow the repository's antislop guidance and settle the requested usage mode first.

## Local workflow

Install and validate with:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

If a Linux host has a global `libvips` installation and `sharp` falls back to a native build, rerun installation with `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm ci`.

Run the app locally in two terminals because Vite proxies `/api` to the Worker:

```bash
npm run dev:worker   # Wrangler Worker, normally :8787
npm run dev          # Vite SPA, normally :5173
```

The first smoke check is `GET /api/health` through the Worker. Local secrets belong in the ignored `.dev.vars`; production secrets belong in Wrangler's secret store.

## Change and deployment gates

Before changing Wrangler bindings, run `npx wrangler --version` and validate against the installed schema. After config changes, run type generation/checking as appropriate, then typecheck, tests, build, and a dry run. Use the existing `.github/workflows/deploy.yml` for CI deployment. A direct production `wrangler deploy` requires a confirmed target, artifact/build result, binding and migration status, and rollback plan.
