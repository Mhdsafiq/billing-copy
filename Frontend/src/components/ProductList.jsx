import React, { useState, useEffect } from "react";

const ProductList = () => {
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState({ storeName: "iVA Retail", tagline: "Quality groceries at best price...", billLogo: "" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const load = async () => {
    if (window.api && window.api.getProductsFull) {
      setProducts(await window.api.getProductsFull());
    }
    if (window.api && window.api.getCategories) {
      setCategories(await window.api.getCategories());
    }
    try {
      const raw = localStorage.getItem("smart_billing_settings");
      if (raw) setSettings(JSON.parse(raw));
    } catch (e) {}
  };

  const handleLocalRefresh = async () => {
    setIsRefreshing(true);
    setSearchQuery("");
    await load();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
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

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
      if (window.api.deleteProduct) {
        await window.api.deleteProduct(id);
        load();
      }
    }
  };

  const handleEdit = (product) => {
    setEditingProduct({ ...product }); // create copy
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

  const printPriceList = () => {
    const printWindow = window.open('', '_blank');
    const content = `
      <html>
        <head>
          <title>Price List Preview</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
            body { 
              font-family: 'Inter', -apple-system, sans-serif; 
              padding: 50px; 
              color: #0f172a; 
              background: #f1f5f9; 
              line-height: 1.5;
            }
            .container { 
              max-width: 900px; 
              margin: 0 auto; 
              background: white; 
              padding: 60px; 
              border-radius: 2px; 
              box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
              position: relative;
              border-top: 8px solid #3b82f6;
            }
            header { 
              display: flex; 
              justify-content: space-between; 
              align-items: flex-start; 
              margin-bottom: 50px; 
            }
            .shop-info h1 { 
              margin: 0; 
              font-size: 32px; 
              font-weight: 800; 
              letter-spacing: -0.025em;
              text-transform: uppercase;
              color: #1e3a8a;
            }
            .tagline { color: #64748b; font-size: 14px; margin-top: 4px; font-weight: 500; }
            .shop-header { display: flex; align-items: center; gap: 20px; }
            .shop-logo { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid #f1f5f9; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
            .catalog-label {
              display: inline-block;
              background: #eff6ff;
              color: #2563eb;
              padding: 6px 12px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 8px;
            }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { 
              text-align: left; 
              padding: 14px 12px; 
              background: #f8fafc; 
              color: #475569; 
              font-size: 11px; 
              text-transform: uppercase; 
              letter-spacing: 0.1em;
              border-bottom: 2px solid #e2e8f0;
            }
            td { 
              padding: 16px 12px; 
              border-bottom: 1px solid #f1f5f9; 
              font-size: 14px; 
            }
            tr:nth-child(even) { background: #fafafa; }
            .id-col { font-weight: 800; color: #2563eb; width: 120px; }
            .price-col { font-weight: 800; color: #0f172a; text-align: right; font-size: 16px; }
            .unit-col { color: #94a3b8; font-size: 12px; font-weight: 600; }
            
            .no-print { 
              position: fixed; 
              top: 30px; 
              right: 30px; 
              display: flex; 
              gap: 12px; 
              z-index: 100;
            }
            .btn { 
              padding: 12px 24px; 
              border-radius: 8px; 
              border: none; 
              cursor: pointer; 
              font-weight: 700; 
              font-size: 14px; 
              display: flex;
              align-items: center;
              gap: 8px;
              transition: transform 0.1s;
              box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
            }
            .btn:active { transform: scale(0.95); }
            .btn-print { background: #2563eb; color: white; }
            .btn-close { background: white; color: #475569; border: 1px solid #e2e8f0; }
            
            footer {
              margin-top: 60px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
              text-align: center;
              font-size: 12px;
              color: #94a3b8;
            }

            @media print { 
              .no-print { display: none; } 
              body { background: white; padding: 0; } 
              .container { box-shadow: none; width: 100%; max-width: 100%; padding: 0; border: none; } 
            }
          </style>
        </head>
        <body>
          <div class="no-print">
            <button class="btn btn-close" onclick="window.close()">Close Preview</button>
            <button class="btn btn-print" onclick="window.print()">📥 Save as PDF / Print</button>
          </div>
          <div class="container">
            <header>
              <div class="shop-header">
                ${settings.billLogo ? `<img src="${settings.billLogo}" class="shop-logo" />` : ''}
                <div class="shop-info">
                  <div class="catalog-label">Product Catalog</div>
                  <h1>${settings.storeName || 'MY SHOP'}</h1>
                  <div class="tagline">${settings.tagline || 'Reliable billing solutions'}</div>
                </div>
              </div>
              <div style="text-align: right">
                <div style="font-size: 12px; color: #64748b; font-weight: 600;">DATE GENERATED</div>
                <div style="font-weight: 800; font-size: 16px;">${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
            </header>
            <table>
              <thead>
                <tr>
                  <th class="id-col">ITEM CODE</th>
                  <th>PRODUCT DESCRIPTION</th>
                  <th style="text-align: center">UNIT</th>
                  <th style="text-align: right">RATE (INR)</th>
                </tr>
              </thead>
              <tbody>
                ${products.map(p => `
                  <tr>
                    <td class="id-col">#${p.product_code || p.id}</td>
                    <td style="font-weight: 600">${p.name}</td>
                    <td style="text-align: center" class="unit-col">${p.unit}</td>
                    <td class="price-col">₹${p.price.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <footer>
              This is a computer-generated price list and subject to change without notice.
            </footer>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeekStr = new Date(Date.now() + 7*86400000).toISOString().split('T')[0];

  return (
    <div className="admin-scroll-area" style={{ position: 'relative' }}>
      {isRefreshing && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(255,255,255,0.7)", zIndex: 999,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(2px)", borderRadius: "var(--r-lg)"
        }}>
          <div style={{
             width: 40, height: 40, border: "3px solid #e2e8f0",
             borderTopColor: "var(--primary)", borderRadius: "50%",
             animation: "spin 1s linear infinite"
          }}></div>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div style={{ marginTop: 15, fontWeight: 700, color: "var(--text-1)", fontSize: "14px" }}>Synchronizing Master Inventory...</div>
        </div>
      )}

      {isEditModalOpen && editingProduct && (() => {
        const isLoose = editingProduct.product_type === 'loose';
        return (
        <div className="modal-overlay" onClick={() => setEditModalOpen(false)}>
          <div className="invoice-modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '20px', color: '#0f172a' }}>Edit Product</h2>
            <div className="form-group">
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 2 }}>
                  <label className="form-label">Product Name</label>
                  <input className="form-input" value={editingProduct.name} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Product Type</label>
                  <select className="form-select" value={editingProduct.product_type || 'packaged'} onChange={e => setEditingProduct({...editingProduct, product_type: e.target.value})} style={{ height: '42px' }}>
                    <option value="packaged">📦 Packaged</option>
                    <option value="loose">⚖️ Loose</option>
                  </select>
                </div>
              </div>
            </div>

            {isLoose ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Weight</label>
                    <input className="form-input" value={editingProduct.weight || ""} onChange={e => setEditingProduct({...editingProduct, weight: e.target.value})} placeholder="e.g. 500" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Selling Unit</label>
                    <select className="form-select" value={editingProduct.unit} onChange={e => setEditingProduct({...editingProduct, unit: e.target.value})}>
                      <option value="Kg">Kilogram</option>
                      <option value="Gram">Gram</option>
                      <option value="Liter">Liter</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Price (₹)</label>
                  <input type="number" className="form-input" value={editingProduct.price} onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value)})} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Stock Quantity</label>
                    <input type="number" step="0.01" className="form-input" value={editingProduct.quantity} onChange={e => setEditingProduct({...editingProduct, quantity: parseFloat(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Stock Unit</label>
                    <select className="form-select" value={editingProduct.stock_unit || 'Kg'} onChange={e => setEditingProduct({...editingProduct, stock_unit: e.target.value})}>
                      <option value="Kg">Kilogram</option>
                      <option value="Gram">Gram</option>
                      <option value="Liter">Liter</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Short Code / ID</label>
                    <input className="form-input" value={editingProduct.product_code || ""} onChange={e => setEditingProduct({...editingProduct, product_code: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Default Discount (%)</label>
                    <input type="number" step="0.5" className="form-input" value={editingProduct.default_discount || ""} onChange={e => setEditingProduct({...editingProduct, default_discount: parseFloat(e.target.value)})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={editingProduct.category_id || ""} onChange={e => setEditingProduct({...editingProduct, category_id: parseInt(e.target.value)})}>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {settings?.gstNumber && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div className="form-group">
                      <label className="form-label">GST Rate (%)</label>
                      <select className="form-select" value={editingProduct.gst_rate || 0} onChange={e => setEditingProduct({...editingProduct, gst_rate: parseFloat(e.target.value)})}>
                        <option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Price Type</label>
                      <select className="form-select" value={editingProduct.price_type || "exclusive"} onChange={e => setEditingProduct({...editingProduct, price_type: e.target.value})}>
                        <option value="exclusive">Exclusive (+ GST)</option>
                        <option value="inclusive">Inclusive (GST Included)</option>
                      </select>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Selling Price</label>
                    <input type="number" className="form-input" value={editingProduct.price} onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cost Price</label>
                    <input type="number" className="form-input" value={editingProduct.cost_price} onChange={e => setEditingProduct({...editingProduct, cost_price: parseFloat(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Stock Quantity</label>
                    <input type="number" className="form-input" value={editingProduct.quantity} onChange={e => setEditingProduct({...editingProduct, quantity: parseInt(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit</label>
                    <select className="form-select" value={editingProduct.unit} onChange={e => setEditingProduct({...editingProduct, unit: e.target.value})}>
                      <option value="PCS">PCS</option><option value="Pcs">Pcs</option><option value="KG">KG</option><option value="Kg">Kg</option>
                      <option value="LTR">LTR</option><option value="BOX">BOX</option><option value="Box">Box</option>
                      <option value="PKT">PKT</option><option value="Strip">Strip</option><option value="Bottle">Bottle</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Short Code / ID</label>
                    <input className="form-input" value={editingProduct.product_code || ""} onChange={e => setEditingProduct({...editingProduct, product_code: e.target.value})} />
                  </div>
                  {settings?.gstNumber && (
                    <div className="form-group">
                      <label className="form-label">GST Rate (%)</label>
                      <select className="form-select" value={editingProduct.gst_rate || 0} onChange={e => setEditingProduct({...editingProduct, gst_rate: parseFloat(e.target.value)})}>
                        <option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label className="form-label">Barcode</label>
                  <input className="form-input" value={editingProduct.barcode || ""} onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})} />
                </div>
                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label className="form-label">Default Discount (%)</label>
                  <input type="number" step="0.5" className="form-input" value={editingProduct.default_discount || ""} onChange={e => setEditingProduct({...editingProduct, default_discount: parseFloat(e.target.value)})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={editingProduct.category_id || ""} onChange={e => setEditingProduct({...editingProduct, category_id: parseInt(e.target.value)})}>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {settings?.gstNumber && (
                  <div className="form-group">
                    <label className="form-label">Price Type</label>
                    <select className="form-select" value={editingProduct.price_type || "exclusive"} onChange={e => setEditingProduct({...editingProduct, price_type: e.target.value})}>
                      <option value="exclusive">Exclusive (+ GST)</option>
                      <option value="inclusive">Inclusive (GST Included)</option>
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Expiry Date 🗓️</label>
                  <input type="date" className="form-input" value={editingProduct.expiry_date || ""}
                    onChange={e => setEditingProduct({...editingProduct, expiry_date: e.target.value || null})}
                    style={{ colorScheme: 'light' }}
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Product Image (Optional)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                {editingProduct.image && (
                  <img src={editingProduct.image} alt="Preview" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                )}
                <div style={{ flex: 1, position: 'relative' }}>
                  <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => { setEditingProduct({ ...editingProduct, image: reader.result }); }; reader.readAsDataURL(file); }}}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 13 }}
                  />
                  {editingProduct.image && (
                    <button onClick={() => setEditingProduct({ ...editingProduct, image: null })}
                      style={{ marginTop: 8, padding: '4px 10px', fontSize: 11, background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}
                    >Remove Image</button>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '30px' }}>
              <button className="btn-outline" onClick={() => setEditModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
        );
      })()}

      <div className="admin-card" style={{ maxWidth: '100%' }}>
         <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Inventory Records ({products.length})</span>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search products..."
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', width: '200px'
                }}
              />
              <button className="btn-action" style={{ padding: '6px 15px', fontSize: '0.8rem' }} onClick={printPriceList}>🖨️ Print Price List</button>
              <button className="btn-action" style={{ padding: '6px 15px', fontSize: '0.8rem' }} onClick={handleLocalRefresh}>Refresh Data</button>
            </div>
         </div>

         <div className="admin-card-body" style={{ padding: '0' }}>
            <table className="data-table">
              <thead>
                <tr>
                   <th style={{ width: '100px', paddingLeft: '25px' }}>Code/ID</th>
                   <th>Item Description</th>
                   <th>Barcode</th>
                   <th>Rate (₹)</th>
                   <th>Stock</th>
                   <th>Unit</th>
                   <th>Expiry</th>
                   <th style={{ textAlign: 'right', paddingRight: '25px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                 {products
                   .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.barcode || "").includes(searchQuery) || (p.product_code || "").toLowerCase().includes(searchQuery.toLowerCase()))
                   .slice(0, 100)
                   .map((p, index) => {
                    const expired = p.expiry_date && p.expiry_date < todayStr;
                    const near = p.expiry_date && !expired && p.expiry_date <= nextWeekStr;
                    return (
                   <tr key={p.id}>
                       <td style={{ paddingLeft: '25px', color: '#0284c7', fontWeight: 800 }}>#{index + 1}</td>
                       <td style={{ fontWeight: 600, color: expired ? '#ef4444' : 'inherit' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {p.image ? (
                              <img src={p.image} alt={p.name} style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 30, height: 30, background: 'var(--surface-2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🛍️</div>
                            )}
                            <div>
                               {p.name}
                               {p.product_type === 'loose' && <span style={{ color: '#6366f1', fontWeight: 700 }}> (Loose)</span>}
                               {p.product_type === 'loose' && p.weight && <span style={{ color: '#64748b', fontWeight: 500, fontSize: 12 }}> — {p.weight} {p.unit}</span>}
                               {p.product_type !== 'loose' && p.weight && <span style={{ color: '#64748b', fontWeight: 500 }}> ({p.weight})</span>}
                               {expired && <span style={{ fontSize: 10, background: '#ef444420', color: '#ef4444', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>EXPIRED</span>}
                            </div>
                          </div>
                       </td>
                       <td style={{ fontFamily: 'monospace' }}>{p.barcode || '-'}</td>
                       <td style={{ fontWeight: 600, color: '#059669' }}>₹{p.price.toFixed(2)}</td>
                       <td style={{ fontWeight: 600 }}>{p.quantity}</td>
                       <td>{p.unit}</td>
                       <td>
                         {p.expiry_date ? (
                           <span style={{
                             fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                             background: expired ? '#ef444420' : near ? '#fef3c7' : '#dcfce7',
                             color: expired ? '#ef4444' : near ? '#d97706' : '#16a34a',
                             border: `1px solid ${expired ? '#fca5a5' : near ? '#fde68a' : '#86efac'}`
                           }}>{p.expiry_date}</span>
                         ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                       </td>
                       <td style={{ textAlign: 'right', paddingRight: '25px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                          <button onClick={() => handleEdit(p)} className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Edit</button>
                          <button onClick={() => handleDelete(p.id, p.name)} className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.85rem', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}>Delete</button>
                       </td>
                    </tr>
                    );
                 })}
                {products.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '50px', color: '#94a3b8' }}>No records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

export default ProductList;
