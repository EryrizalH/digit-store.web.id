import React, { useState, useEffect } from 'react';
import { Product, Category } from '../types';
import { Plus, Upload, Key, Package, ShieldCheck, Database, FileText } from 'lucide-react';

export const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'products' | 'stock' | 'orders'>('products');
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

  // Bulk stock form
  const [selectedProductId, setSelectedProductId] = useState('');
  const [bulkCodesText, setBulkCodesText] = useState('');
  const [stockMsg, setStockMsg] = useState('');

  const fetchProducts = async () => {
    const res = await fetch('/api/products');
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products || []);
    }
  };

  const fetchCategories = async () => {
    const res = await fetch('/api/products/categories');
    if (res.ok) {
      const data = await res.json();
      setCategories(data.categories || []);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
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
      const data = await res.json();
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
      const err = await res.json();
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

    const data = await res.json();
    if (res.ok) {
      setStockMsg(`Berhasil menambah ${data.added} stok kode baru!`);
      setBulkCodesText('');
      fetchProducts();
    } else {
      setStockMsg(data.error || 'Gagal menambahkan stok');
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
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'products' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Produk ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'stock' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Import Stok Kode
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Kategori</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="code">Code / Voucher</option>
                    <option value="file">File (Cloudflare R2)</option>
                    <option value="herosms">HeroSMS OTP</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Harga (IDR)</label>
                <input
                  type="number"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="50000"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                    <label className="text-purple-300 font-semibold block">Service Code</label>
                    <input
                      type="text"
                      value={herosmsService}
                      onChange={(e) => setHerosmsService(e.target.value)}
                      placeholder="tg, wa, go"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-purple-300 font-semibold block">Country Code</label>
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
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md"
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
                    <th className="p-3">Nama</th>
                    <th className="p-3">Tipe</th>
                    <th className="p-3">Harga</th>
                    <th className="p-3">Stok Kode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-900/40">
                      <td className="p-3 font-semibold text-white">{p.name}</td>
                      <td className="p-3 uppercase font-bold text-slate-400">{p.type}</td>
                      <td className="p-3 font-mono text-emerald-400">Rp {p.price.toLocaleString()}</td>
                      <td className="p-3 font-bold text-indigo-300">{p.stock_count ?? '-'}</td>
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
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white"
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
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md"
            >
              Upload Stok Kode
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
