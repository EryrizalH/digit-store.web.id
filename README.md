# Digit Store

Digital storefront untuk produk file, kode, dan aktivasi HeroSMS. Aplikasi ini memakai satu codebase untuk SPA pelanggan dan API edge.

## Arsitektur

- **Frontend:** React 19 + React Router 7 + Vite 6 + Tailwind CSS 4
- **Backend:** Hono 4 di Cloudflare Workers (`src/index.ts`)
- **Storage:** D1 untuk data relasional, R2 untuk file, KV untuk rate limiting
- **Routes API:** `/api/auth`, `/api/products`, `/api/orders`, `/api/downloads`, `/api/activations`, `/api/webhooks`, `/api/otp`, `/api/credits`, dan `/api/health`; katalog mendukung filter, sorting, dan pagination
- **Deploy:** `.github/workflows/deploy.yml` menjalankan check, test, build, lalu deploy ke Workers pada push ke `main`

## Prasyarat

- Node.js 22 atau lebih baru
- npm
- Akun Cloudflare hanya diperlukan untuk binding/deploy remote; `wrangler` sudah tersedia sebagai dev dependency

## Mulai lokal

1. Pasang dependency:

   ```bash
   npm ci
   ```

   Jika host Linux memiliki `libvips` global dan `sharp` mencoba compile dari source, ulangi dengan `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm ci` agar memakai prebuild platform.

2. Isi secret lokal pada `.dev.vars` (file ini di-ignore Git). Nama yang digunakan aplikasi dapat dilihat di `.env.example` dan `src/types.ts`; jangan masukkan nilai secret ke `wrangler.jsonc` atau source code.

3. Jalankan Worker dan Vite pada dua terminal:

   ```bash
   npm run dev:worker
   npm run dev
   ```

   Buka `http://localhost:5173`. Worker API berjalan di `http://localhost:8787`; smoke check dasar adalah `GET /api/health`.

## Validasi sebelum perubahan/deploy

```bash
npm run typecheck
npm test
npm run build
```

Untuk perubahan Cloudflare, baca skill pada `AGENTS.md`, validasi `wrangler.jsonc` terhadap schema Wrangler terpasang, dan gunakan `npx wrangler deploy --dry-run` sebelum deploy. Deploy production, perubahan secret, dan migrasi D1 remote harus dikonfirmasi untuk target yang tepat terlebih dahulu.

## Database

`schema.sql` adalah baseline database. Perubahan berikutnya berada di `migrations/0001` sampai `migrations/0005`; migration `0005` menambahkan metadata katalog dan index untuk filter/sorting. Sebelum bootstrap atau migrasi remote, cocokkan schema dan riwayat migration target; beberapa field/index terbaru sudah tercermin di baseline sehingga menjalankan semua SQL tanpa pemeriksaan dapat menyebabkan konflik.

## Skill dan workflow

Panduan kerja repository ada di [`AGENTS.md`](./AGENTS.md). Skill yang dipasang untuk proyek ini:

- `cloudflare-deploy` untuk provisioning/hosting/deploy Cloudflare
- `security-best-practices` untuk review keamanan TypeScript/React/Hono yang diminta secara eksplisit
- `cloudflare`, `wrangler`, dan `workers-best-practices` sebagai skill runtime Cloudflare yang sudah tersedia di environment Codex
- `Cloudflare Stack Operator` pada `.github/agents/` untuk operasi Cloudflare yang aman dan terverifikasi
