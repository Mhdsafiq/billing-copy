/**
 * INNOAIVATORS Smart Billing — AI Assistant Service
 * Multi-LLM (Gemini -> Groq -> OpenAI) + Intent RAG Architecture
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

let db = null;

/**
 * Lazily load the db module
 */
function getDb() {
  if (!db) db = require('./db');
  return db;
}

function getSettings() {
    try {
        const { app } = require("electron");
        const fs = require("fs");
        const configPath = path.join(app.getPath("userData"), "app_settings.json");
        if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch(e) {}
    try {
        const fs = require("fs");
        const os = require("os");
        const configPath = path.join(os.homedir(), "AppData", "Roaming", "innoaivators-billing", "app_settings.json");
        if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch(e) {}
    return {};
}

// ── DATE UTILS & FORMATTING ──
function todayStr() { return new Date().toLocaleDateString('sv'); }
function inNdays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv'); }
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

// ── 1. MODULAR DATA FETCHERS (STRICT BACKEND LOGIC) ──
function getSalesContext(q) {
   const database = getDb();
   const todaySales = database.prepare(`SELECT COALESCE(SUM(total_amount),0) as t, COUNT(*) as bills FROM invoices WHERE date(created_at)=date('now','localtime')`).get();
   const weeklySales = database.prepare(`SELECT COALESCE(SUM(total_amount),0) as t, COUNT(*) as bills FROM invoices WHERE created_at>=datetime('now','-7 days')`).get();
   const monthlySales = database.prepare(`SELECT COALESCE(SUM(total_amount),0) as t, COUNT(*) as bills FROM invoices WHERE created_at>=datetime('now','-30 days')`).get();
   const overallSales = database.prepare(`SELECT COALESCE(SUM(total_amount),0) as t, COUNT(*) as bills FROM invoices`).get();
   
   let res = "[SALES DATA]\n";
   if (q.includes("today") || q.includes("இன்று")) {
      res += `• TODAY'S SALES: ${fmt(todaySales.t)} (from ${todaySales.bills} bills)\n`;
      if (q.includes("overall") || q.includes("total")) res += `• OVERALL TOTAL: ${fmt(overallSales.t)}\n`;
      return res;
   }
   
   return `[SALES DATA]
• TODAY'S SALES: ${fmt(todaySales.t)} (from ${todaySales.bills} bills)
• THIS WEEK'S SALES: ${fmt(weeklySales.t)}
• THIS MONTH'S SALES: ${fmt(monthlySales.t)}
• OVERALL SALES: ${fmt(overallSales.t)}`;
}

function getProfitContext(q) {
   const database = getDb();
   const todaySales = database.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE date(created_at)=date('now','localtime')`).get().t;
   const todayCost = database.prepare(`SELECT COALESCE(SUM(p.cost_price * ii.quantity), 0) as cost FROM invoice_items ii JOIN products p ON ii.product_id = p.id JOIN invoices inv ON ii.invoice_id = inv.id WHERE date(inv.created_at)=date('now','localtime')`).get().cost;
   const monthlySales = database.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-30 days')`).get().t;
   const monthlyCost = database.prepare(`SELECT COALESCE(SUM(p.cost_price * ii.quantity), 0) as cost FROM invoice_items ii JOIN products p ON ii.product_id = p.id JOIN invoices inv ON ii.invoice_id = inv.id WHERE inv.created_at>=datetime('now','-30 days')`).get().cost;
   
   if (q.includes("today") || q.includes("இன்று")) {
       return `[PROFIT DATA]\n• TODAY'S PROFIT: ${fmt(todaySales - todayCost)} (Sales: ${fmt(todaySales)}, Cost: ${fmt(todayCost)})`;
   }
   
   return `[PROFIT DATA]
• TODAY'S PROFIT: ${fmt(todaySales - todayCost)}
• THIS MONTH'S PROFIT: ${fmt(monthlySales - monthlyCost)}`;
}

function getInventoryContext() {
   const database = getDb();
   const lowStock = database.prepare(`SELECT name, quantity, unit FROM products WHERE quantity > 0 AND quantity <= 10 LIMIT 15`).all();
   const outOfStock = database.prepare(`SELECT name FROM products WHERE quantity <= 0 LIMIT 10`).all();
   let txt = `[INVENTORY DATA]\n`;
   if(lowStock.length > 0) { txt += `Low Stock: ` + lowStock.map(p=>`${p.name} (${p.quantity} left)`).join(', ') + `\n`; }
   else { txt += `Low Stock: None\n`; }
   if(outOfStock.length > 0) { txt += `Out of Stock: ` + outOfStock.map(p=>p.name).join(', ') + `\n`; }
   else { txt += `Out of Stock: None\n`; }
   return txt;
}

function getExpiryContext() {
   const database = getDb();
   const today = todayStr();
   const in30 = inNdays(30);
   const expired = database.prepare(`SELECT name, expiry_date, quantity FROM products WHERE expiry_date IS NOT NULL AND expiry_date < ? LIMIT 15`).all(today);
   const expiring = database.prepare(`SELECT name, expiry_date, quantity FROM products WHERE expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= ? LIMIT 15`).all(today, in30);
   let txt = `[EXPIRY DATA]\n`;
   if(expired.length > 0) txt += `Expired: ` + expired.map(p=>`${p.name} (qty: ${p.quantity})`).join(', ') + `\n`;
   if(expiring.length > 0) txt += `Expiring soon: ` + expiring.map(p=>`${p.name} (qty: ${p.quantity})`).join(', ') + `\n`;
   if(expired.length === 0 && expiring.length === 0) txt += `No expiry issues.\n`;
   return txt;
}

function getCustomersContext() {
   const database = getDb();
   const topCustomers = database.prepare(`SELECT customer_name, customer_phone, COUNT(*) as visits, ROUND(SUM(total_amount), 2) as lifetime_value FROM invoices WHERE customer_phone IS NOT NULL AND customer_phone != '' GROUP BY customer_phone ORDER BY lifetime_value DESC LIMIT 5`).all();
   return `[CUSTOMER DATA]\nTop Customers: ` + topCustomers.map((c,i) => `${i+1}. ${c.customer_name || 'Walkin'} (${c.visits} visits, spent ${fmt(c.lifetime_value)})`).join(', ');
}

// Intent Router returns only exactly what is needed!
function fetchContextForIntent(intent, originalQuestion = "") {
   const q = originalQuestion.toLowerCase();
   switch(intent) {
     case 'SALES': return getSalesContext(q);
     case 'PROFIT': return getProfitContext(q);
     case 'INVENTORY': return getInventoryContext();
     case 'EXPIRY': return getExpiryContext();
     case 'CUSTOMERS': return getCustomersContext();
     default: 
       return getSalesContext(q) + "\n" + getProfitContext(q);
   }
}

// ── 2. MULTI-LLM ROTATING ENGINE (API FALLBACKS) ──
async function llmAsk(prompt, systemPrompt = "") {
   let lastError = null;
   const settings = getSettings();

   // Attempt 1: Gemini First (Google)
   try {
     const apiKey = settings.geminiKey || process.env.GEMINI_API_KEY;
     if (apiKey && apiKey.trim() !== "") {
       const genAI = new GoogleGenerativeAI(apiKey);
       const model = genAI.getGenerativeModel({ model: process.env.AI_MODEL || 'gemini-1.5-flash' });
       const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
       const result = await model.generateContent(fullPrompt);
       return result.response.text().trim();
     }
   } catch (e) {
     console.error("[LLM] Gemini request failed or hit limits:", e.message);
     lastError = e;
   }

   // Attempt 2: Fallback to Groq (Llama 3 Backup)
   try {
     const groqKey = settings.groqKey || process.env.GROQ_API_KEY;
     if (groqKey && groqKey.trim() !== "") {
       console.log("[LLM] Failing over to GROQ Llama 3...");
       const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
         method: "POST",
         headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
         body: JSON.stringify({
           model: "llama-3.1-8b-instant",
           messages: [
             { role: "system", content: systemPrompt || "You are a helpful assistant." },
             { role: "user", content: prompt }
           ],
           temperature: 0.3
         })
       });
       if (res.ok) {
           const data = await res.json();
           if (data.choices && data.choices[0]) return data.choices[0].message.content.trim();
       } else {
           console.error("[LLM] Groq HTTP Error:", await res.text());
       }
     }
   } catch (e) {
     console.error("[LLM] Groq request failed:", e.message);
     lastError = e;
   }

   // If both fail, throw error so the Regex Backup Engine takes over
   throw new Error("Gemini and Groq APIs failed or limits exhausted.");
}

