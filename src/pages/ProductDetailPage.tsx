// ponytail: Route-based product detail page with shareable URL, reserved artwork ratio & sticky mobile CTA
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { ArtworkImage } from '../components/ArtworkImage';
import { ProductDetailSkeleton } from '../components/Skeleton';
import { ArrowLeft, Download, Key, Smartphone, ShieldAlert, ShoppingBag, CheckCircle2, AlertCircle } from 'lucide-react';

export const ProductDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [addedNotice, setAddedNotice] = useState(false);

  const fetchProductDetail = async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/by-slug/${slug}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Produk tidak ditemukan atau telah dinonaktifkan.');
        throw new Error('Gagal mengambil data produk dari server.');
      }
      const data = (await res.json()) as any;
      setProduct(data.product || null);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductDetail();
  }, [slug]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  const handleAddToCart = () => {
    if (!product) return;
    if (product.type === 'herosms' && !policyAgreed) {
      alert('Anda wajib menyetujui Kebijakan Penggunaan HeroSMS sebelum menambahkan ke keranjang.');
      return;
    }
    addToCart(product);
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 2500);
  };

  if (loading) {
    return <ProductDetailSkeleton />;
  }

  if (error || !product) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-extrabold text-white">Produk Tidak Ditemukan</h2>
          <p className="text-xs text-slate-400">{error || 'Produk yang Anda cari tidak tersedia.'}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md"
          >
            <ArrowLeft className="w-4 h-4" /> Kembali ke Katalog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto py-6 sm:py-8 px-4 lg:px-8 space-y-6 pb-28 sm:pb-safe">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs font-bold text-slate-400 hover:text-white rounded-xl bg-slate-900 border border-slate-800 transition-all focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <ArrowLeft className="w-4 h-4" /> Kembali
      </button>

      {/* Main Detail Card */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 space-y-6">
        {/* Reserved Aspect Ratio Artwork Header */}
        <ArtworkImage
          src={product.artwork_url}
          alt={product.name}
          type={product.type}
          aspectRatio="aspect-video"
          className="w-full rounded-2xl shadow-xl"
        />

        {/* Title & Badges */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {product.type === 'file' && (
              <span className="px-3 py-1 text-xs font-semibold rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 inline-flex items-center gap-1.5">
                <Download className="w-4 h-4" /> Digital Download
              </span>
            )}
            {product.type === 'code' && (
              <span className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1.5">
                <Key className="w-4 h-4" /> Lisensi Voucher
              </span>
            )}
            {product.type === 'herosms' && (
              <span className="px-3 py-1 text-xs font-semibold rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 inline-flex items-center gap-1.5">
                <Smartphone className="w-4 h-4" /> Aktivasi HeroSMS OTP
              </span>
            )}

            {product.type === 'code' && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                (product.stock_count || 0) > 0
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-rose-950 text-rose-300 border border-rose-800'
              }`}>
                Stok Kode: {product.stock_count ?? 0}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
            {product.name}
          </h1>

          <div className="text-2xl font-black text-emerald-400">
            {formatPrice(product.price)}
          </div>
        </div>

        {/* Description Section */}
        <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800/80 space-y-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Deskripsi & Informasi Produk</h3>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            {product.description || 'Tidak ada deskripsi rinci untuk produk ini.'}
          </p>
        </div>

        {/* HeroSMS Policy Consent */}
        {product.type === 'herosms' && (
          <div className="bg-purple-950/40 border border-purple-800/50 rounded-2xl p-5 space-y-3 text-xs text-purple-200">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold text-purple-300 block mb-1">Syarat & Kebijakan Aktivasi HeroSMS:</span>
                <p className="text-purple-300/80 leading-relaxed">
                  Layanan ini disediakan khusus untuk keperluan legal. Nomor OTP SMS bersifat sementara & sekali pakai. Pembeli wajib menyetujui bahwa penggunaan nomor tidak melanggar ketentuan hukum atau syarat layanan pihak ketiga.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer pt-2 border-t border-purple-800/40 font-semibold text-purple-200 hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={policyAgreed}
                onChange={(e) => setPolicyAgreed(e.target.checked)}
                className="w-5 h-5 rounded border-purple-700 bg-purple-900/50 text-indigo-500 focus:ring-2 focus:ring-indigo-500"
              />
              <span>Saya telah membaca & menyetujui kebijakan penggunaan HeroSMS di atas</span>
            </label>
          </div>
        )}

        {/* Added Notification */}
        {addedNotice && (
          <div className="p-4 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-2xl text-xs font-bold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Produk berhasil ditambahkan ke keranjang!
            </span>
            <Link to="/keranjang" className="underline hover:text-white">Lihat Keranjang</Link>
          </div>
        )}
      </div>

      {/* Sticky Mobile CTA Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 p-4 bg-[#090d16]/95 border-t border-slate-800/90 backdrop-blur-xl sm:relative sm:bg-transparent sm:border-none sm:p-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-bold">Harga Produk</span>
            <span className="text-xl sm:text-2xl font-black text-white">
              {formatPrice(product.price)}
            </span>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={product.type === 'code' && (product.stock_count || 0) <= 0}
            className="px-6 py-3.5 min-h-[44px] rounded-2xl bg-gradient-to-r from-indigo-600 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 disabled:opacity-50 text-white text-sm font-extrabold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <ShoppingBag className="w-5 h-5" />
            <span>Tambah ke Keranjang</span>
          </button>
        </div>
      </div>
    </main>
  );
};
