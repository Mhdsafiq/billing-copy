/**
 * INNOAIVATORS Smart Billing — Owner Mobile Dashboard API Server
 * Runs inside the Electron main process on a local HTTP port.
 * Internet access via localtunnel — owner can access from ANYWHERE.
 */

const express = require("express");
const cors = require("cors");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const db = require("./db");
const aiService = require('./aiService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    try {
        const { createClient } = require('@supabase/supabase-js');
        supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    } catch (e) {
        console.error("[Supabase] Failed to initialize:", e.message);
    }
}

const PORT = 4567;
let server = null;
let localIP = "127.0.0.1";
let tunnelURL = null;   // Public internet URL (via localtunnel)
let tunnelObj = null;

const getSettings = () => {
    try {
        const { app } = require("electron");
        const fs = require("fs");
        const path = require("path");
        const configPath = path.join(app.getPath("userData"), "app_settings.json");
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch(e) {}
    return { masterKey: "owner123" };
};

/* ── Get local WiFi IP ─────────────────────────────── */
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

/* ── Helpers ─────────────────────────────────────────── */
function todayStr() { return new Date().toISOString().split("T")[0]; }
function in7days() { return new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]; }
function inNdays(n) { return new Date(Date.now() + n * 86400000).toISOString().split("T")[0]; }

/* ── Reconnection Logic & Tunnel Management ── */
let isStartingTunnel = false;
async function startTunnel(mainWindow) {
  if (isStartingTunnel) return;
  isStartingTunnel = true;

  const settings = getSettings();
  const baseName = (settings.storeName || "mystore").toLowerCase().replace(/billing|invoice|pay/g, "app");
  const shopSlug = baseName.replace(/[^a-z0-9]/g, "-");
  
  const stableId = settings.shopId || process.env.SHOP_ID || "store123";
  const stableSuffix = stableId.replace(/[^a-zA-Z0-9]/g, "").slice(-6); 
  const subdomain = `${shopSlug}-manager-${stableSuffix}`.toLowerCase();

  try {
    const localtunnel = require("localtunnel");
    
    if (tunnelObj) {
      try { tunnelObj.close(); } catch(e) {}
    }

    tunnelObj = await localtunnel({ 
        port: PORT, 
        subdomain: subdomain 
      }).catch(err => {
        throw new Error("Tunnel spawn failed");
      });

    if (tunnelURL !== tunnelObj.url) {
      tunnelURL = tunnelObj.url;
      console.log("[Sync Engine] ✅ Public URL Active:", tunnelURL);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("tunnel-ready", { url: tunnelURL });
    }

    tunnelObj.on("close", () => {
      tunnelURL = null;
      isStartingTunnel = false;
      // 2 Minute retry
      setTimeout(() => { if (mainWindow) startTunnel(mainWindow); }, 120000);
    });

    tunnelObj.on("error", (err) => {
      tunnelURL = null;
      isStartingTunnel = false;
      setTimeout(() => { if (mainWindow) startTunnel(mainWindow); }, 120000);
    });

  } catch (e) {
    isStartingTunnel = false;
    // Exponential backoff or just long delay
    setTimeout(() => { if (mainWindow) startTunnel(mainWindow); }, 180000);
  }
}

