import React, { useState, useEffect } from "react";
import { Search, Save, PackagePlus, Box } from "lucide-react";

export default function BulkUpdate() {
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState("");
  const [updates, setUpdates] = useState({});

  const load = async () => {
    if (window.api && window.api.getProductsFull) {
      setProducts(await window.api.getProductsFull());
    } else {
      // Mock data
      setProducts([
        { id: 1, name: "Premium Tomato Ketchup 1kg", category_gst: 0, quantity: 10, unit: "Pcs", price: 120 },
        { id: 2, name: "Fresh Dairy Milk 1L", category_gst: 5, quantity: 40, unit: "Pcs", price: 65 },
        { id: 3, name: "Whole Wheat Bread", category_gst: 0, quantity: 5, unit: "Pcs", price: 40 },
        { id: 4, name: "Basmati Rice 5kg", category_gst: 0, quantity: 2, unit: "Pcs", price: 450 },
      ]);
    }
  };

  useEffect(() => {
    load();
    const onRefresh = () => {
      setFilter("");
      load();
    };
    window.addEventListener('soft_refresh', onRefresh);
    return () => window.removeEventListener('soft_refresh', onRefresh);
  }, []);

  const handleChange = (id, value) => {
    setUpdates(prev => ({ ...prev, [id]: value }));
  };

  const processUpdate = async () => {
    const payload = Object.keys(updates)
      .map(id => ({ id: Number(id), addQty: Number(updates[id] || 0) }))
      .filter(u => u.addQty !== 0);

    if (payload.length === 0) {
      alert("No changes to save.");
      return;
    }

    if (window.api && window.api.bulkUpdateProducts) {
      try {
        await window.api.bulkUpdateProducts(payload);
        alert("Stock Updated Successfully!");
        setUpdates({});
        load();
      } catch (err) {
        alert("❌ Error updating stock: " + err.message);
      }
    } else {
      alert("Stock Updated Successfully! (Mock)");
      setUpdates({});
    }
  };

  const filteredProducts = products.filter(p => !filter || p.name?.toLowerCase().includes(filter.toLowerCase()) || p.barcode?.includes(filter)).slice(0, 100);
  const hasChanges = Object.values(updates).some(val => Number(val) !== 0);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Page Title & Actions */}
      <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PackagePlus size={24} color="var(--primary)" />
        Bulk Stock Inward
        {hasChanges && (
          <button className="btn btn-primary" onClick={processUpdate} style={{ marginLeft: 'auto' }}>
            <Save size={18} style={{ marginRight: 6 }} /> 
            Save All {Object.keys(updates).filter(k => updates[k] !== "").length} Changes
          </button>
        )}
      </div>

      <div className="modern-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        
        {/* Search Bar matching history filter approach */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 400 }}>
            <input
              type="text"
              autoFocus
              className="form-input"
              placeholder="🔍 Search product to update stock..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ width: '100%', paddingLeft: 14, height: 40, fontSize: 13 }}
            />
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-3)', fontSize: 13, fontWeight: 500 }}>
            Fast bulk entry ({filteredProducts.length} items)
          </div>
        </div>

        {/* Minimalist Data Header (Matching History Style) */}
        <div style={{
          display: 'flex',
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
          fontSize: 11, 
          fontWeight: 800, 
          color: 'var(--text-3)',
          textTransform: 'uppercase', 
          letterSpacing: '.06em',
          gap: 16
        }}>
          <div style={{ flex: 1 }}>Product Details</div>
          <div style={{ width: 140, textAlign: 'center' }}>Current Stock</div>
          <div style={{ width: 160, textAlign: 'center' }}>Add Quantity</div>
          <div style={{ width: 140, textAlign: 'center' }}>Final Stock</div>
        </div>

        {/* Data Rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredProducts.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-4)' }}>
              <Box size={48} style={{ opacity: 0.4, marginBottom: 16 }} />
              <div style={{ fontSize: 15 }}>No products found.</div>
            </div>
          ) : (
            filteredProducts.map(p => {
              const addedQty = Number(updates[p.id] || 0);
              const finalQty = p.quantity + addedQty;
              const isUpdated = addedQty !== 0;

              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '14px 24px', borderBottom: '1px solid var(--border)',
                  background: isUpdated ? 'var(--primary-light)' : 'transparent',
                  transition: 'background .15s'
                }}>
                  {/* Product Details */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 14 }}>
                      {p.name}
                      {p.product_type === 'loose' && <span style={{ color: '#6366f1', fontWeight: 700, fontSize: 12, marginLeft: 6 }}>(Loose)</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Price: ₹{p.price}</div>
                  </div>
                  
                  {/* Current Stock */}
                  <div style={{ width: 140, textAlign: 'center', fontWeight: 600, fontSize: 16, color: 'var(--text-2)' }}>
                    {p.quantity} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)' }}>{p.unit}</span>
                  </div>
                  
                  {/* Add Quantity Input */}
                  <div style={{ width: 160, textAlign: 'center' }}>
                    <input 
                      type="number" 
                      className="form-input" 
                      style={{ 
                        width: '100%', maxWidth: 120, height: 42, 
                        textAlign: "center", fontWeight: 700, fontSize: 16,
                        borderColor: isUpdated ? 'var(--primary)' : 'var(--border-2)',
                        boxShadow: isUpdated ? '0 0 0 3px rgba(37,99,235,.1)' : 'none'
                      }} 
                      value={updates[p.id] || ""} 
                      onChange={(e) => handleChange(p.id, e.target.value)}
                      placeholder="+0"
                    />
                  </div>
                  
                  {/* Final Stock */}
                  <div style={{ width: 140, textAlign: 'center' }}>
                    <span style={{ 
                      fontSize: 18, 
                      fontWeight: 800, 
                      color: isUpdated ? 'var(--primary)' : 'var(--text-1)' 
                    }}>
                      {finalQty} 
                    </span>
                    <span style={{ fontSize: 12, marginLeft: 4, fontWeight: 500, color: 'var(--text-3)' }}>{p.unit}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}