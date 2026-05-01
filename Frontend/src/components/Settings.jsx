import React, { useState, useEffect } from "react";

const DEFAULTS = {
  storeName: "",
  tagline: "",
  storePhone: "",
  storeAddress: "",
  gstNumber: "",
  lowStockThreshold: 10,
  deadStockThresholdDays: 30,
  expiryAlertDays: 3,
  ownerPhone: "",
  whatsappAlerts: true,
  isCloudEnabled: false,
  masterKey: "owner123",
  supabaseUrl: "",
  supabaseKey: "",
  billLogo: "",
  upiId: "",
  geminiKey: "",
  groqKey: "",
};

function SettingRow({ label, children, hint }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "24px 0", borderBottom: "1px solid var(--glass-border)", gap: 40
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0, minWidth: 300 }}>{children}</div>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "24px 0 12px", borderBottom: "2px solid var(--primary-glow)",
      marginBottom: 12, marginTop: 40
    }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--primary)', letterSpacing: ".1em", textTransform: "uppercase" }}>{title}</span>
    </div>
  );
}

export default function Settings() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [expoUrl, setExpoUrl] = useState("");
  const [showQR, setShowQR] = useState(false);

  // Shop Supabase Connection
  const [shopUrl, setShopUrl] = useState("");
  const [shopKey, setShopKey] = useState("");
  const [shopConnStatus, setShopConnStatus] = useState("idle"); // idle, testing, connected, error
  const [shopConnMsg, setShopConnMsg] = useState("");
  const [syncStatus, setSyncStatus] = useState("idle"); // idle, syncing, done, error
  const [syncMsg, setSyncMsg] = useState("");
  const [lastSynced, setLastSynced] = useState("");

  // Local Database
  const [localDbPath, setLocalDbPath] = useState("");
  const [localDbSaved, setLocalDbSaved] = useState(false);
  const [localDbMsg, setLocalDbMsg] = useState("");

  // Validity
  const [validity, setValidity] = useState(null);

  // Pairing
  const [pairingCode, setPairingCode] = useState("");
  const [pairingStatus, setPairingStatus] = useState("idle");
  const [pairingMsg, setPairingMsg] = useState("");

  // Lock for Cloud Section
  const [isCloudLocked, setIsCloudLocked] = useState(true);
  const [cloudPwd, setCloudPwd] = useState("");

  // Tax Report
  const [taxMonth, setTaxMonth] = useState(new Date().getMonth() + 1);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  const [taxReport, setTaxReport] = useState(null);
  const [taxLoading, setTaxLoading] = useState(false);

  const handleUnlockCloud = () => {
    if (cloudPwd === (cfg.masterKey || "owner123")) {
      setIsCloudLocked(false);
      setCloudPwd("");
    } else {
      alert("Incorrect Master Key.");
    }
  };

  const loadSettingsData = () => {
    try {
      const raw = localStorage.getItem("smart_billing_settings");
      if (raw) setCfg(prev => ({ ...prev, ...JSON.parse(raw) }));
    } catch (e) {}

    window.api?.getDashboardUrl?.().then(url => {
      if (url) setTunnelUrl(url);
    }).catch(() => {});

    window.api?.getLocalIp?.().then(ip => {
      if (ip) setExpoUrl(`exp://${ip}:8081`);
    }).catch(() => {});

    window.api?.getShopId?.().then(id => {
      if (id) setCfg(prev => ({ ...prev, shopId: id }));
    });

    // Load shop Supabase config
    window.api?.getShopSupabase?.().then(config => {
      if (config) {
        setShopUrl(config.supabase_url || "");
        setShopKey(config.supabase_key || "");
        setShopConnStatus(config.is_connected ? "connected" : "idle");
        setLastSynced(config.last_synced || "");
      }
    });

    // Load local DB path
    window.api?.getLocalDbPath?.().then(p => {
      if (p) setLocalDbPath(p);
    });

    // Load validity
    window.api?.getValidity?.().then(v => {
      if (v) setValidity(v);
    });
  };

  useEffect(() => {
    loadSettingsData();

    // Listen for completion
    window.api?.onTunnelReady?.(data => {
      setTunnelUrl(data.url);
    });

    window.addEventListener('soft_refresh', loadSettingsData);
    window.addEventListener('settings_updated', loadSettingsData);
    
    // Auto-refresh validity every 60 seconds so it stays in sync
    const validityInterval = setInterval(() => {
      window.api?.getValidity?.().then(v => {
        if (v) setValidity(v);
      });
    }, 60000);
    
    return () => {
      window.removeEventListener('soft_refresh', loadSettingsData);
      window.removeEventListener('settings_updated', loadSettingsData);
      clearInterval(validityInterval);
    };
  }, []);

  const set = (key, val) => setCfg(prev => ({ ...prev, [key]: val }));

  const save = () => {
    // Sync storePhone to ownerMobile so it gets pushed to Supabase
    const toSave = { ...cfg };
    if (toSave.storePhone && !toSave.ownerMobile) {
      toSave.ownerMobile = toSave.storePhone;
    }
    localStorage.setItem("smart_billing_settings", JSON.stringify(toSave));
    window.api?.saveAppSettings?.(toSave);
    if (window.api?.setWindowTitle && toSave.storeName) window.api.setWindowTitle(toSave.storeName);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    window.dispatchEvent(new Event('settings_updated'));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      set("billLogo", reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Shop Supabase handlers
  const handleSaveShopSupabase = async () => {
    save(); // Automatically save any unsaved AI keys or other settings before proceeding
    
    if (!shopUrl || !shopKey) {
      setShopConnMsg("Please enter both URL and Key.");
      setShopConnStatus("error");
      return;
    }
    setShopConnStatus("testing");
    setShopConnMsg("Connecting to Cloud...");
    try {
      const testResult = await window.api.testShopConnection({ url: shopUrl, key: shopKey });
      if (testResult.success) {
        const saveResult = await window.api.saveShopSupabase({ url: shopUrl, key: shopKey });
        if (saveResult.success) {
          setShopConnStatus("connected");
          setShopConnMsg("✅ Cloud Connected.");
          
          // 🔄 AUTOMATIC RESTORE
          // If we just linked a Supabase, we should automatically pull data.
          setSyncStatus("syncing");
          setSyncMsg("🔄 Automatically restoring your data from cloud...");
          const restoreRes = await window.api.restoreFromCloud();
          if (restoreRes.success) {
            setSyncStatus("done");
            setSyncMsg("✅ Data Restored Successfully! Refreshing...");
            setTimeout(() => window.location.reload(), 2000);
          } else {
            setSyncStatus("error");
            setSyncMsg("Connection ok, but restore failed: " + restoreRes.error);
          }
        } else {
          setShopConnStatus("error");
          setShopConnMsg("Save failed: " + saveResult.error);
        }
      } else {
        setShopConnStatus("error");
        setShopConnMsg("Connection failed: " + testResult.error);
      }
    } catch (e) {
      setShopConnStatus("error");
      setShopConnMsg("Error: " + e.message);
    }
  };

  const handleSyncShop = async () => {
    setSyncStatus("syncing");
    setSyncMsg("Syncing data to cloud...");
    try {
      const res = await window.api.syncShopData();
      if (res.success) {
        setSyncStatus("done");
        setSyncMsg("✅ " + res.message);
        setLastSynced(new Date().toLocaleString());
      } else {
        setSyncStatus("error");
        setSyncMsg("❌ " + res.error);
      }
    } catch (e) {
      setSyncStatus("error");
      setSyncMsg("Error: " + e.message);
    }
    setTimeout(() => setSyncStatus("idle"), 5000);
  };

  const handleRestoreFromCloud = async () => {
    if (!confirm("This will restore all data from your cloud database. Existing local data may be overwritten. Continue?")) return;
    setSyncStatus("syncing");
    setSyncMsg("Restoring data from cloud...");
    try {
      const res = await window.api.restoreFromCloud();
      if (res.success) {
        setSyncStatus("done");
        setSyncMsg("✅ " + res.message);
      } else {
        setSyncStatus("error");
        setSyncMsg("❌ " + res.error);
      }
    } catch (e) {
      setSyncStatus("error");
      setSyncMsg("Error: " + e.message);
    }
    setTimeout(() => setSyncStatus("idle"), 8000);
  };

  const handleValidatePairing = async () => {
    if (!pairingCode || pairingCode.length < 6) return;
    setPairingStatus("validating");
    setPairingMsg("");
    try {
      const res = await window.api.validatePairingCode(pairingCode);
      if (res.success) {
        setPairingStatus("success");
        setPairingMsg("Successfully Linked Device: " + (res.deviceId || "Remote App"));
        setPairingCode("");
      } else {
        setPairingStatus("error");
        setPairingMsg(res.error || "Invalid pairing code.");
      }
    } catch (e) {
      setPairingStatus("error");
      setPairingMsg("Connection error: " + e.message);
    }
  };

  // Local DB handlers
  const handleBrowseFolder = async () => {
    const p = await window.api?.browseFolder?.();
    if (p) setLocalDbPath(p);
  };

  const handleSaveLocalDb = async () => {
    if (!localDbPath) {
      setLocalDbMsg("Please enter a storage path.");
      return;
    }
    try {
      const res = await window.api.saveLocalDbPath(localDbPath);
      if (res.success) {
        setLocalDbSaved(true);
        setLocalDbMsg("✅ " + res.message);
        setTimeout(() => { setLocalDbSaved(false); setLocalDbMsg(""); }, 3000);
      } else {
        setLocalDbMsg("❌ " + res.error);
      }
    } catch (e) {
      setLocalDbMsg("Error: " + e.message);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "14px 18px",
    borderRadius: "14px",
    border: "1px solid var(--glass-border)",
    background: "rgba(0,0,0,0.2)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "600",
    transition: "0.2s cubic-bezier(0.16, 1, 0.3, 1)",
    outline: "none",
  };

  const actionBtnStyle = (color, loading) => ({
    padding: "10px 24px",
    borderRadius: "12px",
    border: "none",
    background: color,
    color: "#fff",
    fontSize: "13px",
    fontWeight: "800",
    cursor: loading ? "default" : "pointer",
    opacity: loading ? 0.6 : 1,
    transition: "0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    boxShadow: `0 4px 12px ${color}40`
  });

  const numInputStyle = { ...inputStyle, width: 100 };

  const toggleStyle = (active) => ({
    width: 44, height: 24, borderRadius: 12,
    background: active ? "var(--primary)" : "#cbd5e1",
    border: "none", cursor: "pointer", position: "relative",
    transition: "background 0.2s", padding: 0
  });

  const toggleKnob = (active) => ({
    width: 18, height: 18, borderRadius: "50%",
    background: "#fff", position: "absolute",
    top: 3, left: active ? 23 : 3,
    transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
  });

  return (
    <div className="animate-fade" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '48px', gap: '24px' }}>
          <div>
            <h1 className="text-gradient" style={{ margin: 0, fontSize: '42px', fontWeight: 950, letterSpacing: '-0.04em' }}>System Parameters</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginTop: '6px', fontWeight: 500 }}>Configure global operational protocols and business logic</p>
          </div>
          <button 
            onClick={save} 
            className="btn-primary pulse" 
            style={{ padding: '16px 40px', fontSize: '16px', fontWeight: 900 }}
          >
            {saved ? "✓ PROTOCOL SAVED" : "COMMIT CHANGES ➔"}
          </button>
        </header>

        <div className="modern-card" style={{ padding: '48px' }}>
        
        {/* ── VALIDITY STATUS ── */}
        {validity && (
          <>
            <SectionTitle icon="⏳" title="Subscription Status" />
            {(() => {
              const isLow = validity.daysLeft <= 7;
              const isCritical = validity.daysLeft <= 3;
              const isExpired = validity.daysLeft <= 0 || !validity.valid;
              const statusColor = isExpired ? "#ef4444" : isCritical ? "#ef4444" : isLow ? "#f59e0b" : "#10b981";
              const bgGrad = isExpired || isCritical
                ? "rgba(239,68,68,0.08)"
                : isLow
                  ? "rgba(245,158,11,0.08)"
                  : "rgba(16,185,129,0.08)";
              const borderColor = isExpired || isCritical
                ? "rgba(239,68,68,0.2)"
                : isLow ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)";
              const statusText = isExpired
                ? "🔴 Subscription Expired"
                : isCritical
                  ? "🚨 Subscription Critical — Pay Now!"
                  : isLow
                    ? "⚠️ Subscription Expiring Soon"
                    : "✅ Subscription Active";
              return (
                <div style={{ padding: "20px", borderRadius: 12, marginBottom: 12, marginTop: 8, background: bgGrad, border: `1px solid ${borderColor}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: statusColor }}>
                        {statusText}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                        {validity.validityEnd ? `Expires: ${new Date(validity.validityEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : ""}
                        {validity.isOffline ? " (Offline cache)" : ""}
                      </div>
                      {!validity.isPaid && validity.daysLeft > 0 && (
                        <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6, fontWeight: 600 }}>
                          💳 Payment pending — Contact admin to renew subscription
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 32, fontWeight: 900, color: statusColor, lineHeight: 1 }}>
                        {validity.daysLeft}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: statusColor, opacity: 0.8 }}>days left</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}


        {/* ── CLOUD INSTALLATION ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <SectionTitle icon="☁️" title="Cloud Installation (Shop Database)" />
          {isCloudLocked ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 20 }}>
              <input 
                type="password" 
                value={cloudPwd}
                onChange={(e) => setCloudPwd(e.target.value)}
                placeholder="Master Key" 
                style={{ ...inputStyle, width: 120, height: 28 }}
              />
              <button 
                onClick={handleUnlockCloud}
                style={{ ...actionBtnStyle("var(--primary)", false), padding: "0 12px", height: 28, fontSize: 11 }}
              >
                🔒 Unlock
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsCloudLocked(true)}
              style={{ ...actionBtnStyle("var(--text-3)", false), padding: "0 12px", height: 28, fontSize: 11, background: "transparent", border: "1px solid var(--border)", color: "var(--text-2)", marginTop: 20 }}
            >
              Lock
            </button>
          )}
        </div>
        
        {isCloudLocked ? (
          <div style={{ padding: "20px", background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px dashed var(--border)", marginBottom: 16, textAlign: "center" }}>
            <span style={{ fontSize: 24, display: "block", marginBottom: 8 }}>🔒</span>
            <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 600 }}>This section is locked for installation use only.</div>
          </div>
        ) : (
          <div style={{ 
            padding: "20px", background: "rgba(255,255,255,0.03)", 
            borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, marginTop: 8 
          }}>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16, lineHeight: 1.6 }}>
              Enter your <strong>Supabase Shop Connection</strong> details provided during installation. This links your desktop terminal with your cloud database and allows the Mobile App to show your real-time data.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-4)", marginBottom: 4, display: "block" }}>SUPABASE URL</label>
                <input 
                  style={inputStyle} 
                  value={shopUrl} 
                  onChange={e => setShopUrl(e.target.value)} 
                  placeholder="https://your-project.supabase.co"
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-4)", marginBottom: 4, display: "block" }}>ANON PUBLIC KEY</label>
                <input 
                  style={inputStyle} 
                  value={shopKey} 
                  onChange={e => setShopKey(e.target.value)} 
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5..."
                />
              </div>

              {/* ── CLOUD SYNC & RESTORE (Locked) ── */}
              <div style={{ marginTop: 12, padding: "16px", background: "rgba(16,185,129,0.05)", borderRadius: 8, border: "1px dashed rgba(16,185,129,0.3)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#10b981", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  🔄 Data Synchronization
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 12, lineHeight: 1.6 }}>
                  Manage your data backup to the cloud. You can manually push your local data to the cloud or restore old data from the cloud to this terminal.
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <button 
                    onClick={handleSyncShop}
                    style={{ ...actionBtnStyle("var(--primary)", syncStatus === "syncing"), padding: "0 16px", height: 32, fontSize: 11 }}
                    disabled={syncStatus === "syncing"}
                  >
                    {syncStatus === "syncing" ? "⏳ Syncing..." : "⬆️ Push Data to Cloud"}
                  </button>
                  <button 
                    onClick={handleRestoreFromCloud}
                    style={{ ...actionBtnStyle("#ef4444", syncStatus === "syncing"), padding: "0 16px", height: 32, fontSize: 11 }}
                    disabled={syncStatus === "syncing"}
                  >
                    {syncStatus === "syncing" ? "⏳ Restoring..." : "⬇️ Restore from Cloud"}
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 600 }}>
                  <span style={{ color: "var(--text-4)" }}>Status:</span>
                  <span style={{ color: syncStatus === "error" ? "#ef4444" : (syncStatus === "done" ? "#10b981" : "var(--primary)") }}>
                    {syncMsg || "Idle"}
                  </span>
                </div>
                {lastSynced && (
                  <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 8 }}>
                    Last Synced: {lastSynced}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 8, padding: "12px", background: "rgba(99,102,241,0.05)", borderRadius: 8, border: "1px dashed rgba(99,102,241,0.3)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--primary)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  🤖 AI Chatbot Configuration
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-4)", marginBottom: 4, display: "block" }}>GEMINI API KEY (Primary)</label>
                  <input 
                    style={inputStyle} 
                    value={cfg.geminiKey || ""} 
                    onChange={e => set("geminiKey", e.target.value)} 
                    type="password"
                    placeholder="AIzaSy..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-4)", marginBottom: 4, display: "block" }}>GROQ API KEY (Backup / Llama 3)</label>
                  <input 
                    style={inputStyle} 
                    value={cfg.groqKey || ""} 
                    onChange={e => set("groqKey", e.target.value)} 
                    type="password"
                    placeholder="gsk_..."
                  />
                </div>
                <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 8 }}>
                  Note: The AI keys will be saved when you click the main "Save Changes" button at the top.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: shopConnStatus === 'connected' ? '#16a34a' : (shopConnStatus === 'error' ? '#ef4444' : 'var(--text-4)') }}>
                  {shopConnMsg || (shopConnStatus === 'connected' ? "Connected to Cloud" : "Not Linked")}
                </div>
                <button 
                  onClick={handleSaveShopSupabase}
                  style={actionBtnStyle(shopConnStatus === 'connected' ? "#16a34a" : "var(--primary)", shopConnStatus === 'testing')}
                >
                  {shopConnStatus === 'testing' ? 'Testing...' : (shopConnStatus === 'connected' ? 'Update Credentials' : 'Link Connection')}
                </button>
              </div>
            </div>
          </div>
        )}



        {/* ── STORE INFO ── */}
        <SectionTitle icon="" title="Store Information" />

        <SettingRow label="Store Name">
          <input style={inputStyle} value={cfg.storeName} onChange={e => set("storeName", e.target.value)} />
        </SettingRow>

        <SettingRow label="Tagline (Optional)">
          <input style={inputStyle} value={cfg.tagline} onChange={e => set("tagline", e.target.value)} />
        </SettingRow>

        <SettingRow label="Store Phone / Mobile">
          <input style={inputStyle} value={cfg.storePhone} onChange={e => set("storePhone", e.target.value)} />
        </SettingRow>

        <SettingRow label="Store Address">
          <textarea style={{ ...inputStyle, height: 60, padding: "8px 12px", resize: "none" }} value={cfg.storeAddress} onChange={e => set("storeAddress", e.target.value)} />
        </SettingRow>

        <SettingRow label="System Shop ID" hint="Unique identifier for this terminal. Used for mobile app pairing.">
          <input style={{ ...inputStyle, background: "rgba(255,255,255,0.05)", cursor: "default", fontFamily: "monospace", color: "var(--text-3)", border: "1px dashed var(--border)" }} 
            value={cfg.shopId || "ID NOT FOUND"} 
            readOnly />
        </SettingRow>

        {/* ── BILLING SETTINGS ── */}
        <SectionTitle icon="" title="Billing Details" />

        <SettingRow label="GST Number">
          <input style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: ".05em" }} value={cfg.gstNumber} onChange={e => set("gstNumber", e.target.value.toUpperCase())} />
        </SettingRow>


        {/* ── TAX REPORT ── */}
        {!!cfg.gstNumber && (
          <>
            <SectionTitle icon="📊" title="Monthly Tax Report" />
            <div style={{ padding: "16px 0" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <select 
              value={taxMonth} 
              onChange={e => setTaxMonth(parseInt(e.target.value))}
              style={{ ...inputStyle, width: 140, cursor: "pointer" }}
            >
              {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={taxYear}
              onChange={e => setTaxYear(parseInt(e.target.value))}
              style={{ ...inputStyle, width: 100, cursor: "pointer" }}
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={async () => {
                setTaxLoading(true);
                try {
                  const res = await window.api?.getTaxReport?.({ year: taxYear, month: taxMonth });
                  if (res?.success) setTaxReport(res);
                  else alert('Failed: ' + (res?.error || 'Unknown error'));
                } catch(e) { alert('Error: ' + e.message); }
                setTaxLoading(false);
              }}
              style={{ ...actionBtnStyle("#3b82f6", taxLoading), padding: "0 20px", height: 36, fontSize: 12 }}
              disabled={taxLoading}
            >
              {taxLoading ? '⏳ Loading...' : '📊 Generate Report'}
            </button>
            {taxReport && (
              <button
                onClick={async () => {
                  try {
                    const { jsPDF } = await import('jspdf');
                    const autoTable = (await import('jspdf-autotable')).default;
                    const r = taxReport;
                    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    const mName = monthNames[r.month - 1];
                    const doc = new jsPDF();
                    
                    doc.setFontSize(18);
                    doc.text(`MONTHLY TAX REPORT - ${mName} ${r.year}`, 14, 22);
                    
                    doc.setFontSize(10);
                    doc.setTextColor(100);
                    doc.text(`Shop Name: ${r.shop.name}`, 14, 32);
                    doc.text(`Owner Name: ${r.shop.ownerName}`, 14, 38);
                    doc.text(`GST Number: ${r.shop.gstNumber}`, 14, 44);
                    doc.text(`Phone/Email: ${r.shop.phone} / ${r.shop.email}`, 14, 50);

                    doc.setFontSize(14);
                    doc.setTextColor(0);
                    doc.text("Summary", 14, 62);
                    autoTable(doc, {
                      startY: 65,
                      head: [['Metric', 'Value']],
                      body: [
                        ['Total Invoices', r.totals.totalInvoices],
                        ['Net Sales (excl. tax)', r.totals.netSales.toFixed(2)],
                        ['Total Tax Collected', r.totals.totalTax.toFixed(2)],
                        ['Total Sales (incl. tax)', r.totals.totalSales.toFixed(2)]
                      ],
                      theme: 'striped',
                      headStyles: { fillColor: [59, 130, 246] }
                    });

                    doc.text("Tax Breakdown by GST Rate", 14, doc.lastAutoTable.finalY + 12);
                    autoTable(doc, {
                      startY: doc.lastAutoTable.finalY + 15,
                      head: [['GST Rate', 'Invoices', 'Taxable Amt', 'Tax Collected', 'Total']],
                      body: (r.taxBreakdown || []).map(t => [
                        `${t.gst_rate}%`, t.invoice_count, t.taxable_amount.toFixed(2), t.total_tax.toFixed(2), t.total_with_tax.toFixed(2)
                      ]),
                      theme: 'grid',
                      headStyles: { fillColor: [16, 185, 129] }
                    });

                    doc.text("Payment Modes", 14, doc.lastAutoTable.finalY + 12);
                    autoTable(doc, {
                      startY: doc.lastAutoTable.finalY + 15,
                      head: [['Mode', 'Count', 'Amount']],
                      body: (r.paymentModes || []).map(p => [p.payment_mode || 'N/A', p.count, p.total.toFixed(2)]),
                      theme: 'striped',
                      headStyles: { fillColor: [245, 158, 11] }
                    });

                    doc.save(`GST_Report_${mName}_${r.year}.pdf`);
                  } catch (e) {
                    alert('Error generating PDF: ' + e.message);
                  }
                }}
                style={{ ...actionBtnStyle("#10b981", false), padding: "0 20px", height: 36, fontSize: 12 }}
              >
                📥 Download
              </button>
            )}
          </div>

          {/* Tax Report Results */}
          {taxReport && (
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
              {/* Shop Header */}
              <div style={{ background: "rgba(99,102,241,0.08)", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)" }}>{taxReport.shop.name || 'My Shop'}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                  {taxReport.shop.address && <span>{taxReport.shop.address} • </span>}
                  {taxReport.shop.phone && <span>📞 {taxReport.shop.phone} • </span>}
                  {taxReport.shop.gstNumber && <span>GST: {taxReport.shop.gstNumber}</span>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", marginTop: 8 }}>
                  📊 Tax Report — {['January','February','March','April','May','June','July','August','September','October','November','December'][taxReport.month - 1]} {taxReport.year}
                </div>
              </div>

              {/* Summary Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, borderBottom: "1px solid var(--border)" }}>
                {[
                  { label: "Total Bills", value: taxReport.totals.totalInvoices, color: "#3b82f6" },
                  { label: "Total Sales", value: `₹${taxReport.totals.totalSales.toFixed(2)}`, color: "#10b981" },
                  { label: "Tax Collected", value: `₹${taxReport.totals.totalTax.toFixed(2)}`, color: "#f59e0b" },
                  { label: "Net Sales", value: `₹${taxReport.totals.netSales.toFixed(2)}`, color: "#8b5cf6" }
                ].map((card, i) => (
                  <div key={i} style={{ padding: "14px 16px", borderRight: i < 3 ? "1px solid var(--border)" : "none", textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: card.color, marginTop: 4 }}>{card.value}</div>
                  </div>
                ))}
              </div>

              {/* GST Breakdown Table */}
              {taxReport.taxBreakdown?.length > 0 && (
                <div style={{ borderBottom: "1px solid var(--border)" }}>
                  <div style={{ padding: "10px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", background: "rgba(255,255,255,0.02)" }}>GST Rate Breakdown</div>
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <th style={{ padding: "8px 16px", textAlign: "left", fontWeight: 700, color: "var(--text-3)", fontSize: 10, textTransform: "uppercase" }}>GST Rate</th>
                        <th style={{ padding: "8px 16px", textAlign: "right", fontWeight: 700, color: "var(--text-3)", fontSize: 10, textTransform: "uppercase" }}>Items</th>
                        <th style={{ padding: "8px 16px", textAlign: "right", fontWeight: 700, color: "var(--text-3)", fontSize: 10, textTransform: "uppercase" }}>Taxable Amt</th>
                        <th style={{ padding: "8px 16px", textAlign: "right", fontWeight: 700, color: "var(--text-3)", fontSize: 10, textTransform: "uppercase" }}>CGST</th>
                        <th style={{ padding: "8px 16px", textAlign: "right", fontWeight: 700, color: "var(--text-3)", fontSize: 10, textTransform: "uppercase" }}>SGST</th>
                        <th style={{ padding: "8px 16px", textAlign: "right", fontWeight: 700, color: "var(--text-3)", fontSize: 10, textTransform: "uppercase" }}>Total Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxReport.taxBreakdown.map((t, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 16px", fontWeight: 700, color: "var(--text-1)" }}>{t.gst_rate}%</td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: "var(--text-2)" }}>{t.item_count}</td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: "var(--text-2)" }}>₹{t.taxable_amount.toFixed(2)}</td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: "#f59e0b" }}>₹{(t.total_tax / 2).toFixed(2)}</td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: "#f59e0b" }}>₹{(t.total_tax / 2).toFixed(2)}</td>
                          <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 700, color: "#ef4444" }}>₹{t.total_tax.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payment Mode Breakdown */}
              {taxReport.paymentModes?.length > 0 && (
                <div>
                  <div style={{ padding: "10px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", background: "rgba(255,255,255,0.02)" }}>Payment Modes</div>
                  <div style={{ display: "flex", gap: 0, flexWrap: "wrap" }}>
                    {taxReport.paymentModes.map((p, i) => (
                      <div key={i} style={{ flex: 1, minWidth: 120, padding: "10px 16px", borderRight: "1px solid var(--border)", borderTop: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase" }}>{p.payment_mode || 'Cash'}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", marginTop: 2 }}>₹{p.total.toFixed(2)}</div>
                        <div style={{ fontSize: 10, color: "var(--text-4)" }}>{p.count} bills</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        </>
        )}

        {/* ── UPI PAYMENT SETTINGS ── */}
        <SectionTitle icon="" title="UPI Payment (QR Code)" />
        
        <SettingRow label="UPI ID (VPA)" hint="Used to generate dynamic QR codes for customers to pay. (e.g. shopname@okicici)">
          <input style={inputStyle} value={cfg.upiId} onChange={e => set("upiId", e.target.value)} placeholder="yourname@upi" />
        </SettingRow>

        {/* ── LOGO FOR BILL ── */}
        <SectionTitle icon="" title="Bill Logo" />

        <SettingRow label="Upload Store Logo" hint="Displayed on printed bills/receipts (black & white format)">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {cfg.billLogo ? (
              <div style={{ position: "relative" }}>
                <img
                  src={cfg.billLogo}
                  alt="Logo"
                  style={{
                    width: 60, height: 60, objectFit: "contain",
                    borderRadius: 8, border: "1px solid var(--border)",
                    filter: "grayscale(100%)"
                  }}
                />
                <button
                  onClick={() => set("billLogo", "")}
                  style={{
                    position: "absolute", top: -6, right: -6,
                    width: 18, height: 18, borderRadius: "50%",
                    background: "#ef4444", color: "white", border: "none",
                    fontSize: 10, cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center"
                  }}
                >×</button>
              </div>
            ) : (
              <label style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 60, height: 60, borderRadius: 8,
                border: "2px dashed var(--border)", cursor: "pointer",
                background: "var(--surface-2)", fontSize: 10, fontWeight: 800, color: "var(--text-4)"
              }}>
                UPLOAD
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
              </label>
            )}
            {!cfg.billLogo && (
              <label style={{
                padding: "6px 14px", borderRadius: 8,
                background: "var(--primary)", color: "#fff",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: "none"
              }}>
                Choose File
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
              </label>
            )}
          </div>
        </SettingRow>

        {/* ── ALERT SETTINGS ── */}
        <SectionTitle icon="" title="System Alerts" />

        <SettingRow label="Low Stock Alert Level" hint="Products with stock ≤ this value trigger alerts">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" style={numInputStyle} value={cfg.lowStockThreshold} min={1} max={100}
              onChange={e => set("lowStockThreshold", Number(e.target.value))} />
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>units</span>
          </div>
        </SettingRow>

        <SettingRow label="Dead Stock Threshold">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" style={numInputStyle} value={cfg.deadStockThresholdDays} min={1} max={365}
              onChange={e => set("deadStockThresholdDays", Number(e.target.value))} />
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>days (unsold)</span>
          </div>
        </SettingRow>

        <SettingRow label="Expiry Warning Days" hint="Alert when a product has ≤ this many days to expire">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" style={numInputStyle} value={cfg.expiryAlertDays} min={1} max={90}
              onChange={e => set("expiryAlertDays", Number(e.target.value))} />
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>days</span>
          </div>
        </SettingRow>

        <SectionTitle icon="" title="Automation & Notifications" />

        <SettingRow label="Owner WhatsApp Number" hint="For automated stock/expiry alerts via WhatsApp">
          <input style={inputStyle} value={cfg.ownerPhone} onChange={e => set("ownerPhone", e.target.value)} />
        </SettingRow>

        <SettingRow label="WhatsApp Alerts" hint="Send automated alerts for low stock, out of stock, and expiry">
          <button
            onClick={() => set("whatsappAlerts", !cfg.whatsappAlerts)}
            style={toggleStyle(cfg.whatsappAlerts)}
          >
            <div style={toggleKnob(cfg.whatsappAlerts)} />
          </button>
        </SettingRow>


        {/* ── ABOUT BRAND ── */}
        <SectionTitle icon="" title="About Software" />


        <div style={{
          background: "#0f172a",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 16, padding: "32px 24px", marginTop: 12, marginBottom: 40,
          textAlign: "center",
          boxShadow: "0 10px 30px rgba(0,0,0,0.1)"
        }}>
          <div style={{ letterSpacing: "-.02em", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ 
              fontSize: 28, fontWeight: 900, 
              background: "#818cf8", 
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" 
            }}>INNOAIVATORS</span>
          </div>
          <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.8, maxWidth: 500, margin: "0 auto" }}>
            <div style={{ color: "#38bdf8", fontWeight: 700, marginBottom: 16, fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase" }}>
              Transforming ideas into innovative digital solutions through cutting-edge technology and creative excellence.
            </div>
            <p style={{marginBottom: 12}}>
              We are a visionary technology partner committed to empowering businesses through seamless digital transformation. Our expertise lies in crafting high-performance, intelligent systems that bridge the gap between offline reliability and cloud-scale intelligence.
            </p>
            <p style={{marginBottom: 12, fontSize: 13, fontStyle: "italic", color: "#cbd5e1"}}>
              Driven by innovation, built for excellence.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 24 }}>
            <div style={{ background: "rgba(255,255,255,0.05)", padding: "8px 16px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 800 }}>Version</span><br/>
              <span style={{ fontSize: 13, color: "#f8fafc", fontWeight: 700 }}>2.2.0 Enterprise</span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", padding: "8px 16px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 800 }}>Core</span><br/>
              <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}>Local-First AI Engine</span>
            </div>
          </div>
        </div>

        </div>
      </div>
    </div>
  );
}