/* ── Sync Stats to Supabase Cloud ── */
async function syncStatsToSupabase() {
  if (!supabase) return;
  const settings = getSettings();
  const shopId = settings.shopId || process.env.SHOP_ID;
  if (!shopId) return;

  try {
    const lowThreshold = settings.lowStockThreshold || 10;
    const expiryDays = settings.expiryAlertDays || 3;
    const deadDays = settings.deadStockThresholdDays || 30;
    const today = todayStr();
    const inExp = inNdays(expiryDays);

    // Prepare Summary Data
    const totalProducts = db.prepare("SELECT COUNT(*) as c FROM products").get().c;
    const totalCategories = db.prepare("SELECT COUNT(*) as c FROM categories").get().c;
    const todaySales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE date(created_at)=date('now','localtime')").get().t;
    const todayBills = db.prepare("SELECT COUNT(*) as c FROM invoices WHERE date(created_at)=date('now','localtime')").get().c;
    const weeklySales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-7 days')").get().t;
    const monthlySales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-30 days')").get().t;
    const overallSales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices").get().t;
    const overallBills = db.prepare("SELECT COUNT(*) as c FROM invoices").get().c;
    const expiredCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE expiry_date IS NOT NULL AND expiry_date<?").get(today).c;
    const nearExpiryCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=?").get(today, inExp).c;
    const lowStockCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE quantity>0 AND quantity<=?").get(lowThreshold).c;
    const outOfStockVal = db.prepare("SELECT COUNT(*) as c FROM products WHERE quantity<=0").get().c;

    const todayCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE date(inv.created_at)=date('now','localtime')").get().c;
    const weeklyCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-7 days')").get().c;
    const monthlyCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-30 days')").get().c;
    const overallCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id").get().c;

    const topProducts = db.prepare("SELECT p.name, SUM(ii.quantity) as sold, SUM(ii.price*ii.quantity) as revenue FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-30 days') GROUP BY ii.product_id ORDER BY sold DESC LIMIT 8").all();
    const dailySalesData = db.prepare("SELECT date(inv.created_at,'localtime') as day, COUNT(DISTINCT inv.id) as bills, COALESCE(SUM(inv.total_amount),0) as total, COALESCE(SUM(ii.quantity * (ii.price - COALESCE(p.cost_price, ii.price * 0.7))), 0) as profit FROM invoices inv LEFT JOIN invoice_items ii ON inv.id = ii.invoice_id LEFT JOIN products p ON ii.product_id = p.id WHERE inv.created_at>=datetime('now','-365 days') GROUP BY day ORDER BY day ASC").all();
    const monthlyBreakdown = db.prepare("SELECT strftime('%Y-%m', inv.created_at, 'localtime') as month, COUNT(DISTINCT inv.id) as bills, COALESCE(SUM(inv.total_amount), 0) as total, COALESCE(SUM(ii.quantity * (ii.price - COALESCE(p.cost_price, ii.price * 0.7))), 0) as profit FROM invoices inv LEFT JOIN invoice_items ii ON inv.id = ii.invoice_id LEFT JOIN products p ON ii.product_id = p.id WHERE inv.created_at >= datetime('now', '-180 days') GROUP BY month ORDER BY month ASC").all();
    const yearlyBreakdown = db.prepare("SELECT strftime('%Y',created_at,'localtime') as year, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total FROM invoices GROUP BY year ORDER BY year DESC LIMIT 5").all();
    const weeklyBreakdown = db.prepare("SELECT strftime('%W',created_at,'localtime') as week, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE strftime('%Y-%m',created_at,'localtime')=strftime('%Y-%m','now','localtime') GROUP BY week ORDER BY week ASC").all();
    const peakHoursData = db.prepare("SELECT strftime('%H',created_at,'localtime') as hour, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as revenue FROM invoices WHERE created_at>=datetime('now','-30 days') GROUP BY hour ORDER BY bills DESC LIMIT 24").all();
    const paymentBreakdownData = db.prepare("SELECT payment_mode, COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-30 days') GROUP BY payment_mode ORDER BY cnt DESC").all();
    const deadStockData = db.prepare("SELECT p.id as local_id, p.name, p.quantity FROM products p WHERE p.quantity>0 AND p.created_at <= datetime('now','-" + deadDays + " days') AND p.id NOT IN (SELECT DISTINCT ii.product_id FROM invoice_items ii JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-" + deadDays + " days'))").all();
    const lowStockProducts = db.prepare("SELECT name, quantity, unit FROM products WHERE quantity>0 AND quantity<=? ORDER BY quantity ASC LIMIT 30").all(lowThreshold);
    const outOfStockProducts = db.prepare("SELECT name, unit FROM products WHERE quantity<=0 LIMIT 30").all();
    const expiredProducts = db.prepare("SELECT name, expiry_date, quantity FROM products WHERE expiry_date IS NOT NULL AND expiry_date<? ORDER BY expiry_date ASC LIMIT 30").all(today);
    const expiringProducts = db.prepare("SELECT name, expiry_date, quantity FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=? ORDER BY expiry_date ASC LIMIT 30").all(today, inExp);
    const customerBehavior = db.prepare("SELECT customer_name, customer_phone, COUNT(*) as visit_count, SUM(total_amount) as total_spent FROM invoices WHERE customer_phone IS NOT NULL AND customer_phone != '' GROUP BY customer_phone ORDER BY total_spent DESC LIMIT 20").all();
    const recentInvoices = db.prepare("SELECT id, bill_no, bill_date, customer_name, customer_phone, payment_mode, total_amount, created_at FROM invoices ORDER BY created_at DESC LIMIT 150").all();
    const allProductsList = db.prepare("SELECT name, quantity, price, unit FROM products ORDER BY name ASC LIMIT 1000").all();
    const overallTax = db.prepare("SELECT ii.gst_rate, COALESCE(SUM(ii.gst_amount), 0) as tax FROM invoice_items ii JOIN invoices inv ON ii.invoice_id=inv.id GROUP BY ii.gst_rate").all();
    const monthlyTax = db.prepare("SELECT strftime('%Y-%m', inv.created_at, 'localtime') as month, ii.gst_rate, COALESCE(SUM(ii.gst_amount), 0) as tax FROM invoice_items ii JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-180 days') GROUP BY month, ii.gst_rate ORDER BY month DESC").all();
    const dailyTax = db.prepare("SELECT date(inv.created_at, 'localtime') as day, ii.gst_rate, COALESCE(SUM(ii.gst_amount), 0) as tax FROM invoice_items ii JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-365 days') GROUP BY day, ii.gst_rate ORDER BY day DESC").all();

    // 1. Control Plane Sync (Snapshot)
    try {
      // LOAD SETTINGS FOR SYNC
      let settings = getSettings();

      // FIRST: Ensure shop exists (prevents FK error in shop_stats)
      const shopSyncConfig = db.prepare("SELECT * FROM shop_supabase_config WHERE is_connected = 1 ORDER BY id DESC LIMIT 1").get();
      const shopEntry = { 
        id: shopId, 
        name: settings.storeName || 'My Shop', 
        updated_at: new Date().toISOString(),
        shop_supabase_url: shopSyncConfig ? shopSyncConfig.supabase_url : null,
        shop_supabase_key: shopSyncConfig ? shopSyncConfig.supabase_key : null
      };
      await supabase.from("shops").upsert(shopEntry);

      const statsJson = {
        totalProducts, totalCategories, todaySales, todayBills, weeklySales, monthlySales, overallSales, overallCost, overallBills, 
        expiredCount, nearExpiryCount, lowStockCount, outOfStock: outOfStockVal,
        todayProfit: todaySales - todayCost, weeklyProfit: weeklySales - weeklyCost, monthlyProfit: monthlySales - monthlyCost, overallProfit: overallSales - overallCost,
        todayCost, weeklyCost, monthlyCost, topSelling: topProducts.map(p => ({ ...p, total_sold: p.sold })), topProducts,
        dailySales: dailySalesData, monthlySalesBreakdown: monthlyBreakdown, yearlyBreakdown, weeklyBreakdown,
        peakHours: peakHoursData, paymentBreakdown: paymentBreakdownData, deadStock: deadStockData, lowStockProducts, 
        outOfStockProducts, expiredProducts, expiringProducts, recentInvoices, allProductsList, customerBehavior,
        overallTax, monthlyTax, dailyTax,
        settings: {
          storeName: settings.storeName || '', storeAddress: settings.storeAddress || '', gstNumber: settings.gstNumber || '',
          whatsappNumber: settings.ownerPhone || '', expiryAlertDays: expiryDays, lowStockThreshold: lowThreshold, deadStockThresholdDays: deadDays
        },
        ai_keys: {
          gemini: process.env.GEMINI_API_KEY || settings.geminiKey || '',
          groq: process.env.GROQ_API_KEY || settings.groqKey || ''
        }
      };
      const { error: statsErr } = await supabase.from("shop_stats").upsert({ shop_id: shopId, stats_json: statsJson, updated_at: new Date().toISOString() });
      if (statsErr) console.error("[Sync] ❌ Stats error:", statsErr.message);
      else console.log("[Sync] ✅ Snapshot pushed.");
    } catch (e) { console.error("[Sync] Control Plane Error:", e.message); }

    // 2. Data Plane Sync (Individual Table Records → Shop's OWN Supabase only)
    try {
      const config = db.prepare("SELECT * FROM shop_supabase_config WHERE is_connected = 1 ORDER BY id DESC LIMIT 1").get();
      if (config && config.supabase_url && config.supabase_key) {
        // ⚠️ SAFETY GUARD: Never sync billing data to the GLOBAL control plane
        // The global DB (baawqrqihlhsrghvjlpx) has NO billing tables by design.
        // Each shop MUST have its own separate Supabase project for billing data.
        const GLOBAL_CONTROL_URL = process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
        if (config.supabase_url.includes('baawqrqihlhsrghvjlpx') || config.supabase_url === GLOBAL_CONTROL_URL) {
          console.warn('[ShopSync] ⚠️ BLOCKED: shop_supabase_url is the GLOBAL control plane!');
          console.warn('[ShopSync] ⚠️ To sync billing data, set a SEPARATE individual shop Supabase URL in Settings → Cloud Sync.');
          // Still continue to push stats snapshot to global — that is correct
        } else {
        const { createClient } = require('@supabase/supabase-js');
        const shopSupabase = createClient(config.supabase_url, config.supabase_key);
        console.log(`[ShopSync] 🌐 Target URL: ${config.supabase_url}`);
        console.log("[ShopSync] 🔄 Syncing data chunks...");

        // ── CATEGORIES ──
        console.log("[ShopSync] 📦 Syncing Categories...");
        const cats = db.prepare("SELECT * FROM categories").all();
        if (cats.length > 0) {
          for (let i = 0; i < cats.length; i += 50) {
            const chunk = cats.slice(i, i + 50).map(c => ({ id: c.id, name: c.name, gst: c.gst }));
            const { error: catErr } = await shopSupabase.from('categories').upsert(chunk);
            if (catErr) console.error("[ShopSync] 📦 Category Error:", catErr.message);
          }
        }

        // ── PRODUCTS ──
        console.log("[ShopSync] 🛒 Syncing Products...");
        const products = db.prepare("SELECT * FROM products").all();
        if (products.length > 0) {
          for (let i = 0; i < products.length; i += 50) {
            let chunk = products.slice(i, i + 50).map(p => ({
                local_id: p.id,
                name: p.name,
                category_id: p.category_id,
                category_name: p.category_name,
                gst_rate: p.gst_rate || 0,
                product_code: p.product_code,
                price_type: p.price_type || 'exclusive',
                price: p.price,
                cost_price: p.cost_price || 0,
                quantity: p.quantity,
                unit: p.unit,
                barcode: p.barcode,
                expiry_date: p.expiry_date,
                default_discount: p.default_discount || 0,
                weight: p.weight,
                brand: p.brand,
                product_type: p.product_type || 'packaged',
                stock_unit: p.stock_unit,
                updated_at: new Date().toISOString()
            }));
            // Smart retry: auto-strip missing columns
            let success = false;
            for (let attempt = 0; attempt < 5; attempt++) {
              const { error: prodErr } = await shopSupabase.from('products').upsert(chunk, { onConflict: 'local_id' });
              if (!prodErr) { success = true; break; }
              const errMsg = prodErr.message || '';
              const colMatch = errMsg.match(/column\s+"?([a-z_]+)"?\s/i)
                            || errMsg.match(/"([a-z_]+)"\s.*not\s.*found/i)
                            || errMsg.match(/Could not find.*'([a-z_]+)'/i);
              if (colMatch && colMatch[1]) {
                const badCol = colMatch[1];
                console.warn(`[ShopSync] Column "${badCol}" missing, removing and retrying...`);
                chunk = chunk.map(row => { const { [badCol]: _, ...rest } = row; return rest; });
              } else {
                console.error("[ShopSync] 🛒 Product Error:", errMsg);
                break;
              }
            }
          }
        }

        // ── CUSTOMERS ──
        console.log("[ShopSync] 👥 Syncing Customers...");
        const customers = db.prepare("SELECT * FROM customers").all();
        if (customers.length > 0) {
          for (let i = 0; i < customers.length; i += 50) {
            const chunk = customers.slice(i, i + 50).map(c => {
               // Normalize Dates for Postgres
               let isoDate = new Date().toISOString(); 
               if (c.created_at) {
                 try { isoDate = new Date(c.created_at.replace(' ', 'T')).toISOString(); } catch(e) {}
               }

               return { 
                  name: c.name || "Customer",
                  phone: c.phone || "WALK-IN",
                  address: c.address || "",
                  local_id: c.id,
                  created_at: isoDate
               };
            });
            const { error: custErr } = await shopSupabase.from('customers').upsert(chunk, { onConflict: 'local_id' });
            if (custErr) console.error("[ShopSync] 👥 Customer Error:", custErr.message);
          }
        }

        // ── INVOICES & ITEMS ──
        console.log("[ShopSync] 🧾 Syncing Invoices...");
        const localInvoices = db.prepare("SELECT * FROM invoices ORDER BY id DESC LIMIT 500").all();
        if (localInvoices.length > 0) {
          for (const inv of localInvoices) {
            const { id: localInvId, is_synced, created_at, ...invData } = inv;
            // Map ONLY the columns that exist in user's cloud schema
            const invoicePayload = {
               local_id: localInvId,
               bill_no: Math.floor(invData.bill_no || 0),
               bill_date: invData.bill_date,
               customer_name: invData.customer_name,
               customer_phone: invData.customer_phone,
               customer_address: invData.customer_address,
               customer_id: invData.customer_id,
               payment_mode: invData.payment_mode,
               total_amount: Number(invData.total_amount || 0),
               created_at: created_at
            };

            const { data: remoteInv, error: invErr } = await shopSupabase
              .from('invoices')
              .upsert(invoicePayload, { onConflict: 'local_id' })
              .select('id')
              .single();
            
            if (invErr) {
               console.error(`[ShopSync] 🧾 Invoice Error (ID: ${localInvId}):`, invErr.message);
               continue;
            }

            if (remoteInv) {
              const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(localInvId);
              if (items.length > 0) {
                const itemChunk = items.map(item => {
                  const { id: localItemId, invoice_id, ...itemData } = item;
                  return { 
                    local_id: localItemId, 
                    invoice_id: localInvId, 
                    invoice_uuid: remoteInv.id,
                    product_id: itemData.product_id,
                    quantity: Number(itemData.quantity || 0),
                    price: Number(itemData.price || 0),
                    gst_rate: Number(itemData.gst_rate || 0),
                    gst_amount: Number(itemData.gst_amount || 0),
                    discount_percent: Number(itemData.discount_percent || 0),
                    discount_amount: Number(itemData.discount_amount || 0)
                  };
                });
                const { error: itemsErr } = await shopSupabase.from('invoice_items').upsert(itemChunk, { onConflict: 'local_id' });
                if (itemsErr) console.error(`[ShopSync] 🧾 Item Error (InvID: ${localInvId}):`, itemsErr.message);
              }
            }
          }
        }
        // ── HELD BILLS ──
        console.log("[ShopSync] ⏳ Syncing Held Bills...");
        const heldBills = db.prepare("SELECT id, label, cart_json, customer_json, created_at FROM held_bills WHERE is_synced = 0").all();
        if (heldBills.length > 0) {
          for (let i = 0; i < heldBills.length; i += 50) {
            const chunk = heldBills.slice(i, i + 50).map(h => {
              const { id, ...rest } = h;
              return { ...rest, local_id: id };
            });
            const { error: heldErr } = await shopSupabase.from('held_bills').upsert(chunk, { onConflict: 'local_id' });
            if (heldErr) {
              console.error("[ShopSync] ⏳ Held Bill Error:", heldErr.message);
            } else {
              const ids = chunk.map(c => c.local_id);
              const placeholders = ids.map(() => '?').join(',');
              db.prepare(`UPDATE held_bills SET is_synced = 1 WHERE id IN (${placeholders})`).run(...ids);
            }
          }
        }

        // ── OFFERS ──
        console.log("[ShopSync] 🎁 Syncing Offers...");
        const offers = db.prepare("SELECT id, name, status, buy_product_id, buy_quantity, free_product_id, free_quantity, created_at FROM offers WHERE is_synced = 0").all();
        if (offers.length > 0) {
          for (let i = 0; i < offers.length; i += 50) {
            const chunk = offers.slice(i, i + 50).map(o => {
              const { id, ...rest } = o;
              return { ...rest, local_id: id };
            });
            const { error: offErr } = await shopSupabase.from('offers').upsert(chunk, { onConflict: 'local_id' });
            if (offErr) {
              console.error("[ShopSync] 🎁 Offer Error:", offErr.message);
            } else {
              const ids = chunk.map(c => c.local_id);
              const placeholders = ids.map(() => '?').join(',');
              db.prepare(`UPDATE offers SET is_synced = 1 WHERE id IN (${placeholders})`).run(...ids);
            }
          }
        }

        // ── NOTIFICATIONS ──
        console.log("[ShopSync] 🔔 Syncing Notifications...");
        const notifs = db.prepare("SELECT id, type, title, message, is_read, created_at FROM notifications WHERE is_synced = 0").all();
        if (notifs.length > 0) {
          for (let i = 0; i < notifs.length; i += 50) {
            const chunk = notifs.slice(i, i + 50).map(n => {
              const { id, is_read, ...rest } = n;
              return { ...rest, is_read: !!is_read, local_id: id };
            });
            const { error: notifErr } = await shopSupabase.from('notifications').upsert(chunk, { onConflict: 'local_id' });
            if (notifErr) {
              console.error("[ShopSync] 🔔 Notification Error:", notifErr.message);
            } else {
              const ids = chunk.map(c => c.local_id);
              const placeholders = ids.map(() => '?').join(',');
              db.prepare(`UPDATE notifications SET is_synced = 1 WHERE id IN (${placeholders})`).run(...ids);
            }
          }
        }

        console.log("[ShopSync] ✅ ALL TABLES SYNCED SUCCESSFULLY!");
        } // end else (individual shop URL guard)
      }
    } catch (sErr) { console.error("[ShopSync] ❌ CRITICAL SYNC ERROR:", sErr.message); }

  } catch (err) { console.error("[Sync] Critical Error:", err.message); }
}

