// ponytail: Admin Panel with Product management, Stock Code bulk import, and OTP pricing settings management
import React, { useState, useEffect } from 'react';
import { Product, Category, OtpSettings } from '../types';
import { Plus, Upload, Key, Package, ShieldCheck, Image as ImageIcon, Sliders, CheckCircle2, AlertCircle } from 'lucide-react';

export const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'products' | 'stock' | 'otp'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
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
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingArtworkId, setUploadingArtworkId] = useState<string | null>(null);

  // Bulk stock form
  const [selectedProductId, setSelectedProductId] = useState('');
  const [bulkCodesText, setBulkCodesText] = useState('');
  const [stockMsg, setStockMsg] = useState('');

  // OTP Pricing Settings form
  const [otpEnabled, setOtpEnabled] = useState(false);
  const [providerCurrency, setProviderCurrency] = useState('RUB');
  const [rate, setRate] = useState('200');
  const [markupPercent, setMarkupPercent] = useState('20');
  const [minSalePriceIdr, setMinSalePriceIdr] = useState('5000');
  const [savingOtpSettings, setSavingOtpSettings] = useState(false);
  const [otpMsg, setOtpMsg] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  const fetchProducts = async () => {
    const res = await fetch('/api/products?include_all=1');
    if (res.ok) {
      const data = (await res.json()) as any;
      setProducts(data.products || []);
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
          setProviderCurrency(data.settings.provider_currency || 'RUB');
          setRate(String(data.settings.rate || '200'));
          setMarkupPercent(String(data.settings.markup_percent || '20'));
          setMinSalePriceIdr(String(data.settings.min_price_idr || '5000'));
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchOtpSettings();
  }, []);

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
      setStockMsg(`Berhasil menambah ${data.added} stok kode baru!`);
      setBulkCodesText('');
      fetchProducts();
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
    <div className="max-w-7xl mx-auto py-8 px-4 lg:px-8">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Admin Management Portal
          </span>
          <h1 className="text-2xl font-extrabold text-white">Kelola Produk, R2 & Stok Kode</h1>
        </div>

        <div className="flex gap-2 bg-slate-900 p-1 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
              activeTab === 'products' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Produk ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
              activeTab === 'stock' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Import Stok Kode
          </button>
          <button
            onClick={() => setActiveTab('otp')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
              activeTab === 'otp' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Pengaturan Harga OTP
          </button>
        </div>
      </div>

      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create Product Form */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" /> Tambah Produk Baru
            </h3>

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Nama Produk</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Canva Pro 1 Tahun / Source Code React"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Kategori</label>
                  <select
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
                  <label className="text-slate-300 font-semibold block mb-1">Tipe Produk</label>
                  <select
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
                <label className="text-slate-300 font-semibold block mb-1">Harga Acuan (IDR)</label>
                <input
                  type="number"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="50000"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white min-h-[44px]"
                />
              </div>

              {type === 'file' && (
                <div className="p-3 bg-blue-950/40 border border-blue-800/50 rounded-xl space-y-2">
                  <label className="text-blue-300 font-semibold block">Upload Private File to R2</label>
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    className="w-full text-slate-300 text-[11px]"
                  />
                  {uploadingFile && <span className="text-blue-400 font-bold block">Uploading file to R2...</span>}
                  {r2Key && <span className="text-emerald-400 font-mono block text-[10px]">R2 Key: {r2Key}</span>}
                </div>
              )}

              {type === 'herosms' && (
                <div className="p-3 bg-purple-950/40 border border-purple-800/50 rounded-xl grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-purple-300 font-semibold block">Service Default</label>
                    <input
                      type="text"
                      value={herosmsService}
                      onChange={(e) => setHerosmsService(e.target.value)}
                      placeholder="tg, wa, go"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-purple-300 font-semibold block">Country Default</label>
                    <input
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
                <label className="text-slate-300 font-semibold block mb-1">Deskripsi</label>
                <textarea
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
          <div className="lg:col-span-2 glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
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
                      <td className="p-3 font-bold text-indigo-300">{p.stock_count ?? '-'}</td>
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
        <div className="max-w-2xl mx-auto glass-panel p-8 rounded-3xl border border-slate-800 space-y-4">
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
              <label className="text-slate-300 font-semibold block mb-1">Pilih Produk Tipe Code</label>
              <select
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
              <label className="text-slate-300 font-semibold block mb-1">Daftar Kode (1 Kode per Baris)</label>
              <textarea
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
        <div className="max-w-2xl mx-auto glass-panel p-8 rounded-3xl border border-slate-800 space-y-5">
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
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={otpEnabled}
                  onChange={(e) => setOtpEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Mata Uang Provider</label>
                <input
                  type="text"
                  required
                  value={providerCurrency}
                  onChange={(e) => setProviderCurrency(e.target.value)}
                  placeholder="RUB"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white min-h-[44px] font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Kurs Provider ke IDR (Rate)</label>
                <input
                  type="number"
                  required
                  step="any"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="200"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white min-h-[44px] font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Markup (%)</label>
                <input
                  type="number"
                  required
                  step="any"
                  value={markupPercent}
                  onChange={(e) => setMarkupPercent(e.target.value)}
                  placeholder="20"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white min-h-[44px] font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Harga Jual Minimum IDR</label>
                <input
                  type="number"
                  required
                  step="any"
                  value={minSalePriceIdr}
                  onChange={(e) => setMinSalePriceIdr(e.target.value)}
                  placeholder="5000"
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
