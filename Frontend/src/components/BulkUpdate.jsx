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
    <div className="animate-fade" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
          <div>
            <h1 className="text-gradient" style={{ margin: 0, fontSize: '36px', fontWeight: 950, letterSpacing: '-0.04em' }}>Inventory Inflow</h1>
            <p style={{ color: 'var(--text-3)', fontSize: '15px', marginTop: '4px', fontWeight: 500 }}>Update stock levels for multiple entities simultaneously</p>
          </div>
          <button 
            onClick={processUpdate} 
            className="btn-primary" 
            style={{ 
              padding: '14px 32px', fontSize: '15px', fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: '10px',
              opacity: hasChanges ? 1 : 0.6,
              pointerEvents: hasChanges ? 'auto' : 'none'
            }}
          >
            <Save size={20} />
            {hasChanges ? "SAVE PROTOCOL" : "NO CHANGES"}
          </button>
        </header>

        <div style={{ position: 'relative', marginBottom: '32px' }}>
          <Search style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)' }} size={20} />
          <input 
            className="input-premium" 
            placeholder="Query nomenclature or scan barcode..." 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: '100%', paddingLeft: '56px', height: '60px', fontSize: '16px' }}
          />
        </div>

        <div className="modern-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: 16, 
            padding: '20px 24px', background: 'rgba(255,255,255,0.02)', 
            borderBottom: '1px solid var(--border)',
            fontSize: '11px', fontWeight: 900, color: 'var(--text-3)', 
            textTransform: 'uppercase', letterSpacing: '1px'
          }}>
            <div style={{ flex: 1 }}>Entity Description</div>
            <div style={{ width: 140, textAlign: 'center' }}>Current Assets</div>
            <div style={{ width: 160, textAlign: 'center' }}>Inflow Quantity</div>
            <div style={{ width: 140, textAlign: 'center' }}>Projected Stock</div>
          </div>

          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {filteredProducts.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-3)' }}>
                <Box size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                <p>No entities found matching your search.</p>
              </div>
            ) : (
              filteredProducts.map(p => {
                const isUpdated = updates[p.id] && Number(updates[p.id]) !== 0;
                const finalQty = (Number(p.quantity) + Number(updates[p.id] || 0)).toFixed(2).replace(/\.00$/, '');
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '16px 24px', borderBottom: '1px solid var(--border)',
                    background: isUpdated ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}>
                    {/* Product Details */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: isUpdated ? 'var(--primary)' : '#fff', fontSize: '15px' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>CODE: {p.barcode || 'N/A'} · ₹{p.price}</div>
                    </div>
                    
                    {/* Current Stock */}
                    <div style={{ width: 140, textAlign: 'center', fontWeight: 600, fontSize: '16px', color: 'var(--text-2)' }}>
                      {p.quantity} <span style={{ fontSize: '12px', opacity: 0.6 }}>{p.unit}</span>
                    </div>
                    
                    {/* Add Quantity Input */}
                    <div style={{ width: 160, textAlign: 'center' }}>
                      <input 
                        type="number" 
                        className="input-premium" 
                        style={{ 
                          width: '100%', maxWidth: 100, height: '40px', 
                          textAlign: "center", fontWeight: 800, fontSize: '16px',
                          borderColor: isUpdated ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                          background: isUpdated ? 'rgba(99, 102, 241, 0.1)' : 'rgba(0,0,0,0.2)'
                        }} 
                        value={updates[p.id] || ""} 
                        onChange={(e) => handleChange(p.id, e.target.value)}
                        placeholder="+0"
                      />
                    </div>
                    
                    {/* Final Stock */}
                    <div style={{ width: 140, textAlign: 'center' }}>
                      <div style={{ 
                        fontSize: '18px', 
                        fontWeight: 900, 
                        color: isUpdated ? 'var(--primary)' : '#fff' 
                      }}>
                        {finalQty} 
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{p.unit}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {hasChanges && (
          <div className="animate-up" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
             <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px 24px', borderRadius: '12px', color: '#10b981', fontSize: '13px', fontWeight: 700 }}>
                ⚠️ You have unsaved inflow protocols. Commit changes to update inventory.
             </div>
          </div>
        )}
      </div>
    </div>
  );
}