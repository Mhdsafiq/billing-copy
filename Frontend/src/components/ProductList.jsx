import React, { useState, useEffect } from "react";
import { Search, Eye, Trash2, X, Camera, RefreshCw, Printer } from "lucide-react";

const ProductList = () => {
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const load = async () => {
    if (window.api && window.api.getProductsFull) {
      setProducts(await window.api.getProductsFull());
    }
    if (window.api && window.api.getCategories) {
      setCategories(await window.api.getCategories());
    }
  };

  useEffect(() => {
    load();
    const onRefresh = () => {
      setSearchQuery("");
      load();
    };
    window.addEventListener('soft_refresh', onRefresh);
    return () => window.removeEventListener('soft_refresh', onRefresh);
  }, []);

  const handleLocalRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
      if (window.api.deleteProduct) {
        await window.api.deleteProduct(id);
        load();
      }
    }
  };

  const handleEdit = (product) => {
    setEditingProduct({ ...product });
    setEditModalOpen(true);
  };

  const saveEdit = async () => {
    if (!editingProduct.name || !editingProduct.price) {
      alert("Name and Selling Price are required!");
      return;
    }
    if (window.api.editProduct) {
      await window.api.editProduct({
        ...editingProduct,
        gst_rate: Number(editingProduct.gst_rate) || 0,
        product_code: editingProduct.product_code || null,
        price_type: editingProduct.price_type || 'exclusive',
        default_discount: Number(editingProduct.default_discount) || 0,
        weight: editingProduct.weight || null,
        product_type: editingProduct.product_type || 'packaged',
        stock_unit: editingProduct.product_type === 'loose' ? (editingProduct.stock_unit || 'Kg') : null
      });
      setEditModalOpen(false);
      load();
    }
  };

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.barcode?.includes(searchQuery)
  );

  return (
    <div className="animate-fade" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '48px', gap: '24px' }}>
          <div>
            <h1 className="text-gradient" style={{ margin: 0, fontSize: '42px', fontWeight: 950, letterSpacing: '-0.04em' }}>Inventory Index</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginTop: '6px', fontWeight: 500 }}>Comprehensive catalog of all tradeable entities</p>
          </div>
          
          <div style={{ display: 'flex', gap: '16px' }}>
            <button onClick={handleLocalRefresh} className={`btn-outline ${isRefreshing ? 'animate-spin' : ''}`} style={{ width: '60px', height: '60px', padding: 0 }}>
              <RefreshCw size={24} />
            </button>
            <div style={{ position: 'relative' }}>
               <Search size={20} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
               <input 
                  className="input-premium" 
                  placeholder="Query nomenclature or barcode..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '350px', height: '60px', paddingLeft: '56px' }}
               />
            </div>
          </div>
        </header>

        <div className="modern-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--glass-border)' }}>
              <tr>
                <th style={{ padding: '24px 32px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Entity Details</th>
                <th style={{ padding: '24px 32px', textAlign: 'center', fontSize: '11px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Asset Category</th>
                <th style={{ padding: '24px 32px', textAlign: 'center', fontSize: '11px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Current Stock</th>
                <th style={{ padding: '24px 32px', textAlign: 'right', fontSize: '11px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Unit Value</th>
                <th style={{ padding: '24px 32px', textAlign: 'right', fontSize: '11px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="hover-row" style={{ borderBottom: '1px solid var(--glass-border)', transition: '0.2s' }}>
                  <td style={{ padding: '24px 32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📦</div>
                      <div>
                        <div style={{ fontWeight: 800, color: '#fff', fontSize: '16px' }}>{p.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>CODE: {p.barcode || 'N/A'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '24px 32px', textAlign: 'center' }}>
                    <span style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>
                      {p.category_name || 'General'}
                    </span>
                  </td>
                  <td style={{ padding: '24px 32px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, color: p.quantity <= 5 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                      {p.quantity} <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.6 }}>{p.unit}</span>
                    </div>
                  </td>
                  <td style={{ padding: '24px 32px', textAlign: 'right', fontWeight: 950, fontSize: '18px', color: '#fff' }}>
                    ₹{p.price}
                  </td>
                  <td style={{ padding: '24px 32px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                       <button onClick={() => handleEdit(p)} className="btn-outline" style={{ width: '40px', height: '40px', padding: 0 }}><Eye size={18} /></button>
                       <button onClick={() => handleDelete(p.id, p.name)} className="btn-outline" style={{ width: '40px', height: '40px', padding: 0, color: 'var(--danger)', borderColor: 'rgba(244, 63, 94, 0.2)' }}><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isEditModalOpen && (
        <div className="modal-overlay" onClick={() => setEditModalOpen(false)}>
           <div className="invoice-modal animate-up" onClick={e => e.stopPropagation()} style={{ width: '600px' }}>
              <h2 className="text-gradient" style={{ marginBottom: '32px', fontSize: '32px', fontWeight: 950 }}>Entity Protocol</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                 <div>
                    <label className="form-label">Nomenclature</label>
                    <input className="input-premium" value={editingProduct.name} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} />
                 </div>
                 
                 <div className="grid-2" style={{ gap: '20px' }}>
                    <div>
                       <label className="form-label">Unit Price (₹)</label>
                       <input type="number" className="input-premium" value={editingProduct.price} onChange={e => setEditingProduct({...editingProduct, price: e.target.value})} />
                    </div>
                    <div>
                       <label className="form-label">Inventory Count</label>
                       <input type="number" className="input-premium" value={editingProduct.quantity} onChange={e => setEditingProduct({...editingProduct, quantity: e.target.value})} />
                    </div>
                 </div>

                 <div className="grid-2" style={{ gap: '20px' }}>
                    <div>
                       <label className="form-label">Classification</label>
                       <select className="input-premium" value={editingProduct.category_id} onChange={e => setEditingProduct({...editingProduct, category_id: e.target.value})}>
                          {categories.map(c => <option key={c.id} value={c.id} style={{background:'#020617'}}>{c.name}</option>)}
                       </select>
                    </div>
                    <div>
                       <label className="form-label">Tax Magnitude (%)</label>
                       <input type="number" className="input-premium" value={editingProduct.gst_rate} onChange={e => setEditingProduct({...editingProduct, gst_rate: e.target.value})} />
                    </div>
                 </div>

                 <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                    <button onClick={() => setEditModalOpen(false)} className="btn-outline" style={{ flex: 1, height: '56px' }}>ABORT</button>
                    <button onClick={saveEdit} className="btn-primary" style={{ flex: 2, height: '56px' }}>COMMIT UPDATES</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ProductList;