/* ── Start API Server ────────────────────────────────── */
function startDashboardServer(mainWindow) {
  localIP = getLocalIP();
  const expressApp = express();
  expressApp.use(cors());
  expressApp.use(express.json({ limit: '50mb' }));

  // ── Serve the mobile dashboard HTML with credential injection ──
  expressApp.get("/", (req, res) => {
    const mobilePath = path.join(__dirname, "..", "mobile-dashboard", "index.html");
    if (!fs.existsSync(mobilePath)) {
      return res.status(404).send("Mobile dashboard not found.");
    }
    
    let html = fs.readFileSync(mobilePath, "utf-8");
    const settings = getSettings();
    const currentShopId = settings.shopId || process.env.SHOP_ID || "";
    
    // Inject credentials
    html = html.replace("__SUPABASE_URL__", process.env.SUPABASE_URL || "");
    html = html.replace("__SUPABASE_KEY__", process.env.SUPABASE_KEY || "");
    html = html.replace("__SHOP_ID__",      currentShopId);
    html = html.replace("__MASTER_KEY__",   process.env.MASTER_KEY || settings.masterKey || "");
    html = html.replace("__LOCAL_API__",    `http://${localIP}:${PORT}`);
    
    res.send(html);
  });
  expressApp.use(express.static(path.join(__dirname, "..", "mobile-dashboard")));

  // ── Serve Master Control Dashboard ──
  expressApp.get("/master", (req, res) => {
    const masterPath = path.join(__dirname, "..", "master-dashboard", "index.html");
    if (!fs.existsSync(masterPath)) return res.status(404).send("Master Dashboard not found.");
    res.sendFile(masterPath);
  });

  // ── Master License Management API ──
  expressApp.get("/api/master/licenses", async (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== (process.env.MASTER_KEY || "owner123")) return res.status(401).send("Unauthorized");
    
    try {
      const { data, error } = await supabase.from('software_licenses').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      res.json(data);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/master/licenses/:id/status", async (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== (process.env.MASTER_KEY || "owner123")) return res.status(401).send("Unauthorized");
    
    const { status } = req.body;
    try {
      const { error } = await supabase.from('software_licenses').update({ 
        is_active: status,
        activated_at: status ? new Date().toISOString() : null
      }).eq('id', req.params.id);
      
      if (error) throw error;
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/auth", (req, res) => {
    const { key } = req.body;
    const settings = getSettings();
    if (key === settings.masterKey) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false });
    }
  });

  // ── Config endpoint for mobile to get Supabase credentials ──
  expressApp.get("/api/config", (req, res) => {
    const settings = getSettings();
    const currentShopId = settings.shopId || process.env.SHOP_ID || "";
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || "",
      supabaseKey: process.env.SUPABASE_KEY || "",
      shopId: currentShopId,
      localApi: `http://${localIP}:${PORT}`
    });
  });

  // ── Validate pairing code (desktop enters code from mobile app) ──
  expressApp.post("/api/pairing/validate", async (req, res) => {
    const { createClient } = require("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    const settings = getSettings();
    const shopId = settings.shopId || process.env.SHOP_ID;
    const { code } = req.body;
    
    if (!url || !key || !shopId) {
      return res.status(400).json({ success: false, error: "Supabase or Shop not configured" });
    }
    if (!code) {
      return res.status(400).json({ success: false, error: "Code is required" });
    }
    
    try {
      const sb = createClient(url, key);
      
      // Find matching pending code
      const { data, error } = await sb.from("pairing_codes")
        .select("*")
        .eq("shop_id", shopId)
        .eq("code", code)
        .eq("status", "pending")
        .single();
      
      if (error || !data) {
        return res.json({ success: false, error: "Invalid code. Generate a new one in the Owner App." });
      }
      
      // Check expiry
      if (new Date(data.expires_at) < new Date()) {
        await sb.from("pairing_codes").update({ status: "expired" }).eq("id", data.id);
        return res.json({ success: false, error: "Code expired. Generate a new one." });
      }
      
      // Mark as used
      await sb.from("pairing_codes").update({ status: "used" }).eq("id", data.id);
      
      res.json({ success: true, deviceId: data.device_id });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     API: Dashboard Summary Stats + Profit
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/stats", (req, res) => {
    try {
      const today = todayStr();
      const in30 = inNdays(30);

      const totalProducts = db.prepare("SELECT COUNT(*) as cnt FROM products").get().cnt;
      const totalCategories = db.prepare("SELECT COUNT(*) as cnt FROM categories").get().cnt;

      // Sales
      const todaySales = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE date(created_at)=date('now','localtime')`).get().t;
      const todayBills = db.prepare(`SELECT COUNT(*) as cnt FROM invoices WHERE date(created_at)=date('now','localtime')`).get().cnt;
      const weeklySales = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-7 days')`).get().t;
      const monthlySales = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-30 days')`).get().t;

      // Alerts
      const settings = getSettings();
      const lowThreshold = settings.lowStockThreshold || 10;
      const expiryAlertDays = settings.expiryAlertDays || 3;
      const inExpiry = inNdays(expiryAlertDays);

      const expiredCount = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date<?`).get(today).cnt;
      const nearExpiryCount = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=?`).get(today, inExpiry).cnt;
      const lowStockCount = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE quantity>0 AND quantity<=?`).get(lowThreshold).cnt;
      const outOfStock = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE quantity<=0`).get().cnt;

      // Product lists for drilldown
      const lowStockProducts = db.prepare(`SELECT p.name, p.quantity, p.unit FROM products p WHERE p.quantity>0 AND p.quantity<=? ORDER BY p.quantity ASC`).all(lowThreshold);
      const outOfStockProducts = db.prepare(`SELECT p.name, p.unit FROM products p WHERE p.quantity<=0`).all();
      const expiringProducts = db.prepare(`SELECT p.name, p.expiry_date, p.quantity FROM products p WHERE p.expiry_date IS NOT NULL AND p.expiry_date>=? AND p.expiry_date<=? ORDER BY p.expiry_date ASC`).all(today, inExpiry);
      const expiredProducts = db.prepare(`SELECT p.name, p.expiry_date, p.quantity FROM products p WHERE p.expiry_date IS NOT NULL AND p.expiry_date<? ORDER BY p.expiry_date ASC`).all(today);

      // Top 5 products this month
      const topProducts = db.prepare(`
        SELECT p.name, SUM(ii.quantity) as sold, SUM(ii.price*ii.quantity) as revenue
        FROM invoice_items ii
        JOIN products p ON ii.product_id=p.id
        JOIN invoices inv ON ii.invoice_id=inv.id
        WHERE inv.created_at>=datetime('now','-30 days')
        GROUP BY ii.product_id ORDER BY sold DESC LIMIT 8
      `).all();

      // Daily sales last 7 days
      const dailySales = db.prepare(`
        SELECT date(created_at,'localtime') as day,
               COUNT(*) as bills,
               COALESCE(SUM(total_amount),0) as total
        FROM invoices
        WHERE created_at>=datetime('now','-7 days')
        GROUP BY day ORDER BY day ASC
      `).all();

      // Monthly sales last 6 months
      const monthlySalesBreakdown = db.prepare(`
        SELECT strftime('%Y-%m', created_at,'localtime') as month,
               COUNT(*) as bills,
               COALESCE(SUM(total_amount),0) as total
        FROM invoices
        WHERE created_at>=datetime('now','-180 days')
        GROUP BY month ORDER BY month ASC
      `).all();

      // ── PROFIT CALCULATIONS ──────────────────────────
      const todayCost = db.prepare(`
        SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as cost
        FROM invoice_items ii
        JOIN products p ON ii.product_id=p.id
        JOIN invoices inv ON ii.invoice_id=inv.id
        WHERE date(inv.created_at)=date('now','localtime')
      `).get().cost;

      const weeklyCost = db.prepare(`
        SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as cost
        FROM invoice_items ii
        JOIN products p ON ii.product_id=p.id
        JOIN invoices inv ON ii.invoice_id=inv.id
        WHERE inv.created_at>=datetime('now','-7 days')
      `).get().cost;

      const monthlyCost = db.prepare(`
        SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as cost
        FROM invoice_items ii
        JOIN products p ON ii.product_id=p.id
        JOIN invoices inv ON ii.invoice_id=inv.id
        WHERE inv.created_at>=datetime('now','-30 days')
      `).get().cost;

      const todayProfit = todaySales - todayCost;
      const weeklyProfit = weeklySales - weeklyCost;
      const monthlyProfit = monthlySales - monthlyCost;

      // ── OVERALL (ALL-TIME) PROFIT ──
      const overallSales = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices`).get().t;
      const overallCost = db.prepare(`
        SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as cost
        FROM invoice_items ii
        JOIN products p ON ii.product_id=p.id
      `).get().cost;
      const overallBills = db.prepare(`SELECT COUNT(*) as c FROM invoices`).get().c;
      const overallProfit = overallSales - overallCost;

      // ── PEAK TIME ANALYSIS ───────────────────────────
      const peakHours = db.prepare(`
        SELECT strftime('%H', created_at,'localtime') as hour,
               COUNT(*) as bills,
               COALESCE(SUM(total_amount),0) as revenue
        FROM invoices
        WHERE created_at>=datetime('now','-30 days')
        GROUP BY hour ORDER BY bills DESC LIMIT 24
      `).all();

      // Payment mode breakdown
      const paymentBreakdown = db.prepare(`
        SELECT payment_mode, COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total
        FROM invoices
        WHERE created_at>=datetime('now','-30 days')
        GROUP BY payment_mode ORDER BY cnt DESC
      `).all();

      // Dead Stock
      const deadDays = settings.deadStockThresholdDays || 30;
      const deadStock = db.prepare(`
        SELECT p.id as local_id, p.name, p.quantity FROM products p
        WHERE p.quantity > 0 AND p.created_at <= datetime('now', '-${deadDays} days')
        AND p.id NOT IN (
          SELECT DISTINCT ii.product_id FROM invoice_items ii
          JOIN invoices inv ON ii.invoice_id = inv.id
          WHERE inv.created_at >= datetime('now', '-${deadDays} days')
        )
      `).all();

      res.json({
        totalProducts, totalCategories,
        todaySales, todayBills, weeklySales, monthlySales,
        overallSales, overallCost, overallBills,
        expiredCount, nearExpiryCount, lowStockCount, outOfStock,
        topSelling: topProducts.map(p => ({ ...p, total_sold: p.sold })), 
        dailySales, monthlySalesBreakdown,
        todayProfit, weeklyProfit, monthlyProfit, overallProfit,
        todayCost, weeklyCost, monthlyCost,
        peakHours, paymentBreakdown,
        deadStock,
        lowStockProducts, outOfStockProducts, expiringProducts, expiredProducts
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     API: Expiry Alerts
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/expiry", (req, res) => {
    try {
      const today = todayStr();
      const in30 = inNdays(30);   // show 30-day window for complete visibility
      const in7 = in7days();

      const expired = db.prepare(`
        SELECT p.*,c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id=c.id
        WHERE p.expiry_date IS NOT NULL AND p.expiry_date<?
        ORDER BY p.expiry_date ASC
      `).all(today);

      const nearExpiry = db.prepare(`
        SELECT p.*,c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id=c.id
        WHERE p.expiry_date IS NOT NULL AND p.expiry_date>=? AND p.expiry_date<=?
        ORDER BY p.expiry_date ASC
      `).all(today, in30);

      res.json({ expired, nearExpiry });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Invoices History
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/invoices", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM invoices ORDER BY created_at DESC").all();
      const itemsStmt = db.prepare(`
        SELECT p.name
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = ?
      `);
      res.json(rows.map(r => ({
        ...r,
        productsList: itemsStmt.all(r.id).map(i => i.name).join(", ")
      })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     API: Invoice Details (line items)
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/invoices/:id/items", (req, res) => {
    try {
      const items = db.prepare(`
        SELECT ii.quantity, ii.price, ii.gst_rate, ii.gst_amount, p.name
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = ?
      `).all(req.params.id);
      res.json(items);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Delete Invoice
  ══════════════════════════════════════════════════════ */
  expressApp.delete("/api/invoices/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(req.params.id);
      db.prepare("DELETE FROM invoices WHERE id = ?").run(req.params.id);
      res.json({ message: "Invoice deleted" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Stock Alerts (low / dead / out-of-stock)
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/stock", (req, res) => {
    try {
      const settings = getSettings();
      const lowThreshold = settings.lowStockThreshold || 10;

      const lowStock = db.prepare(`
        SELECT p.*,c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id=c.id
        WHERE p.quantity>0 AND p.quantity<=?
        ORDER BY p.quantity ASC
      `).all(lowThreshold);

      const deadStock = db.prepare(`
        SELECT p.*,c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id=c.id
        WHERE p.quantity>0
        AND p.created_at <= datetime('now','-30 days')
        AND p.id NOT IN (
          SELECT DISTINCT ii.product_id FROM invoice_items ii
          INNER JOIN invoices inv ON ii.invoice_id=inv.id
          WHERE inv.created_at>=datetime('now','-30 days')
        )
        ORDER BY p.quantity DESC
      `).all();

      const outOfStock = db.prepare(`
        SELECT p.*,c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id=c.id
        WHERE p.quantity<=0
      `).all();

      res.json({ lowStock, deadStock, outOfStock });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Analytics — Peak time, trends etc.
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/analytics", (req, res) => {
    try {
      // 1. Peak hours (last 30 days)
      const peakHours = db.prepare(`
        SELECT strftime('%H', created_at,'localtime') as hour,
               COUNT(*) as bills,
               SUM(total_amount) as revenue
        FROM invoices
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY hour ORDER BY hour ASC
      `).all();

      // 2. Category revenue breakdown
      const categoryRevenue = db.prepare(`
        SELECT c.name as category, SUM(ii.price * ii.quantity) as revenue
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        JOIN invoices inv ON ii.invoice_id = inv.id
        WHERE inv.created_at >= datetime('now', '-30 days')
        GROUP BY category ORDER BY revenue DESC
      `).all();

      // 3. Top 10 selling products (last 30 days)
      const topSelling = db.prepare(`
        SELECT p.name, SUM(ii.quantity) as total_sold, SUM(ii.price * ii.quantity) as total_revenue
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        JOIN invoices inv ON ii.invoice_id = inv.id
        WHERE inv.created_at >= datetime('now', '-30 days')
        GROUP BY p.id ORDER BY total_sold DESC LIMIT 10
      `).all();

      // 4. Customer behavior (Frequent buyers / High value)
      const customerBehavior = db.prepare(`
        SELECT customer_name, customer_phone, COUNT(*) as visit_count, SUM(total_amount) as lifetime_value
        FROM invoices
        WHERE customer_phone IS NOT NULL AND customer_phone != ''
        GROUP BY customer_phone ORDER BY lifetime_value DESC LIMIT 10
      `).all();

      // 5. Dead Stock: Products with quantity > 0 but no sales in last 60 days
      const deadStock = db.prepare(`
        SELECT name, quantity, unit, price FROM products
        WHERE quantity > 0 AND created_at <= datetime('now', '-60 days')
        AND id NOT IN (
          SELECT DISTINCT product_id FROM invoice_items ii
          JOIN invoices inv ON ii.invoice_id = inv.id
          WHERE inv.created_at >= datetime('now', '-60 days')
        )
      `).all();

      res.json({ peakHours, categoryRevenue, topSelling, customerBehavior, deadStock });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Recent invoices
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/invoices", (req, res) => {
    try {
      const invoices = db.prepare(`SELECT * FROM invoices ORDER BY created_at DESC LIMIT 20`).all();
      res.json(invoices);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: For Localhost Web Browser Fallback
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/categories", (req, res) => {
    try { res.json(db.prepare("SELECT * FROM categories").all()); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.get("/api/products/full", (req, res) => {
    try {
      res.json(db.prepare(`
        SELECT p.*, c.gst as category_gst, c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id = c.id
      `).all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/products", (req, res) => {
    try {
      const { name, category_id, price, cost_price, quantity, unit, barcode, expiry_date, image } = req.body;
      db.prepare(`INSERT INTO products (name, category_id, price, cost_price, quantity, unit, barcode, expiry_date, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        name, category_id || null, price, cost_price || 0, quantity, unit, barcode ? String(barcode) : null, expiry_date || null, image || null
      );
      res.json({ message: "Product added" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.put("/api/products/:id", (req, res) => {
    try {
      const { name, category_id, price, cost_price, quantity, unit, barcode, expiry_date, image } = req.body;
      db.prepare(`UPDATE products SET name=?, category_id=?, price=?, cost_price=?, quantity=?, unit=?, barcode=?, expiry_date=?, image=? WHERE id=?`).run(
        name, category_id || null, price, cost_price || 0, quantity, unit, barcode ? String(barcode) : null, expiry_date || null, image || null, req.params.id
      );
      res.json({ message: "Product updated" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.delete("/api/products/:id", (req, res) => {
    try { db.prepare(`DELETE FROM products WHERE id=?`).run(req.params.id); res.json({ message: "Product deleted" }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/products/bulk", (req, res) => {
    try {
      const updates = req.body;
      const stmt = db.prepare(`UPDATE products SET quantity = quantity + ? WHERE id = ?`);
      const trans = db.transaction((items) => { for (const item of items) stmt.run(item.addQty, item.id); });
      trans(updates);
      res.json({ message: "Bulk updated" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.get("/api/customers/:phone", (req, res) => {
    try { res.json(db.prepare("SELECT * FROM customers WHERE phone = ?").get(req.params.phone) || null); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/invoices", (req, res) => {
    try {
      const { cart, customer, paymentMode } = req.body;
      let total = 0;
      cart.forEach(item => { total += (item.total + item.gstAmt); });

      let customerId = null;
      if (customer && customer.phone) {
        const existing = db.prepare("SELECT * FROM customers WHERE phone = ?").get(customer.phone);
        if (!existing) {
          customerId = db.prepare("INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)").run(customer.name || "", customer.phone, customer.address || "").lastInsertRowid;
        } else {
          db.prepare("UPDATE customers SET name = ?, address = ? WHERE phone = ?").run(customer.name || existing.name, customer.address || existing.address, customer.phone);
          customerId = existing.id;
        }
      }

      const invRes = db.prepare(`INSERT INTO invoices (customer_name, customer_phone, customer_address, customer_id, payment_mode, total_amount) VALUES (?, ?, ?, ?, ?, ?)`).run(
        customer?.name || "", customer?.phone || "", customer?.address || "", customerId, paymentMode || "Cash", total
      );
      const invoiceId = invRes.lastInsertRowid;

      const insertItem = db.prepare(`INSERT INTO invoice_items (invoice_id, product_id, quantity, price, gst_rate, gst_amount) VALUES (?, ?, ?, ?, ?, ?)`);
      const updateStock = db.prepare(`UPDATE products SET quantity = quantity - ? WHERE id = ?`);

      db.transaction((items) => {
        for (const item of items) {
          insertItem.run(invoiceId, item.id, item.qty, item.price, item.gstRate, item.gstAmt);
          updateStock.run(item.qty, item.id);
        }
      })(cart);
      
      // Trigger sync immediately after bill creation
      syncStatsToSupabase();
      
      res.json({ message: "Invoice created", invoiceId });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: BACKUP & DATA PROTECTION
  ══════════════════════════════════════════════════════ */
  expressApp.post("/api/system/backup", (req, res) => {
    try {
      const backupDir = path.join(os.homedir(), "Documents", "Innoaivators_Backups");
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = path.join(backupDir, `billing_backup_${timestamp}.db`);
      
      // Copy the active database file
      fs.copyFileSync(db.name, backupPath);
      
      res.json({ 
        success: true, 
        message: "Backup created successfully!", 
        path: backupPath 
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  expressApp.post("/api/held-bills", (req, res) => {
    try {
      const { cart, customer, label } = req.body;
      db.prepare(`INSERT INTO held_bills (label, cart_json, customer_json) VALUES (?, ?, ?)`).run(
        label || `Held ${new Date().toLocaleTimeString('en-IN')}`, JSON.stringify(cart), JSON.stringify(customer || {})
      );
      res.json({ message: "Held" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.get("/api/held-bills", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM held_bills ORDER BY created_at DESC").all();
      res.json(rows.map(r => ({ ...r, cart: JSON.parse(r.cart_json), customer: JSON.parse(r.customer_json || '{}') })));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.delete("/api/held-bills/:id", (req, res) => {
    try { db.prepare("DELETE FROM held_bills WHERE id=?").run(req.params.id); res.json({ message: "Removed" }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Offers & Promotions
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/offers", (req, res) => {
    try {
      res.json(db.prepare(`
        SELECT o.*, b.name as buy_product_name, f.name as free_product_name
        FROM offers o
        JOIN products b ON o.buy_product_id = b.id
        JOIN products f ON o.free_product_id = f.id
        ORDER BY o.created_at DESC
      `).all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/offers", (req, res) => {
    try {
      const { name, status, buy_product_id, buy_quantity, free_product_id, free_quantity } = req.body;
      db.prepare(`INSERT INTO offers (name, status, buy_product_id, buy_quantity, free_product_id, free_quantity) VALUES (?, ?, ?, ?, ?, ?)`).run(
        name, status === undefined ? 1 : status, buy_product_id, buy_quantity, free_product_id, free_quantity
      );
      res.json({ message: "Offer added" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.put("/api/offers/:id", (req, res) => {
    try {
      const { name, status, buy_product_id, buy_quantity, free_product_id, free_quantity } = req.body;
      db.prepare(`UPDATE offers SET name=?, status=?, buy_product_id=?, buy_quantity=?, free_product_id=?, free_quantity=? WHERE id=?`).run(
        name, status, buy_product_id, buy_quantity, free_product_id, free_quantity, req.params.id
      );
      res.json({ message: "Offer updated" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.delete("/api/offers/:id", (req, res) => {
    try { db.prepare("DELETE FROM offers WHERE id=?").run(req.params.id); res.json({ message: "Offer deleted" }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/offers/:id/toggle", (req, res) => {
    try {
      const { status } = req.body;
      db.prepare("UPDATE offers SET status=? WHERE id=?").run(status, req.params.id);
      res.json({ message: "Status toggled" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: AI CHATBOT (Gemini RAG — Live Data)
  ══════════════════════════════════════════════════════ */
  expressApp.post("/api/ai/ask", async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || question.trim().length === 0) {
        return res.status(400).json({ error: 'Question is required' });
      }
      const answer = await aiService.askAI(question.trim());
      res.json({ answer });
    } catch (e) {
      console.error('[AI API] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     API: Notifications (Owner Mobile Alerts)
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/notifications", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const unreadOnly = req.query.unread === 'true';
      
      let query = "SELECT * FROM notifications";
      if (unreadOnly) query += " WHERE is_read = 0";
      query += " ORDER BY created_at DESC LIMIT ?";
      
      const notifications = db.prepare(query).all(limit);
      const unreadCount = db.prepare("SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0").get().cnt;
      
      res.json({ notifications, unreadCount });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/notifications/read", (req, res) => {
    try {
      const { id } = req.body;
      if (id) {
        db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id);
      } else {
        db.prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0").run();
      }
      res.json({ message: "Marked as read" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.delete("/api/notifications/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM notifications WHERE id = ?").run(req.params.id);
      res.json({ message: "Notification deleted" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ── Start HTTP server ────────────────────────────── */
  server = http.createServer(expressApp);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Dashboard API] Local: http://${localIP}:${PORT}`);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("dashboard-server-ready", {
        ip: localIP, port: PORT, url: `http://${localIP}:${PORT}`
      });
    }
    // Start internet tunnel after server is up
    startTunnel(mainWindow);

    // ── Supabase Cloud Sync (works standalone without Electron) ──
    syncStatsToSupabase();
    setInterval(syncStatsToSupabase, 60000);
  });

  server.on("error", (err) => {
    console.error("[Dashboard API] Error:", err.message);
  });
}

function stopDashboardServer() {
  if (tunnelObj) { try { tunnelObj.close(); } catch (e) { } }
  if (server) { server.close(); }
}

function getDashboardURL() { return `http://${localIP}:${PORT}`; }
function getTunnelURL() { return tunnelURL; }

module.exports = { startDashboardServer, stopDashboardServer, getDashboardURL, getTunnelURL, syncStatsToSupabase };

// Self-start when run directly (e.g., `node dashboardServer.js`)
if (require.main === module) {
  startDashboardServer(null);
}
