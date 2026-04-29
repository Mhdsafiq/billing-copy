import React, { useState, useEffect, useRef } from "react";
import { Search, Camera, QrCode } from "lucide-react";
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
  const handleInputChange = (index, value) => {
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

  const addNewRow = () => {
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
      addNewRow();
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
      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", 
        background: "#ffffff", /* Simple minimal B&W background */
        gap: 40, padding: 40
      }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: "#2563eb", marginBottom: 10 }}>Select Billing Terminal</h1>
          <p style={{ color: "var(--text-2)", fontSize: 18, fontWeight: 500 }}>Choose your preferred method to start billing</p>
        </div>
        
        <div style={{ display: "flex", gap: 30, width: "100%", maxWidth: 900 }}>
          {/* PHOTO METHOD */}
          <div 
            onClick={() => startTerminal('photo')}
            style={{
              flex: 1, background: "#ffffff", borderRadius: 32, padding: 50,
              border: "1px solid #e5e7eb", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center",
              transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.05)",
              position: "relative"
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "#9ca3af"; e.currentTarget.style.transform = "translateY(-8px) scale(1.02)"; e.currentTarget.style.boxShadow = "0 30px 60px rgba(0, 0, 0, 0.1)"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.05)"; }}
          >
            <div style={{ width: 100, height: 100, borderRadius: 24, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50, marginBottom: 25, boxShadow: "0 10px 20px rgba(0, 0, 0, 0.05)" }}>🖼️</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-1)" }}>Image Method</h2>
            <p style={{ textAlign: "center", color: "var(--text-3)", fontSize: 15, marginTop: 15, lineHeight: 1.5 }}>
              Visual grid selection. Best for touchscreens and quick identification of items.
            </p>
          </div>

          {/* TALLY METHOD */}
          <div 
            onClick={() => startTerminal('tally')}
            style={{
              flex: 1, background: "#ffffff", borderRadius: 32, padding: 50,
              border: "1px solid #e5e7eb", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center",
              transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.05)"
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "#9ca3af"; e.currentTarget.style.transform = "translateY(-8px) scale(1.02)"; e.currentTarget.style.boxShadow = "0 30px 60px rgba(0, 0, 0, 0.1)"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.05)"; }}
          >
            <div style={{ width: 100, height: 100, borderRadius: 24, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50, marginBottom: 25, boxShadow: "0 10px 20px rgba(0, 0, 0, 0.05)" }}>⌨️</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-1)" }}>Tally Method</h2>
            <p style={{ textAlign: "center", color: "var(--text-3)", fontSize: 15, marginTop: 15, lineHeight: 1.5 }}>
              Keyboard-first list interface. Best for barcodes and rapid bulk entry.
            </p>
          </div>
        </div>
        
        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 10, fontWeight: 600, background: "#f3f4f6", border: "1px solid #e5e7eb", padding: "10px 20px", borderRadius: 20 }}>
          Terminal will automatically enter Full-Screen mode after selection.
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
        <div className="modal-overlay" onClick={() => setShowLooseModal(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px', width: '420px', padding: '0', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.3)', animation: 'slideUp 0.25s ease-out' }}>
            <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            
            {/* Header */}
            <div style={{ background: '#6366f1', padding: '22px 28px', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>⚖️</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '17px' }}>{looseProduct.name}</div>
                  <div style={{ fontSize: '12px', opacity: 0.9 }}>{regWeight} {regUnit} = ₹{regPrice} · Stock: {looseProduct.quantity} {stkUnit}</div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '24px 28px' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#475569', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Enter Weight</div>
              
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                <input
                  type="number"
                  step="0.01"
                  autoFocus
                  value={looseWeight}
                  onChange={e => setLooseWeight(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmLooseAdd(); }}
                  placeholder="e.g. 250"
                  style={{ flex: 1, padding: '12px 16px', fontSize: '20px', fontWeight: 800, border: '2px solid #e2e8f0', borderRadius: '10px', outline: 'none', textAlign: 'center', transition: 'border-color 0.2s' }}
                  onFocus={e => e.target.style.borderColor = '#6366f1'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />
              </div>

              {/* Unit Selector */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {(regUnit === 'Kg' || regUnit === 'Gram' ? ['Kg', 'Gram'] : ['Liter', 'ml']).map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setLooseWeightUnit(u)}
                    style={{
                      flex: 1, padding: '9px', borderRadius: '8px',
                      border: looseWeightUnit === u ? '2px solid #6366f1' : '1px solid #e2e8f0',
                      background: looseWeightUnit === u ? '#6366f1' : '#fff',
                      color: looseWeightUnit === u ? '#fff' : '#475569',
                      fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
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
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowLooseModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={confirmLooseAdd} style={{ flex: 2, padding: '12px', borderRadius: '10px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>
                  ✓ Add to Bill
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── CAMERA SCANNER MODAL ── */}
      {isScannerOpen && (
        <div className="modal-overlay" onClick={() => setIsScannerOpen(false)}>
          <div className="invoice-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450, padding: 30 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <QrCode size={24} color="var(--primary)" /> 
                Scan Product Barcode
              </h3>
              <button onClick={() => setIsScannerOpen(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            
            <div id="pos-reader" style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: '2px solid var(--border)', background: '#000' }}></div>
            
            <div style={{ marginTop: 20, padding: 15, background: '#f8fafc', borderRadius: 10, textAlign: 'center' }}>
               <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  Scanner Status
               </div>
               <div style={{ fontSize: '14px', fontWeight: '800', color: scanStatus.includes('✅') ? '#059669' : '#2563eb' }}>
                  {scanStatus}
               </div>
               
               {detectedBarcode && (
                 <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>DETECTED NUMBER</div>
                    <div style={{ fontSize: '18px', fontWeight: '900', color: '#1e293b', letterSpacing: '1px' }}>{detectedBarcode}</div>
                 </div>
               )}
            </div>

            <button 
              onClick={() => setIsScannerOpen(false)} 
              className="btn-outline" 
              style={{ width: '100%', marginTop: 20, height: 45, fontWeight: 700 }}
            >
              Cancel Scanning
            </button>
          </div>
        </div>
      )}

      {/* ── CHECKOUT MODAL ───── */}
      {showInvoice && (
        <div className="modal-overlay" style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: invoiceSuccess ? "white" : "rgba(15, 23, 42, 0.6)",
          zIndex: 1000,
          display: invoiceSuccess ? "block" : "flex",
          justifyContent: "center", alignItems: "center",
          overflowY: "auto"
        }}>
          {!invoiceSuccess ? (
            <div className="modal-content" style={{
              background: "white", padding: "30px", borderRadius: "12px",
              width: "650px", maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)"
            }}>
              {checkoutStep === 1 && (
                <>
                  <h2 style={{ marginTop: 0, marginBottom: "20px", color: "#0f172a" }}>1. Customer & Order Summary</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "20px" }}>
                    <div className="form-group">
                      <label className="form-label">Phone Number (Auto Search)</label>
                      <input className="form-input" placeholder="e.g. 9876543210" value={customer.phone} onChange={handlePhoneChange} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Customer Name</label>
                      <input className="form-input" placeholder="e.g. John Doe" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                      <label className="form-label">Address</label>
                      <input className="form-input" placeholder="e.g. 1st street, city..." value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} />
                    </div>
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px", fontSize: "0.9rem", color: "#475569" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#1e293b" }}>
                        <th style={{ padding: "8px 0" }}>Item</th>
                        <th style={{ padding: "8px 0", textAlign: "center" }}>Qty</th>
                        <th style={{ padding: "8px 0", textAlign: "center" }}>Disc%</th>
                        <th style={{ padding: "8px 0", textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...billItems.filter(i => i.qty > 0 && i.id), ...freeItems].map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 0", fontWeight: "500" }}>
                            {item.name} {item.isFree && <span style={{ color: "white", backgroundColor: "#10b981", fontSize: "0.7rem", padding: "2px 6px", borderRadius: "4px", marginLeft: "6px" }}>FREE</span>} <br />
                            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                              {item.isFree ? `Offer: ${item.offerName}` : `₹${item.price} ${settings.gstNumber ? `(${item.price_type}) + ${item.gstRate}% GST` : ''}`}
                            </span>
                          </td>
                          <td style={{ padding: "10px 0", textAlign: "center" }}>{item.qty}</td>
                          <td style={{ padding: "10px 0", textAlign: "center", color: item.discountPercent > 0 ? '#10b981' : '#94a3b8' }}>
                            {item.discountPercent > 0 ? `${item.discountPercent}%` : '—'}
                            {item.discountAmt > 0 && <div style={{ fontSize: '0.7rem' }}>-₹{item.discountAmt.toFixed(2)}</div>}
                          </td>
                          <td style={{ padding: "10px 0", textAlign: "right", fontWeight: "bold", color: "#0f172a" }}>₹{(item.total + item.gstAmt - (item.discountAmt || 0)).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "20px", borderTop: "2px solid #e2e8f0", paddingTop: "15px" }}>
                    <div style={{ color: "#64748b", fontSize: "0.85rem" }}>
                      Subtotal: ₹{subtotal.toFixed(2)}
                      {settings.gstNumber && <><br/>CGST (Total): ₹{totalCGST.toFixed(2)}<br/>SGST (Total): ₹{totalSGST.toFixed(2)}</>}
                      {totalDiscount > 0 && <><br/><span style={{ color: '#10b981' }}>Discount: -₹{totalDiscount.toFixed(2)}</span></>}
                    </div>
                    <div style={{ textAlign: "right", fontSize: "1.4rem", fontWeight: "800", color: "var(--primary)" }}>
                      Payable: ₹{grandTotal}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: "15px" }}>
                    <button onClick={() => setShowInvoice(false)} className="btn-outline">Cancel</button>
                    <button onClick={() => setCheckoutStep(2)} className="btn-primary">Continue to Payment ➔</button>
                  </div>
                </>
              )}

              {checkoutStep === 2 && (
                <>
                  <h2 style={{ marginTop: 0, marginBottom: "20px", color: "#0f172a" }}>2. Payment Verification</h2>
                  <div style={{ textAlign: "center", marginBottom: "25px" }}>
                    <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#0f172a" }}>₹{grandTotal}</div>
                    <div style={{ color: "#64748b", fontSize: "0.9rem" }}>Net Payable Amount</div>
                  </div>

                  <div style={{ border: "1px solid #e2e8f0", padding: "20px", borderRadius: "8px", marginBottom: "25px" }}>
                    <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "bold" }}>
                        <input type="radio" checked={paymentMode === "Cash"} onChange={() => setPaymentMode("Cash")} /> 💵 Cash
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "bold" }}>
                        <input type="radio" checked={paymentMode === "UPI"} onChange={() => setPaymentMode("UPI")} /> 📱 UPI (GPay/PhonePe)
                      </label>
                    </div>

                    {paymentMode === "Cash" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "15px" }}>
                        <div>
                          <label className="form-label">Amount Given By Customer (₹)</label>
                          <input type="text" inputMode="decimal" className="form-input" autoFocus style={{ fontSize: "1.2rem", padding: "12px" }}
                            value={amountReceived} onChange={e => setAmountReceived(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={`₹ ${grandTotal}`} />
                        </div>
                        {amountReceived && Number(amountReceived) >= Number(grandTotal) && (
                          <div style={{ padding: "15px", backgroundColor: "#ecfdf5", borderRadius: "6px", fontSize: "1.2rem", color: "#059669", textAlign: "center", fontWeight: "bold" }}>
                            Give Change: ₹{(Number(amountReceived) - Number(grandTotal)).toFixed(2)}
                          </div>
                        )}
                      </div>
                    )}

                    {paymentMode === "UPI" && (
                      <div style={{ textAlign: 'center', backgroundColor: "#f8fafc", padding: "20px", borderRadius: "8px" }}>
                        <div style={{ fontWeight: "bold", color: "#0f172a", fontSize: "1.2rem", marginBottom: 15 }}>Scan to Pay ₹{grandTotal}</div>
                        
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
                  {/* Dynamic QR */}
                  {settings.upiId ? (
                    <div style={{ background: '#fff', padding: 10, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${settings.upiId}&pn=${settings.storeName || 'Shop'}&am=${grandTotal}&cu=INR`)}`}
                        alt="Dynamic UPI QR"
                        style={{ width: 180, height: 180 }}
                      />
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 8 }}>DYNAMIC AMOUNT QR</div>
                    </div>
                  ) : (
                    <div style={{ padding: 20, border: '2px dashed #cbd5e1', borderRadius: 12, color: '#64748b', fontSize: 12, maxWidth: 200 }}>
                      UPI ID not set in Settings.<br/>Cannot generate dynamic QR.
                    </div>
                  )}
                </div>

                        <div style={{ marginTop: 20, padding: 12, background: '#fff', borderRadius: 8, fontSize: 13, color: '#1e293b', border: '1px solid #e2e8f0' }}>
                           VPA: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{settings.upiId || 'Not Configured'}</span>
                        </div>
                        
                        <div style={{ fontSize: "0.9rem", color: "#64748b", marginTop: "15px" }}>
                          Ask customer to scan and verify the amount <b>₹{grandTotal}</b>.
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: "15px" }}>
                    <button onClick={() => setCheckoutStep(1)} className="btn-outline">Back</button>
                    {paymentMode === "UPI" ? (
                      <button onClick={finalizeInvoice} className="btn-primary" style={{ flex: 1, fontSize: "1.05rem", background: '#059669' }}>
                        ✅ Payment Done & Generate Bill
                      </button>
                    ) : (
                      <button onClick={finalizeInvoice} className="btn-primary" style={{ flex: 1, fontSize: "1.05rem" }}>
                        Complete Payment ✓
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── PRINTABLE INVOICE ─ */
            <div className="printable-invoice" style={{ background: "white", maxWidth: "800px", margin: "40px auto", padding: "40px", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}>
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
      <div style={{ display: "flex", flex: 1, overflow: "hidden", height: "100%", background: "var(--bg)" }}>
        
        {/* LEFT PANEL: PRODUCTS SELECTION */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px", overflow: "hidden" }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{billingMode === 'photo' ? '🖼️ Image Billing' : '⌨️ Tally Billing'}</h2>
              <div style={{ fontSize: 12, color: "var(--text-4)" }}>Terminal Active · Full Screen Mode</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: 'center' }}>
              {billingMode === 'photo' && (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={photoSearch}
                    onChange={e => setPhotoSearch(e.target.value)}
                    style={{ padding: '6px 12px 6px 30px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, width: 180, outline: 'none', background: '#fff' }}
                  />
                  {photoSearch && <button onClick={() => setPhotoSearch('')} style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8', padding: 2 }}>✕</button>}
                </div>
              )}
              <button 
                onClick={() => setIsScannerOpen(true)} 
                className="btn-primary" 
                style={{ padding: "6px 14px", fontSize: 11, background: "#059669", display: 'flex', gap: '6px', alignItems: 'center' }}
              >
                <Camera size={14} /> Scan Barcode
              </button>
              <button onClick={handleLocalRefresh} className="btn-outline" style={{ padding: "6px 12px", fontSize: 11 }}>🔄 Refresh</button>
              <button onClick={() => { setTerminalActive(false); if(document.exitFullscreen) document.exitFullscreen(); }} className="btn-outline" style={{ padding: "6px 12px", fontSize: 11 }}>Exit Terminal</button>
            </div>
          </div>

          {billingMode === 'photo' ? (
            /* PHOTO GRID */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "20px", overflowY: "auto", paddingBottom: "30px", alignContent: "flex-start" }}>
              {filteredProducts.map(p => {
              const isOutOfStock = Number(p.quantity || 0) <= 0;
              const isLowStock = !isOutOfStock && Number(p.quantity || 0) <= 5;
              const isDisabled = isExpired(p) || isOutOfStock;
              return (
                <div 
                  key={p.id} 
                  style={{
                    background: "white",
                    borderRadius: "var(--r-lg)",
                    border: `1px solid ${isOutOfStock ? '#ef444440' : isLowStock ? '#f59e0b40' : 'var(--border)'}`,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "var(--shadow-sm)",
                    opacity: isDisabled ? 0.5 : 1,
                    transition: "all 0.2s ease"
                  }}
                >
                  <div style={{ height: "140px", background: "#f8fafc", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid var(--border)" }}>
                    {p.image ? (
                      <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ fontSize: "40px", color: "#cbd5e1" }}>🛍️</div>
                    )}
                    {isExpired(p) && (
                      <div style={{ position: "absolute", top: 10, right: 10, background: "#ef4444", color: "white", fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "10px" }}>
                        EXPIRED
                      </div>
                    )}
                    {isOutOfStock && !isExpired(p) && (
                      <div style={{ position: "absolute", top: 10, right: 10, background: "#ef4444", color: "white", fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "10px" }}>
                        OUT OF STOCK
                      </div>
                    )}
                    {isLowStock && (
                      <div style={{ position: "absolute", top: 10, right: 10, background: "#f59e0b", color: "white", fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "10px" }}>
                        LOW STOCK
                      </div>
                    )}
                    {p.product_type === 'loose' && (
                      <div style={{ position: "absolute", bottom: 8, left: 8, background: "#f59e0b", color: "white", fontSize: "9px", fontWeight: "800", padding: "3px 8px", borderRadius: "10px", display: 'flex', alignItems: 'center', gap: '3px' }}>
                        ⚖️ LOOSE
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "15px", display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-1)", marginBottom: "4px", lineHeight: "1.3" }}>{p.name}</div>
                      <div style={{ fontSize: "11px", color: isOutOfStock ? '#ef4444' : isLowStock ? '#f59e0b' : 'var(--text-3)', fontWeight: isOutOfStock || isLowStock ? 600 : 400, marginBottom: "10px" }}>
                        Stock: {p.quantity} {p.product_type === 'loose' ? (p.stock_unit || p.unit) : p.unit}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: "700", color: "var(--primary)", fontSize: "15px" }}>₹{p.price}</div>
                        {p.product_type === 'loose' && p.weight && <div style={{ fontSize: '9px', color: '#6366f1', fontWeight: 700 }}>{p.weight} {p.unit}</div>}
                      </div>
                      <button 
                        onClick={() => addProductToCart(p)}
                        disabled={isDisabled}
                        style={{
                          background: isDisabled ? '#94a3b8' : 'var(--primary)', color: "white", border: "none",
                          width: "32px", height: "32px", borderRadius: "50%",
                          fontSize: "20px", display: "flex", alignItems: "center", justifyContent: "center", 
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >+</button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          ) : (
            /* TALLY LIST VIEW */
            /* ── TALLY TERMINAL VIEW ── */
            <div className="pos-container" style={{ flex: 1, display: "flex", flexDirection: "column", background: "white", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", position: "relative" }}>
              

              {/* Tally Table Header */}
              <div className="pos-table-header" style={{ gridTemplateColumns: settings.gstNumber ? "50px 1fr 100px 112px 72px 72px 90px 110px" : "50px 1fr 100px 112px 72px 110px" }}>
                <div>S.NO</div>
                <div>DESCRIPTION</div>
                <div>RATE (₹)</div>
                <div>QTY</div>
                <div>DISC %</div>
                {settings.gstNumber && <div>GST %</div>}
                {settings.gstNumber && <div>GST (₹)</div>}
                <div>AMOUNT (₹)</div>
              </div>

              {/* Tally Table Body */}
              <div id="tally-body" style={{ flex: 1, overflowY: "auto", position: "relative" }}>
                {billItems.map((item, idx) => (
                  <div 
                    key={item.tempId || idx} 
                    className="pos-row" 
                    style={{ 
                      background: currentRow === idx ? "rgba(37, 99, 235, 0.05)" : "transparent",
                      gridTemplateColumns: settings.gstNumber ? "50px 1fr 100px 112px 72px 72px 90px 110px" : "50px 1fr 100px 112px 72px 110px"
                    }}
                  >
                    <div className="pos-cell" style={{ color: "var(--text-4)", fontSize: 11 }}>{idx + 1}</div>
                    
                    {/* Description / Search Cell */}
                    <div className="pos-cell" style={{ position: "relative" }}>
                      <input 
                        ref={el => inputRefs.current[`${idx}_name`] = el}
                        className="pos-input"
                        style={{ textAlign: "left", fontWeight: item.id ? 700 : 400 }}
                        placeholder="Type to search..."
                        value={item.name}
                        onChange={(e) => handleInputChange(idx, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, idx, "name")}
                        onFocus={() => setCurrentRow(idx)}
                      />
                      
                      {/* Tally-style Suggestion Box */}
                      {suggestions.length > 0 && currentRow === idx && (
                        <div className="tally-suggestions" style={{ left: 0, width: "100%", minWidth: 400 }}>
                          <div style={{ padding: "6px 12px", background: "var(--surface-3)", fontSize: 10, fontWeight: 800, color: "var(--text-4)", borderBottom: "1px solid var(--border)", letterSpacing: 1 }}>LIST OF STOCK ITEMS</div>
                          {suggestions.map((s, sIdx) => (
                            <div 
                              key={s.id}
                              className={`tally-suggestion-item ${sIdx === selectedSugIndex ? 'selected' : ''}`}
                              onClick={() => selectProduct(s, idx)}
                            >
                              <span>{s.name}{s.product_type === 'loose' ? ' (Loose)' : ''} <small style={{ marginLeft: 8, opacity: 0.6 }}>({s.product_code || 'N/A'})</small></span>
                              <span>₹{s.price} | Stock: {s.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pos-cell" style={{ color: "var(--text-3)" }}>{item.price ? `₹${item.price}` : ""}</div>
                    
                    <div className="pos-cell">
                      {item.id ? (
                        <div className="qty-stepper">
                          <button 
                            className="qty-btn qty-minus"
                            onClick={() => updateQty(idx, (item.qty || 0) - 1)}
                            disabled={!item.qty || item.qty <= 0}
                          >–</button>
                          <input 
                            ref={el => inputRefs.current[`${idx}_qty`] = el}
                            type="number"
                            className="pos-input"
                            style={{ width: 45, fontWeight: 800, fontSize: 13, background: 'transparent' }}
                            value={item.qty || ""}
                            onFocus={(e) => { e.target.select(); setCurrentRow(idx); }}
                            onKeyDown={(e) => handleKeyDown(e, idx, "qty")}
                            onChange={(e) => updateQty(idx, e.target.value)}
                          />
                          <button 
                            className="qty-btn qty-plus"
                            onClick={() => updateQty(idx, (item.qty || 0) + 1)}
                            disabled={item.qty >= (item.maxStock || getProductStock(item.id))}
                          >+</button>
                          {item.id && <span className="qty-stock-hint" style={{ marginLeft: 4 }}>/{item.maxStock || getProductStock(item.id)}</span>}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-4)', fontSize: 12 }}>—</span>
                      )}
                    </div>

                    <div className="pos-cell">
                      {item.id ? (
                        <input
                          type="number"
                          className="pos-input"
                          style={{ width: 50, textAlign: "center", fontSize: 12 }}
                          value={item.discountPercent || ""}
                          placeholder="0"
                          min={0}
                          max={100}
                          onChange={(e) => updateDiscount(idx, e.target.value)}
                        />
                      ) : (
                        <span style={{ color: 'var(--text-4)', fontSize: 12 }}>—</span>
                      )}
                    </div>

                    {settings.gstNumber && <div className="pos-cell" style={{ color: "var(--text-4)" }}>{item.id ? `${item.gstRate}%` : "0"}</div>}
                    {settings.gstNumber && <div className="pos-cell" style={{ color: "var(--text-3)" }}>{item.gstAmt ? item.gstAmt.toFixed(2) : "0.00"}</div>}
                    <div className="pos-cell" style={{ fontWeight: 800, color: "var(--text-1)" }}>{item.total ? (item.total + item.gstAmt - (item.discountAmt || 0)).toFixed(2) : "0.00"}</div>
                  </div>
                ))}

                {/* Free Items List (Tally Mode) */}
                {freeItems.map((item, idx) => (
                  <div key={item.tempId} className="pos-row" style={{ 
                    background: "rgba(16, 185, 129, 0.05)",
                    gridTemplateColumns: settings.gstNumber ? "50px 1fr 100px 112px 72px 72px 90px 110px" : "50px 1fr 100px 112px 72px 110px"
                  }}>
                    <div className="pos-cell" style={{ color: "#10b981", fontSize: 11, fontWeight: "bold" }}>F{idx + 1}</div>
                    <div className="pos-cell" style={{ textAlign: "left" }}>
                      <span style={{ fontWeight: 700, color: "var(--text-1)" }}>{item.name}</span>
                      <span style={{ marginLeft: 8, background: "#10b981", color: "white", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>FREE</span>
                      <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>Offer: {item.offerName}</div>
                    </div>
                    <div className="pos-cell" style={{ color: "var(--text-3)" }}>₹0.00</div>
                    <div className="pos-cell" style={{ fontWeight: 700 }}>{item.qty}</div>
                    <div className="pos-cell" style={{ color: "var(--text-4)" }}>—</div>
                    {settings.gstNumber && <div className="pos-cell" style={{ color: "var(--text-4)" }}>0%</div>}
                    {settings.gstNumber && <div className="pos-cell" style={{ color: "var(--text-4)" }}>0.00</div>}
                    <div className="pos-cell" style={{ fontWeight: 800, color: "#10b981" }}>0.00</div>
                  </div>
                ))}
                
                {/* Empty spacer for visual balance */}
                <div style={{ height: 100 }}></div>
              </div>

              {/* Tally Terminal Footer (The Dark Status Bar) */}
              <div className="pos-footer">
                 <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 20 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }}></div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Cloud Secured</span>
                 </div>

                 <div className="pos-footer-col">
                    <span className="footer-label">Total Qty</span>
                    <span className="footer-val">{qtyTotal}</span>
                 </div>

                 {settings.gstNumber && (
                   <div className="pos-footer-col">
                      <span className="footer-label">Taxable Amt</span>
                      <span className="footer-val">₹{subtotal.toFixed(2)}</span>
                   </div>
                 )}

                 {settings.gstNumber && (
                   <div className="pos-footer-col">
                      <span className="footer-label">Total GST</span>
                      <span className="footer-val">₹{taxTotal.toFixed(2)}</span>
                   </div>
                 )}

                 <div className="pos-footer-col">
                    <span className="footer-label">Discount</span>
                    <span className="footer-val" style={{ color: totalDiscount > 0 ? '#10b981' : undefined }}>-₹{totalDiscount.toFixed(2)}</span>
                 </div>

                 <div className="pos-footer-col">
                    <span className="footer-label">Net Payable</span>
                    <span className="footer-val" style={{ color: "#3b82f6", fontSize: 20 }}>₹{grandTotal}</span>
                 </div>

                 <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                    <button onClick={holdBill} className="btn-outline" style={{ background: "white", border: "1.5px solid #f59e0b", color: "#f59e0b", padding: "0 20px", height: 42, borderRadius: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>⏸ Hold</button>
                    <button onClick={() => setShowHeldBills(true)} className="btn-outline" style={{ position: "relative", background: "#ede9fe", border: "1.5px solid #c4b5fd", color: "#7c3aed", padding: "0 20px", height: 42, borderRadius: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      ▶ Resume
                      {heldCount > 0 && <span style={{ position: "absolute", top: "-5px", right: "-5px", background: "#ef4444", color: "white", borderRadius: "50%", padding: "2px 6px", fontSize: "10px" }}>{heldCount}</span>}
                    </button>
                    <button onClick={handleGenerateClick} className="btn-invoice" style={{ height: 42, background: "#2563eb", borderRadius: 8 }}>GENERATE BILL</button>
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: CART (Only visible in Photo mode) */}
        {billingMode === 'photo' && (
          <div style={{ width: "400px", background: "white", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", boxShadow: "-4px 0 15px rgba(0,0,0,0.03)" }}>
            
            <div style={{ padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
               <div style={{ fontWeight: "700", fontSize: "16px", color: "var(--text-1)" }}>Current Bill</div>
               <div style={{ background: "var(--primary-light)", color: "var(--primary)", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" }}>{qtyTotal} Items</div>
            </div>

            {/* Cart Items List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "15px", display: "flex", flexDirection: "column", gap: "15px" }}>
              {billItems.filter(i => i.id).map((item, idx) => {
                const stock = item.maxStock || getProductStock(item.id);
                const atMax = item.qty >= stock;
                return (
                <div key={item.tempId} style={{ display: "flex", gap: "12px", background: "var(--surface-2)", padding: "10px", borderRadius: "var(--r-md)" }}>
                  <div style={{ width: "50px", height: "50px", borderRadius: "6px", overflow: "hidden", background: "var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                     {item.image ? (
                        <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                     ) : (
                        <span style={{ fontSize: "20px", color: "white" }}>🛍️</span>
                     )}
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                     <div style={{ fontWeight: "600", fontSize: "13.5px", color: "var(--text-1)", lineHeight: "1.2" }}>{item.name}</div>
                     <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                           <span style={{ fontSize: "12px", color: "var(--text-3)" }}>₹{item.price}</span>
                           <div className="cart-qty-stepper">
                             <button
                               className="cart-qty-btn"
                               onClick={() => updateQty(idx, (item.qty || 0) - 1)}
                               disabled={!item.qty || item.qty <= 0}
                             >–</button>
                             <span className="cart-qty-val">{item.qty}</span>
                             <button
                               className="cart-qty-btn"
                               onClick={() => updateQty(idx, (item.qty || 0) + 1)}
                               disabled={atMax}
                               title={atMax ? `Max stock: ${stock}` : ''}
                             >+</button>
                           </div>
                        </div>
                        <div style={{ fontWeight: "700", fontSize: "13px", color: "var(--text-1)" }}>₹{(item.total + item.gstAmt - (item.discountAmt || 0)).toFixed(2)}</div>
                     </div>
                     {atMax && <div style={{ fontSize: "10px", color: "#f59e0b", fontWeight: 600, marginTop: 2 }}>⚠ Max stock ({stock})</div>}
                  </div>
                  <button 
                    onClick={() => removeRow(idx)}
                    style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#ef444415", color: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "center", fontSize: "14px" }}
                  >×</button>
                </div>
              );
              })}

              {/* Free Items List (Photo Mode Cart) */}
              {freeItems.map(item => (
                <div key={item.tempId} style={{ display: "flex", gap: "12px", background: "rgba(16, 185, 129, 0.05)", padding: "10px", borderRadius: "var(--r-md)", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                  <div style={{ width: "50px", height: "50px", borderRadius: "6px", overflow: "hidden", background: "#10b98120", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                     {item.image ? (
                        <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                     ) : (
                        <span style={{ fontSize: "20px" }}>🎁</span>
                     )}
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                     <div style={{ fontWeight: "600", fontSize: "13.5px", color: "var(--text-1)", lineHeight: "1.2", display: "flex", alignItems: "center", gap: "6px" }}>
                       {item.name} 
                       <span style={{ background: "#10b981", color: "white", padding: "2px 6px", borderRadius: "4px", fontSize: "9px", fontWeight: "bold" }}>FREE</span>
                     </div>
                     <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", alignItems: "center" }}>
                        <div style={{ fontSize: "11px", color: "var(--text-3)", fontStyle: "italic" }}>Offer: {item.offerName}</div>
                        <div style={{ fontWeight: "700", fontSize: "13px", color: "#10b981" }}>{item.qty} items</div>
                     </div>
                  </div>
                  <div style={{ width: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>🔒</div>
                </div>
              ))}

              {billItems.filter(i => i.id).length === 0 && freeItems.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--text-4)", marginTop: "40px", fontSize: "14px" }}>
                   <div style={{ fontSize: "40px", marginBottom: "10px" }}>🛒</div>
                   Cart is empty.<br/>Add products from the left.
                </div>
              )}
            </div>

            {/* Cart Footer */}
            <div style={{ background: "#f8fafc", borderTop: "1px solid var(--border)", padding: "20px" }}>
               <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px", color: "var(--text-3)" }}>
                 <span>Taxable Amount</span>
                 <span>₹{subtotal.toFixed(2)}</span>
               </div>
               <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px", color: "var(--text-3)" }}>
                 <span>Total GST</span>
                 <span>₹{taxTotal.toFixed(2)}</span>
               </div>
               {totalDiscount > 0 && (
                 <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px", color: "#10b981", fontWeight: 600 }}>
                   <span>Discount</span>
                   <span>-₹{totalDiscount.toFixed(2)}</span>
                 </div>
               )}
               <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px", fontSize: "18px", fontWeight: "800", color: "var(--text-1)" }}>
                 <span>Net Payable</span>
                 <span style={{ color: "var(--primary)" }}>₹{grandTotal}</span>
               </div>

               <div style={{ display: "flex", gap: "10px" }}>
                 <button 
                   onClick={holdBill}
                   style={{ flex: 1, padding: "12px", background: "white", border: "1.5px solid #f59e0b", color: "#f59e0b", borderRadius: "var(--r-md)", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                 >⏸ Hold</button>
                 <button 
                   onClick={() => setShowHeldBills(true)}
                   style={{ flex: 1, position: "relative", padding: "12px", background: "#ede9fe", border: "1.5px solid #c4b5fd", color: "#7c3aed", borderRadius: "var(--r-md)", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                 >
                   ▶ Resume
                   {heldCount > 0 && <span style={{ position: "absolute", top: "-5px", right: "-5px", background: "#ef4444", color: "white", borderRadius: "50%", padding: "2px 6px", fontSize: "10px" }}>{heldCount}</span>}
                 </button>
               </div>
               <button 
                 onClick={handleGenerateClick}
                 style={{ width: "100%", marginTop: "15px", padding: "15px", background: "var(--primary)", color: "white", border: "none", borderRadius: "var(--r-md)", fontWeight: "700", fontSize: "16px", cursor: "pointer", boxShadow: "0 4px 12px rgba(0, 82, 204, 0.25)" }}
               >NEXT ➔</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default POS;