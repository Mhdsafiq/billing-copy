import React, { useState } from "react";

/**
 * PairingCode — Desktop modal to ENTER a pairing code from the mobile app.
 * Flow: Mobile generates code → Owner tells it to desktop → Desktop validates → Paired!
 */
export default function PairingCode({ shopId, onClose }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle"); // idle | success

  const validateCode = async () => {
    if (code.length !== 6) {
      setError("Enter the full 6-digit code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await window.api.validatePairingCode(code);
      if (result.success) {
        setStatus("success");
      } else {
        setError(result.error || "Invalid or expired code. Try again.");
      }
    } catch (e) {
      setError("Failed to validate. Check internet connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
    }} onClick={onClose}>
      <div style={{
        background: "#0f172a",
        border: "1px solid rgba(99,102,241,0.25)", borderRadius: 24,
        padding: "40px", maxWidth: 420, width: "90%", textAlign: "center",
        boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
      }} onClick={e => e.stopPropagation()}>
        
        {/* Icon */}
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: "0 auto 20px",
          background: status === "success"
            ? "#22c55e"
            : "#6366f1",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
          boxShadow: status === "success"
            ? "0 8px 24px rgba(34,197,94,0.4)"
            : "0 8px 24px rgba(99,102,241,0.4)",
          transition: "all 0.5s ease",
        }}>
          {status === "success" ? "✅" : "🔗"}
        </div>

        <h2 style={{ color: "white", fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
          {status === "success" ? "Device Paired!" : "Enter Pairing Key"}
        </h2>
        <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
          {status === "success"
            ? "The owner's mobile app is now linked to this shop. Data will sync automatically."
            : "Open the iVA Owner App → Generate a Pairing Key → Enter the 6-digit code below."}
        </p>

        {status !== "success" && (
          <>
            {/* Code Input Display */}
            <div style={{
              display: "flex", justifyContent: "center", gap: 10, marginBottom: 24,
            }}>
              {[0,1,2,3,4,5].map(i => (
                <div key={i} style={{
                  width: 52, height: 64, borderRadius: 14,
                  background: code[i] ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                  border: `2px solid ${code[i] ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, fontWeight: 900, color: "white",
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  transition: "all 0.2s ease",
                }}>
                  {code[i] || ""}
                </div>
              ))}
            </div>

            {/* Hidden Input */}
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && validateCode()}
              autoFocus
              maxLength={6}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12,
                background: "rgba(30,41,59,0.8)", border: "1px solid rgba(99,102,241,0.2)",
                color: "white", fontSize: 24, textAlign: "center", outline: "none",
                letterSpacing: "12px", fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 20,
              }}
              placeholder="------"
            />
          </>
        )}

        {/* Shop ID */}
        <div style={{
          background: "rgba(30,41,59,0.5)", borderRadius: 12, padding: "10px 16px",
          marginBottom: 20, border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
            Shop ID
          </span>
          <p style={{ color: "#38bdf8", fontSize: 12, fontFamily: "monospace", fontWeight: 600, marginTop: 2, wordBreak: "break-all" }}>
            {shopId}
          </p>
        </div>

        {/* Error */}
        {error && (
          <p style={{ color: "#ef4444", fontSize: 12, fontWeight: 600, marginBottom: 16,
            padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 10 }}>
            ❌ {error}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          {status !== "success" ? (
            <button
              onClick={validateCode}
              disabled={loading || code.length !== 6}
              style={{
                flex: 1, padding: "14px", borderRadius: 12, border: "none",
                background: code.length === 6
                  ? "#6366f1"
                  : "rgba(99,102,241,0.2)",
                color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer",
                transition: "all 0.2s",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "⏳ Validating..." : "🔗 PAIR DEVICE"}
            </button>
          ) : null}
          <button
            onClick={onClose}
            style={{
              flex: status === "success" ? 1 : undefined, padding: "14px 20px", borderRadius: 12,
              background: status === "success" ? "#22c55e" : "rgba(255,255,255,0.06)",
              border: status === "success" ? "none" : "1px solid rgba(255,255,255,0.1)",
              color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {status === "success" ? "✅ Done" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
