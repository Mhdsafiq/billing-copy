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
          background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
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
          background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1));
          border-bottom: 1px solid rgba(99,102,241,0.2);
          flex-shrink: 0;
        }
        .ai-avatar {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
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
        .ai-msg-icon.bot { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
        .ai-msg-icon.user { background: linear-gradient(135deg, #0ea5e9, #38bdf8); }
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
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
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
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none; cursor: pointer; color: white;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
          box-shadow: 0 4px 12px rgba(99,102,241,0.3);
        }
        .ai-send-btn:hover { transform: scale(1.05); box-shadow: 0 6px 16px rgba(99,102,241,0.4); }
        .ai-send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
      `}</style>

      <div className="ai-chat-overlay" onClick={onClose}>
        <div className="ai-chat-panel" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="ai-chat-header">
            <div className="ai-avatar">🤖</div>
            <div className="ai-header-info">
              <div className="ai-header-name">AI Business Assistant</div>
              <div className="ai-header-status">
                <div className="ai-dot" />
                Powered by Google Gemini · Live Data
              </div>
            </div>
            <button className="ai-close-btn" onClick={onClose} title="Close">✕</button>
          </div>

          {/* Messages */}
          <div className="ai-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`ai-msg-row ${msg.role}`}>
                <div className={`ai-msg-icon ${msg.role}`}>
                  {msg.role === "bot" ? "🤖" : "👤"}
                </div>
                <div>
                  <div className={`ai-bubble ${msg.role}`}>{msg.text}</div>
                  <div className="ai-msg-time">{msg.time}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="ai-msg-row bot">
                <div className="ai-msg-icon bot">🤖</div>
                <div className="ai-typing">
                  <div className="ai-typing-dot" />
                  <div className="ai-typing-dot" />
                  <div className="ai-typing-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          <div className="ai-quick-prompts">
            {quickPrompts.map((p) => (
              <button
                key={p}
                className="ai-quick-chip"
                onClick={() => {
                  setInput(p);
                  inputRef.current?.focus();
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="ai-input-row">
            <input
              ref={inputRef}
              className="ai-input"
              placeholder="Ask about sales, profit, stock, expiry... (Tamil or English)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
            />
            <button
              className="ai-send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              title="Send"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
