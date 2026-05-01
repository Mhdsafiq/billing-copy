import React, { useState, useEffect } from "react";
import logoUrl from "../assets/logo.png";

/**
 * ShopRegistration — Enterprise Setup Interface.
 * Registration-only flow with Email OTP verification.
 * - Shows only on first launch
 * - 4 fields: Business Name, Owner Name, Email (with OTP), Mobile
 * - Duplicate email blocked, duplicate phone allowed
 */
export default function ShopRegistration({ onRegistered, forcePending = false, savedShopId = '' }) {
  const [shopName, setShopName]   = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [mobile, setMobile]       = useState("");
  const [email, setEmail]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  // Registration success state
  const [registrationStatus, setRegistrationStatus] = useState(forcePending ? 'pending' : null); // null | 'pending'
  const [registeredShopId, setRegisteredShopId]     = useState(savedShopId || "");
  const [registeredSystemId, setRegisteredSystemId] = useState("");
  const [checkingActivation, setCheckingActivation] = useState(false);
  const [checkMsg, setCheckMsg]                     = useState("");

  // Email verification state
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpSent, setOtpSent]       = useState(false);
  const [otpCode, setOtpCode]       = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMsg, setOtpMsg]         = useState("");
  const [otpError, setOtpError]     = useState("");
  const [emailError, setEmailError] = useState("");
  const [mobileVerified, setMobileVerified] = useState(true);
  const [mobileError, setMobileError] = useState("");

  // ── On app restart with forcePending, load saved shop details ──
  useEffect(() => {
    if (forcePending && savedShopId) {
      setRegisteredShopId(savedShopId);
      setRegistrationStatus('pending');
      // Load hardware ID from settings for display
      (async () => {
        try {
          const settings = await window.api?.getAppSettings?.();
          if (settings?.hardwareId) setRegisteredSystemId(settings.hardwareId);
          else setRegisteredSystemId('N/A');
        } catch { setRegisteredSystemId('N/A'); }
      })();
    }
  }, [forcePending, savedShopId]);

  // ── Auto-poll for activation every 10 seconds ──
  useEffect(() => {
    if (registrationStatus !== 'pending') return;
    const interval = setInterval(async () => {
      try {
        // Check both validity and license status for activation
        const validity = await window.api.getValidity?.();
        if (validity?.isActive) {
          clearInterval(interval);
          onRegistered(registeredShopId);
          return;
        }
        // Fallback: direct license check
        const license = await window.api.getLicenseStatus?.();
        if (license?.is_active) {
          clearInterval(interval);
          onRegistered(registeredShopId);
        }
      } catch (e) { }
    }, 10000);
    return () => clearInterval(interval);
  }, [registrationStatus, registeredShopId]);

  // ── Manual Check Button ──
  const handleManualCheck = async () => {
    setCheckingActivation(true);
    setCheckMsg("");
    try {
      // Check 1: Try getValidity (queries full shop record from Supabase)
      let isActive = false;
      const validity = await window.api.getValidity?.();
      console.log("[Activation Check] getValidity result:", validity);
      if (validity?.isActive) {
        isActive = true;
      }

      // Check 2: Fallback to getLicenseStatus (direct is_active check)
      if (!isActive) {
        const license = await window.api.getLicenseStatus?.();
        console.log("[Activation Check] getLicenseStatus result:", license);
        if (license?.is_active) {
          isActive = true;
        }
      }

      if (isActive) {
        setCheckMsg("✅ Activated! Launching...");
        setTimeout(() => onRegistered(registeredShopId), 1000);
      } else {
        setCheckMsg("⏳ Not yet activated. Please contact admin.");
        setTimeout(() => setCheckMsg(""), 5000);
      }
    } catch (e) {
      console.error("[Activation Check] Error:", e);
      setCheckMsg("❌ Network error. Try again.");
      setTimeout(() => setCheckMsg(""), 3000);
    } finally {
      setCheckingActivation(false);
    }
  };

  // ── Copy to clipboard ──
  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  // ── Send OTP ──
  const handleSendOtp = async () => {
    if (!email.trim() || !email.includes("@")) {
      setEmailError("Please enter a valid email address first.");
      return;
    }
    setOtpLoading(true);
    setEmailError("");
    setOtpError("");
    setOtpMsg("");

    try {
      // 1. Check if email already exists
      const exists = await window.api.checkEmailExists(email.trim());
      if (exists.exists) {
        setEmailError("Email already exists. Please use a different email.");
        setOtpLoading(false);
        return;
      }

      // 2. Send OTP
      const result = await window.api.sendOtp(email.trim());
      if (result.success) {
        setOtpSent(true);
        setOtpMsg("✅ Verification code sent to " + email.trim());
      } else {
        setOtpError(result.error || "Failed to send verification code.");
      }
    } catch (e) {
      setOtpError("Network error. Please check your connection.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Verify OTP ──
  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      setOtpError("Please enter the full 6-digit code.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");

    try {
      const result = await window.api.verifyOtp({ email: email.trim(), code: otpCode });
      if (result.success) {
        setEmailVerified(true);
        setOtpMsg("✅ Email verified successfully!");
        setOtpError("");
      } else {
        setOtpError(result.error || "Invalid verification code.");
      }
    } catch (e) {
      setOtpError("Verification failed. Try again.");
    } finally {
      setOtpLoading(false);
    }
  };



  // ── Register ──
  const handleRegister = async () => {
    if (!shopName.trim() || !ownerName.trim() || !mobile.trim() || !email.trim()) {
      setError("All fields are required to register your terminal.");
      return;
    }
    if (mobile.trim().length < 10) {
      setError("Mobile number must be at least 10 digits.");
      return;
    }
    if (!emailVerified) {
      setError("Please verify your email before registering.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await window.api.registerShop({
        shopName: shopName.trim(),
        ownerName: ownerName.trim(),
        mobileNumber: mobile.trim(),
        email: email.trim(),
        shopEmail: email.trim()
      });

      if (result.success) {
        // Show pending activation screen with Shop ID + System ID
        setRegisteredShopId(result.shopId);
        setRegisteredSystemId(result.systemId || 'N/A');
        setRegistrationStatus('pending');
        // Also save settings locally
        await completeAuthAndLaunch(result.shopId, shopName, ownerName, mobile, email, email, "owner123");
      } else {
        setError(result.error || "Cloud gateway timeout. Check connection.");
      }
    } catch (e) {
      setError("System failed to establish cloud handshake.");
    } finally {
      setLoading(false);
    }
  };

  const completeAuthAndLaunch = async (id, name, owner, phone, email, sEmail, mKey) => {
    try {
      const currentSettings = await window.api.getAppSettings() || {};
      const newSettings = {
        ...currentSettings,
        shopId: id,
        storeName: name || currentSettings.storeName,
        ownerName: owner || currentSettings.ownerName,
        ownerPhone: phone || currentSettings.ownerPhone,
        ownerEmail: email || currentSettings.ownerEmail,
        shopEmail: sEmail || currentSettings.shopEmail,
        masterKey: mKey || currentSettings.masterKey
      };
      await window.api.saveAppSettings(newSettings);
      localStorage.setItem("smart_billing_settings", JSON.stringify(newSettings));
      if (window.api.setWindowTitle && name) window.api.setWindowTitle(name);
      window.dispatchEvent(new CustomEvent('settings_updated'));
      // Do NOT call onRegistered here — wait for admin activation
    } catch (err) { console.error("Sync error:", err); }
  };

  // ── Pending Activation Screen ──
  if (registrationStatus === 'pending') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 999999,
        background: '#020617',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', color: 'white', textAlign: 'center',
        fontFamily: "'Inter', system-ui, sans-serif", padding: 40,
        animation: 'fadeIn 0.6s ease-out'
      }}>
        {/* Success Icon */}
        <div style={{
          width: 120, height: 120, borderRadius: 36,
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.3)',
          boxShadow: '0 20px 60px rgba(99,102,241,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 32, animation: 'pulse 2s infinite ease-in-out'
        }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>

        <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 12 }}>
          Registration Complete
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.03em',
          background: '#fff', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Pending Admin Activation
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', maxWidth: 500, lineHeight: 1.7, marginBottom: 40 }}>
          Your terminal has been registered successfully. Share the details below with your Innoaivators admin to activate your software license.
        </p>

        {/* Info Cards with Copy buttons */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ padding: '24px 32px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20, minWidth: 240, position: 'relative' }}>
            <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>Shop ID</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', fontFamily: "'Courier New', monospace", letterSpacing: 2 }}>{registeredShopId}</div>
            <button onClick={() => copyToClipboard(registeredShopId)} style={{ marginTop: 10, fontSize: 11, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontWeight: 700 }}>📋 Copy</button>
          </div>
          <div style={{ padding: '24px 32px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20, minWidth: 240 }}>
            <div style={{ fontSize: 11, color: '#a855f7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>System ID (Hardware)</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', fontFamily: "'Courier New', monospace", wordBreak: 'break-all' }}>{registeredSystemId}</div>
            <button onClick={() => copyToClipboard(registeredSystemId)} style={{ marginTop: 10, fontSize: 11, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#d8b4fe', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontWeight: 700 }}>📋 Copy</button>
          </div>
        </div>

        {/* Support */}
        <div style={{ padding: '24px 40px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 24, backdropFilter: 'blur(20px)', marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 8 }}>Contact Admin to Activate</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff' }}>+91 90877 86231</div>
          <div style={{ fontSize: 12, color: '#475569', fontWeight: 600, marginTop: 6 }}>Available 24/7 for Enterprise Support</div>
        </div>

        {/* Manual Check Button */}
        <button
          onClick={handleManualCheck}
          disabled={checkingActivation}
          style={{
            marginBottom: 20,
            padding: '14px 36px',
            background: checkingActivation ? 'rgba(99,102,241,0.3)' : '#6366f1',
            color: '#fff', border: 'none', borderRadius: 16,
            fontSize: 15, fontWeight: 800, cursor: checkingActivation ? 'wait' : 'pointer',
            boxShadow: '0 8px 24px rgba(99,102,241,0.25)',
            transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: 10
          }}
        >
          {checkingActivation ? (
            <>
              <svg style={{ animation: 'spin 1s linear infinite' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Checking...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-.08-4.63"/>
              </svg>
              Check Activation Now
            </>
          )}
        </button>

        {/* Status message */}
        {checkMsg && (
          <div style={{ marginBottom: 16, padding: '10px 24px', borderRadius: 12, background: checkMsg.includes('✅') ? 'rgba(34,197,94,0.1)' : checkMsg.includes('❌') ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)', border: `1px solid ${checkMsg.includes('✅') ? 'rgba(34,197,94,0.3)' : checkMsg.includes('❌') ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.2)'}`, color: checkMsg.includes('✅') ? '#22c55e' : checkMsg.includes('❌') ? '#ef4444' : '#a5b4fc', fontSize: 13, fontWeight: 700 }}>
            {checkMsg}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#475569', fontSize: 12, fontWeight: 600 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: 'pulse 1.5s infinite', boxShadow: '0 0 8px #6366f1' }}/>
          Auto-checking every 10 seconds...
        </div>

        <div style={{ position: 'absolute', bottom: 32, color: '#334155', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          System: Innoaivators Smart Billing v4.0 Pro
        </div>

        <style>{`
          @keyframes pulse { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 0.8; } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="setup-container">
      {/* LEFT PANEL: Branding & Visuals */}
      <div className="visual-panel">
        <div className="gradient-mesh"></div>
        <div className="panel-content">
          <div className="setup-logo-container">
            <img src={logoUrl} alt="Innoaivators" className="setup-logo-img" />
          </div>
          <h1 className="brand-name">Innoaivators</h1>
          <h2 className="setup-tagline">Innovate, Create, Elevate.<br/><span>Partner in Digital Transformation.</span></h2>
          <p className="setup-description">
            Your Strategic Partner in Intelligent Automation and Advanced Business Analytics. 
            Built for the modern enterprise, designed for scale.
          </p>
        </div>

        <div className="setup-footer">
          © 2026 Innoaivators Systems • Version 4.0 Pro
        </div>
      </div>

      {/* RIGHT PANEL: Registration Form */}
      <div className="form-panel">
        <div className="form-inner">
          <div className="form-header">
            <h1>Initial Setup</h1>
            <p>Register your terminal to begin operations.</p>
          </div>

          <div className="setup-form">
            {/* 1. Business Name */}
            <div className="input-group">
              <label>Business / Venture Name</label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g. Phoenix Enterprises"
                autoFocus
              />
            </div>

            {/* 2. Owner Name */}
            <div className="input-group">
              <label>Primary Owner Identity (Name)</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Full Legal Name"
              />
            </div>

            {/* 3. Owner Email + Verify */}
            <div className="input-group">
              <label>Owner Personal Email</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailVerified) {
                      setEmailVerified(false);
                      setOtpSent(false);
                      setOtpCode("");
                      setOtpMsg("");
                    }
                    setEmailError("");
                  }}
                  placeholder="owner@gmail.com"
                  disabled={emailVerified}
                  style={emailVerified ? { borderColor: "#22c55e", background: "rgba(34,197,94,0.05)" } : {}}
                />
                {!emailVerified && !otpSent && (
                  <button
                    onClick={handleSendOtp}
                    disabled={otpLoading || !email.includes("@")}
                    className="verify-btn"
                  >
                    {otpLoading ? "⏳" : "📧"} Verify
                  </button>
                )}
                {emailVerified && (
                  <div className="verified-badge">✅ Verified</div>
                )}
              </div>

              {emailError && <div className="field-error">{emailError}</div>}

              {otpSent && !emailVerified && (
                <div className="otp-section">
                  <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginBottom: 8 }}>
                    {otpMsg}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && otpCode.length === 6 && handleVerifyOtp()}
                      placeholder="6-digit code"
                      maxLength={6}
                      className="otp-input"
                    />
                    <button
                      onClick={handleVerifyOtp}
                      disabled={otpLoading || otpCode.length !== 6}
                      className="verify-btn confirm"
                    >
                      {otpLoading ? "⏳" : "✓"} Confirm
                    </button>
                  </div>
                  {otpError && <div className="field-error">{otpError}</div>}
                </div>
              )}

            </div>

            {/* 4. Mobile Number */}
            <div className="input-group">
              <label>Owner Mobile Number (Communication)</label>
              <input
                type="tel"
                value={mobile}
                onChange={(e) => { setMobile(e.target.value.replace(/[^0-9+\s-]/g, "")); }}
                placeholder="+91 XXXX XXXX XX"
                maxLength={15}
              />
              {mobileError && <div className="field-error">{mobileError}</div>}
            </div>

            {error && <div className="setup-error">⚠️ {error}</div>}

            <button
              className="setup-submit-btn"
              onClick={handleRegister}
              disabled={loading || !emailVerified}
              style={!emailVerified ? { opacity: 0.5, cursor: "not-allowed" } : {}}
            >
              {loading ? "Establishing Secure Connection..." : !emailVerified ? "🔒 Verify Email to Continue" : "Register & Launch Terminal"}
            </button>
          </div>

          <div className="form-footer">
            <div className="status-indicator">
              <span className="pulse-dot"></span> Secure Cloud Link Active
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .setup-container {
          position: fixed; inset: 0; z-index: 999999;
          display: flex; background: #020617;
          font-family: 'Inter', -apple-system, sans-serif;
          animation: fadeIn 0.6s ease-out;
        }

        /* VISUAL PANEL */
        .visual-panel {
          flex: 1.2; position: relative; overflow: hidden;
          background: #0f172a; display: flex; align-items: center; padding: 80px;
        }
        .gradient-mesh {
          position: absolute; inset: 0; opacity: 0.4;
          background: 
            #6366f1,
            #a855f7;
          filter: blur(80px); animation: meshFloat 20s infinite alternate;
        }
        @keyframes meshFloat { 0% { transform: scale(1); } 100% { transform: scale(1.2) rotate(5deg); } }

        .panel-content { position: relative; z-index: 10; width: 100%; }

        .setup-logo-container {
          width: 72px; height: 72px; background: white; border-radius: 20px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 24px; box-shadow: 0 15px 35px rgba(0,0,0,0.2);
          overflow: hidden; padding: 10px;
        }
        .setup-logo-img { width: 100%; height: 100%; object-fit: contain; }
        
        .brand-name { color: rgba(255,255,255,0.5); font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 8px; }
        
        .setup-tagline { color: #f8fafc; font-size: 42px; font-weight: 900; line-height: 1.1; letter-spacing: -0.04em; margin-bottom: 20px; }
        .setup-tagline span { color: #818cf8; }
        
        .setup-description { color: #94a3b8; font-size: 16px; font-weight: 500; line-height: 1.6; margin-bottom: 40px; max-width: 480px; }

        .feature-list { list-style: none; padding: 0; margin-bottom: 60px; }
        .feature-list li { color: #e2e8f0; font-size: 17px; font-weight: 600; margin-bottom: 18px; display: flex; align-items: center; gap: 12px; }
        .feature-list .dot { width: 8px; height: 8px; background: #6366f1; border-radius: 50%; box-shadow: 0 0 10px #6366f1; }
        
        .setup-footer { 
          position: absolute; 
          bottom: 32px; 
          left: 0; 
          right: 0; 
          text-align: center; 
          color: #475569; 
          font-size: 13px; 
          font-weight: 700; 
          letter-spacing: 0.05em; 
          z-index: 100;
          pointer-events: none;
        }

        /* FORM PANEL */
        .form-panel { flex: 1; background: #020617; display: flex; align-items: center; justify-content: center; padding: 60px; border-left: 1px solid rgba(255,255,255,0.05); overflow-y: auto; }
        .form-inner { width: 100%; max-width: 440px; }
        .form-header { margin-bottom: 40px; }
        .form-header h1 { color: white; font-size: 32px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.02em; }
        .form-header p { color: #64748b; font-size: 16px; font-weight: 500; }

        .setup-form { display: flex; flex-direction: column; gap: 20px; }
        .input-group label { display: block; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; }
        .input-group input {
          width: 100%; height: 56px; background: #0f172a; border: 1px solid #1e293b;
          border-radius: 14px; padding: 0 20px; color: white; font-size: 15px; font-weight: 500;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); outline: none;
          box-sizing: border-box;
        }
        .input-group input:focus { border-color: #6366f1; background: #1e293b; box-shadow: 0 0 0 4px rgba(99,102,241,0.1); }
        .input-group input:disabled { opacity: 0.7; cursor: not-allowed; }

        /* Verify Button */
        .verify-btn {
          height: 56px; padding: 0 18px; border-radius: 14px; border: none;
          background: #6366f1; color: white;
          font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all 0.3s; white-space: nowrap;
          display: flex; align-items: center; gap: 6px;
        }
        .verify-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.4); }
        .verify-btn:disabled { opacity: 0.5; cursor: wait; }
        .verify-btn.confirm {
          background: #22c55e;
        }
        .verify-btn.confirm:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(34,197,94,0.4); }

        /* Verified Badge */
        .verified-badge {
          height: 56px; padding: 0 16px; border-radius: 14px;
          background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3);
          color: #22c55e; font-size: 13px; font-weight: 700;
          display: flex; align-items: center; gap: 6px; white-space: nowrap;
        }

        /* OTP Section */
        .otp-section {
          margin-top: 12px; padding: 16px; border-radius: 12px;
          background: rgba(99,102,241,0.05); border: 1px solid rgba(99,102,241,0.15);
          animation: slideDown 0.3s ease-out;
        }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

        .otp-input {
          flex: 1; height: 48px !important; text-align: center;
          font-size: 22px !important; font-weight: 800 !important;
          letter-spacing: 8px; font-family: 'JetBrains Mono', monospace;
          border-color: #6366f1 !important;
        }

        /* Field error */
        .field-error {
          color: #ef4444; font-size: 12px; font-weight: 600;
          margin-top: 8px; padding: 8px 12px; border-radius: 8px;
          background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.15);
        }

        .setup-submit-btn {
          height: 64px; margin-top: 8px; background: #6366f1; color: white; border: none;
          border-radius: 18px; font-size: 16px; font-weight: 700; cursor: pointer;
          transition: all 0.3s;
        }
        .setup-submit-btn:hover:not(:disabled) { background: #4f46e5; transform: translateY(-2px); box-shadow: 0 10px 30px rgba(99,102,241,0.3); }
        .setup-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .setup-error { color: #fb7185; font-size: 14px; font-weight: 600; padding: 14px; border-radius: 12px; background: rgba(225,29,72,0.1); border: 1px solid rgba(225,29,72,0.2); text-align: center; }
        .form-footer { margin-top: 30px; text-align: center; }
        .status-indicator { display: inline-flex; align-items: center; gap: 10px; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
        .pulse-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 12px #22c55e; animation: pulse 2s infinite; }

        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        @media (max-width: 1000px) {
          .visual-panel { display: none; }
          .form-panel { border-left: none; }
        }
      `}</style>
    </div>
  );
}
