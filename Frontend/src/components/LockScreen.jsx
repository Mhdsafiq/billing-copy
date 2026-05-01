import React, { useState } from "react";

export default function LockScreen({ reason, expiry }) {
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  const handleRequest = async () => {
    setLoading(true);
    try {
      const res = await window.api.requestActivation();
      if (res.success) setRequested(true);
      else alert("Request failed: " + res.error);
    } catch (e) {
      alert("Network error: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 999999,
      background: "#020617",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      color: "white",
      textAlign: "center",
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      padding: 40,
      userSelect: "none"
    }}>
      <div style={{
        width: 140,
        height: 140,
        borderRadius: "40px",
        background: "rgba(239, 68, 68, 0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 40,
        border: "1px solid rgba(239, 68, 68, 0.3)",
        boxShadow: "0 20px 50px rgba(239, 68, 68, 0.15)",
        animation: "pulse 2s infinite ease-in-out"
      }}>
        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      </div>

      <h1 style={{ 
        fontSize: 48, 
        fontWeight: 800, 
        marginBottom: 20, 
        letterSpacing: "-0.03em",
        background: "#fff",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent"
      }}>
        Terminal Restricted
      </h1>
      
      <p style={{ 
        fontSize: 18, 
        color: "#94a3b8", 
        maxWidth: 550, 
        lineHeight: 1.6,
        marginBottom: 48,
        fontWeight: 500
      }}>
        {reason === 'Account Deactivated' 
          ? "This terminal has been temporarily restricted by the Administrator. You can only access the software if you complete your pending payments or contact support."
          : `Your subscription validity has expired. You can only access the billing software if you complete your renewal payment.`
        }
      </p>

      <div style={{
        padding: "32px 48px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: "32px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        backdropFilter: "blur(20px)"
      }}>
        <p style={{ fontSize: 11, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 800 }}>
          Official Support Channel
        </p>
        <p style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "1px" }}>
          +91 90877 86231
        </p>
        <p style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>
          Available 24/7 for Enterprise Support
        </p>
      </div>

      {requested ? (
        <p style={{ marginTop: 40, color: "#10b981", fontWeight: 700, fontSize: 14 }}>
          🔄 Activation Request Sent to Admin. Please wait...
        </p>
      ) : (
        <button 
          onClick={handleRequest}
          disabled={loading}
          style={{
            marginTop: 40,
            background: "#6366f1",
            color: "#fff",
            border: "none",
            padding: "16px 32px",
            borderRadius: "16px",
            fontSize: 16,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 10px 20px rgba(99, 102, 241, 0.2)",
            transition: "0.3s",
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? "Sending Request..." : "Request Software Activation"}
        </button>
      )}

      <button 
        onClick={() => { if(window.api?.closeWindow) window.api.closeWindow(); }}
        style={{
          marginTop: 20,
          background: "transparent",
          color: "#94a3b8",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          padding: "10px 20px",
          borderRadius: "12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          transition: "0.2s"
        }}
      >
        Exit Application
      </button>

      <div style={{ position: "absolute", bottom: 40, color: "#334155", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        System: Innoaivators Smart Billing v3.0
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
