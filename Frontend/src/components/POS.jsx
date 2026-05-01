import React, { useState, useEffect, useRef } from "react";
import { Search, Camera, QrCode, RefreshCw, Trash2, ShoppingCart } from "lucide-react";
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from "html5-qrcode";

/* ─────────────────── helpers ─────────────────────────── */
const todayStr = () => new Date().toISOString().split("T")[0];

function isExpired(product) {
  if (!product || !product.expiry_date) return false;
  return product.expiry_date < todayStr();
}

/* ─────────────────── Held Bills Panel ───────────────── */
function HeldBillsPanel({ onResume, onClose }) {
  const [heldBills, setHeldBills] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await window.api?.getHeldBills?.() || [];
    setHeldBills(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const discard = async (id) => {
    await window.api?.deleteHeldBill?.(id);
    await load();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="invoice-modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          ⏸️ Held Bills ({heldBills.length})
        </div>
        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-3)", padding: "20px 0" }}>Loading…</div>
        ) : heldBills.length === 0 ? (
          <div style={{
            textAlign: "center", color: "var(--text-4)", padding: "30px 0",
            background: "var(--surface-2)", borderRadius: 10
          }}>🗂️ No bills on hold right now</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto" }}>
            {heldBills.map(bill => (
              <div key={bill.id} style={{
                background: "var(--surface-2)", borderRadius: 10,
                border: "1px solid var(--border)", padding: "12px 14px",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text-1)" }}>{bill.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                    {bill.cart?.length || 0} items · {bill.customer?.name || "Walk-in"}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>
                    Held at: {new Date(bill.created_at).toLocaleTimeString("en-IN")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => { onResume(bill); onClose(); }}
                    style={{
                      padding: "6px 14px", background: "var(--primary)", color: "#fff",
                      border: "none", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer"
                    }}
                  >▶ Resume</button>
                  <button
                    onClick={() => discard(bill.id)}
                    style={{
                      padding: "6px 10px", background: "#ef444420", color: "#ef4444",
                      border: "1px solid #ef444440", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer"
                    }}
                  >🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="btn-outline" style={{ width: "100%", marginTop: 16 }}>Close</button>
      </div>
    </div>
  );
}

/* ─────────────────── Main POS Component ────────────── */
const POS = ({ showQR }) => {
  const emptyRow = () => ({ tempId: Date.now() + Math.random(), name: "", price: 0, qty: 0, total: 0, gstRate: 0, gstAmt: 0, discountPercent: 0, discountAmt: 0 });

  const [billItems, setBillItems] = useState([emptyRow()]);
  const [currentRow, setCurrentRow] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSugIndex, setSelectedSugIndex] = useState(0);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceSuccess, setInvoiceSuccess] = useState(false);
  const [lastInvoiceId, setLastInvoiceId] = useState(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "" });
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [allProducts, setAllProducts] = useState([]);
  const [showHeldBills, setShowHeldBills] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
  const [settings, setSettings] = useState({ storeName: "iVA BILLING", storeAddress: "123 Business Road...", storePhone: "+91 90000 00000", gstNumber: "" });
  const [syncPending, setSyncPending] = useState(0);
  const [activeOffers, setActiveOffers] = useState([]);
  
  // ── NEW TERMINAL STATES ──
  const [terminalActive, setTerminalActive] = useState(false);
  const [billingMode, setBillingMode] = useState(null); // 'photo' or 'tally'
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState("Waiting for scanner...");
  const [detectedBarcode, setDetectedBarcode] = useState("");
  
  // ── LOOSE PRODUCT WEIGHT MODAL ──
  const [showLooseModal, setShowLooseModal] = useState(false);
  const [looseProduct, setLooseProduct] = useState(null);
  const [looseWeight, setLooseWeight] = useState("");
  const [looseWeightUnit, setLooseWeightUnit] = useState("Kg");
  const [looseTargetIndex, setLooseTargetIndex] = useState(null); // for tally mode
  const [photoSearch, setPhotoSearch] = useState(""); // search for image billing
  
  const inputRefs = useRef({}); 
  const tallyInputRef = useRef(null);

  // 🟢 Keyboard Shortcuts — registered ONCE, reads from refs
  const billingModeRef = useRef(billingMode);
  const currentRowRef = useRef(currentRow);
  const showInvoiceRef2 = useRef(showInvoice);
  const showHeldBillsRef2 = useRef(showHeldBills);
  const showQRRef2 = useRef(showQR);

  useEffect(() => { billingModeRef.current = billingMode; }, [billingMode]);
  useEffect(() => { currentRowRef.current = currentRow; }, [currentRow]);
  useEffect(() => { showInvoiceRef2.current = showInvoice; }, [showInvoice]);
  useEffect(() => { showHeldBillsRef2.current = showHeldBills; }, [showHeldBills]);
  useEffect(() => { showQRRef2.current = showQR; }, [showQR]);

  useEffect(() => {
    const handleGlobalKeys = (e) => {
      if (showInvoiceRef2.current || showHeldBillsRef2.current || showQRRef2.current) return;
      // Never hijack when typing in any field
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;

      // F2 or Ctrl+F to focus search in Tally mode
      if ((e.key === 'F2' || (e.ctrlKey && e.key === 'f')) && billingModeRef.current === 'tally') {
        e.preventDefault();
        inputRefs.current[`${currentRowRef.current}_name`]?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []); // ← Registered ONCE

  const [scanFlash, setScanFlash] = useState(false);
  
  // 🟢 Global Barcode Scanner Listener
  // Uses refs for ALL mutable state so this listener is ONLY registered ONCE.
  // This permanently fixes the typing issue caused by stale listener accumulation.
  const barcodeBuffer = useRef("");
  const barcodeTimeout = useRef(null);
  const lastScanTime = useRef(0);

  // Mutable refs that the listener reads — updated every render, NO re-registration needed
  const allProductsRef = useRef(allProducts);
  const showInvoiceRef = useRef(showInvoice);
  const showHeldBillsRef = useRef(showHeldBills);
  const showQRRef = useRef(showQR);
  const isScannerOpenRef = useRef(isScannerOpen);
  const addProductToCartRef = useRef(null);
  const triggerScanFeedbackRef = useRef(null); // assigned after fn defined

  useEffect(() => { allProductsRef.current = allProducts; }, [allProducts]);
  useEffect(() => { showInvoiceRef.current = showInvoice; }, [showInvoice]);
  useEffect(() => { showHeldBillsRef.current = showHeldBills; }, [showHeldBills]);
  useEffect(() => { showQRRef.current = showQR; }, [showQR]);
  useEffect(() => { isScannerOpenRef.current = isScannerOpen; }, [isScannerOpen]);

  useEffect(() => {
    const handleBarcodeScan = (e) => {
      // Don't listen when modals are open
      if (showInvoiceRef.current || showHeldBillsRef.current || showQRRef.current || isScannerOpenRef.current) return;

      // CRITICAL: Never intercept when user is typing in ANY input-like element
      const activeEl = document.activeElement;
      if (activeEl) {
        const tag = activeEl.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          activeEl.isContentEditable ||
          activeEl.getAttribute('role') === 'textbox' ||
          activeEl.getAttribute('contenteditable') === 'true'
        ) return;
      }

      if (e.key === "Enter") {
        const now = Date.now();
        const scanned = barcodeBuffer.current.trim();
        barcodeBuffer.current = "";
        if (barcodeTimeout.current) { clearTimeout(barcodeTimeout.current); barcodeTimeout.current = null; }
        
        if (scanned.length > 3 && (now - lastScanTime.current) > 500) {
          e.preventDefault();
          lastScanTime.current = now;
          
          const matched = allProductsRef.current.find(p => p.barcode === scanned || p.product_code === scanned);
          if (matched) {
            addProductToCartRef.current(matched);
            if (triggerScanFeedbackRef.current) triggerScanFeedbackRef.current();
          } else {
            console.warn("Barcode not found:", scanned);
          }
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        barcodeBuffer.current += e.key;
        if (barcodeTimeout.current) clearTimeout(barcodeTimeout.current);
        barcodeTimeout.current = setTimeout(() => {
          barcodeBuffer.current = "";
        }, 300);
      }
    };

    // Register ONCE, never re-register
    window.addEventListener("keydown", handleBarcodeScan, true);
    return () => window.removeEventListener("keydown", handleBarcodeScan, true);
  }, []); // ← Empty deps: registered once for the lifetime of this component

  // Visual/Audio Feedback
  const triggerScanFeedback = () => {
    setScanFlash(true);
    setTimeout(() => setScanFlash(false), 300);
    // Simple synth beep if browser allows
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } catch(e) {}
  };
  // Keep ref in sync so the once-registered listener can always call the latest version
  triggerScanFeedbackRef.current = triggerScanFeedback;

  // 📷 Camera Scanner Effect
  const scannerRef = useRef(null);
  useEffect(() => {
    if (isScannerOpen && !scannerRef.current) {
      const scanner = new Html5QrcodeScanner("pos-reader", { 
        fps: 20, 
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const width = viewfinderWidth * 0.8;
          const height = viewfinderHeight * 0.4;
          return { width, height };
        },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
        useBarCodeDetectorIfSupported: true,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF
        ]
      }, false);
      scannerRef.current = scanner;
      
      scanner.render(async (decodedText) => {
        setDetectedBarcode(decodedText);
        setScanStatus("✅ Barcode captured! Processing...");
        
        if (scannerRef.current) {
          try { await scannerRef.current.clear(); } catch(e){}
          scannerRef.current = null;
        }
        setIsScannerOpen(false);
        const matchedProduct = allProducts.find(p => p.barcode === decodedText || p.product_code === decodedText);
        if (matchedProduct) {
          addProductToCart(matchedProduct);
        } else {
          alert(`Product with barcode "${decodedText}" not found in inventory.`);
        }
      }, (error) => {});
    }

    return () => {
      if (!isScannerOpen && scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [isScannerOpen, allProducts]);

  // Full Screen Trigger
  const enterFullScreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen();
    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
  };

  const startTerminal = (mode) => {
    setBillingMode(mode);
    setTerminalActive(true);
    enterFullScreen();
    setTimeout(() => {
      inputRefs.current["0_name"]?.focus();
    }, 300);
  };

  /* ── Load settings ── */
  const loadSettings = () => {
    try {
      const raw = localStorage.getItem("smart_billing_settings");
      if (raw) setSettings(JSON.parse(raw));
    } catch (e) {}
  };

  /* ── Load products, held bills, offers ── */
  useEffect(() => {
    const fetchData = async () => {
      if (window.api?.getProductsFull) {
        try {
          const prods = await window.api.getProductsFull();
          setAllProducts(Array.isArray(prods) ? prods : []);
        } catch(e) { setAllProducts([]); }
      }
      if (window.api?.getOffers) {
        try {
          const offers = await window.api.getOffers();
          setActiveOffers(offers.filter(o => o.status === 1));
        } catch(e) {}
      }
      refreshHeldCount();
      loadSettings();
    };
    fetchData();

    // Focus first row on start
    setTimeout(() => inputRefs.current["0_name"]?.focus(), 100);

    const doRefresh = async () => {
      if (window.api?.getProductsFull) {
        try {
          const prods = await window.api.getProductsFull();
          setAllProducts(Array.isArray(prods) ? prods : []);
        } catch(e) { setAllProducts([]); }
      }
      if (window.api?.getOffers) {
        try {
          const offers = await window.api.getOffers();
          setActiveOffers(offers.filter(o => o.status === 1));
        } catch(e) {}
      }
      refreshHeldCount();
      loadSettings();
    };

    const syncCheck = setInterval(() => {
      window.api?.getSyncStatus?.().then(res => setSyncPending(res.pending));
    }, 10000);

    window.addEventListener('soft_refresh', doRefresh);

    return () => {
      clearInterval(syncCheck);
      window.removeEventListener('soft_refresh', doRefresh);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log("Exit fullscreen error:", err));
      }
    };
  }, []);

  const refreshHeldCount = async () => {
    const held = await window.api?.getHeldBills?.() || [];
    setHeldCount(held.length);
  };

  const handleLocalRefresh = async () => {
    setIsRefreshing(true);
    setBillItems([emptyRow()]);
    setCustomer({ name: "", phone: "", address: "" });
    setAmountReceived("");
    setCheckoutStep(1);
    try {
      if (window.api?.getProductsFull) {
        const prods = await window.api.getProductsFull();
        setAllProducts(Array.isArray(prods) ? prods : []);
      }
      if (window.api?.getOffers) {
        const offers = await window.api.getOffers();
        setActiveOffers(offers.filter(o => o.status === 1));
      }
      await refreshHeldCount();
      loadSettings();
    } catch(e) {}
    
    setTimeout(() => {
      setIsRefreshing(false);
      // Ensure focus goes back to the terminal input
      inputRefs.current["0_name"]?.focus();
    }, 800);
  };

  /* ── Hold current bill ── */
  const holdBill = async () => {
    const validItems = billItems.filter(i => i.qty > 0 && i.id);
    if (validItems.length === 0) {
      alert("Nothing to hold — add at least one item.");
      return;
    }
    const label = customer.name
      ? `${customer.name} (${customer.phone || "no phone"})`
      : `Draft Bill #${heldCount + 1}`;
    await window.api?.holdBill?.({ cart: validItems, customer, label });
    // Reset for next customer
    setBillItems([emptyRow()]);
    setCustomer({ name: "", phone: "", address: "" });
    refreshHeldCount();
    alert(`✅ Bill held for "${label}". You can resume it anytime.`);
  };

  /* ── Get available stock for a product (accounting for items already in the cart) ── */
  const getProductStock = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    return product ? Number(product.quantity || 0) : 0;
  };

  /* ── Add Product from Grid ── */
  // ── HELPERS ──
  const isExpired = (p) => {
    if (!p.expiry_date) return false;
    return new Date(p.expiry_date) < new Date();
  };

  const addProductToCart = (product) => {
    if (!product) return;
    if (isExpired(product)) {
      alert(`🚫 "${product.name}" is EXPIRED (${product.expiry_date})!\nThis product cannot be added to billing.`);
      return;
    }
    const availableStock = Number(product.quantity || 0);
    if (availableStock <= 0) {
      alert(`🚫 "${product.name}" is OUT OF STOCK!\nCannot add to billing.`);
      return;
    }

    // ⚖️ LOOSE PRODUCT: Show weight modal instead of adding directly
    if (product.product_type === 'loose') {
      setLooseProduct(product);
      setLooseWeight("");
      setLooseWeightUnit(product.unit || 'Kg');
      setLooseTargetIndex(null);
      setShowLooseModal(true);
      return;
    }

    const priceType = product.price_type || 'exclusive';
    const catGst = settings.gstNumber ? Number(product.gst_rate || product.category_gst || 0) : 0;
    const price = Number(product.price || 0);

    const existingIdx = billItems.findIndex(i => i.id === product.id);
    if (existingIdx >= 0) {
      const currentQty = Number(billItems[existingIdx].qty || 0);
      if (currentQty >= availableStock) {
        alert(`⚠️ Stock limit reached!\n"${product.name}" has only ${availableStock} in stock.`);
        return;
      }
      updateQty(existingIdx, currentQty + 1);
    } else {
      let total, gstAmt, gross_taxable;
      const quantity = 1;
      const dp = Number(product.default_discount) || 0;
      
      if (priceType === 'inclusive') {
        total = price * quantity;
        gross_taxable = total / (1 + catGst / 100);
      } else {
        gross_taxable = price * quantity;
      }

      const discAmt = (gross_taxable * dp) / 100;
      const net_taxable = gross_taxable - discAmt;
      gstAmt = (net_taxable * catGst) / 100;
      
      const newRow = {
        tempId: Date.now() + Math.random(),
        id: product.id,
        name: product.name || "",
        price,
        price_type: priceType,
        qty: quantity,
        total: gross_taxable,
        gstRate: catGst,
        gstAmt,
        cgstRate: catGst / 2,
        sgstRate: catGst / 2,
        cgstAmt: gstAmt / 2,
        sgstAmt: gstAmt / 2,
        expiry_date: product.expiry_date || null,
        image: product.image || null,
        maxStock: availableStock,
        discountPercent: dp,
        discountAmt: discAmt
      };

      const currentValid = billItems.filter(i => i.id);
      setBillItems([...currentValid, newRow]);
    }
  };
  // Keep ref in sync so the once-registered barcode listener can call the latest version
  addProductToCartRef.current = addProductToCart;

  /* ── Convert weight between units ── */
  const convertUnit = (value, fromUnit, toUnit) => {
    const v = parseFloat(value) || 0;
    if (fromUnit === toUnit) return v;
    // Gram → Kg
    if (fromUnit === 'Gram' && toUnit === 'Kg') return v / 1000;
    // Kg → Gram
    if (fromUnit === 'Kg' && toUnit === 'Gram') return v * 1000;
    // ml → Liter
    if (fromUnit === 'ml' && toUnit === 'Liter') return v / 1000;
    // Liter → ml
    if (fromUnit === 'Liter' && toUnit === 'ml') return v * 1000;
    return v;
  };

  /* ── Confirm adding loose product after weight entry ── */
  const confirmLooseAdd = () => {
    if (!looseProduct || !looseWeight || parseFloat(looseWeight) <= 0) {
      alert("Please enter a valid weight/quantity.");
      return;
    }

    const product = looseProduct;
    const sellingUnit = product.unit || 'Kg'; // unit product is sold in (e.g. Gram)
    const stockUnit = product.stock_unit || sellingUnit; // unit stock is tracked in (e.g. Kg)
    const registeredWeight = parseFloat(product.weight) || 1; // e.g. 500 (grams)
    const registeredPrice = Number(product.price || 0); // e.g. ₹50 (for 500 grams)
    
    const enteredWeight = parseFloat(looseWeight); // e.g. 250
    const enteredUnit = looseWeightUnit; // e.g. Gram

    // Convert entered weight to selling unit for proportional calc
    const enteredInSellingUnit = convertUnit(enteredWeight, enteredUnit, sellingUnit);
    
    // Proportional price: (enteredWeight / registeredWeight) * registeredPrice
    const priceRatio = enteredInSellingUnit / registeredWeight;
    const calculatedPrice = registeredPrice * priceRatio;

    // Convert entered weight to stock unit for stock deduction
    const qtyInStockUnit = convertUnit(enteredWeight, enteredUnit, stockUnit);
    
    if (qtyInStockUnit <= 0) {
      alert("Invalid weight entered.");
      return;
    }

    const availableStock = Number(product.quantity || 0); // in stock_unit
    const existingLooseQty = billItems.filter(i => i.id === product.id).reduce((sum, i) => sum + Number(i.qty || 0), 0);
    if (existingLooseQty + qtyInStockUnit > availableStock) {
      alert(`⚠️ Not enough stock!\n"${product.name}" has only ${(availableStock - existingLooseQty).toFixed(3)} ${stockUnit} remaining.`);
      return;
    }

    const priceType = product.price_type || 'exclusive';
    const catGst = settings.gstNumber ? Number(product.gst_rate || product.category_gst || 0) : 0;
    const dp = Number(product.default_discount) || 0;

    let gross_taxable;
    if (priceType === 'inclusive') {
      gross_taxable = calculatedPrice / (1 + catGst / 100);
    } else {
      gross_taxable = calculatedPrice;
    }

    const discAmt = (gross_taxable * dp) / 100;
    const net_taxable = gross_taxable - discAmt;
    const gstAmt = (net_taxable * catGst) / 100;

    // Display label: "Basmati Rice (250 Gram)"
    const displayWeight = `${looseWeight} ${enteredUnit}`;

    const newRow = {
      tempId: Date.now() + Math.random(),
      id: product.id,
      name: `${product.name} (${displayWeight})`,
      price: registeredPrice,
      price_type: priceType,
      qty: qtyInStockUnit,
      total: gross_taxable,
      gstRate: catGst,
      gstAmt,
      cgstRate: catGst / 2,
      sgstRate: catGst / 2,
      cgstAmt: gstAmt / 2,
      sgstAmt: gstAmt / 2,
      expiry_date: product.expiry_date || null,
      image: product.image || null,
      maxStock: availableStock,
      discountPercent: dp,
      discountAmt: discAmt,
      isLoose: true,
      looseBaseUnit: stockUnit
    };

    // For tally mode with a target index, replace that row
    if (looseTargetIndex !== null) {
      const updated = [...billItems];
      updated[looseTargetIndex] = newRow;
      setBillItems(updated);
    } else {
      // Photo mode: always add as new entry (each weight entry is separate)
      const currentValid = billItems.filter(i => i.id);
      setBillItems([...currentValid, newRow]);
    }

    setShowLooseModal(false);
    setLooseProduct(null);
    setLooseWeight("");
  };

  /* ── Resume held bill ── */
  const resumeBill = async (bill) => {
    try {
      // Merge saved cart with fresh product data (latest price, stock, expiry)
      const freshProducts = allProducts;
      const restoredCart = bill.cart.map(i => {
        const fresh = freshProducts.find(p => p.id === i.id);
        const maxStock = fresh ? Number(fresh.quantity || 0) : Number(i.maxStock || 0);
        return {
          ...i,
          tempId: Date.now() + Math.random(),
          maxStock,
          // Refresh expiry from fresh product
          expiry_date: fresh?.expiry_date || i.expiry_date || null,
          image: fresh?.image || i.image || null,
        };
      }).filter(i => i.id && i.qty > 0); // Remove invalid items

      if (restoredCart.length === 0) {
        alert("⚠️ This held bill has no valid items (products may have been deleted).");
        await window.api?.deleteHeldBill?.(bill.id);
        refreshHeldCount();
        return;
      }

      setBillItems([...restoredCart, emptyRow()]);
      setCustomer(bill.customer || { name: "", phone: "", address: "" });
      // Remove from db
      await window.api?.deleteHeldBill?.(bill.id);
      refreshHeldCount();

      // Switch to tally mode if not already active
      if (!terminalActive) {
        setBillingMode('tally');
        setTerminalActive(true);
      }
    } catch (e) {
      console.error("Resume error:", e);
      alert("Failed to resume bill. Try again.");
    }
  };

  /* ── Product search ── */
  const handleItemNameChange = (index, value) => {
    const safeValue = typeof value === "string" ? value : "";
    const updated = [...billItems];
    updated[index] = {
      ...updated[index],
      name: safeValue,
      id: null,
      price: 0,
      total: 0,
      gstRate: 0,
      gstAmt: 0
    };
    setBillItems(updated);

    const matchVal = safeValue.trim().toLowerCase();
    if (matchVal.length > 0) {
      const filtered = allProducts.filter(p => {
        if (!p) return false;
        const pName = p.name ? String(p.name).toLowerCase() : "";
        const pBarcode = p.barcode ? String(p.barcode).trim().toLowerCase() : "";
        const pCode = p.product_code ? String(p.product_code).toLowerCase() : "";
        return pName.includes(matchVal) || pBarcode === matchVal || pCode === matchVal;
      }).slice(0, 25);
      setSuggestions(filtered);
      setSelectedSugIndex(0);
    } else {
      setSuggestions([]);
    }
  };

  /* ── Select product (with expiry guard + stock check) ── */
  const selectProduct = (product, index) => {
    if (!product) return;

    // 🔥 EXPIRY BLOCK
    if (isExpired(product)) {
      alert(`🚫 "${product.name}" is EXPIRED (${product.expiry_date})!\nThis product cannot be added to billing.`);
      return;
    }

    const availableStock = Number(product.quantity || 0);
    if (availableStock <= 0) {
      alert(`🚫 "${product.name}" is OUT OF STOCK!\nCannot add to billing.`);
      return;
    }

    // ⚖️ LOOSE PRODUCT: Show weight modal
    if (product.product_type === 'loose') {
      setLooseProduct(product);
      setLooseWeight("");
      setLooseWeightUnit(product.unit || 'Kg');
      setLooseTargetIndex(index);
      setShowLooseModal(true);
      setSuggestions([]);
      return;
    }

    const updated = [...billItems];
    const catGst = settings.gstNumber ? Number(product.gst_rate || product.category_gst || 0) : 0;
    const price = Number(product.price || 0);
    const quantity = 1;
    const priceType = product.price_type || 'exclusive';

    const dp = Number(product.default_discount) || 0;
    let total, gstAmt, gross_taxable;
    if (priceType === 'inclusive') {
      total = price * quantity;
      gross_taxable = total / (1 + catGst / 100);
    } else {
      gross_taxable = price * quantity;
    }

    const discAmt = (gross_taxable * dp) / 100;
    const net_taxable = gross_taxable - discAmt;
    gstAmt = (net_taxable * catGst) / 100;

    updated[index] = {
      ...updated[index],
      id: product.id,
      name: product.name || "",
      price,
      price_type: priceType,
      qty: quantity,
      total: gross_taxable, 
      gstRate: catGst,
      gstAmt: gstAmt,
      cgstRate: catGst / 2,
      sgstRate: catGst / 2,
      cgstAmt: gstAmt / 2,
      sgstAmt: gstAmt / 2,
      expiry_date: product.expiry_date || null,
      maxStock: availableStock,
      discountPercent: dp,
      discountAmt: discAmt
    };

    setBillItems(updated);
    setSuggestions([]);
  };

  const addRow = () => {
    const newIdx = billItems.length;
    const newRow = emptyRow();
    setBillItems(prev => [...prev, newRow]);
    setTimeout(() => {
      inputRefs.current[`${newIdx}_name`]?.focus();
      // Scroll to bottom of table if needed
      const tableBody = document.getElementById("tally-body");
      if (tableBody) tableBody.scrollTop = tableBody.scrollHeight;
    }, 10);
  };

  // In "Image Billing" mode, filter by search query and limit products
  const filteredProducts = photoSearch.trim()
    ? allProducts.filter(p => p.name.toLowerCase().includes(photoSearch.toLowerCase()) || (p.product_code || '').toLowerCase().includes(photoSearch.toLowerCase()) || (p.barcode || '').includes(photoSearch)).slice(0, 100)
    : allProducts.slice(0, 100);

  const handleKeyDown = (e, index, field) => {
    if (field === "name") {
      if (e.key === "ArrowDown") { 
        e.preventDefault(); 
        setSelectedSugIndex(p => Math.min(p + 1, Math.max(0, suggestions.length - 1))); 
      }
      if (e.key === "ArrowUp") { 
        e.preventDefault(); 
        setSelectedSugIndex(p => Math.max(p - 1, 0)); 
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (suggestions.length > 0 && suggestions[selectedSugIndex]) {
          selectProduct(suggestions[selectedSugIndex], index);
        } else if (billItems[index].id) {
          // If already selected, move to Qty
          inputRefs.current[`${index}_qty`]?.focus();
        } else if (index === billItems.length - 1 && billItems[index].name === "") {
          // Empty row Enter -> Finish
          handleGenerateClick();
        }
      }
    } else if (field === "qty" && e.key === "Enter") {
      e.preventDefault();
      addRow();
    } else if (e.key === "Escape") {
      setSuggestions([]);
    }
  };

  const updateQty = (idx, q) => {
    const updated = [...billItems];
    let newQty = parseFloat(q) || 0;
    const item = updated[idx];

    // 🔥 Stock limit enforcement
    const maxStock = item.maxStock || getProductStock(item.id);
    if (newQty > maxStock) {
      newQty = maxStock;
      // Brief visual feedback — we cap at max
    }
    if (newQty < 0) newQty = 0;

    const priceType = item.price_type || 'exclusive';
    const rate = settings.gstNumber ? Number(item.gstRate || 0) : 0;
    const price = Number(item.price || 0);

    const dp = item.discountPercent || 0;
    let total, gstAmt, gross_taxable;

    if (priceType === 'inclusive') {
      total = price * newQty;
      gross_taxable = total / (1 + rate / 100);
    } else {
      gross_taxable = price * newQty;
    }

    const discAmt = (gross_taxable * dp) / 100;
    const net_taxable = gross_taxable - discAmt;
    gstAmt = (net_taxable * rate) / 100;

    const cgstRate = rate / 2;
    const sgstRate = rate / 2;
    const cgstAmt = gstAmt / 2;
    const sgstAmt = gstAmt / 2;

    updated[idx] = { 
      ...item, 
      qty: newQty, 
      total: gross_taxable, 
      gstAmt: gstAmt,
      cgstRate,
      sgstRate,
      cgstAmt,
      sgstAmt,
      maxStock: maxStock,
      discountAmt: discAmt
    };
    setBillItems(updated);
  };

  /* ── Update discount percent ── */
  const updateDiscount = (idx, pct) => {
    const updated = [...billItems];
    const item = updated[idx];
    const dp = Math.max(0, Math.min(100, parseFloat(pct) || 0));
    const gross_taxable = Number(item.total || 0);
    const discAmt = (gross_taxable * dp) / 100;
    const net_taxable = gross_taxable - discAmt;
    const rate = settings.gstNumber ? Number(item.gstRate || 0) : 0;
    const gstAmt = (net_taxable * rate) / 100;

    updated[idx] = { 
      ...item, 
      discountPercent: dp, 
      discountAmt: discAmt,
      gstAmt: gstAmt,
      cgstAmt: gstAmt / 2,
      sgstAmt: gstAmt / 2
    };
    setBillItems(updated);
  };

  const removeRow = (idx) => {
    if (billItems.length === 1 && !billItems[0].id) { setBillItems([emptyRow()]); return; }
    const updated = billItems.filter((_, i) => i !== idx);
    setBillItems(updated.length ? updated : [emptyRow()]);
  };

  /* ── Compute Free Items ── */
  const freeItems = React.useMemo(() => {
    let list = [];
    activeOffers.forEach(offer => {
      const buyItemsCount = billItems.filter(i => i.id === offer.buy_product_id).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      if (buyItemsCount >= offer.buy_quantity) {
        const multiplier = Math.floor(buyItemsCount / offer.buy_quantity);
        if (multiplier > 0) {
          const freeProduct = allProducts.find(p => p.id === offer.free_product_id);
          if (freeProduct) {
            const freeQty = multiplier * offer.free_quantity;
            list.push({
              tempId: 'free_' + freeProduct.id + '_' + Date.now() + Math.random(),
              id: freeProduct.id,
              name: freeProduct.name,
              qty: freeQty,
              price: 0,
              price_type: freeProduct.price_type || 'exclusive',
              total: 0,
              gstRate: 0,
              gstAmt: 0,
              discountPercent: 0,
              discountAmt: 0,
              cgstAmt: 0,
              sgstAmt: 0,
              isFree: true,
              offerName: offer.name,
              image: freeProduct.image
            });
          }
        }
      }
    });
    return list;
  }, [billItems, activeOffers, allProducts]);

  const qtyTotal = billItems.reduce((s, i) => s + Number(i.qty || 0), 0) + freeItems.reduce((s, i) => s + Number(i.qty || 0), 0);
  const subtotal = billItems.reduce((s, i) => s + Number(i.total || 0), 0);
  const taxTotal = billItems.reduce((s, i) => s + Number(i.gstAmt || 0), 0);
  const totalCGST = billItems.reduce((s, i) => s + Number(i.cgstAmt || 0), 0);
  const totalSGST = billItems.reduce((s, i) => s + Number(i.sgstAmt || 0), 0);
  const totalDiscount = billItems.reduce((s, i) => s + Number(i.discountAmt || 0), 0);
  const grandTotal = Number(subtotal + taxTotal - totalDiscount).toFixed(2);

  const handlePhoneChange = async (e) => {
    const p = e.target.value;
    setCustomer(prev => ({ ...prev, phone: p }));
    if (p.length >= 10 && window.api?.searchCustomer) {
      const existing = await window.api.searchCustomer(p);
      if (existing) setCustomer(prev => ({ ...prev, name: existing.name || prev.name, address: existing.address || prev.address }));
    }
  };

  const handleGenerateClick = () => {
    const invalidItems = billItems.filter(i => i.name.trim() !== "" && !i.id);
    if (invalidItems.length > 0) {
      alert("Please add a valid product. Unregistered products cannot be billed.");
      return;
    }

    const validItems = [...billItems.filter(i => i.qty > 0 && i.id), ...freeItems];
    if (validItems.length === 0) { alert("Please add at least one item before generating a bill."); return; }
    setAmountReceived("");
    setPaymentMode("Cash");
    setCheckoutStep(1);
    setShowInvoice(true);
  };

  const finalizeInvoice = async () => {
    const validItems = [...billItems.filter(i => i.qty > 0 && i.id), ...freeItems];
    if (validItems.length === 0) return;
    if (paymentMode === "Cash" && Math.round(Number(amountReceived) * 100) < Math.round(Number(grandTotal) * 100)) {
      alert(`Insufficient Cash! Need ₹${(Number(grandTotal) - Number(amountReceived)).toFixed(2)} more.`);
      return;
    }
    if (window.api?.createInvoice) {
      const res = await window.api.createInvoice({ cart: validItems, customer, paymentMode });
      setLastInvoiceId(res.billNo); // Use billNo instead of autoincrement ID for display
      setInvoiceSuccess(true);
      if (customer?.phone?.length >= 10 && window.api.sendWhatsapp) {
        window.api.sendWhatsapp(customer.phone, `Thanks for shopping at ${settings.storeName}! Your bill total is ₹${grandTotal}. Have a great day! 🛍️`);
      }
    }
  };

  const closeSuccess = () => {
    setBillItems([emptyRow()]);
    setCustomer({ name: "", phone: "", address: "" });
    setShowInvoice(false);
    setTimeout(() => {
      setInvoiceSuccess(false);
      // Restore focus to first row after closing
      inputRefs.current["0_name"]?.focus();
    }, 300);
  };

  /* ════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  if (!terminalActive) {
    return (
      <div className="animate-fade" style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", 
        background: "transparent",
        gap: 60, padding: 40
      }}>
        <div style={{ textAlign: "center" }}>
          <h1 className="text-gradient" style={{ fontSize: 52, fontWeight: 950, marginBottom: 12, letterSpacing: '-0.04em' }}>Select Intelligence Terminal</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 20, fontWeight: 500 }}>Choose your preferred operational interface to proceed</p>
        </div>
        
        <div style={{ display: "flex", gap: 40, width: "100%", maxWidth: 1100 }}>
          {/* PHOTO METHOD */}
          <div 
            onClick={() => startTerminal('photo')}
            className="modern-card animate-up"
            style={{
              flex: 1, padding: 60,
              cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center",
              transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
              background: "rgba(15, 23, 42, 0.4)",
              border: "1px solid var(--border)"
            }}
          >
            <div style={{ width: 120, height: 120, borderRadius: 32, background: "rgba(99, 102, 241, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, marginBottom: 30, border: "1px solid var(--primary-glow)", boxShadow: "0 20px 40px rgba(99, 102, 241, 0.1)" }}>🖼️</div>
            <h2 className="text-gradient" style={{ fontSize: 32, fontWeight: 900 }}>Visual Method</h2>
            <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 16, marginTop: 20, lineHeight: 1.6 }}>
              Intuitive grid-based selection. Enhanced for high-resolution touchscreens and rapid visual identification.
            </p>
            <div style={{ marginTop: 40, padding: '12px 32px', borderRadius: 14, background: 'var(--primary)', color: 'white', fontWeight: 800, fontSize: 14 }}>LAUNCH VISUAL ➔</div>
          </div>

          {/* TALLY METHOD */}
          <div 
            onClick={() => startTerminal('tally')}
            className="modern-card animate-up"
            style={{
              flex: 1, padding: 60,
              cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center",
              transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
              background: "rgba(15, 23, 42, 0.4)",
              border: "1px solid var(--border)",
              animationDelay: '0.1s'
            }}
          >
            <div style={{ width: 120, height: 120, borderRadius: 32, background: "rgba(168, 85, 247, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, marginBottom: 30, border: "1px solid rgba(168, 85, 247, 0.3)", boxShadow: "0 20px 40px rgba(168, 85, 247, 0.1)" }}>⌨️</div>
            <h2 className="text-gradient" style={{ fontSize: 32, fontWeight: 900, backgroundImage: '#a855f7' }}>Tally Method</h2>
            <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 16, marginTop: 20, lineHeight: 1.6 }}>
              Keyboard-optimized ledger interface. Designed for elite operators using barcodes and high-speed entry.
            </p>
            <div style={{ marginTop: 40, padding: '12px 32px', borderRadius: 14, background: '#a855f7', color: 'white', fontWeight: 800, fontSize: 14 }}>LAUNCH EXPRESS ➔</div>
          </div>
        </div>
        
        <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 20, fontWeight: 700, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", padding: "12px 32px", borderRadius: 100, backdropFilter: 'blur(10px)' }}>
          Terminal will automatically synchronize and enter Full-Screen mode upon selection.
        </div>
      </div>
    );
  }

  return (
    <div className="pos-container" style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 1000, background: "var(--bg)" }}>
      {/* ── SCAN FLASH OVERLAY ── */}
      {scanFlash && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(37, 99, 235, 0.15)", zIndex: 99999,
          pointerEvents: "none", border: "10px solid var(--primary)",
          animation: "flash 0.3s forwards"
        }}>
          <style>{`@keyframes flash { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }`}</style>
        </div>
      )}

      {/* ── REFRESH OVERLAY ── */}
      {isRefreshing && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(255,255,255,0.85)", zIndex: 9999,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(2px)"
        }}>
          <div style={{
             width: 45, height: 45, border: "4px solid #e2e8f0",
             borderTopColor: "var(--primary)", borderRadius: "50%",
             animation: "spin 1s linear infinite"
          }}></div>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div style={{ marginTop: 20, fontWeight: 800, color: "var(--text-1)", fontSize: "16px" }}>Syncing latest stock & prices...</div>
          <div style={{ marginTop: 6, fontWeight: 500, color: "var(--text-3)", fontSize: "13px" }}>Clearing current bill</div>
        </div>
      )}

      {/* ── HELD BILLS PANEL ─── */}
      {showHeldBills && (
        <HeldBillsPanel
          onResume={resumeBill}
          onClose={() => { setShowHeldBills(false); refreshHeldCount(); }}
        />
      )}

      {/* ── LOOSE PRODUCT WEIGHT ENTRY MODAL ── */}
      {showLooseModal && looseProduct && (() => {
        const regWeight = parseFloat(looseProduct.weight) || 1;
        const regUnit = looseProduct.unit || 'Kg';
        const regPrice = Number(looseProduct.price || 0);
        const stkUnit = looseProduct.stock_unit || regUnit;
        const enteredW = parseFloat(looseWeight) || 0;
        const enteredInSelling = convertUnit(enteredW, looseWeightUnit, regUnit);
        const livePrice = enteredW > 0 ? (enteredInSelling / regWeight) * regPrice : 0;
        return (
        <div className="modal-overlay" onClick={() => setShowLooseModal(false)} style={{ zIndex: 10000 }}>
          <div className="invoice-modal animate-up" onClick={e => e.stopPropagation()} style={{ width: '420px', padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ background: 'var(--primary)', padding: '24px 32px', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>⚖️</div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '20px' }}>{looseProduct.name}</div>
                  <div style={{ fontSize: '13px', opacity: 0.9, fontWeight: 600 }}>{regWeight} {regUnit} = ₹{regPrice} · Stock: {looseProduct.quantity}</div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '32px' }}>
              <div style={{ fontWeight: 900, fontSize: '11px', color: 'var(--text-dim)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Operational Weight</div>
              
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <input
                  type="number"
                  step="0.01"
                  autoFocus
                  className="input-premium"
                  value={looseWeight}
                  onChange={e => setLooseWeight(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmLooseAdd(); }}
                  placeholder="0.00"
                  style={{ flex: 1, fontSize: '24px', fontWeight: 950, textAlign: 'center', height: '64px' }}
                />
              </div>

              {/* Unit Selector */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                {(regUnit === 'Kg' || regUnit === 'Gram' ? ['Kg', 'Gram'] : ['Liter', 'ml']).map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setLooseWeightUnit(u)}
                    className={looseWeightUnit === u ? "btn-primary" : "btn-outline"}
                    style={{ flex: 1, height: '44px', fontSize: '13px', fontWeight: 800 }}
                  >{u}</button>
                ))}
              </div>

              {/* Live Price Preview */}
              {enteredW > 0 && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px', marginBottom: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase' }}>Estimated Price</div>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#15803d' }}>
                    ₹{livePrice.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    {looseWeight} {looseWeightUnit} of {regWeight} {regUnit} = ₹{regPrice}
                  </div>
                </div>
              )}

              {/* Quick Weight Buttons */}
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {(regUnit === 'Kg' || regUnit === 'Gram' 
                  ? [{ v: '100', u: 'Gram' }, { v: '250', u: 'Gram' }, { v: '500', u: 'Gram' }, { v: '1', u: 'Kg' }, { v: '2', u: 'Kg' }, { v: '5', u: 'Kg' }]
                  : [{ v: '100', u: 'ml' }, { v: '250', u: 'ml' }, { v: '500', u: 'ml' }, { v: '1', u: 'Liter' }, { v: '2', u: 'Liter' }]
                ).map(q => (
                  <button
                    key={q.v + q.u}
                    type="button"
                    onClick={() => { setLooseWeight(q.v); setLooseWeightUnit(q.u); }}
                    style={{ padding: '5px 10px', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                  >{q.v} {q.u}</button>
                ))}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button onClick={() => setShowLooseModal(false)} className="btn-outline" style={{ flex: 1, height: '52px' }}>ABORT</button>
                <button onClick={confirmLooseAdd} className="btn-primary" style={{ flex: 2, height: '52px' }}>
                  ADD TO BILL ➔
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── CAMERA SCANNER MODAL ── */}
      {isScannerOpen && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="invoice-modal animate-up" style={{ width: '550px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <h2 className="text-gradient" style={{ margin: 0, fontSize: '24px', fontWeight: 900 }}>Inventory Vision</h2>
              <button onClick={() => setIsScannerOpen(false)} className="btn-outline" style={{ width: '40px', height: '40px', padding: 0, borderRadius: '50%' }}>✕</button>
            </div>
            
            <div id="reader" style={{ width: '100%', borderRadius: '24px', overflow: 'hidden', border: '2px solid var(--primary)', background: '#000', boxShadow: '0 0 40px var(--primary-glow)' }}></div>
            
            <div className="glass-panel" style={{ marginTop: '32px', padding: '24px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)' }}>
               <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px' }}>Neural Link Status</div>
               <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)' }}>SYSTEM ACTIVE · SCANNING...</div>
            </div>

            <button className="btn-primary" style={{ marginTop: '32px', width: '100%', height: '56px', background: 'var(--danger)' }} onClick={() => setIsScannerOpen(false)}>DEACTIVATE SENSORS</button>
          </div>
        </div>
      )}

      {/* ── CHECKOUT MODAL ───── */}
      {showInvoice && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          {!invoiceSuccess ? (
            <div className="invoice-modal animate-up" style={{ width: '800px' }}>
              {checkoutStep === 1 && (
                <>
                  <h2 className="text-gradient" style={{ marginBottom: '32px', fontSize: '32px', fontWeight: 950 }}>Transaction Overview</h2>
                  
                  <div className="grid-2" style={{ gap: '24px', marginBottom: '32px' }}>
                    <div>
                      <label className="form-label">Client Contact</label>
                      <input className="input-premium" placeholder="Enter mobile..." value={customer.phone} onChange={handlePhoneChange} />
                    </div>
                    <div>
                      <label className="form-label">Client Identity</label>
                      <input className="input-premium" placeholder="Enter name..." value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '32px', background: 'rgba(0,0,0,0.2)', marginBottom: '32px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>Manifest Items</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {[...billItems.filter(i => i.qty > 0 && i.id), ...freeItems].map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                          <div style={{ fontWeight: 700, fontSize: '14px' }}>
                            {item.name} {item.isFree && <span style={{ color: 'var(--success)', fontSize: '10px', fontWeight: 900, marginLeft: '8px' }}>[FREE]</span>}
                          </div>
                          <div style={{ fontWeight: 900, fontSize: '15px' }}>{item.qty} × ₹{item.price}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex-between" style={{ padding: '24px 32px', background: 'rgba(99,102,241,0.1)', borderRadius: '20px', border: '1px solid var(--primary-glow)', marginBottom: '32px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800 }}>Total Revenue Due</div>
                    <div style={{ fontSize: '32px', fontWeight: 950, color: 'var(--primary)' }}>₹{grandTotal}</div>
                  </div>

                  <div style={{ display: 'flex', gap: '16px' }}>
                    <button onClick={() => setShowInvoice(false)} className="btn-outline" style={{ flex: 1, height: '60px' }}>ABORT</button>
                    <button onClick={() => setCheckoutStep(2)} className="btn-primary" style={{ flex: 2, height: '60px', fontSize: '18px' }}>CONTINUE TO PAYMENT ➔</button>
                  </div>
                </>
              )}

              {checkoutStep === 2 && (
                <>
                  <h2 className="text-gradient" style={{ marginBottom: '32px', fontSize: '32px', fontWeight: 950 }}>Payment Settlement</h2>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '40px' }}>
                    {[
                      { id: 'Cash', label: 'CASH ASSET', icon: '💵' },
                      { id: 'UPI', label: 'DIGITAL UPI', icon: '📱' },
                      { id: 'Card', label: 'CREDIT/DEBIT', icon: '💳' },
                      { id: 'Credit', label: 'DEBT / CREDIT', icon: '📝' }
                    ].map(m => (
                      <div 
                        key={m.id}
                        onClick={() => setPaymentMode(m.id)}
                        className={`modern-card ${paymentMode === m.id ? 'pulse' : ''}`}
                        style={{ 
                          padding: '24px', cursor: 'pointer', textAlign: 'center',
                          border: paymentMode === m.id ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                          background: paymentMode === m.id ? 'rgba(99,102,241,0.1)' : 'rgba(0,0,0,0.1)'
                        }}
                      >
                        <div style={{ fontSize: '32px', marginBottom: '12px' }}>{m.icon}</div>
                        <div style={{ fontWeight: 900, fontSize: '14px', letterSpacing: '1px' }}>{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {paymentMode === 'Cash' && (
                    <div className="glass-panel" style={{ padding: '24px', background: 'rgba(0,0,0,0.2)', marginBottom: '32px' }}>
                      <label className="form-label">Tendered Amount (₹)</label>
                      <input 
                        className="input-premium" 
                        type="number" 
                        value={amountReceived} 
                        onChange={e => setAmountReceived(e.target.value)}
                        autoFocus
                        style={{ fontSize: '28px', fontWeight: 950, textAlign: 'center' }}
                      />
                      {Number(amountReceived) > grandTotal && (
                        <div className="flex-between" style={{ marginTop: '20px', color: 'var(--success)', fontWeight: 800 }}>
                          <span>CHANGE TO RETURN:</span>
                          <span style={{ fontSize: '20px' }}>₹{(Number(amountReceived) - grandTotal).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '16px' }}>
                    <button onClick={() => setCheckoutStep(1)} className="btn-outline" style={{ flex: 1, height: '60px' }}>BACK</button>
                    <button onClick={finalizeInvoice} className="btn-primary" style={{ flex: 2, height: '60px', fontSize: '18px' }}>FINALIZE TRANSACTION ➔</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── PRINTABLE INVOICE ─ */
            <div id="printable-invoice" style={{ background: "white", padding: "40px", width: "100%", height: "100%", color: "#000" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #333", paddingBottom: "20px", marginBottom: "30px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {settings.billLogo && (
                    <img src={settings.billLogo} alt="Logo" style={{ width: 120, maxHeight: 60, objectFit: "contain", filter: "grayscale(100%)", marginBottom: 5 }} />
                  )}
                  <div>
                    <h1 style={{ margin: "0 0 5px 0", fontSize: "2.2rem", fontFamily: "Inter, sans-serif" }}>
                      <span style={{ color: "#111", letterSpacing: "-1px", textTransform: "uppercase" }}>{settings.storeName || "iVA BILLING"}</span>
                    </h1>
                    {settings.gstNumber && <div style={{ color: "#333", fontSize: "0.95rem", fontWeight: "bold", marginBottom: 2 }}>GSTIN: {settings.gstNumber}</div>}
                    <div style={{ color: "#555", fontSize: "0.9rem" }}>{settings.storeAddress}</div>
                    <div style={{ color: "#555", fontSize: "0.9rem" }}>Phone: {settings.storePhone}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right", marginTop: settings.billLogo ? 85 : 0 }}>
                  <h2 style={{ margin: "0 0 10px 0", color: "#333", letterSpacing: "2px" }}>{settings.gstNumber ? "TAX INVOICE" : "INVOICE"}</h2>
                  <div><strong>Bill No:</strong> #{lastInvoiceId}</div>
                  <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
                  <div><strong>Time:</strong> {new Date().toLocaleTimeString()}</div>
                </div>
              </div>

              <div style={{ marginBottom: "30px" }}>
                <strong>Bill To:</strong><br />
                {customer.name ? (
                  <><div>{customer.name}</div><div>{customer.phone}</div><div>{customer.address}</div></>
                ) : (
                  <div>Walk-in Customer</div>
                )}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "30px", border: "1px solid #333" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8f9fa", borderBottom: "1px solid #333" }}>
                    <th style={{ padding: "12px", textAlign: "left", borderRight: "1px solid #333" }}>Item Description</th>
                    <th style={{ padding: "12px", textAlign: "center", borderRight: "1px solid #333" }}>Qty</th>
                    <th style={{ padding: "12px", textAlign: "right", borderRight: "1px solid #333" }}>Rate</th>
                    <th style={{ padding: "12px", textAlign: "center", borderRight: "1px solid #333" }}>Disc%</th>
                    <th style={{ padding: "12px", textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...billItems.filter(i => i.qty > 0 && i.id), ...freeItems].map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #ccc" }}>
                      <td style={{ padding: "12px", borderRight: "1px solid #333" }}>
                        {item.name}
                        {settings.gstNumber && (
                          <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "4px" }}>
                            {item.isFree ? `Offer: ${item.offerName}` : (
                              <>
                                CGST {item.cgstRate || 0}% (₹{(item.cgstAmt || 0).toFixed(2)}) + 
                                SGST {item.sgstRate || 0}% (₹{(item.sgstAmt || 0).toFixed(2)})
                              </>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px", textAlign: "center", borderRight: "1px solid #333" }}>{item.qty}</td>
                      <td style={{ padding: "12px", textAlign: "right", borderRight: "1px solid #333" }}>₹{item.price.toFixed(2)}</td>
                      <td style={{ padding: "12px", textAlign: "center", borderRight: "1px solid #333", color: item.discountPercent > 0 ? '#10b981' : '#999' }}>
                        {item.discountPercent > 0 ? `${item.discountPercent}%` : '—'}
                        {item.discountAmt > 0 && <div style={{ fontSize: '0.7rem' }}>-₹{item.discountAmt.toFixed(2)}</div>}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right" }}>₹{(item.total + item.gstAmt - (item.discountAmt || 0)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* GST Tax Summary Table */}
              {taxTotal > 0 && settings.gstNumber && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: "bold", marginBottom: "8px", textTransform: "uppercase", borderBottom: "1px solid #333", display: "inline-block" }}>Tax Summary</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", border: "1px solid #eee" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                        <th style={{ padding: "6px", border: "1px solid #eee" }}>GST %</th>
                        <th style={{ padding: "6px", border: "1px solid #eee" }}>Taxable Amt</th>
                        <th style={{ padding: "6px", border: "1px solid #eee" }}>CGST Amt</th>
                        <th style={{ padding: "6px", border: "1px solid #eee" }}>SGST Amt</th>
                        <th style={{ padding: "6px", border: "1px solid #eee" }}>Total Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Group items by GST rate */}
                      {Object.entries(
                        billItems.filter(i => i.id && i.gstRate > 0).reduce((acc, item) => {
                          const rate = item.gstRate;
                          if (!acc[rate]) acc[rate] = { taxable: 0, cgst: 0, sgst: 0 };
                          acc[rate].taxable += (item.total - (item.discountAmt || 0));
                          acc[rate].cgst += (item.cgstAmt || 0);
                          acc[rate].sgst += (item.sgstAmt || 0);
                          return acc;
                        }, {})
                      ).map(([rate, vals]) => (
                        <tr key={rate}>
                          <td style={{ padding: "6px", border: "1px solid #eee" }}>{rate}%</td>
                          <td style={{ padding: "6px", border: "1px solid #eee" }}>₹{vals.taxable.toFixed(2)}</td>
                          <td style={{ padding: "6px", border: "1px solid #eee" }}>₹{vals.cgst.toFixed(2)}</td>
                          <td style={{ padding: "6px", border: "1px solid #eee" }}>₹{vals.sgst.toFixed(2)}</td>
                          <td style={{ padding: "6px", border: "1px solid #eee" }}>₹{(vals.cgst + vals.sgst).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "40px" }}>



                <div style={{ width: "250px" }}>
                  {settings.gstNumber ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>
                        <span>Total Taxable:</span><span>₹{subtotal.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>
                        <span>Total CGST:</span><span>₹{totalCGST.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>
                        <span>Total SGST:</span><span>₹{totalSGST.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>
                      <span>Subtotal:</span><span>₹{subtotal.toFixed(2)}</span>
                    </div>
                  )}
                  {totalDiscount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: "0.9rem", color: "#10b981" }}>
                      <span>Discount:</span><span>-₹{totalDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontWeight: "900", fontSize: "1.4rem", color: "#000" }}>
                    <span>TOTAL:</span><span>₹{grandTotal}</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", textAlign: "right", color: "#666", marginTop: -5 }}>{paymentMode} Payment</div>
                </div>
              </div>

              <div style={{ marginTop: "50px", textAlign: "center", color: "#666", fontSize: "0.9rem", borderTop: "1px solid #ccc", paddingTop: "20px" }}>
                Thank you for your purchase visit again<br /><br />
                <span style={{ fontSize: "0.8rem", color: "#888" }}>
                  Software by Innoaivators<br />
                  innoaivators.com &nbsp;|&nbsp; PH - +91 90877 86231
                </span>
              </div>

              <div className="no-print" style={{ marginTop: "40px", display: "flex", justifyContent: "center", gap: "20px" }}>
                <button onClick={() => { if (document.activeElement) document.activeElement.blur(); setTimeout(() => window.print(), 100); }} style={{ padding: "12px 25px", background: "#333", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", fontSize: "1rem" }}>🖨️ PRINT INVOICE</button>
                <button onClick={closeSuccess} style={{ padding: "12px 25px", background: "#1e293b", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", fontSize: "1rem" }}>CLOSE & START NEW</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MAIN LAYOUT ─── */}
      <div className="animate-fade" style={{ height: "100%", display: "flex", gap: "24px", overflow: "hidden" }}>
        
        {/* LEFT PANEL: PRODUCTS SELECTION */}
        <div className="modern-card" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px", overflow: "hidden" }}>
          
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: '30px' }}>
            <div>
              <h2 className="text-gradient" style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>
                {billingMode === 'photo' ? 'Visual Terminal' : 'Express Tally'}
              </h2>
              <div style={{ fontSize: '13px', color: "var(--text-muted)", marginTop: '4px' }}>
                Mode: <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{billingMode === 'photo' ? 'Image-Based' : 'High-Speed Keyboard'}</span>
              </div>
            </div>
            
            <div style={{ display: "flex", gap: '12px', alignItems: 'center' }}>
              {billingMode === 'photo' && (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={18} style={{ position: 'absolute', left: 14, color: 'var(--text-dim)' }} />
                  <input
                    type="text"
                    placeholder="Search by name or code..."
                    className="input-premium"
                    value={photoSearch}
                    onChange={e => setPhotoSearch(e.target.value)}
                    style={{ paddingLeft: '44px', width: '240px' }}
                  />
                </div>
              )}
              <button 
                onClick={() => setIsScannerOpen(true)} 
                className="btn-primary" 
                style={{ background: '#059669', padding: '10px 20px' }}
              >
                <Camera size={18} /> Barcode Scan
              </button>
              <button onClick={handleLocalRefresh} className="btn-outline" style={{ padding: '10px' }} title="Sync Database">
                <RefreshCw size={18} />
              </button>
              <button onClick={() => { setTerminalActive(false); if(document.exitFullscreen) document.exitFullscreen(); }} className="btn-outline" style={{ color: 'var(--danger)', borderColor: 'rgba(244, 63, 94, 0.2)' }}>
                Exit Terminal
              </button>
            </div>
          </header>

          {billingMode === 'photo' ? (
            /* PHOTO GRID — PREMIUM RE-IMAGINED */
            <div className="grid-auto animate-fade" style={{ 
              flex: 1, 
              overflowY: "auto", 
              padding: '10px',
              display: 'grid',
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", 
              gap: '24px',
              alignContent: "start"
            }}>
              {filteredProducts.map(p => {
                const isOutOfStock = Number(p.quantity || 0) <= 0;
                const isLowStock = !isOutOfStock && Number(p.quantity || 0) <= 5;
                const isDisabled = isExpired(p) || isOutOfStock;
                return (
                  <div 
                    key={p.id} 
                    className="glass-card animate-up"
                    style={{
                      opacity: isDisabled ? 0.6 : 1,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      display: 'flex', flexDirection: 'column',
                      padding: '16px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid var(--border)',
                      borderRadius: '24px',
                      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    onClick={() => !isDisabled && addProductToCart(p)}
                  >
                    {/* Image Area */}
                    <div style={{ 
                      height: "140px", 
                      borderRadius: '18px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: '16px',
                      overflow: 'hidden',
                      border: '1px solid var(--glass-border)'
                    }}>
                      {p.image ? (
                        <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ fontSize: "40px", opacity: 0.1 }}>📦</div>
                      )}
                    </div>

                    <div style={{ padding: "20px", flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px', lineHeight: 1.4 }}>{p.name}</h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '16px' }}>
                        Stock: <span style={{ color: isLowStock ? 'var(--warning)' : 'var(--text-muted)' }}>{p.quantity} {p.unit}</span>
                      </div>
                      
                      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>₹{p.price}</div>
                        <div className="flex-center" style={{ width: '36px', height: '36px', background: 'var(--primary)', borderRadius: '10px', color: 'white', fontSize: '20px' }}>+</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* TALLY METHOD — EXPRESS LEDGER */
            <div className="modern-card animate-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 140px 140px 60px', padding: '16px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--glass-border)', fontSize: '11px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <div>Item Protocol / Search</div>
                <div style={{ textAlign: 'center' }}>Price</div>
                <div style={{ textAlign: 'center' }}>Quantity</div>
                <div style={{ textAlign: 'right' }}>Extension</div>
                <div />
              </div>
              
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {billItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 140px 140px 60px', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.03)', gap: '16px', position: 'relative' }}>
                    <div style={{ position: 'relative' }}>
                      <input 
                        className="input-premium"
                        style={{ width: '100%', height: '48px', fontWeight: 700 }}
                        placeholder="Type nomenclature or scan SKU..."
                        value={item.name || ""}
                        onChange={(e) => handleItemNameChange(idx, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, idx, "name")}
                        autoFocus={idx === billItems.length - 1}
                      />
                      {suggestions.length > 0 && currentRow === idx && (
                        <div className="glass-panel animate-up" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, marginTop: '8px', padding: '8px', background: '#0f172a', border: '1px solid var(--primary-glow)' }}>
                          {suggestions.map((s, sIdx) => (
                            <div key={s.id} onClick={() => selectProduct(s, idx)} style={{ padding: '12px 16px', borderRadius: '12px', background: sIdx === selectedSugIndex ? 'var(--primary)' : 'transparent', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', marginBottom: '4px', transition: '0.2s' }}>
                              <span style={{ fontWeight: 700 }}>{s.name}</span>
                              <span style={{ opacity: 0.8, fontSize: '13px' }}>₹{s.price} | {s.quantity} stk</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center', fontWeight: 800, color: 'var(--primary)', fontSize: '16px' }}>{item.price ? `₹${item.price}` : "—"}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                      <button className="btn-outline" onClick={() => updateQty(idx, (item.qty || 0) - 1)} style={{ width: '36px', height: '36px', padding: 0 }}>-</button>
                      <input type="number" className="input-premium" style={{ width: '64px', textAlign: 'center', fontWeight: 900, height: '36px' }} value={item.qty || ""} onChange={(e) => updateQty(idx, e.target.value)} onKeyDown={(e) => handleKeyDown(e, idx, "qty")} />
                      <button className="btn-outline" onClick={() => updateQty(idx, (item.qty || 0) + 1)} style={{ width: '36px', height: '36px', padding: 0 }}>+</button>
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 950, fontSize: '18px', color: '#fff' }}>
                      ₹{item.total ? (item.total + (item.gstAmt || 0) - (item.discountAmt || 0)).toFixed(2) : "0.00"}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                       <button onClick={() => removeRow(idx)} style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px' }}><Trash2 size={20} /></button>
                    </div>
                  </div>
                ))}
              </div>
              
              <button onClick={addRow} className="btn-outline" style={{ margin: '24px', padding: '16px', borderStyle: 'dashed', borderColor: 'var(--primary-glow)', color: 'var(--primary)', fontWeight: 900, letterSpacing: '1px' }}>
                + APPEND OPERATIONAL ROW (F2)
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT: SUMMARY PANEL ── */}
        <div style={{ width: '380px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="modern-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '16px' }}>Customer Entity</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input className="form-input" placeholder="Customer Name / Mobile..." value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px', background: paymentMode === 'Cash' ? 'var(--primary)' : 'rgba(255,255,255,0.03)', borderRadius: '14px', textAlign: 'center', cursor: 'pointer', fontWeight: 800, fontSize: '12px', border: '1px solid var(--glass-border)' }} onClick={() => setPaymentMode('Cash')}>CASH</div>
                <div style={{ padding: '12px', background: paymentMode === 'UPI' ? 'var(--primary)' : 'rgba(255,255,255,0.03)', borderRadius: '14px', textAlign: 'center', cursor: 'pointer', fontWeight: 800, fontSize: '12px', border: '1px solid var(--glass-border)' }} onClick={() => setPaymentMode('UPI')}>UPI / ONLINE</div>
              </div>
            </div>
          </div>

          <div className="modern-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600 }}>Basket Items</span>
                <span style={{ fontWeight: 800, color: 'white' }}>{qtyTotal}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600 }}>Tax Total</span>
                <span style={{ fontWeight: 800, color: 'white' }}>₹{taxTotal.toFixed(2)}</span>
              </div>
              {totalDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', color: 'var(--success)' }}>
                  <span style={{ fontWeight: 600 }}>Campaign Discount</span>
                  <span style={{ fontWeight: 800 }}>-₹{totalDiscount.toFixed(2)}</span>
                </div>
              )}
              
              <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>Payable Amount</div>
                <div style={{ fontSize: '36px', fontWeight: 900, color: 'var(--primary)', letterSpacing: '-1px' }}>₹{grandTotal}</div>
              </div>
            </div>

            <div style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
              <button onClick={holdBill} className="btn-outline" style={{ flex: 1, height: '56px' }}>HOLD</button>
              <button onClick={() => setShowHeldBills(true)} className="btn-outline" style={{ flex: 1, height: '56px', position: 'relative' }}>
                RECALL {heldCount > 0 && <span className="flex-center" style={{ position: 'absolute', top: '-10px', right: '-10px', width: '24px', height: '24px', background: 'var(--danger)', borderRadius: '50%', fontSize: '11px', fontWeight: 900 }}>{heldCount}</span>}
              </button>
            </div>
            
            <button 
              onClick={handleGenerateClick} 
              className="btn-primary" 
              style={{ width: "100%", marginTop: "16px", padding: "18px", fontSize: "18px", letterSpacing: '1px' }}
            >
              PROCEED TO PAY ➔
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default POS;