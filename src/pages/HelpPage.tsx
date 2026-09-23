import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CircleHelp, RefreshCcw, ShieldCheck } from 'lucide-react';

const faqs = [
  ['Bagaimana produk dikirim?', 'Produk instant dikirim otomatis setelah pembayaran terkonfirmasi. Produk manual diproses admin sesuai keterangan produknya.'],
  ['Di mana kode atau file saya?', 'Buka menu Pesanan setelah pembayaran. Kode, link unduhan, dan status fulfillment tampil di detail order.'],
  ['Kapan saya boleh meminta penggantian?', 'Laporkan kode invalid, file rusak, atau isi tidak sesuai dari detail order. Sertakan kronologi singkat agar admin dapat memeriksa log fulfillment.'],
  ['Apakah pembayaran bisa dibatalkan?', 'Order pending yang belum dibayar tidak diproses. Refund untuk item gagal mengikuti metode pembayaran dan hasil pemeriksaan admin.'],
  ['Apakah checkout tamu aman?', 'Email baru dapat checkout sebagai tamu dan mendapat sesi akses order selama 24 jam. Email yang sudah terdaftar wajib login agar data akun tidak diambil alih.'],
];

export const HelpPage: React.FC = () => (
  <main className="max-w-3xl mx-auto py-8 px-4 lg:px-8 space-y-6">
    <Link to="/" className="inline-flex items-center gap-2 min-h-[44px] text-xs font-bold text-slate-400 hover:text-white">
      <ArrowLeft className="w-4 h-4" /> Kembali ke katalog
    </Link>
    <header className="glass-panel rounded-3xl border border-slate-800 p-6 sm:p-8">
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 inline-flex items-center gap-1.5"><CircleHelp className="w-4 h-4" /> Bantuan DigitStore</span>
      <h1 className="mt-2 text-2xl font-black text-white">FAQ & kebijakan penggantian</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">Jawaban singkat untuk pembelian produk digital, status pengiriman, dan pelaporan masalah.</p>
    </header>
    <section className="space-y-3" aria-label="Pertanyaan umum">
      {faqs.map(([question, answer]) => (
        <details key={question} className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <summary className="cursor-pointer list-none pr-8 text-sm font-bold text-white marker:hidden">{question}</summary>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">{answer}</p>
        </details>
      ))}
    </section>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-indigo-800/50 bg-indigo-950/30 p-4 text-xs text-indigo-200"><ShieldCheck className="mb-2 h-5 w-5 text-indigo-400" /><strong className="block text-white">Bukti order tersimpan</strong>Setiap transaksi memiliki ID order dan audit fulfillment untuk pemeriksaan admin.</div>
      <div className="rounded-2xl border border-amber-800/50 bg-amber-950/30 p-4 text-xs text-amber-200"><RefreshCcw className="mb-2 h-5 w-5 text-amber-400" /><strong className="block text-white">Butuh penggantian?</strong>Gunakan tombol “Laporkan masalah” di detail pesanan, bukan mengirim kode rahasia lewat chat.</div>
    </div>
  </main>
);