// ── 3. OFFLINE BACKUP INTENT ROUTING (Ultra Fast Regex) ──
function offlineRegexIntent(q) {
  q = q.toLowerCase();
  if (q.includes('profit') || q.includes('லாபம்')) return 'PROFIT';
  if (q.includes('sale') || q.includes('revenue') || q.includes('விற்பனை') || q.includes('earn')) return 'SALES';
  if (q.includes('stock') || q.includes('inventory') || q.includes('சரக்கு') || q.includes('items') || q.includes('dead')) return 'INVENTORY';
  if (q.includes('expir') || q.includes('கெடு')) return 'EXPIRY';
  if (q.includes('customer') || q.includes('client') || q.includes('வாடிக்கையாளர்')) return 'CUSTOMERS';
  return null;
}

// Guaranteed fallback if all internet/APIs are down
function offlineRegexBackup(question) {
   try {
     const intent = offlineRegexIntent(question) || 'GENERAL';
     const data = fetchContextForIntent(intent, question);
     return `⚡ <b>[Offline Backup Mode]</b>\nIt seems the AI API limits are exhausted or offline.\nHere is your exact live database record:\n\n${data}`;
   } catch(e) {
     return "⚠️ Offline Error: Could not connect to AI, and local database fetch failed.";
   }
}

