import React, { useState, useEffect, useRef } from "react";

/* ── Autocomplete Input Component ── */
function AutocompleteProduct({ products, selectedId, onSelect, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Sync display text when selectedId changes (e.g. on edit)
  useEffect(() => {
    if (selectedId) {
      const p = products.find(pr => pr.id === Number(selectedId));
      if (p) setQuery(p.name);
    } else {
      setQuery("");
    }
  }, [selectedId, products]);

  // Close dropdown on outside click
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
        className="form-input"
        placeholder={placeholder || "Type to search..."}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Clear selection if user edits text
          onSelect("");
        }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "white", border: "1px solid var(--border)",
          borderRadius: 8, marginTop: 4, zIndex: 9999,
          maxHeight: 200, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)"
        }}>
          {filtered.map(p => (
            <div
              key={p.id}
              style={{
                padding: "9px 14px", fontSize: 13, cursor: "pointer",
                borderBottom: "1px solid #f1f5f9",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur before click registers
                setQuery(p.name);
                onSelect(p.id);
                setOpen(false);
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "#f8fafc"}
              onMouseOut={(e) => e.currentTarget.style.background = "white"}
            >
              <span style={{ fontWeight: 600, color: "#1e293b" }}>{p.name}</span>
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Stock: {p.quantity} {p.unit}</span>
            </div>
          ))}
        </div>
      )}
      {open && query && filtered.length === 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "white", border: "1px solid var(--border)",
          borderRadius: 8, marginTop: 4, zIndex: 9999,
          padding: "14px", textAlign: "center", color: "#94a3b8", fontSize: 13,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)"
        }}>
          No products matching "{query}"
        </div>
      )}
    </div>
  );
}

/* ── Main Offers Component ── */
const Offers = () => {
  const [offers, setOffers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    id: null,
    name: "",
    status: 1,
    buy_product_id: "",
    buy_quantity: 1,
    free_product_id: "",
    free_quantity: 1,
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
    <div className="admin-scroll-area">
      {/* ── Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="invoice-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 20, color: "#0f172a" }}>
              {isEditing ? "Edit Offer" : "Create New Offer"}
            </h2>

            <form onSubmit={handleSubmit}>
              {/* Buy Condition */}
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#334155", marginBottom: 12 }}>🛒 Condition (Buy)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Select Product</label>
                    <AutocompleteProduct
                      products={products}
                      selectedId={formData.buy_product_id}
                      onSelect={(id) => setFormData(prev => ({ ...prev, buy_product_id: id }))}
                      placeholder="Type to search product..."
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Req. Qty</label>
                    <input
                      type="number"
                      className="form-input"
                      min="1"
                      value={formData.buy_quantity}
                      onChange={e => setFormData(prev => ({ ...prev, buy_quantity: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Reward */}
              <div style={{ background: "#eff6ff", borderRadius: 10, padding: 16, marginBottom: 20, border: "1px solid #dbeafe", position: "relative" }}>
                <div style={{
                  position: "absolute", top: -10, right: 14,
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  color: "white", fontSize: 10, fontWeight: 800,
                  padding: "3px 10px", borderRadius: 4,
                  boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)"
                }}>REWARD</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#334155", marginBottom: 12 }}>🎁 Reward (Get Free)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Select Free Product</label>
                    <AutocompleteProduct
                      products={products}
                      selectedId={formData.free_product_id}
                      onSelect={(id) => setFormData(prev => ({ ...prev, free_product_id: id }))}
                      placeholder="Type to search free item..."
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Free Qty</label>
                    <input
                      type="number"
                      className="form-input"
                      min="1"
                      value={formData.free_quantity}
                      onChange={e => setFormData(prev => ({ ...prev, free_quantity: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
                <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-action">{isEditing ? "Update Offer" : "Create Offer"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Main Card ── */}
      <div className="admin-card" style={{ maxWidth: "100%" }}>
        <div className="admin-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Offers & Promotions ({offers.length})</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search offers..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', width: '200px' }}
            />
            <button className="btn-action" onClick={() => { resetForm(); setShowModal(true); }}>+ New Offer</button>
          </div>
        </div>

        <div className="admin-card-body" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 25 }}>#</th>
                <th>Offer Name</th>
                <th>Buy Product</th>
                <th style={{ textAlign: "center" }}>Buy Qty</th>
                <th>Free Product</th>
                <th style={{ textAlign: "center" }}>Free Qty</th>
                <th style={{ textAlign: "center" }}>Status</th>
                <th style={{ textAlign: "right", paddingRight: 25 }}>Actions</th>
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
                    <td colSpan="8" style={{ textAlign: "center", padding: 50, color: "#94a3b8" }}>
                      {offers.length === 0 ? 'No offers defined yet. Click "+ New Offer" to create a promotion.' : `No offers matching "${searchQuery}"`}
                    </td>
                  </tr>
                ) : (
                  filtered.map((offer, idx) => (
                  <tr key={offer.id} style={{ opacity: offer.status ? 1 : 0.55 }}>
                    <td style={{ paddingLeft: 25, fontWeight: 800, color: "#0284c7" }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{offer.name}</td>
                    <td>{offer.buy_product_name || "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        background: "#e0e7ff", color: "#4338ca",
                        padding: "2px 10px", borderRadius: 4,
                        fontSize: 12, fontWeight: 800
                      }}>{offer.buy_quantity}</span>
                    </td>
                    <td>{offer.free_product_name || "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        background: "#dcfce7", color: "#16a34a",
                        padding: "2px 10px", borderRadius: 4,
                        fontSize: 12, fontWeight: 800
                      }}>{offer.free_quantity}</span>
                      <span style={{
                        marginLeft: 6, background: "linear-gradient(135deg, #10b981, #059669)",
                        color: "white", padding: "2px 8px", borderRadius: 4,
                        fontSize: 10, fontWeight: 700
                      }}>FREE</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        onClick={() => toggleStatus(offer)}
                        style={{
                          border: "none", cursor: "pointer",
                          padding: "4px 14px", borderRadius: 20,
                          fontSize: 12, fontWeight: 700,
                          background: offer.status ? "#dcfce7" : "#f1f5f9",
                          color: offer.status ? "#16a34a" : "#94a3b8",
                        }}
                      >{offer.status ? "● ON" : "○ OFF"}</button>
                    </td>
                    <td style={{ textAlign: "right", paddingRight: 25, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button className="btn-outline" style={{ padding: "6px 12px", fontSize: "0.85rem" }} onClick={() => openEditModal(offer)}>Edit</button>
                      <button className="btn-outline" style={{ padding: "6px 12px", fontSize: "0.85rem", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }} onClick={() => handleDelete(offer.id)}>Delete</button>
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
  );
};

export default Offers;
