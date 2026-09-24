import React, { useState, useEffect } from 'react';
import { Product, Category, Order } from '../types';
import { Plus, Upload, Key, Package, ShieldCheck, Image as ImageIcon, Sliders, CheckCircle2, AlertCircle, ListOrdered, RefreshCw, RotateCcw, Undo2 } from 'lucide-react';

interface AdminOrderSummary extends Order {
  email: string;
  item_count: number;
  fulfilled_item_count: number;
  pending_item_count: number;
  failed_item_count: number;
}

interface AdminMetrics {
  periodDays: number;
  revenue: number;
  paidOrders: number;
  pendingOrders: number;
  failedPayments: number;
  failedItems: number;
  fulfillmentSuccessRate: number;
  repeatPurchaseRate: number;
  lowStockProducts: number;
  topProducts: Array<{ product_id: string; product_name: string; units_sold: number; revenue: number }>;
}

export const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'stock' | 'otp'>('orders');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [adminOrders, setAdminOrders] = useState<AdminOrderSummary[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [orderFilter, setOrderFilter] = useState('needs_attention');
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderActionId, setOrderActionId] = useState<string | null>(null);
  const [orderActionMessage, setOrderActionMessage] = useState<string | null>(null);
  const [couponCodeAdmin, setCouponCodeAdmin] = useState('');
  const [couponTypeAdmin, setCouponTypeAdmin] = useState<'percent' | 'fixed'>('percent');
  const [couponValueAdmin, setCouponValueAdmin] = useState('10');
  const [couponMinimumAdmin, setCouponMinimumAdmin] = useState('0');
  const [couponMaxUsesAdmin, setCouponMaxUsesAdmin] = useState('');
  const [couponMessageAdmin, setCouponMessageAdmin] = useState<string | null>(null);
  const [bundleNameAdmin, setBundleNameAdmin] = useState('');
  const [bundleProductsAdmin, setBundleProductsAdmin] = useState('');
  const [bundleValueAdmin, setBundleValueAdmin] = useState('10');
  const [bundleMessageAdmin, setBundleMessageAdmin] = useState<string | null>(null);
  
  // New product form
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [type, setType] = useState<'file' | 'code' | 'herosms'>('code');
  const [r2Key, setR2Key] = useState('');
  const [herosmsService, setHerosmsService] = useState('tg');
  const [herosmsCountry, setHerosmsCountry] = useState('0');
  const [deliveryMode, setDeliveryMode] = useState<'instant' | 'manual'>('instant');
  const [validityDays, setValidityDays] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [isFeatured, setIsFeatured] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingArtworkId, setUploadingArtworkId] = useState<string | null>(null);

  // Bulk stock form
  const [selectedProductId, setSelectedProductId] = useState('');
  const [bulkCodesText, setBulkCodesText] = useState('');
  const [stockMsg, setStockMsg] = useState('');

  // OTP Pricing Settings form (Explicit USD configuration)
  const [otpEnabled, setOtpEnabled] = useState(false);
  const [providerCurrency, setProviderCurrency] = useState('USD');
  const [rate, setRate] = useState('16000');
  const [markupPercent, setMarkupPercent] = useState('20');
  const [minSalePriceIdr, setMinSalePriceIdr] = useState('3000');
  const [savingOtpSettings, setSavingOtpSettings] = useState(false);
  const [otpMsg, setOtpMsg] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  const fetchProducts = async () => {
    const res = await fetch('/api/products?include_all=1&limit=48');
    if (res.ok) {
      const data = (await res.json()) as any;
      setProducts(data.products || []);
    }
  };

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/orders/admin/metrics');
      if (res.ok) setMetrics((await res.json()) as AdminMetrics);
    } catch {
      // Metrics are supplementary; keep the queue usable when they fail.
    }
  };

  const fetchCategories = async () => {
    const res = await fetch('/api/products/categories');
    if (res.ok) {
      const data = (await res.json()) as any;
      setCategories(data.categories || []);
    }
  };

  const fetchOtpSettings = async () => {
    try {
      const res = await fetch('/api/otp/settings');
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.settings) {
          setOtpEnabled(data.settings.enabled === 1);
          setProviderCurrency('USD');
          setRate(String(data.settings.rate || '16000'));
          setMarkupPercent(String(data.settings.markup_percent !== undefined ? data.settings.markup_percent : '20'));
          setMinSalePriceIdr(String(data.settings.min_price_idr || '3000'));

          if (
            data.settings.provider_currency !== 'USD' ||
            Number(data.settings.rate) <= 0 ||
            Number(data.settings.min_price_idr) < 3000
          ) {
            setOtpError('Pengaturan OTP memerlukan pembaruan konfigurasi USD valid (Kurs > 0, Min IDR 3000). Silakan simpan.');
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const fetchAdminOrders = async (filter = orderFilter) => {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const res = await fetch(`/api/orders/admin?status=${encodeURIComponent(filter)}&limit=50`);
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error || 'Gagal memuat antrean pesanan.');
      setAdminOrders(data.orders || []);
    } catch (err: any) {
      setOrdersError(err.message || 'Gagal memuat antrean pesanan.');
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchOtpSettings();
    fetchMetrics();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') fetchAdminOrders(orderFilter);
  }, [activeTab, orderFilter]);

  const handleOrderAction = async (orderId: string, action: 'retry-fulfillment' | 'refund-failed') => {
    setOrderActionId(orderId);
    setOrderActionMessage(null);
    try {
      const res = await fetch(`/api/orders/admin/${orderId}/${action}`, { method: 'POST' });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error || 'Aksi pesanan gagal.');
      setOrderActionMessage(action === 'retry-fulfillment'
        ? `Retry fulfillment ${orderId} selesai.`
        : `Refund ${data.refundedItems || 0} item sebesar Rp ${Number(data.refundedAmount || 0).toLocaleString('id-ID')} selesai.`);
      await fetchAdminOrders(orderFilter);
      await fetchMetrics();
    } catch (err: any) {
      setOrderActionMessage(err.message || 'Aksi pesanan gagal.');
    } finally {
      setOrderActionId(null);
    }
  };

  const handleCreateCoupon = async (event: React.FormEvent) => {
    event.preventDefault();
    setCouponMessageAdmin(null);
    const res = await fetch('/api/orders/admin/coupons', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: couponCodeAdmin, discount_type: couponTypeAdmin, discount_value: Number(couponValueAdmin), min_order_amount: Number(couponMinimumAdmin), max_uses: couponMaxUsesAdmin ? Number(couponMaxUsesAdmin) : null })
    });
    const data = await res.json() as any;
    if (!res.ok) { setCouponMessageAdmin(data.error || 'Kupon gagal dibuat.'); return; }
    setCouponMessageAdmin(`Kupon ${data.code} berhasil dibuat.`);
    setCouponCodeAdmin('');
  };

  const handleCreateBundle = async (event: React.FormEvent) => {
    event.preventDefault();
    setBundleMessageAdmin(null);
    const res = await fetch('/api/orders/admin/bundles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: bundleNameAdmin, product_ids: bundleProductsAdmin.split(',').map((id) => id.trim()).filter(Boolean), discount_type: 'percent', discount_value: Number(bundleValueAdmin) })
    });
    const data = await res.json() as any;
    if (!res.ok) { setBundleMessageAdmin(data.error || 'Bundle gagal dibuat.'); return; }
    setBundleMessageAdmin(`Bundle ${data.name} berhasil dibuat.`);
    setBundleNameAdmin('');
    setBundleProductsAdmin('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/products/admin/upload-file', {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setR2Key(data.r2_key);
        alert(`File berhasil diunggah ke R2: ${data.r2_key}`);
      } else {
        alert(data.error || 'Upload file ke R2 gagal');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleArtworkUpload = async (productId: string, file: File) => {
    setUploadingArtworkId(productId);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/products/admin/${productId}/artwork`, {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json()) as any;
      if (data.success) {
        alert('Artwork produk berhasil diunggah!');
        fetchProducts();
      } else {
        alert(data.error || 'Upload artwork gagal');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploadingArtworkId(null);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      category_id: categoryId || null,
      description,
      price: parseFloat(price),
      type,
      r2_key: r2Key || null,
      herosms_service: type === 'herosms' ? herosmsService : null,
      herosms_country: type === 'herosms' ? herosmsCountry : null,
      delivery_mode: deliveryMode,
      validity_days: validityDays ? Number(validityDays) : null,
      low_stock_threshold: Number(lowStockThreshold || 5),
      is_featured: isFeatured,
    };

    const res = await fetch('/api/products/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      alert('Produk berhasil ditambahkan!');
      setName('');
      setSlug('');
      setDescription('');
      setPrice('');
      setR2Key('');
      setDeliveryMode('instant');
      setValidityDays('');
      setLowStockThreshold('5');
      setIsFeatured(false);
      fetchProducts();
    } else {
      const err = (await res.json()) as any;
      alert(err.error || 'Gagal menambahkan produk');
    }
  };

  const handleAddStockCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !bulkCodesText.trim()) return;

    const codes = bulkCodesText.split('\n').map(c => c.trim()).filter(Boolean);
    const res = await fetch('/api/products/admin/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: selectedProductId, codes }),
    });

    const data = (await res.json()) as any;
    if (res.ok) {
      setStockMsg(`Berhasil menambah ${data.added} stok kode baru${data.skipped ? `, ${data.skipped} dilewati` : ''}.`);
      setBulkCodesText('');
      fetchProducts();
      fetchMetrics();
    } else {
      setStockMsg(data.error || 'Gagal menambahkan stok');
    }
  };

  const handleSaveOtpSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOtpSettings(true);
    setOtpMsg(null);
    setOtpError(null);

    try {
      const res = await fetch('/api/otp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: otpEnabled,
          providerCurrency: providerCurrency.trim().toUpperCase(),
          rate: parseFloat(rate),
          markupPercent: parseFloat(markupPercent),
          minSalePriceIdr: parseFloat(minSalePriceIdr)
        })
      });

      const data = (await res.json()) as any;
      if (res.ok && data.success) {
        setOtpMsg('Pengaturan harga HeroSMS OTP berhasil disimpan & aktif!');
        fetchOtpSettings();
      } else {
        setOtpError(data.error || 'Gagal menyimpan pengaturan OTP');
      }
    } catch (err: any) {
      setOtpError(err.message || 'Terjadi kesalahan jaringan');
    } finally {
      setSavingOtpSettings(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:py-8 lg:px-8">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:mb-8 lg:flex-row lg:items-center">
        <div>
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Admin Management Portal
          </span>
          <h1 className="text-2xl font-extrabold text-white">Operasional DigitStore</h1>
        </div>

        <div role="tablist" aria-label="Admin Navigation Tabs" className="flex max-w-full gap-2 overflow-x-auto bg-slate-900 p-1 rounded-2xl border border-slate-800">
          <button
            type="button"
            role="tab"
            id="tab-orders"
            aria-selected={activeTab === 'orders'}
            aria-controls="panel-orders"
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] whitespace-nowrap ${
              activeTab === 'orders' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Antrean Pesanan
          </button>
          <button
            type="button"
            role="tab"
            id="tab-products"
            aria-selected={activeTab === 'products'}
            aria-controls="panel-products"
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] whitespace-nowrap ${
              activeTab === 'products' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Produk ({products.length})
          </button>
          <button
            type="button"
            role="tab"
            id="tab-stock"
            aria-selected={activeTab === 'stock'}
            aria-controls="panel-stock"
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] whitespace-nowrap ${
              activeTab === 'stock' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Import Stok Kode
          </button>
          <button
            type="button"
            role="tab"
            id="tab-otp"
            aria-selected={activeTab === 'otp'}
            aria-controls="panel-otp"
            onClick={() => setActiveTab('otp')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] whitespace-nowrap ${
              activeTab === 'otp' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Pengaturan Harga OTP
          </button>
        </div>
      </div>

      {activeTab === 'orders' && (
        <section id="panel-orders" role="tabpanel" aria-labelledby="tab-orders" className="space-y-5">
          {metrics && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ringkasan performa 30 hari">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Omzet 30 hari</p>
                <p className="mt-1 text-lg font-extrabold text-emerald-300">Rp {metrics.revenue.toLocaleString('id-ID')}</p>
                <p className="text-[11px] text-slate-500">{metrics.paidOrders} order paid</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fulfillment sukses</p>
                <p className="mt-1 text-lg font-extrabold text-indigo-300">{metrics.fulfillmentSuccessRate}%</p>
                <p className="text-[11px] text-slate-500">{metrics.failedItems} item gagal</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Repeat purchase</p>
                <p className="mt-1 text-lg font-extrabold text-violet-300">{metrics.repeatPurchaseRate}%</p>
                <p className="text-[11px] text-slate-500">berdasarkan buyer 30 hari</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Stok menipis</p>
                <p className={`mt-1 text-lg font-extrabold ${metrics.lowStockProducts > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{metrics.lowStockProducts}</p>
                <p className="text-[11px] text-slate-500">produk perlu dicek</p>
              </div>
            </div>
          )}

          {metrics && metrics.topProducts.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">Produk terlaris 30 hari</h3>
                <span className="text-[11px] text-slate-500">Gunakan untuk bundle dan restock</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {metrics.topProducts.map((product) => (
                  <div key={product.product_id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 min-w-0">
                    <p className="truncate text-xs font-bold text-white" title={product.product_name}>{product.product_name}</p>
                    <p className="mt-1 text-[11px] text-indigo-300">{Number(product.units_sold).toLocaleString('id-ID')} unit</p>
                    <p className="text-[10px] text-slate-500">Rp {Number(product.revenue).toLocaleString('id-ID')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleCreateCoupon} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3"><h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">Buat kupon promo</h3><span className="text-[11px] text-slate-500">Berlaku segera · dikelola server</span></div>
            <div className="grid gap-2 sm:grid-cols-5">
              <input aria-label="Kode kupon" required value={couponCodeAdmin} onChange={(e) => setCouponCodeAdmin(e.target.value.toUpperCase())} placeholder="PROMO10" className="min-h-[40px] rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs font-mono text-white" />
              <select aria-label="Jenis diskon" value={couponTypeAdmin} onChange={(e) => setCouponTypeAdmin(e.target.value as 'percent' | 'fixed')} className="min-h-[40px] rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white"><option value="percent">Persen</option><option value="fixed">Nominal IDR</option></select>
              <input aria-label="Nilai diskon" required type="number" min="1" value={couponValueAdmin} onChange={(e) => setCouponValueAdmin(e.target.value)} placeholder="10" className="min-h-[40px] rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white" />
              <input aria-label="Minimum order" type="number" min="0" value={couponMinimumAdmin} onChange={(e) => setCouponMinimumAdmin(e.target.value)} placeholder="Min order" className="min-h-[40px] rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white" />
              <input aria-label="Batas penggunaan" type="number" min="1" value={couponMaxUsesAdmin} onChange={(e) => setCouponMaxUsesAdmin(e.target.value)} placeholder="Tanpa batas" className="min-h-[40px] rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3"><button type="submit" className="min-h-[40px] rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-500">Simpan kupon</button>{couponMessageAdmin && <span role="status" className="text-xs text-indigo-300">{couponMessageAdmin}</span>}</div>
          </form>

          <form onSubmit={handleCreateBundle} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3"><h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">Buat bundle paket hemat</h3><span className="text-[11px] text-slate-500">Masukkan ID produk dipisahkan koma</span></div>
            <div className="grid gap-2 sm:grid-cols-3"><input aria-label="Nama bundle" required value={bundleNameAdmin} onChange={(e) => setBundleNameAdmin(e.target.value)} placeholder="Starter Pack" className="min-h-[40px] rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white" /><input aria-label="ID produk bundle" required value={bundleProductsAdmin} onChange={(e) => setBundleProductsAdmin(e.target.value)} placeholder="prd_a, prd_b" className="min-h-[40px] rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs font-mono text-white" /><input aria-label="Diskon bundle persen" required type="number" min="1" max="100" value={bundleValueAdmin} onChange={(e) => setBundleValueAdmin(e.target.value)} placeholder="10%" className="min-h-[40px] rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white" /></div>
            <div className="mt-3 flex flex-wrap items-center gap-3"><button type="submit" className="min-h-[40px] rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-500">Simpan bundle</button>{bundleMessageAdmin && <span role="status" className="text-xs text-emerald-300">{bundleMessageAdmin}</span>}</div>
          </form>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-indigo-400" /> Antrean operasional pesanan
              </h2>
              <p className="text-xs text-slate-400 mt-1">Periksa order tertunda atau gagal, lalu jalankan retry atau refund kredit.</p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="admin-order-filter" className="sr-only">Filter status pesanan</label>
              <select
                id="admin-order-filter"
                value={orderFilter}
                onChange={(e) => setOrderFilter(e.target.value)}
                className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-white focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <option value="needs_attention">Perlu tindakan</option>
                <option value="failed">Fulfillment gagal</option>
                <option value="pending">Pembayaran pending</option>
                <option value="paid">Sudah dibayar</option>
                <option value="refunded">Sudah direfund</option>
                <option value="all">Semua pesanan</option>
              </select>
              <button
                type="button"
                onClick={() => fetchAdminOrders(orderFilter)}
                disabled={ordersLoading}
                aria-label="Muat ulang antrean pesanan"
                className="w-11 h-11 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-50 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <RefreshCw className={`w-4 h-4 ${ordersLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {orderActionMessage && (
            <div role="status" className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-200">
              {orderActionMessage}
            </div>
          )}

          {ordersError ? (
            <div role="alert" className="rounded-2xl border border-rose-800/60 bg-rose-950/30 p-6 text-center">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-rose-200">{ordersError}</p>
              <button type="button" onClick={() => fetchAdminOrders(orderFilter)} className="mt-4 min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold focus-visible:ring-2 focus-visible:ring-rose-400">
                Coba lagi
              </button>
            </div>
          ) : ordersLoading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center text-sm text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
              Memuat antrean pesanan...
            </div>
          ) : adminOrders.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-white">Tidak ada pesanan pada filter ini.</p>
              <p className="text-xs text-slate-400 mt-1">Order baru atau gagal akan muncul setelah antrean dimuat ulang.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {adminOrders.map((order) => (
                <article key={order.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-extrabold text-white">{order.id}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                          order.failed_item_count > 0
                            ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                            : order.pending_item_count > 0
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        }`}>
                          {order.failed_item_count > 0 ? 'Perlu tindakan' : order.pending_item_count > 0 ? 'Diproses' : order.payment_status}
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-300">{order.email}</p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(order.updated_at || order.created_at).toLocaleString('id-ID')} · {order.payment_provider} · Rp {Number(order.total_amount).toLocaleString('id-ID')}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300">{order.item_count} item</span>
                      <span className="rounded-lg border border-emerald-800 px-2.5 py-1.5 text-emerald-300">{order.fulfilled_item_count} berhasil</span>
                      <span className="rounded-lg border border-amber-800 px-2.5 py-1.5 text-amber-300">{order.pending_item_count} proses</span>
                      <span className="rounded-lg border border-rose-800 px-2.5 py-1.5 text-rose-300">{order.failed_item_count} gagal</span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                      {order.payment_status === 'paid' && (order.failed_item_count > 0 || order.pending_item_count > 0) && (
                        <button
                          type="button"
                          onClick={() => handleOrderAction(order.id, 'retry-fulfillment')}
                          disabled={orderActionId === order.id}
                          className="min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-indigo-400"
                        >
                          <RotateCcw className={`w-4 h-4 ${orderActionId === order.id ? 'animate-spin' : ''}`} /> Retry
                        </button>
                      )}
                      {order.payment_status === 'paid' && order.payment_provider === 'credit' && order.failed_item_count > 0 && (
                        <button
                          type="button"
                          onClick={() => handleOrderAction(order.id, 'refund-failed')}
                          disabled={orderActionId === order.id}
                          className="min-h-[44px] px-4 rounded-xl border border-amber-700 bg-amber-950/40 hover:bg-amber-900/50 disabled:opacity-50 text-amber-200 text-xs font-bold inline-flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-amber-400"
                        >
                          <Undo2 className="w-4 h-4" /> Refund gagal
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'products' && (
        <div id="panel-products" role="tabpanel" aria-labelledby="tab-products" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create Product Form */}
          <div className="glass-panel space-y-4 rounded-3xl border border-slate-800 p-4 sm:p-6">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" /> Tambah Produk Baru
            </h3>

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              <div>
                <label htmlFor="admin-product-name" className="text-slate-300 font-semibold block mb-1">Nama Produk</label>
                <input
                  id="admin-product-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Canva Pro 1 Tahun / Source Code React"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="admin-product-category" className="text-slate-300 font-semibold block mb-1">Kategori</label>
                  <select
                    id="admin-product-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white min-h-[44px]"
                  >
                    <option value="">Pilih Kategori</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="admin-product-type" className="text-slate-300 font-semibold block mb-1">Tipe Produk</label>
                  <select
                    id="admin-product-type"
                    value={type}
                    onChange={(e: any) => setType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white min-h-[44px]"
                  >
                    <option value="code">Code / Voucher</option>
                    <option value="file">File (Cloudflare R2)</option>
                    <option value="herosms">HeroSMS OTP</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="admin-product-price" className="text-slate-300 font-semibold block mb-1">Harga Acuan (IDR)</label>
                <input
                  id="admin-product-price"
                  type="number"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="50000"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="admin-product-delivery" className="text-slate-300 font-semibold block mb-1">Pengiriman</label>
                  <select
                    id="admin-product-delivery"
                    value={deliveryMode}
                    onChange={(e) => setDeliveryMode(e.target.value as 'instant' | 'manual')}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white min-h-[44px]"
                  >
                    <option value="instant">Instant</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="admin-product-validity" className="text-slate-300 font-semibold block mb-1">Masa aktif (hari)</label>
                  <input
                    id="admin-product-validity"
                    type="number"
                    min="1"
                    value={validityDays}
                    onChange={(e) => setValidityDays(e.target.value)}
                    placeholder="Opsional"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white min-h-[44px]"
                  />
                </div>
              </div>

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="admin-low-stock-threshold" className="text-slate-300 font-semibold block mb-1">Batas stok menipis</label>
                  <input
                    id="admin-low-stock-threshold"
                    type="number"
                    min="0"
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white min-h-[44px]"
                  />
                </div>
                <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 text-slate-300">
                  <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
                  <span className="text-xs font-semibold">Unggulan</span>
                </label>
              </div>

              {type === 'file' && (
                <div className="p-3 bg-blue-950/40 border border-blue-800/50 rounded-xl space-y-2">
                  <label htmlFor="admin-product-r2" className="text-blue-300 font-semibold block">Upload Private File to R2</label>
                  <input
                    id="admin-product-r2"
                    type="file"
                    accept=".zip,.rar,.7z,.tar,.gz,.pdf,.epub,.txt,.jpg,.jpeg,.png,.webp,application/zip,application/pdf"
                    onChange={handleFileUpload}
                    className="w-full text-slate-300 text-[11px]"
                  />
                  {uploadingFile && <span className="text-blue-400 font-bold block">Uploading file to R2...</span>}
                  {r2Key && <span className="text-emerald-400 font-mono block text-[10px]">R2 Key: {r2Key}</span>}
                </div>
              )}

              {type === 'herosms' && (
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-purple-800/50 bg-purple-950/40 p-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="admin-herosms-service" className="text-purple-300 font-semibold block">Service Default</label>
                    <input
                      id="admin-herosms-service"
                      type="text"
                      value={herosmsService}
                      onChange={(e) => setHerosmsService(e.target.value)}
                      placeholder="tg, wa, go"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-herosms-country" className="text-purple-300 font-semibold block">Country Default</label>
                    <input
                      id="admin-herosms-country"
                      type="text"
                      value={herosmsCountry}
                      onChange={(e) => setHerosmsCountry(e.target.value)}
                      placeholder="0 (Indonesia)"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="admin-product-description" className="text-slate-300 font-semibold block mb-1">Deskripsi</label>
                <textarea
                  id="admin-product-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md min-h-[44px]"
              >
                Simpan Produk
              </button>
            </form>
          </div>

          {/* Products List Table */}
          <div className="glass-panel space-y-4 rounded-3xl border border-slate-800 p-4 sm:p-6 lg:col-span-2">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-400" /> Daftar Produk Aktif
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-slate-400 uppercase font-bold">
                  <tr>
                    <th className="p-3">Artwork</th>
                    <th className="p-3">Nama</th>
                    <th className="p-3">Tipe</th>
                    <th className="p-3">Harga</th>
                    <th className="p-3">Stok</th>
                    <th className="p-3">Aksi Artwork</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-900/40">
                      <td className="p-3">
                        {p.artwork_url ? (
                          <img
                            src={p.artwork_url}
                            alt={p.name}
                            className="w-10 h-10 object-cover rounded-lg border border-slate-700"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-slate-500">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-white">{p.name}</td>
                      <td className="p-3 uppercase font-bold text-slate-400">{p.type}</td>
                      <td className="p-3 font-mono text-emerald-400">
                        {p.type === 'herosms' ? 'Dinamis (Configurator)' : `Rp ${p.price.toLocaleString()}`}
                      </td>
                      <td className={`p-3 font-bold ${p.is_low_stock ? 'text-amber-300' : 'text-indigo-300'}`}>
                        {p.stock_count ?? '-'}{p.is_low_stock && <span className="block text-[10px] font-semibold text-amber-400">Menipis</span>}
                      </td>
                      <td className="p-3">
                        <label className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold cursor-pointer transition-all">
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingArtworkId === p.id ? 'Uploading...' : p.artwork_url ? 'Replace' : 'Upload'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleArtworkUpload(p.id, f);
                            }}
                          />
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'stock' && (
        <div id="panel-stock" role="tabpanel" aria-labelledby="tab-stock" className="glass-panel mx-auto max-w-2xl space-y-4 rounded-3xl border border-slate-800 p-4 sm:p-8">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-400" /> Import Stok Kode Voucher Bulk
          </h3>

          {stockMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs">
              {stockMsg}
            </div>
          )}

          <form onSubmit={handleAddStockCodes} className="space-y-4 text-xs">
            <div>
              <label htmlFor="admin-stock-product" className="text-slate-300 font-semibold block mb-1">Pilih Produk Tipe Code</label>
              <select
                id="admin-stock-product"
                required
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white min-h-[44px]"
              >
                <option value="">Pilih Produk</option>
                {products.filter(p => p.type === 'code').map(p => (
                  <option key={p.id} value={p.id}>{p.name} (Stok: {p.stock_count || 0})</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="admin-stock-codes" className="text-slate-300 font-semibold block mb-1">Daftar Kode (1 Kode per Baris)</label>
              <textarea
                id="admin-stock-codes"
                rows={8}
                required
                value={bulkCodesText}
                onChange={(e) => setBulkCodesText(e.target.value)}
                placeholder={"VOUCHER-ABC-123\nVOUCHER-DEF-456\nVOUCHER-GHI-789"}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-mono"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md min-h-[44px]"
            >
              Upload Stok Kode
            </button>
          </form>
        </div>
      )}

      {activeTab === 'otp' && (
        <div id="panel-otp" role="tabpanel" aria-labelledby="tab-otp" className="glass-panel mx-auto max-w-2xl space-y-5 rounded-3xl border border-slate-800 p-4 sm:p-8">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-purple-400" /> Pengaturan Harga HeroSMS OTP
          </h3>

          <p className="text-xs text-slate-400 leading-relaxed">
            Formula Harga Jual IDR: <code className="text-purple-300 bg-purple-950/60 px-2 py-1 rounded">ceil(max(providerCost * rate * (1 + markupPercent/100), minimumSalePriceIdr))</code>
          </p>

          {otpMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {otpMsg}
            </div>
          )}

          {otpError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" /> {otpError}
            </div>
          )}

          <form onSubmit={handleSaveOtpSettings} className="space-y-4 text-xs">
            {/* Status Enable Toggle */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Status Konfigurator OTP</span>
                <span className="text-[11px] text-slate-400">Aktifkan untuk mengizinkan pembelian nomor OTP di toko.</span>
              </div>
              <label htmlFor="admin-otp-status" className="relative inline-flex items-center cursor-pointer">
                <input
                  id="admin-otp-status"
                  type="checkbox"
                  role="switch"
                  aria-checked={otpEnabled}
                  aria-label="Status Konfigurator OTP"
                  checked={otpEnabled}
                  onChange={(e) => setOtpEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="admin-otp-currency" className="text-slate-300 font-semibold block mb-1">Biaya HeroSMS (USD)</label>
                <input
                  id="admin-otp-currency"
                  type="text"
                  readOnly
                  disabled
                  value="USD"
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-400 min-h-[44px] font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label htmlFor="admin-otp-rate" className="text-slate-300 font-semibold block mb-1">Kurs 1 USD ke IDR</label>
                <input
                  id="admin-otp-rate"
                  type="number"
                  required
                  step="any"
                  min="1"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="16000"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white min-h-[44px] font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="admin-otp-markup" className="text-slate-300 font-semibold block mb-1">Margin (%)</label>
                <input
                  id="admin-otp-markup"
                  type="number"
                  required
                  step="any"
                  min="0"
                  value={markupPercent}
                  onChange={(e) => setMarkupPercent(e.target.value)}
                  placeholder="20"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white min-h-[44px] font-mono"
                />
              </div>

              <div>
                <label htmlFor="admin-otp-min-price" className="text-slate-300 font-semibold block mb-1">Harga minimum IDR</label>
                <input
                  id="admin-otp-min-price"
                  type="number"
                  required
                  step="any"
                  min="3000"
                  value={minSalePriceIdr}
                  onChange={(e) => setMinSalePriceIdr(e.target.value)}
                  placeholder="3000"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white min-h-[44px] font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingOtpSettings}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-sm shadow-md transition-all min-h-[44px] disabled:opacity-50"
            >
              {savingOtpSettings ? 'Menyimpan...' : 'Simpan Pengaturan OTP'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