// ── 4. EXPORTED MAIN AGENT PIPELINE ──
async function askAI(question) {
   if (!question) return "";

   try {
     // PHASE A: Identify Intent rapidly (Regex first to save an extra LLM call!)
     let intent = offlineRegexIntent(question);
     
     if (!intent) {
         // Regex couldn't find an exact match -> Ask LLM Classifier mapping
         const intentPrompt = `Classify this user questions intent exactly as ONE word from this list: [SALES, PROFIT, INVENTORY, EXPIRY, CUSTOMERS, GENERAL].\nQuestion: "${question}"\nIntent Word:`;
         const rawIntent = await llmAsk(intentPrompt, "You are a category classifier. Answer with just the single category word.");
         intent = rawIntent.replace(/[^A-Z]/gi, '').toUpperCase();
         
         const validIntents = ['SALES', 'PROFIT', 'INVENTORY', 'EXPIRY', 'CUSTOMERS'];
         if (!validIntents.includes(intent)) intent = 'GENERAL';
     }

     // PHASE B: Execute the specific structured Backend SQL Logic
     const businessContext = fetchContextForIntent(intent, question);

     // PHASE C: Generate final beautiful answer
     const finalPrompt = `You are a helpful Business AI Assistant for "Innoaivators Billing System".
Task: Answer the shop owner realistically using ONLY the Provided Database Snippet.
Rules:
- Read the numbers EXACTLY as written in the snippet.
- If a value is 0 or ₹0.00, you MUST say it is 0. Do not substitute it with another number.
- Format nicely, use new-lines and bold correctly.
- You can reply in Tamil, English, or Tanglish depending on how they asked.

--- Provided Database Snippet ---
${businessContext}
---------------------------------

Shop Owner asked: "${question}"
Answer:`;

     const answer = await llmAsk(finalPrompt, "You are a pro business assistant for modern retail stores.");
     return answer;

   } catch (err) {
     console.error("[Agent Pipeline] Firing Regex Backup Engine. Err:", err);
     // Trigger the absolute unbreakable Offline Regex Backup
     return offlineRegexBackup(question);
   }
}

module.exports = { askAI, buildBusinessContext: () => "" /* Stub just in case other files use it */ };
