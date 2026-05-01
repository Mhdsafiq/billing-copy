import React, { useState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";

/* ── Autocomplete Input Component ── */
function AutocompleteProduct({ products, selectedId, onSelect, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (selectedId) {
      const p = products.find(pr => pr.id === Number(selectedId));
      if (p) setQuery(p.name);
    } else {
      setQuery("");
    }
  }, [selectedId, products]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        type="text"
        className="input-premium"
        placeholder={placeholder || "Search products for campaign..."}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onSelect("");
        }}
        onFocus={() => setOpen(true)}
        style={{
          width: "100%", padding: "14px 16px", borderRadius: "12px", 
          border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)", 
          color: "white", fontSize: "14px"
        }}
      />
      {open && filtered.length > 0 && (
        <div className="glass-panel animate-up" style={{
          position: "absolute", top: "110%", left: 0, right: 0,
          background: "rgba(15, 23, 42, 0.95)", border: "1px solid var(--border)",
          borderRadius: 16, zIndex: 10000,
          maxHeight: 250, overflowY: "auto",
          padding: '8px', backdropFilter: 'blur(20px)',
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
        }}>
          {filtered.map(p => (
            <div
              key={p.id}
              style={{
                padding: "12px 16px", borderRadius: '10px', fontSize: 14, cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                transition: '0.2s'
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery(p.name);
                onSelect(p.id);
                setOpen(false);
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--primary-glow)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontWeight: 700, color: "#fff" }}>{p.name}</span>
              <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 800 }}>STOCK: {p.quantity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const Offers = () => {
  const [offers, setOffers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    id: null,
    name: "",
    type: "BuyXGetY",
    buy_product_id: "",
    buy_qty: 1,
    get_product_id: "",
    get_qty: 1,
    min_bill_amount: 0,
    discount_percent: 0,
    active: true,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchOffers = async () => {
    try {
      if (window.api && window.api.getOffers) {
        const data = await window.api.getOffers();
        setOffers(data);
      }
    } catch (error) {
      console.error("Failed to fetch offers", error);
    }
  };

  const fetchProducts = async () => {
    try {
      if (window.api && window.api.getProductsFull) {
        const data = await window.api.getProductsFull();
        setProducts(data);
      }
    } catch (error) {
      console.error("Failed to fetch products", error);
    }
  };

  useEffect(() => {
    fetchOffers();
    fetchProducts();
    const onRefresh = () => { 
      setSearchQuery("");
      fetchOffers(); 
      fetchProducts(); 
    };
    window.addEventListener("soft_refresh", onRefresh);
    return () => window.removeEventListener("soft_refresh", onRefresh);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.buy_product_id || !formData.free_product_id) {
      alert("Please select both Buy and Free products from the suggestions.");
      return;
    }
    const buyProd = products.find(p => p.id === Number(formData.buy_product_id));
    const freeProd = products.find(p => p.id === Number(formData.free_product_id));
    const finalData = {
      ...formData,
      buy_product_id: Number(formData.buy_product_id),
      free_product_id: Number(formData.free_product_id),
      buy_quantity: Number(formData.buy_quantity),
      free_quantity: Number(formData.free_quantity),
      name: `Buy ${formData.buy_quantity} ${buyProd?.name || "?"} Get ${formData.free_quantity} ${freeProd?.name || "?"} Free`
    };
    try {
      if (isEditing) {
        await window.api.editOffer(finalData);
      } else {
        await window.api.addOffer(finalData);
      }
      setShowModal(false);
      fetchOffers();
      resetForm();
    } catch (error) {
      console.error("Failed to save offer", error);
      alert("Error saving offer: " + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this offer?")) {
      await window.api.deleteOffer(id);
      fetchOffers();
    }
  };

  const toggleStatus = async (offer) => {
    const newStatus = offer.status === 1 ? 0 : 1;
    await window.api.toggleOfferStatus({ id: offer.id, status: newStatus });
    fetchOffers();
  };

  const openEditModal = (offer) => {
    setFormData({
      id: offer.id,
      name: offer.name,
      status: offer.status,
      buy_product_id: offer.buy_product_id,
      buy_quantity: offer.buy_quantity,
      free_product_id: offer.free_product_id,
      free_quantity: offer.free_quantity,
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      id: null,
      name: "",
      status: 1,
      buy_product_id: "",
      buy_quantity: 1,
      free_product_id: "",
      free_quantity: 1,
    });
    setIsEditing(false);
  };

  return (
    <div className="animate-fade" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* ── Modal ── */}
      {showModal && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowModal(false)}>
          <div className="modern-card animate-up" style={{ maxWidth: 520, width: '100%', padding: '32px' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-gradient" style={{ marginBottom: 24, fontSize: '24px', fontWeight: 900 }}>
              {isEditing ? "Edit Promotion" : "Create New Promotion"}
            </h2>

            <form onSubmit={handleSubmit}>
              {/* Buy Condition */}
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 20, marginBottom: 20, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "var(--primary)", marginBottom: 16, letterSpacing: '0.5px' }}>🛒 CONDITION (BUY)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>Select Product</label>
                    <AutocompleteProduct
                      products={products}
                      selectedId={formData.buy_product_id}
                      onSelect={(id) => setFormData(prev => ({ ...prev, buy_product_id: id }))}
                      placeholder="Search base product..."
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>Req. Qty</label>
                    <input
                      type="number"
                      className="input-premium"
                      min="1"
                      value={formData.buy_quantity}
                      onChange={e => setFormData(prev => ({ ...prev, buy_quantity: e.target.value }))}
                      required
                      style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)", color: "white", fontSize: "16px", textAlign: 'center', fontWeight: 800 }}
                    />
                  </div>
                </div>
              </div>

              {/* Reward */}
              <div style={{ background: "rgba(16, 185, 129, 0.05)", borderRadius: 16, padding: 20, marginBottom: 24, border: "1px solid rgba(16, 185, 129, 0.2)", position: "relative" }}>
                <div style={{
                  position: "absolute", top: -12, right: 20,
                  background: "#10b981",
                  color: "white", fontSize: 11, fontWeight: 900,
                  padding: "4px 12px", borderRadius: 8, letterSpacing: '1px',
                  boxShadow: "0 4px 12px rgba(16, 185, 129, 0.4)"
                }}>REWARD</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#10b981", marginBottom: 16, letterSpacing: '0.5px' }}>🎁 REWARD (GET FREE)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>Select Free Product</label>
                    <AutocompleteProduct
                      products={products}
                      selectedId={formData.free_product_id}
                      onSelect={(id) => setFormData(prev => ({ ...prev, free_product_id: id }))}
                      placeholder="Search free item..."
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>Free Qty</label>
                    <input
                      type="number"
                      className="input-premium"
                      min="1"
                      value={formData.free_quantity}
                      onChange={e => setFormData(prev => ({ ...prev, free_quantity: e.target.value }))}
                      required
                      style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "1px solid rgba(16,185,129,0.2)", background: "rgba(16,185,129,0.1)", color: "#10b981", fontSize: "16px", textAlign: 'center', fontWeight: 800 }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 32 }}>
                <button type="button" className="btn-outline" style={{ padding: '14px 28px' }} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ padding: '14px 28px', fontWeight: 800 }}>{isEditing ? "Update Promotion" : "Create Promotion"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 className="text-gradient" style={{ margin: 0, fontSize: '36px', fontWeight: 950, letterSpacing: '-0.04em' }}>Offers & Promotions</h1>
          <p style={{ color: 'var(--text-3)', fontSize: '15px', marginTop: '4px', fontWeight: 500 }}>Manage active campaigns and BOGO rules ({offers.length})</p>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <input
            type="text"
            className="input-premium"
            placeholder="Search offers..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ padding: '12px 20px', borderRadius: '12px', fontSize: '14px', width: '250px' }}
          />
          <button className="btn-primary" style={{ padding: '12px 24px', fontWeight: 800 }} onClick={() => { resetForm(); setShowModal(true); }}>+ NEW PROMOTION</button>
        </div>
      </header>

      {/* ── Main Card ── */}
      <div className="modern-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>#</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Offer Name</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Buy Condition</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Reward</th>
                <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Status</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filtered = offers.filter(o =>
                  !searchQuery ||
                  o.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  o.buy_product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  o.free_product_name?.toLowerCase().includes(searchQuery.toLowerCase())
                );
                return filtered.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: '60px', color: "var(--text-3)" }}>
                      {offers.length === 0 ? 'No promotional campaigns active. Click "+ NEW PROMOTION" to create one.' : `No offers matching "${searchQuery}"`}
                    </td>
                  </tr>
                ) : (
                  filtered.map((offer, idx) => (
                  <tr key={offer.id} style={{ opacity: offer.status ? 1 : 0.55, borderBottom: '1px solid var(--border)', transition: 'background 0.2s', ':hover': { background: 'rgba(255,255,255,0.02)' } }}>
                    <td style={{ padding: '16px 24px', fontWeight: 800, color: "var(--text-3)", fontSize: 13 }}>{idx + 1}</td>
                    <td style={{ padding: '16px 24px', fontWeight: 700, color: "white", fontSize: 14 }}>{offer.name}</td>
                    
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          background: "rgba(99, 102, 241, 0.1)", color: "var(--primary)", border: "1px solid rgba(99, 102, 241, 0.2)",
                          padding: "4px 10px", borderRadius: 8, fontSize: 13, fontWeight: 800
                        }}>{offer.buy_quantity}x</span>
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{offer.buy_product_name || "—"}</span>
                      </div>
                    </td>
                    
                    <td style={{ padding: '16px 24px' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          background: "rgba(16, 185, 129, 0.1)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.2)",
                          padding: "4px 10px", borderRadius: 8, fontSize: 13, fontWeight: 800
                        }}>{offer.free_quantity}x</span>
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{offer.free_product_name || "—"}</span>
                        <span style={{
                          marginLeft: 6, background: "#10b981",
                          color: "white", padding: "2px 6px", borderRadius: 4,
                          fontSize: 9, fontWeight: 900, letterSpacing: 0.5
                        }}>FREE</span>
                      </div>
                    </td>
                    
                    <td style={{ padding: '16px 24px', textAlign: "center" }}>
                      <button
                        onClick={() => toggleStatus(offer)}
                        style={{
                          border: offer.status ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid var(--border)", cursor: "pointer",
                          padding: "6px 16px", borderRadius: 20,
                          fontSize: 11, fontWeight: 800, letterSpacing: 1,
                          background: offer.status ? "rgba(16, 185, 129, 0.1)" : "rgba(255,255,255,0.05)",
                          color: offer.status ? "#10b981" : "var(--text-3)",
                          transition: "0.2s"
                        }}
                      >{offer.status ? "ACTIVE" : "PAUSED"}</button>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: "right", display: "flex", gap: 12, justifyContent: "flex-end", alignItems: "center" }}>
                      <button className="btn-outline" style={{ padding: "6px 16px", fontSize: "13px", borderRadius: 8 }} onClick={() => openEditModal(offer)}>Edit</button>
                      <button className="btn-outline" style={{ padding: "6px 16px", fontSize: "13px", borderRadius: 8, color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.1)" }} onClick={() => handleDelete(offer.id)}>Delete</button>
                    </td>
                  </tr>
                ))
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Offers;
