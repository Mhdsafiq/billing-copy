import React, { useState, useRef, useEffect } from "react";

const API_BASE = "http://localhost:4567";

export default function AIChatbot({ onClose }) {
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "👋 Hi! I'm your AI Business Assistant. Ask me anything about your sales, profit, inventory, stock alerts, or customers!",
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || loading) return;

    const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { role: "user", text: question, time: timeStr }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/ai/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: data.answer || "Sorry, I couldn't get an answer right now.",
          time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: "⚠️ Could not connect to AI. Please check that the app is running and GEMINI_API_KEY is set in your .env file.",
          time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickPrompts = [
    "Today's sales?",
    "Overall profit?",
    "Low stock items?",
    "Top selling products?",
    "Expired products?",
    "Best customer?",
  ];

  return (
    <>
      <style>{`
        .ai-chat-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.7);
          backdrop-filter: blur(6px);
          z-index: 9998;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes bounce { 0%,80%,100% { transform: scale(0); } 40% { transform: scale(1); } }

        .ai-chat-panel {
          width: 560px;
          height: 680px;
          background: #0f172a;
          border: 1px solid rgba(99,102,241,0.3);
          border-radius: 20px;
          box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(99,102,241,0.1), inset 0 1px 0 rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: slideUp 0.3s ease;
        }
        .ai-chat-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: rgba(99,102,241,0.15);
          border-bottom: 1px solid rgba(99,102,241,0.2);
          flex-shrink: 0;
        }
        .ai-avatar {
          width: 40px;
          height: 40px;
          background: #6366f1;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          box-shadow: 0 4px 12px rgba(99,102,241,0.4);
          flex-shrink: 0;
        }
        .ai-header-info { flex: 1; }
        .ai-header-name { font-size: 15px; font-weight: 700; color: #f8fafc; }
        .ai-header-status { font-size: 11.5px; color: #22c55e; display: flex; align-items: center; gap: 5px; margin-top: 2px; }
        .ai-dot { width: 6px; height: 6px; background: #22c55e; border-radius: 50%; animation: pulse 2s ease infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .ai-close-btn {
          width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05); color: #94a3b8; cursor: pointer;
          display: flex; align-items: center; justify-content: center; font-size: 16px;
          transition: all 0.15s;
        }
        .ai-close-btn:hover { background: rgba(239,68,68,0.2); color: #ef4444; border-color: rgba(239,68,68,0.3); }

        .ai-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          scrollbar-width: thin;
          scrollbar-color: rgba(99,102,241,0.3) transparent;
        }
        .ai-msg-row { display: flex; gap: 8px; align-items: flex-end; }
        .ai-msg-row.user { flex-direction: row-reverse; }
        .ai-msg-icon {
          width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; font-size: 13px;
        }
        .ai-msg-icon.bot { background: #6366f1; }
        .ai-msg-icon.user { background: #0ea5e9; }
        .ai-bubble {
          max-width: 78%;
          padding: 10px 14px;
          border-radius: 16px;
          font-size: 13.5px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .ai-bubble.bot {
          background: rgba(30,41,59,0.9);
          border: 1px solid rgba(99,102,241,0.2);
          color: #e2e8f0;
          border-bottom-left-radius: 4px;
        }
        .ai-bubble.user {
          background: #6366f1;
          color: white;
          border-bottom-right-radius: 4px;
        }
        .ai-msg-time { font-size: 10px; color: #475569; margin-top: 3px; text-align: center; }

        .ai-typing {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 10px 14px;
          background: rgba(30,41,59,0.9);
          border: 1px solid rgba(99,102,241,0.2);
          border-radius: 16px;
          border-bottom-left-radius: 4px;
          width: fit-content;
        }
        .ai-typing-dot {
          width: 6px; height: 6px; background: #6366f1; border-radius: 50%;
          animation: bounce 1.4s ease infinite both;
        }
        .ai-typing-dot:nth-child(2) { animation-delay: 0.16s; }
        .ai-typing-dot:nth-child(3) { animation-delay: 0.32s; }

        .ai-quick-prompts {
          display: flex;
          gap: 6px;
          padding: 10px 18px 0 18px;
          flex-wrap: nowrap;
          overflow-x: auto;
          scrollbar-width: none;
          flex-shrink: 0;
        }
        .ai-quick-prompts::-webkit-scrollbar { display: none; }
        .ai-quick-chip {
          white-space: nowrap;
          font-size: 11.5px;
          padding: 5px 11px;
          border-radius: 20px;
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.25);
          color: #a5b4fc;
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .ai-quick-chip:hover { background: rgba(99,102,241,0.25); color: #c7d2fe; }

        .ai-input-row {
          display: flex;
          gap: 10px;
          padding: 14px 18px;
          border-top: 1px solid rgba(99,102,241,0.15);
          flex-shrink: 0;
          background: rgba(15,23,42,0.5);
        }
        .ai-input {
          flex: 1;
          background: rgba(30,41,59,0.8);
          border: 1px solid rgba(99,102,241,0.25);
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 13.5px;
          color: #f1f5f9;
          outline: none;
          transition: border-color 0.15s;
          font-family: inherit;
          resize: none;
          height: 42px;
          line-height: 1.4;
        }
        .ai-input::placeholder { color: #475569; }
        .ai-input:focus { border-color: rgba(99,102,241,0.6); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
        .ai-send-btn {
          width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
          background: #6366f1;
          border: none; cursor: pointer; color: white;
          transition: 0.2s;
        }
        .quick-prompt:hover {
          background: var(--primary);
          color: #fff;
          transform: translateY(-2px);
        }
        @keyframes messagePop {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      <div className="ai-chat-overlay" onClick={onClose}>
        <div className="ai-chat-window" onClick={(e) => e.stopPropagation()}>
          <div className="chat-header">
            <div>
              <h2 className="text-gradient" style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>AI Core Assistant</h2>
              <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginTop: '4px', fontWeight: 700 }}>NEURAL ENGINE v4.2 · CONNECTED</p>
            </div>
            <button onClick={onClose} className="btn-outline" style={{ width: '48px', height: '48px', padding: 0, borderRadius: '50%' }}>✕</button>
          </div>

          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message-bubble ${msg.role === "bot" ? "bot-bubble" : "user-bubble"}`}>
                <div style={{ whiteSpace: "pre-wrap", fontWeight: msg.role === 'user' ? 600 : 500 }}>{msg.text}</div>
                <div style={{ fontSize: "10px", opacity: 0.6, marginTop: "8px", textAlign: "right", fontWeight: 800 }}>{msg.time}</div>
              </div>
            ))}
            {loading && (
              <div className="message-bubble bot-bubble" style={{ display: 'flex', gap: '8px' }}>
                <div className="pulse" style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></div>
                <div className="pulse" style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%', animationDelay: '0.2s' }}></div>
                <div className="pulse" style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%', animationDelay: '0.4s' }}></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: '32px 40px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
              {quickPrompts.map(p => (
                <div key={p} className="quick-prompt" onClick={() => { setInput(p); inputRef.current?.focus(); }}>{p}</div>
              ))}
            </div>

            <div style={{ position: 'relative' }}>
              <textarea
                ref={inputRef}
                className="input-premium"
                style={{ width: '100%', height: '80px', padding: '20px 100px 20px 28px', fontSize: '16px', resize: 'none', background: 'rgba(255,255,255,0.03)', borderRadius: '20px' }}
                placeholder="Ask your query here..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
              />
              <button 
                onClick={sendMessage} 
                className="btn-primary" 
                style={{ position: 'absolute', right: '12px', bottom: '12px', height: '56px', padding: '0 24px', borderRadius: '14px' }}
              >
                SEND ➔
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
