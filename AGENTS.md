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

Use the following routing so each task loads only the guidance it needs. The Cloudflare skills are trusted user-scope skills and are intentionally referenced in place rather than duplicated into this repository:

### Cloudflare and backend

For Worker, Hono, D1, R2, KV, Wrangler configuration, or platform operations, read these before editing:

1. `/home/eryrizal/.agents/skills/cloudflare/SKILL.md`
2. `/home/eryrizal/.agents/skills/wrangler/SKILL.md`
3. `/home/eryrizal/.agents/skills/workers-best-practices/SKILL.md`

Also load `/home/eryrizal/.codex/skills/cloudflare-deploy/SKILL.md` only for deploy, hosting, or provisioning requests. Load `/home/eryrizal/.codex/skills/security-best-practices/SKILL.md` only when the user explicitly requests a security review or secure-by-default change. Use `.github/agents/cloudflare-stack-operator.agent.md` for Cloudflare operations and deployment planning.

### Storefront UI and design

For React, Vite, Tailwind, accessibility, responsive layout, or visual work, load:

- `.agents/skills/ui-styling/SKILL.md` for implementation and component styling.
- `.agents/skills/ui-ux-pro-max/SKILL.md` only when visual direction, UX research, or stack-specific design guidance is needed.
- `.agents/skills/brand/SKILL.md` when changing brand voice or visual identity.
- `.agents/skills/design-system/SKILL.md` when creating or changing shared design tokens/components.
- `.agents/skills/banner-design/SKILL.md` only for requested banner/creative assets.

### Antislop UI guardrails

The antislop package is installed in this workspace so the rules are portable and versioned with the project. For UI or copy work, read the core and the relevant supplements together:

- `.agents/skills/antislop/SKILL.md` (core filter and delivery gate)
- `.agents/skills/antislop-ui/SKILL.md` (visual/UI decisions)
- `.agents/skills/antislop-copywriting/SKILL.md` (user-facing copy)
- `.agents/skills/antislop-human/SKILL.md` (contrast, keyboard, focus, and UI states)
- `.agents/skills/antislop-layoutmobile/SKILL.md` (responsive/mobile behavior)
- `.agents/skills/antislop-code/SKILL.md` (only when editing code comments)

The selected antislop usage mode for this project is **DURING**: apply the rules during planning and implementation, not as a post-hoc audit. Before new UI work, read `DESIGN.md` if present or resolve the design direction explicitly; do not silently invent a visual direction.

<!-- antislop:start -->
## antislop
For UI, copy, accessibility, mobile layout, or code-comment work, read `.agents/skills/antislop/SKILL.md` and then the relevant supplement above. Ask at the start of UI work whether antislop applies during the work or as a post-work audit; this project default is DURING.
<!-- antislop:end -->

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
