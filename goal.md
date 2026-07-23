# Digital Store Full-stack Cloudflare Free

## Ringkasan

Bangun MVP toko digital dalam satu Cloudflare Worker: React + Vite untuk storefront/admin, Hono untuk API, D1 untuk data, R2 untuk file produk, dan Workers KV untuk rate limit. Mendukung produk file/voucher/lisensi serta aktivasi HeroSMS, akun email-password dan Google OAuth, serta adaptor pembayaran untuk Midtrans dan Xendit.

Cloudflare free tier cocok untuk MVP, dengan batas utama 100.000 request Worker/hari dan kuota D1 harian; aplikasi harus menampilkan respons aman saat kuota tercapai. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

## Perubahan implementasi

- Siapkan proyek React + Vite yang dibundel sebagai static assets Worker, dengan Hono di `/api/*`; konfigurasi Wrangler memuat binding D1, R2, KV, secrets, dan environment development/production.
- Buat skema D1 untuk pengguna dan sesi, OAuth account, produk/kategori, stok kode, pesanan/item pesanan, pembayaran/webhook, file entitlement, aktivasi HeroSMS, dan audit log.
- Storefront memuat katalog, detail produk, keranjang, checkout, riwayat pembelian, halaman unduh/kode, serta halaman aktivasi SMS/email yang memperbarui status secara aman.
- Admin yang terlindungi role `admin` mengelola produk, harga, stok kode, file R2, status pesanan/refund, dan daftar aktivasi.
- Autentikasi:
  - Email + kata sandi menggunakan hash Web Crypto yang divalidasi terhadap batas CPU Workers Free.
  - Google OAuth dengan callback server-side.
  - Sesi memakai cookie `HttpOnly`, `Secure`, `SameSite=Lax`, tersimpan dan dapat dicabut di D1.
- Pembayaran memakai antarmuka `PaymentGateway` dengan adaptor Midtrans dan Xendit; provider aktif dipilih melalui `PAYMENT_PROVIDER`. Checkout membuat transaksi pending, webhook tervalidasi dan idempoten mengubah status menjadi paid, kemudian hanya sekali menjalankan fulfilment.
- Fulfilment produk:
  - File: R2 private bucket, diakses melalui URL unduhan sementara milik pembeli.
  - Voucher/lisensi: kode stok dialokasikan atomik dan hanya tampil kepada pemilik pesanan.
  - HeroSMS: Worker memanggil API provider dengan secret server-only, menyimpan activation ID/status, mendukung polling pembeli yang dibatasi, dan menerima callback SMS bila provider mengirim webhook.
- Terapkan kontrol penyalahgunaan pada produk SMS: persetujuan kebijakan penggunaan, rate limit per akun/IP via KV, limit pembelian, idempotency key, audit log, dan penolakan akses ketika batas dilampaui.
- Simpan seluruh secret sebagai Worker secrets; jangan pernah mengirim key HeroSMS, credential payment gateway, atau URL R2 privat ke klien.

## API dan antarmuka utama

- Public: katalog, autentikasi, keranjang/checkout, pesanan, entitlement unduhan/kode, dan status aktivasi milik pengguna.
- Admin: CRUD produk, upload file, impor kode stok, pesanan, dan audit ringkas.
- Internal webhook: endpoint terpisah untuk Midtrans, Xendit, dan callback HeroSMS; seluruhnya wajib signature verification dan idempotency.
- Konfigurasi environment: `PAYMENT_PROVIDER`, credential kedua gateway, Google OAuth credentials, HeroSMS key, URL aplikasi, dan batas transaksi/rate limit.

## Pengujian

- Unit test untuk validasi harga server-side, alokasi stok atomik, otorisasi role, pembatasan akses entitlement, verifikasi signature, dan webhook idempoten.
- Integration test D1 untuk alur: checkout → paid → fulfilment file/kode/HeroSMS; pembayaran gagal/kedaluwarsa; callback HeroSMS berulang; refund sebelum/selesai fulfilment.
- Browser test untuk login email dan Google, checkout, unduh aman, riwayat pesanan, serta semua alur admin utama.
- Uji deployment Worker dan ukur hashing password agar tetap berada dalam limit Workers Free; uji respons aman terhadap kuota/rate-limit. R2 digunakan hanya untuk aset dan file privat, tetap memantau kuota gratisnya. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

## Asumsi

- Gateway live dapat dipilih saat deployment; kedua adaptor tersedia, tetapi akun merchant dan biaya transaksi adalah tanggung jawab pemilik toko.
- Domain kustom dan email transaksional berada di luar cakupan free-tier Cloudflare; MVP tetap berjalan di subdomain `workers.dev`.
- Produk SMS/email hanya ditawarkan sesuai hukum, kebijakan provider, dan persetujuan pengguna; aplikasi tidak dirancang untuk menghindari verifikasi atau pembatasan layanan pihak ketiga.
