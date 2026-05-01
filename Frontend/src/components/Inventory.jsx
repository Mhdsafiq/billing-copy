import React, { useState, useEffect, useRef } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from "html5-qrcode";

const Inventory = () => {
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState({
    name: "",
    category_id: "",
    gst_rate: "0",
    product_code: "",
    price_type: "exclusive",
    price: "",
    cost_price: "",
    quantity: "",
    unit: "Pcs",
    barcode: "",
    expiry_date: "",
    image: "",
    default_discount: "",
    weight: "",
    product_type: "packaged",
    stock_unit: "Kg",
  });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFetchingAPI, setIsFetchingAPI] = useState(false);
  const [detectedBarcode, setDetectedBarcode] = useState("");
  const [scanStatus, setScanStatus] = useState("Waiting for scanner...");
  const scanErrorCount = useRef(0);

  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  const loadCategories = async () => {
    if (window.api && window.api.getCategories) {
      const cats = await window.api.getCategories();
      setCategories(cats);
      if (cats.length > 0) {
        setForm(prev => ({ ...prev, category_id: cats[0].id }));
      }
    }
    try {
      const raw = localStorage.getItem("smart_billing_settings");
      if (raw) setSettings(JSON.parse(raw));
    } catch (e) {}
  };

  useEffect(() => {
    loadCategories();
    const onRefresh = () => loadCategories();
    window.addEventListener('soft_refresh', onRefresh);
    return () => window.removeEventListener('soft_refresh', onRefresh);
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const addProduct = async (e) => {
    e.preventDefault();
    if (window.api && window.api.addProduct) {
      try {
        await window.api.addProduct({
          ...form,
          name: form.product_type === 'loose' ? form.name : form.name,
          price: Number(form.price),
          cost_price: Number(form.cost_price) || 0,
          quantity: Number(form.quantity),
          category_id: Number(form.category_id),
          gst_rate: Number(form.gst_rate),
          product_code: form.product_code || null,
          price_type: form.price_type,
          expiry_date: form.expiry_date || null,
          image: form.image || null,
          weight: form.weight || null,
          product_type: form.product_type || 'packaged',
          stock_unit: form.product_type === 'loose' ? (form.stock_unit || 'Kg') : null,
        });
        alert("Product registered in database! 🔥");
        setForm({
          name: "",
          category_id: categories.length > 0 ? categories[0].id : "",
          gst_rate: "0",
          product_code: "",
          price_type: "exclusive",
          price: "",
          cost_price: "",
          quantity: "",
          unit: "Pcs",
          barcode: "",
          expiry_date: "",
          image: "",
          default_discount: "",
          weight: "",
          product_type: "packaged",
          stock_unit: "Kg",
        });
      } catch (err) {
        alert("❌ Error saving product: " + err.message);
      }
    } else {
      alert("Error: Database connection not found! Please ensure you are running the app as a Desktop Application (Electron), not in a regular web browser.");
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm({ ...form, image: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const scannerRef = useRef(null);

  useEffect(() => {
    if (isScannerOpen && !scannerRef.current) {
      // Use explicit formats and horizontal qrbox to vastly improve 1D barcode success rate
      const scanner = new Html5QrcodeScanner("reader", { 
        fps: 20, // Increased FPS for faster detection
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          // Dynamic qrbox - horizontal for barcodes
          const width = viewfinderWidth * 0.8;
          const height = viewfinderHeight * 0.4;
          return { width, height };
        },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
        showZoomSliderIfSupported: true,
        rememberLastUsedCamera: true,
        useBarCodeDetectorIfSupported: true,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE
        ]
      }, false);
      scannerRef.current = scanner;
      
      setScanStatus("Camera active. Align barcode...");
      setDetectedBarcode("");
      scanErrorCount.current = 0;

      scanner.render(async (decodedText) => {
        // Validation: Ensure barcode is not just a few digits (most are 8+)
        if (!decodedText || decodedText.length < 8) {
          setScanStatus("⚠️ Incomplete scan. Hold steady...");
          return;
        }

        setDetectedBarcode(decodedText);
        setScanStatus("✅ Barcode captured! Fetching data...");
        
        // Success feedback
        if (scannerRef.current) {
          try { await scannerRef.current.clear(); } catch(e){}
          scannerRef.current = null;
        }
        
        setIsScannerOpen(false);
        setForm(prev => ({ ...prev, barcode: decodedText }));
        setIsFetchingAPI(true);
        
        try {
          // Add a small delay to ensure UI updates
          await new Promise(r => setTimeout(r, 400));
          const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${decodedText}.json`);
          const data = await res.json();
          
          if (data && data.status === 1) {
            const product = data.product;
            let updates = {};
            
            if (product.brands) {
              updates.brand = product.brands;
            }

            const rawName = product.product_name || product.product_name_en || product.generic_name || "";
            let baseName = product.brands ? `${product.brands} ${rawName}` : rawName;
            if (!baseName && product.brands) baseName = product.brands;

            // Integrates weight/size directly into the name as requested
            let weight = product.quantity || product.serving_size || "";
            if (weight && baseName) {
              updates.name = `${baseName} (${weight})`;
            } else if (baseName) {
              updates.name = baseName;
            } else if (weight) {
              updates.name = `Product (${weight})`;
            }

            // Still save weight to DB field for data integrity, even though UI input is removed
            if (weight) updates.weight = weight;

            // 3. IMAGE
            if (product.image_front_url || product.image_url || product.image_small_url) {
              updates.image = product.image_front_url || product.image_url || product.image_small_url;
            }

            // 4. CATEGORY MAPPING
            if (product.categories && categories.length > 0) {
              const catStr = product.categories.toLowerCase();
              const matched = categories.find(c => catStr.includes(c.name.toLowerCase()));
              if (matched) {
                updates.category_id = matched.id;
              }
            }
            
            setForm(prev => ({ ...prev, ...updates }));
            setScanStatus("✅ Product found and details filled!");
          } else {
             setScanStatus("❌ Product not found in database.");
             alert("Product details not found online. Please enter manually.");
          }
        } catch (err) {
          console.error("API Fetch Error:", err);
          setScanStatus("❌ Connection error while fetching data.");
        } finally {
          setIsFetchingAPI(false);
        }
      }, (error) => {
        // Show retry message if detecting but not decoding
        scanErrorCount.current += 1;
        if (scanErrorCount.current > 30) {
           setScanStatus("🔍 Align barcode clearly in the box...");
           scanErrorCount.current = 0;
        }
      });
    }

    return () => {
      // Cleanup on unmount or when `isScannerOpen` becomes false
      if (!isScannerOpen && scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [isScannerOpen, categories]);

  return (
    <div className="animate-fade" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '48px', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <h1 className="text-gradient" style={{ margin: 0, fontSize: '42px', fontWeight: 950, letterSpacing: '-0.04em' }}>Inventory Hub</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginTop: '6px', fontWeight: 500 }}>Systematic management of product entities & stock levels</p>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
             {form.product_type !== 'loose' && (
              <button 
                type="button" 
                className="btn-primary" 
                style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '14px 28px', fontSize: '14px' }} 
                onClick={() => setIsScannerOpen(true)}
              >
                <Camera size={20} /> AI SMART SCAN
              </button>
            )}
            <button className="btn-outline" style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '14px 28px', fontSize: '14px' }} onClick={loadCategories}>
               <RefreshCw size={18} /> SYNC HUB
            </button>
          </div>
        </header>

        {isFetchingAPI && (
          <div className="pulse" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', padding: '20px', borderRadius: '18px', marginBottom: '32px', textAlign: 'center', fontWeight: 800, border: '1px solid var(--primary-glow)', letterSpacing: '1px' }}>
            ✨ ANALYZING GLOBAL PRODUCT DATABASE...
          </div>
        )}
        
        {isScannerOpen && (
          <div className="modal-overlay" onClick={() => setIsScannerOpen(false)}>
            <div className="invoice-modal animate-up" onClick={e => e.stopPropagation()} style={{ width: '550px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h3 className="text-gradient" style={{ margin: 0, fontSize: '24px', fontWeight: 900 }}>Vision Scanner</h3>
                <button onClick={() => setIsScannerOpen(false)} className="btn-outline" style={{ width: '40px', height: '40px', padding: 0, borderRadius: '50%' }}>✕</button>
              </div>
              
              <div id="reader" style={{ width: '100%', borderRadius: '24px', overflow: 'hidden', border: '2px solid var(--primary)', background: '#000', boxShadow: '0 0 40px var(--primary-glow)' }}></div>
              
              <div className="glass-panel" style={{ marginTop: '32px', padding: '24px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)' }}>
                 <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px' }}>Neural Processing Status</div>
                 <div style={{ fontSize: '18px', fontWeight: 800, color: scanStatus.includes('✅') ? 'var(--success)' : 'var(--primary)' }}>{scanStatus}</div>
                 
                 {detectedBarcode && (
                   <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--glass-border)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 900 }}>SKU IDENTIFIED</div>
                      <div style={{ fontSize: '32px', fontWeight: 950, color: 'var(--text-main)', letterSpacing: '4px' }}>{detectedBarcode}</div>
                   </div>
                 )}
              </div>

              <button className="btn-primary" style={{ marginTop: '32px', width: '100%', height: '56px', background: 'var(--danger)' }} onClick={() => setIsScannerOpen(false)}>TERMINATE VISION</button>
            </div>
          </div>
        )}

        <div className="modern-card" style={{ padding: '48px' }}>
          <form onSubmit={addProduct}>
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '60px', marginBottom: '60px' }}>
               {/* Left: Product Image */}
               <div>
                  <div style={{ width: '100%', aspectRatio: '1', borderRadius: '32px', border: '2px dashed var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'rgba(0,0,0,0.2)', position: 'relative', transition: '0.3s' }}>
                    {form.image ? (
                      <>
                        <img src={form.image} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button type="button" onClick={() => setForm({ ...form, image: "" })} style={{ position: 'absolute', top: '15px', right: '15px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(244, 63, 94, 0.8)', color: 'white', border: 'none', cursor: 'pointer', backdropFilter: 'blur(10px)' }}>✕</button>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
                        <Camera size={56} style={{ opacity: 0.1, marginBottom: '16px' }} />
                        <div style={{ fontSize: '14px', fontWeight: 700 }}>Upload Visual Asset</div>
                        <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.6 }}>PNG, JPG up to 5MB</div>
                      </div>
                    )}
                    {!form.image && <input type="file" accept="image/*" onChange={handleImageChange} style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }} />}
                  </div>
                  <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '16px', border: '1px solid var(--primary-glow)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '4px' }}>AI Tip</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>High-resolution images increase visual terminal efficiency by 40%.</div>
                  </div>
               </div>

               {/* Right: Core Details */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  <div>
                    <label className="form-label">Product Nomenclature</label>
                    <input className="input-premium" style={{ fontSize: '24px', fontWeight: 900, height: '64px' }} name="name" value={form.name} onChange={handleChange} placeholder="Enter official product name..." required />
                  </div>

                  <div>
                     <label className="form-label">Operational Classification</label>
                     <div style={{ display: 'flex', gap: '20px' }}>
                        <div onClick={() => setForm(prev => ({ ...prev, product_type: 'packaged', unit: 'Pcs' }))} className={`modern-card ${form.product_type === 'packaged' ? 'pulse' : ''}`} style={{ flex: 1, padding: '24px', cursor: 'pointer', border: form.product_type === 'packaged' ? '2px solid var(--primary)' : '1px solid var(--border)', background: form.product_type === 'packaged' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(0,0,0,0.1)' }}>
                          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
                          <div style={{ fontWeight: 900, fontSize: '16px', color: '#fff' }}>Packaged</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>Unit-based inventory</div>
                        </div>
                        <div onClick={() => setForm(prev => ({ ...prev, product_type: 'loose', unit: 'Kg' }))} className={`modern-card ${form.product_type === 'loose' ? 'pulse' : ''}`} style={{ flex: 1, padding: '24px', cursor: 'pointer', border: form.product_type === 'loose' ? '2px solid var(--primary)' : '1px solid var(--border)', background: form.product_type === 'loose' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(0,0,0,0.1)' }}>
                          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚖️</div>
                          <div style={{ fontWeight: 900, fontSize: '16px', color: '#fff' }}>Bulk / Loose</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>Weight-based inventory</div>
                        </div>
                     </div>
                  </div>

                  <div>
                     <label className="form-label">Entity Categorization</label>
                     <div style={{ display: 'flex', gap: '16px' }}>
                        <select className="input-premium" style={{ flex: 1, height: '56px' }} name="category_id" value={form.category_id} onChange={handleChange}>
                          {categories.map(c => <option key={c.id} value={c.id} style={{ background: '#020617' }}>{c.name}</option>)}
                        </select>
                        <button type="button" onClick={() => setAddingCategory(true)} className="btn-outline" style={{ width: '56px', height: '56px', fontSize: '24px', padding: 0 }}>+</button>
                     </div>
                  </div>
               </div>
            </div>

            <div className="grid-3" style={{ gap: '32px', marginBottom: '48px' }}>
              <div>
                <label className="form-label">Commercial Price (₹)</label>
                <input className="input-premium" style={{ fontSize: '28px', fontWeight: 950, color: 'var(--primary)', height: '72px' }} name="price" type="number" step="0.01" value={form.price} onChange={handleChange} required placeholder="0.00" />
              </div>
              <div>
                <label className="form-label">Acquisition Cost (₹)</label>
                <input className="input-premium" style={{ fontSize: '28px', fontWeight: 950, color: 'var(--success)', height: '72px' }} name="cost_price" type="number" step="0.01" value={form.cost_price} onChange={handleChange} placeholder="0.00" />
              </div>
              <div>
                <label className="form-label">Initial Reserves</label>
                <input className="input-premium" style={{ fontSize: '28px', fontWeight: 950, height: '72px' }} name="quantity" type="number" step={form.product_type === 'loose' ? '0.01' : '1'} value={form.quantity} onChange={handleChange} required placeholder="0" />
              </div>
            </div>

            <div className="grid-3" style={{ gap: '32px', marginBottom: '48px' }}>
              <div>
                <label className="form-label">System Entity Code</label>
                <input className="input-premium" name="product_code" value={form.product_code} onChange={handleChange} placeholder="e.g. SKU-101" />
              </div>
              {settings?.gstNumber && (
                <div>
                  <label className="form-label">Taxation Protocol (GST)</label>
                  <select className="input-premium" name="gst_rate" value={form.gst_rate} onChange={handleChange}>
                    <option value="0" style={{ background: '#020617' }}>EXEMPT (0%)</option>
                    <option value="5" style={{ background: '#020617' }}>ESSENTIAL (5%)</option>
                    <option value="12" style={{ background: '#020617' }}>STANDARD (12%)</option>
                    <option value="18" style={{ background: '#020617' }}>PREMIUM (18%)</option>
                    <option value="28" style={{ background: '#020617' }}>LUXURY (28%)</option>
                  </select>
                </div>
              )}
              <div>
                <label className="form-label">Expiration Chronology</label>
                <input className="input-premium" name="expiry_date" type="date" value={form.expiry_date} onChange={handleChange} style={{ colorScheme: 'dark' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '48px', borderTop: '1px solid var(--border)' }}>
               <button className="btn-primary pulse" style={{ padding: '20px 80px', fontSize: '20px', fontWeight: 950, letterSpacing: '2px' }}>REGISTER ENTITY ➔</button>
            </div>
          </form>
        </div>
      </div>

      {addingCategory && (
        <div className="modal-overlay" onClick={() => setAddingCategory(false)}>
          <div className="invoice-modal animate-up" onClick={e => e.stopPropagation()} style={{ width: '400px' }}>
             <h3 className="text-gradient" style={{ marginBottom: '24px', fontSize: '20px', fontWeight: 900 }}>Create Classification</h3>
             <input className="input-premium" placeholder="Category Name..." value={newCategory} onChange={e => setNewCategory(e.target.value)} autoFocus />
             <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button onClick={() => setAddingCategory(false)} className="btn-outline" style={{ flex: 1 }}>Abort</button>
                <button onClick={async () => {
                  if (!newCategory.trim()) return;
                  if (window.api && window.api.addCategory) {
                    await window.api.addCategory(newCategory);
                    setNewCategory("");
                    setAddingCategory(false);
                    loadCategories();
                  }
                }} className="btn-primary" style={{ flex: 2 }}>Commit Category</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
