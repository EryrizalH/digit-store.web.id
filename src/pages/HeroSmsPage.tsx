// ponytail: Dedicated HeroSMS OTP Configurator page with canonical URL /produk/herosms-otp-configurator
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Product, OtpQuote } from '../types';
import { useCart } from '../context/CartContext';
import { ArtworkImage } from '../components/ArtworkImage';
import { ProductDetailSkeleton } from '../components/Skeleton';
import { ArrowLeft, Smartphone, ShieldAlert, ShoppingBag, CheckCircle2, AlertCircle, Search, RefreshCw, Clock } from 'lucide-react';

export const HeroSmsPage: React.FC = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [addedNotice, setAddedNotice] = useState(false);

  // OTP Configurator States - strict user-initiated selection flow
  const [services, setServices] = useState<Array<{ code: string; name: string }>>([]);
  const [countries, setCountries] = useState<Array<{ id: number; eng: string }>>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [quote, setQuote] = useState<OtpQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // Async request trackers to prevent race conditions & stale responses
  const countriesReqId = useRef(0);
  const quoteReqId = useRef(0);

  const fetchProductDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/products/by-slug/herosms-otp-configurator');
      if (!res.ok) {
        throw new Error('Gagal mengambil data layanan HeroSMS dari server.');
      }
      const data = (await res.json()) as any;
      setProduct(data.product || null);
      fetchOtpServices();
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  const fetchOtpServices = async () => {
    try {
      const sRes = await fetch('/api/otp/services');
      if (sRes.ok) {
        const sData = (await sRes.json()) as any;
        setServices(sData.services || []);
      }
    } catch {
      // ignore
    }
  };

  const fetchOtpCountries = async (service: string) => {
    // ponytail: Invalidate both countries and quote in-flight requests on service change
    const reqId = ++countriesReqId.current;
    quoteReqId.current++;

    if (!service) {
      setCountries([]);
      setSelectedCountry('');
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      setCountriesLoading(false);
      setTimeLeft(0);
      return;
    }

    setCountriesLoading(true);
    try {
      const cRes = await fetch(`/api/otp/countries?service=${encodeURIComponent(service)}`);
      if (cRes.ok && reqId === countriesReqId.current) {
        const cData = (await cRes.json()) as any;
        setCountries(cData.countries || []);
      }
    } catch {
      if (reqId === countriesReqId.current) {
        setCountries([]);
      }
    } finally {
      if (reqId === countriesReqId.current) {
        setCountriesLoading(false);
      }
    }
  };

  const fetchQuote = async (service: string, country: string) => {
    // ponytail: Invalidate in-flight quote request on country/service change
    const reqId = ++quoteReqId.current;

    if (!service || country === undefined || country === null || country.trim() === '') {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      setTimeLeft(0);
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);
    setQuote(null);
    try {
      const res = await fetch(`/api/otp/quote?service=${encodeURIComponent(service)}&country=${encodeURIComponent(country)}`);
      const data = (await res.json()) as any;
      if (reqId !== quoteReqId.current) return;

      if (!res.ok) {
        setQuoteError(data.error || 'Gagal mengambil kuotasi harga dari provider HeroSMS.');
        return;
      }
      setQuote(data.quote);
      if (data.quote?.expiresAt) {
        setTimeLeft(Math.max(0, Math.floor((data.quote.expiresAt - Date.now()) / 1000)));
      }
    } catch (err: any) {
      if (reqId === quoteReqId.current) {
        setQuoteError(err.message || 'Terjadi kesalahan jaringan.');
      }
    } finally {
      if (reqId === quoteReqId.current) {
        setQuoteLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchProductDetail();
  }, []);

  // Quote timer countdown
  useEffect(() => {
    if (!quote?.expiresAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((quote.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [quote]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  const handleAddToCart = () => {
    if (!product) return;
    if (!policyAgreed) {
      alert('Anda wajib menyetujui Kebijakan Penggunaan HeroSMS sebelum menambahkan ke keranjang.');
      return;
    }
    if (!quote || quoteError || timeLeft === 0) {
      alert('Silakan dapatkan kuotasi harga aktif terlebih dahulu.');
      return;
    }

    addToCart(product, 1, {
      serviceCode: quote.serviceCode,
      serviceName: quote.serviceName,
      countryCode: quote.countryCode,
      countryName: quote.countryName,
      quoteId: quote.quoteId,
      expiresAt: quote.expiresAt,
      price: quote.sellingPriceIdr
    });

    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 2500);
  };

  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
    s.code.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  if (loading) {
    return <ProductDetailSkeleton />;
  }

  if (error || !product) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-extrabold text-white">Layanan tidak dapat dimuat</h2>
          <p className="text-xs text-slate-400">{error || 'Konfigurator HeroSMS OTP sementara tidak tersedia.'}</p>
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

  const effectivePrice = quote ? quote.sellingPriceIdr : 0;

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
        {/* Artwork Header */}
        <ArtworkImage
          src={product.artwork_url}
          alt={product.name}
          type="herosms"
          aspectRatio="aspect-video"
          className="w-full rounded-2xl shadow-xl"
        />

        {/* Title & Badges */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 text-xs font-semibold rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 inline-flex items-center gap-1.5">
              <Smartphone className="w-4 h-4" /> Konfigurator HeroSMS OTP
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
            {product.name}
          </h1>
        </div>

        {/* Description Section */}
        <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800/80 space-y-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Deskripsi & Informasi Produk</h3>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            {product.description || 'Konfigurasi rute SMS OTP secara cepat & real-time.'}
          </p>
        </div>

        {/* HeroSMS Live OTP Configurator */}
        <div className="bg-slate-900/90 border border-purple-500/30 rounded-2xl p-5 space-y-5">
          <h3 className="text-sm font-extrabold text-purple-300 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-purple-400" /> Konfigurasi Rute Layanan & Negara OTP
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Service Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">Pilih Layanan / Aplikasi:</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Cari aplikasi (mis. Telegram, WA)..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 mb-2"
                />
              </div>
              <select
                value={selectedService}
                onChange={(e) => {
                  const newService = e.target.value;
                  countriesReqId.current++;
                  quoteReqId.current++;
                  setSelectedService(newService);
                  setSelectedCountry('');
                  setCountries([]);
                  setQuote(null);
                  setQuoteError(null);
                  setQuoteLoading(false);
                  setTimeLeft(0);
                  if (newService) {
                    fetchOtpCountries(newService);
                  }
                }}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">-- Pilih Layanan / Aplikasi --</option>
                {filteredServices.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Country Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">Pilih Negara Nomor (Tersedia):</label>
              <select
                value={selectedCountry}
                onChange={(e) => {
                  const newCountry = e.target.value;
                  quoteReqId.current++;
                  setSelectedCountry(newCountry);
                  setQuote(null);
                  setQuoteError(null);
                  setQuoteLoading(false);
                  setTimeLeft(0);
                  if (selectedService && newCountry) {
                    fetchQuote(selectedService, newCountry);
                  }
                }}
                disabled={!selectedService || countriesLoading || countries.length === 0}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
              >
                {!selectedService ? (
                  <option value="">-- Pilih Layanan Terlebih Dahulu --</option>
                ) : countriesLoading ? (
                  <option value="">Memuat daftar negara...</option>
                ) : countries.length === 0 ? (
                  <option value="">Tidak ada negara tersedia</option>
                ) : (
                  <>
                    <option value="">-- Pilih Negara Nomor --</option>
                    {countries.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.eng} (ID: {c.id})
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Live Quote Box */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Kuotasi Harga Real-time (IDR):</span>
              <button
                onClick={() => {
                  if (selectedService && selectedCountry) {
                    fetchQuote(selectedService, selectedCountry);
                  }
                }}
                disabled={!selectedService || !selectedCountry || quoteLoading}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs flex items-center gap-1"
                title="Perbarui Kuotasi"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${quoteLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>

            {quoteLoading ? (
              <div className="text-xs text-purple-400 animate-pulse font-semibold">Mengambil harga terbaru dari HeroSMS...</div>
            ) : quoteError ? (
              <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{quoteError}</span>
              </div>
            ) : quote ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-emerald-400">
                    {formatPrice(quote.sellingPriceIdr)}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    Tersedia: <strong className="text-slate-200">{quote.availableCount} nomor</strong>
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-900">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Masa Berlaku Kuotasi: <strong className={timeLeft < 15 ? 'text-rose-400' : 'text-amber-300'}>{timeLeft} detik</strong>
                  </span>
                  <span>Rute: {quote.serviceName} ({quote.countryName})</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">
                {!selectedService
                  ? 'Silakan pilih layanan dan negara terlebih dahulu untuk melihat kuotasi harga.'
                  : !selectedCountry
                  ? 'Silakan pilih negara nomor untuk melihat kuotasi harga.'
                  : 'Memuat kuotasi...'}
              </div>
            )}
          </div>

          {/* HeroSMS Policy Consent */}
          <div className="bg-purple-950/40 border border-purple-800/50 rounded-xl p-4 space-y-2 text-xs text-purple-200">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span className="font-extrabold text-purple-300">Ketentuan & Kebijakan Aktivasi:</span>
            </div>
            <p className="text-purple-300/80 text-[11px] leading-relaxed">
              Nomor OTP SMS bersifat sekali pakai & langsung aktif setelah pembayaran dikonfirmasi. Penggunaan nomor wajib mematuhi aturan legal.
            </p>
            <label className="flex items-center gap-2.5 cursor-pointer pt-2 border-t border-purple-800/40 font-semibold text-purple-200 hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={policyAgreed}
                onChange={(e) => setPolicyAgreed(e.target.checked)}
                className="w-4 h-4 rounded border-purple-700 bg-purple-900/50 text-indigo-500 focus:ring-indigo-500"
              />
              <span>Saya telah membaca & menyetujui kebijakan di atas</span>
            </label>
          </div>
        </div>

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
              {effectivePrice > 0 ? formatPrice(effectivePrice) : 'Pilih Rute'}
            </span>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={!selectedService || !selectedCountry || !quote || !!quoteError || timeLeft === 0 || !policyAgreed}
            className="px-6 py-3.5 min-h-[44px] rounded-2xl bg-gradient-to-r from-indigo-600 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 disabled:opacity-40 text-white text-sm font-extrabold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <ShoppingBag className="w-5 h-5" />
            <span>Tambah ke Keranjang</span>
          </button>
        </div>
      </div>
    </main>
  );
};
