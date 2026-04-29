const fs = require("fs");
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut } = require("electron");
const { execSync } = require("child_process");
const db = require("./db");
const { initWhatsApp, sendMessage, getStatus, resetWhatsApp } = require("./whatsapp");
const { startDashboardServer, stopDashboardServer, getDashboardURL, getTunnelURL, syncStatsToSupabase } = require("./dashboardServer");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// ── EMAIL OTP SYSTEM ──
const otpStore = new Map(); // email -> { code, expiresAt }

// Gmail SMTP transporter — reads from .env, falls back to hardcoded for packaged app
function getEmailTransporter() {
  // Fallback credentials for packaged app (when .env is not bundled)
  const gmailUser = process.env.GMAIL_USER || 'innoaivatorsbilling@gmail.com';
  const gmailPass = process.env.GMAIL_APP_PASS || 'jswxmaxfeiypvbgb';
  if (!gmailPass) {
    console.error('[EMAIL] ❌ GMAIL_APP_PASS not configured!');
    return null;
  }
  console.log('[EMAIL] 📧 Using Gmail:', gmailUser);
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass }
  });
}

async function sendOtpEmail(toEmail, otpCode) {
  const transporter = getEmailTransporter();
  if (!transporter) throw new Error('Email not configured. Set GMAIL_APP_PASS in .env');

  const gmailUser = process.env.GMAIL_USER || 'innoaivatorsbilling@gmail.com';
  return transporter.sendMail({
    from: `"Innoaivators" <${gmailUser}>`,
    to: toEmail,
    subject: `🔐 Your Verification Code: ${otpCode}`,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; border-radius: 16px; overflow: hidden; border: 1px solid #1e293b;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800;">INNOAIVATORS</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 13px;">Smart Billing System</p>
        </div>
        <div style="padding: 32px; text-align: center;">
          <p style="color: #94a3b8; font-size: 14px; margin-bottom: 24px;">Your email verification code is:</p>
          <div style="background: rgba(99,102,241,0.15); border: 2px dashed #6366f1; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <span style="font-size: 40px; font-weight: 900; letter-spacing: 10px; color: #f8fafc; font-family: 'Courier New', monospace;">${otpCode}</span>
          </div>
          <p style="color: #64748b; font-size: 12px;">This code expires in <strong style="color: #f59e0b;">10 minutes</strong>.</p>
          <p style="color: #475569; font-size: 11px; margin-top: 20px;">If you did not request this, please ignore this email.</p>
        </div>
        <div style="background: #020617; padding: 16px; text-align: center; border-top: 1px solid #1e293b;">
          <p style="color: #475569; font-size: 10px; margin: 0;">© 2026 Innoaivators Systems • Secure Verification</p>
        </div>
      </div>
    `
  });
}

// ── HARDWARE LICENSING ──
function getMachineId() {
  try {
    const output = execSync("wmic csproduct get uuid").toString();
    const lines = output.trim().split("\n");
    // Usually line 0 is 'UUID' and line 1 is the actual ID
    return lines[lines.length - 1].trim();
  } catch (e) {
    return "unknown-hwid";
  }
}

// ── CLOUD SYNC ENGINE ──
// Admin Supabase (central — for shop management, activation, validity)
let supabase = null;
let licenseSubscription = null;

function initSupabase(url, key) {
  if (!supabase && url && key) {
    try { 
      supabase = createClient(url, key); 
      // Setup Realtime for the shop
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      if (fs.existsSync(configPath)) {
        try {
          const s = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          if (s.shopId) setupLicenseRealtime(s.shopId);
        } catch {}
      }
    } catch (e) { }
  }
}

async function setupLicenseRealtime(shopId) {
  if (!supabase || !shopId) return;
  if (licenseSubscription) licenseSubscription.unsubscribe();

  console.log(`[Realtime] 🛸 Listening for license changes for: ${shopId}`);
  
  // 🔥 INITIAL PING: Mark shop as online immediately at startup
  try {
    await supabase.from('shops').update({
       last_ping_at: new Date().toISOString()
    }).eq('id', shopId);
  } catch (e) {}

  licenseSubscription = supabase
    .channel('license-updates')
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'shops', 
      filter: `id=eq.${shopId}` 
    }, (payload) => {
      const newData = payload.new;
      console.log(`[Realtime] \ud83d\udd14 Shop change: is_active=${newData.is_active}, name=${newData.name}, validity_end=${newData.validity_end}`);
      
      // Handle activation/deactivation
      if (newData.is_active === true) {
        if (mainWindow) {
          mainWindow.webContents.send('app-unlock');
        }
      } else if (newData.is_active === false) {
        if (mainWindow) {
          mainWindow.webContents.send('app-lock', {
            reason: 'Account Deactivated',
            expiry: newData.validity_end
          });
        }
      }
      
      // Always sync latest shop data (name, validity, etc.) to local settings
      updateSettingsFromCloud(shopId);
    })
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'shops',
      filter: `id=eq.${shopId}`
    }, () => {
      console.log(`[Realtime] \ud83d\uddd1\ufe0f Shop ${shopId} was DELETED by admin!`);
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      if (fs.existsSync(configPath)) {
        try {
          let settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          delete settings.shopId;
          fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
          process.env.SHOP_ID = '';
        } catch (e) {}
      }
      if (mainWindow) {
        mainWindow.webContents.send('app-lock', { reason: 'Shop Deleted', expiry: '', deleted: true });
      }
    })
    .subscribe((status) => {
        console.log(`[Control] \ud83d\udd0c Realtime Subscription Status: ${status}`);
    });
}

async function updateSettingsFromCloud(shopId) {
  try {
    const { data: shop } = await supabase.from("shops").select("*").eq("id", shopId).single();
    if (shop) {
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      let settings = {};
      if (fs.existsSync(configPath)) {
        try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
      }
      // Use correct field names (column is 'name', not 'store_name')
      if (shop.name) settings.storeName = shop.name;
      if (shop.owner_name) settings.ownerName = shop.owner_name;
      if (shop.mobile_number) settings.ownerMobile = shop.mobile_number;
      if (shop.owner_email) settings.ownerEmail = shop.owner_email;
      fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
      
      // Update window title if name changed
      if (shop.name && mainWindow) {
        mainWindow.setTitle(`${shop.name} - Innoaivators`);
      }
      
      // Push updated settings to renderer localStorage
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`
          try {
            const raw = localStorage.getItem('smart_billing_settings');
            const s = raw ? JSON.parse(raw) : {};
            s.storeName = ${JSON.stringify(shop.name || '')};
            localStorage.setItem('smart_billing_settings', JSON.stringify(s));
            window.dispatchEvent(new Event('settings_updated'));
          } catch(e) {}
        `).catch(() => {});
      }
    }
  } catch (e) { console.error('[UpdateSettings] Error:', e.message); }
}

// Shop-specific Supabase (separate DB per shop — for billing data)
let shopSupabase = null;
let shopSupabaseUrl = '';
let shopSupabaseKey = '';

let dashboardServerRunning = false;

function initShopSupabase(url, key) {
  if (url && key && url.startsWith('http')) {
    // ⚠️ SAFETY: Never use the global control-plane as the individual shop DB
    const globalUrl = process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    if (url === globalUrl || url.includes('baawqrqihlhsrghvjlpx')) {
      console.warn('[ShopDB] ⚠️ BLOCKED: Cannot use global control plane as individual shop DB!');
      return false;
    }
    // Skip if already connected to this URL
    if (shopSupabase && shopSupabaseUrl === url) {
      return true;
    }
    try {
      shopSupabase = createClient(url, key);
      shopSupabaseUrl = url;
      shopSupabaseKey = key;
      console.log('[ShopDB] ✅ Connected to shop Supabase:', url);
      // Start dashboard server ONLY ONCE
      if (mainWindow && !dashboardServerRunning) {
        dashboardServerRunning = true;
        startDashboardServer(mainWindow); 
      }
      return true;
    } catch (e) {
      console.error('[ShopDB] Connection failed:', e.message);
      return false;
    }
  }
  return false;
}

// ── Load shop Supabase config from SQLite on startup ──
function loadShopSupabaseConfig() {
  try {
    const config = db.prepare('SELECT * FROM shop_supabase_config ORDER BY id DESC LIMIT 1').get();
    if (config && config.supabase_url && config.supabase_key) {
      // Clean up bad config: if it points to global control plane, delete it
      const globalUrl = process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
      if (config.supabase_url === globalUrl || config.supabase_url.includes('baawqrqihlhsrghvjlpx')) {
        console.warn('[ShopDB] 🧹 Cleaning up bad shop_supabase_config — was pointing to global DB!');
        db.prepare('DELETE FROM shop_supabase_config WHERE supabase_url LIKE ?').run('%baawqrqihlhsrghvjlpx%');
        return; // Don't init with global URL
      }
      initShopSupabase(config.supabase_url, config.supabase_key);
    }
  } catch (e) { }
}

// ── LOCAL FILE BACKUP ──
function getLocalDbPath() {
  try {
    const config = db.prepare('SELECT storage_path FROM local_db_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
    return config ? config.storage_path : null;
  } catch (e) { return null; }
}

function syncToLocalPath() {
  const localPath = getLocalDbPath();
  if (!localPath) return;
  try {
    if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });
    const sourcePath = db.name;
    const destPath = path.join(localPath, 'billing_local.db');
    fs.copyFileSync(sourcePath, destPath);
    
    // Also save a JSON export for human-readable backup
    const exportData = {
      exportedAt: new Date().toISOString(),
      products: db.prepare('SELECT * FROM products').all(),
      categories: db.prepare('SELECT * FROM categories').all(),
      customers: db.prepare('SELECT * FROM customers').all(),
      invoices: db.prepare('SELECT * FROM invoices').all(),
      invoice_items: db.prepare('SELECT * FROM invoice_items').all(),
      offers: db.prepare('SELECT * FROM offers').all(),
      held_bills: db.prepare('SELECT * FROM held_bills').all(),
    };
    fs.writeFileSync(path.join(localPath, 'billing_data.json'), JSON.stringify(exportData, null, 2));
    console.log('[LocalDB] ✅ Data synced to:', localPath);
  } catch (e) {
    console.error('[LocalDB] Sync error:', e.message);
  }
}

// ── SYNC TO SHOP'S OWN SUPABASE ──
async function syncToShopSupabase() {
  if (!shopSupabase) return;
  try {
    // 1. Sync Products — with smart column auto-detection
    const products = db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_synced = 0').all();
    for (const p of products) {
      let row = {
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
      };

      // Smart retry: if a column doesn't exist in Supabase, auto-strip it and retry
      let success = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { error } = await shopSupabase.from('products').upsert(row, { onConflict: 'local_id' });
        if (!error) {
          success = true;
          break;
        }
        // Detect missing column from error message and remove it
        const errMsg = error.message || '';
        const colMatch = errMsg.match(/column\s+"?([a-z_]+)"?\s/i) 
                      || errMsg.match(/"([a-z_]+)"\s.*not\s.*found/i)
                      || errMsg.match(/Could not find.*'([a-z_]+)'/i);
        if (colMatch && colMatch[1] && row.hasOwnProperty(colMatch[1])) {
          console.warn(`[ShopSync] Column "${colMatch[1]}" missing in Supabase, removing and retrying...`);
          delete row[colMatch[1]];
        } else {
          console.error('[ShopSync] Product sync error for:', p.name, '-', errMsg);
          break;
        }
      }
      if (success) db.prepare('UPDATE products SET is_synced = 1 WHERE id = ?').run(p.id);
    }

    // 2. Sync Invoices
    const invoices = db.prepare('SELECT * FROM invoices WHERE is_synced = 0').all();
    for (const inv of invoices) {
      const { id, is_synced, ...data } = inv;
      const { error } = await shopSupabase.from('invoices').upsert({
        ...data,
        local_id: id
      }, { onConflict: 'local_id' });
      if (!error) {
        db.prepare('UPDATE invoices SET is_synced = 1 WHERE id = ?').run(id);
        // Sync items for this invoice
        const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
        for (const item of items) {
          const { id: itemId, ...itemData } = item;
          await shopSupabase.from('invoice_items').upsert({ ...itemData, local_id: itemId });
        }
      }
    }

    // 3. Sync Customers
    const customers = db.prepare('SELECT * FROM customers WHERE is_synced = 0').all();
    for (const c of customers) {
      const { id, is_synced, ...data } = c;
      const { error } = await shopSupabase.from('customers').upsert({
        ...data, local_id: id
      }, { onConflict: 'local_id' });
      if (!error) db.prepare('UPDATE customers SET is_synced = 1 WHERE id = ?').run(id);
    }

    // 4. Sync Categories
    const categories = db.prepare('SELECT * FROM categories').all();
    for (const cat of categories) {
      await shopSupabase.from('categories').upsert(cat, { onConflict: 'id' });
    }

    // 5. Sync Held Bills
    console.log('[ShopSync] ⏳ Syncing Held Bills...');
    const heldBills = db.prepare('SELECT id, label, cart_json, customer_json, created_at FROM held_bills WHERE is_synced = 0').all();
    for (const h of heldBills) {
      const { id, ...data } = h;
      const { error } = await shopSupabase.from('held_bills').upsert({
        ...data, local_id: id
      }, { onConflict: 'local_id' });
      if (!error) db.prepare('UPDATE held_bills SET is_synced = 1 WHERE id = ?').run(id);
    }

    // Update last synced time
    db.prepare("UPDATE shop_supabase_config SET last_synced = datetime('now') WHERE id = (SELECT MAX(id) FROM shop_supabase_config)").run();
    console.log('[ShopSync] ✅ Data synced to shop Supabase');
  } catch (e) {
    console.error('[ShopSync] Error:', e.message);
  }
}

// ── RESTORE DATA FROM SHOP SUPABASE ──
async function restoreFromShopSupabase() {
  if (!shopSupabase) throw new Error('Shop Supabase not connected');
  try {
    // 🛡️ Safeguard: Ensure missing column exists and disable FK checks during restore
    try { db.exec("ALTER TABLE products ADD COLUMN category_name TEXT;"); } catch(e) {}
    try { db.exec("ALTER TABLE customers ADD COLUMN is_synced INTEGER DEFAULT 0;"); } catch(e) {}
    db.exec("PRAGMA foreign_keys = OFF;");

    // 1. Restore Categories (MUST BE FIRST for Foreign Keys)
    const { data: categories } = await shopSupabase.from('categories').select('*');
    if (categories && categories.length > 0) {
      for (const cat of categories) {
        try {
          db.prepare('INSERT OR REPLACE INTO categories (id, name, gst) VALUES (?, ?, ?)').run(cat.id, cat.name, cat.gst);
        } catch (e) { }
      }
      console.log(`[Restore] ✅ ${categories.length} categories restored`);
    }

    // 2. Restore Products
    const { data: products } = await shopSupabase.from('products').select('*');
    if (products && products.length > 0) {
      const insertProduct = db.prepare(`
        INSERT OR REPLACE INTO products 
        (id, name, category_id, category_name, gst_rate, product_code, price_type, price, cost_price, quantity, unit, barcode, expiry_date, image, default_discount, weight, brand, is_synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const txn = db.transaction((items) => {
        for (const p of items) {
          insertProduct.run(
            p.local_id || null, p.name, p.category_id, p.category_name, p.gst_rate || 0,
            p.product_code, p.price_type || 'exclusive', p.price, p.cost_price || 0,
            p.quantity, p.unit, p.barcode, p.expiry_date, p.image,
            p.default_discount || 0, p.weight, p.brand
          );
        }
      });
      txn(products);
      console.log(`[Restore] ✅ ${products.length} products restored`);
    }

    // 3. Restore Customers
    const { data: customers } = await shopSupabase.from('customers').select('*');
    if (customers && customers.length > 0) {
      const insertCustomer = db.prepare('INSERT OR REPLACE INTO customers (id, name, phone, address, is_synced) VALUES (?, ?, ?, ?, 1)');
      const txn = db.transaction((items) => {
        for (const c of items) {
          insertCustomer.run(c.local_id || null, c.name, c.phone, c.address);
        }
      });
      txn(customers);
      console.log(`[Restore] ✅ ${customers.length} customers restored`);
    }

    // 4. Restore Invoices
    const { data: invoices } = await shopSupabase.from('invoices').select('*');
    if (invoices && invoices.length > 0) {
      const insertInvoice = db.prepare(`
        INSERT OR REPLACE INTO invoices 
        (id, bill_no, bill_date, customer_name, customer_phone, customer_address, customer_id, payment_mode, total_amount, is_synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const txn = db.transaction((items) => {
        for (const inv of items) {
          insertInvoice.run(
            inv.local_id || null, inv.bill_no, inv.bill_date, inv.customer_name,
            inv.customer_phone, inv.customer_address, inv.customer_id,
            inv.payment_mode, inv.total_amount
          );
        }
      });
      txn(invoices);
      console.log(`[Restore] ✅ ${invoices.length} invoices restored`);
    }

    // 5. Restore Invoice Items
    const { data: items } = await shopSupabase.from('invoice_items').select('*');
    if (items && items.length > 0) {
      const insertItem = db.prepare(`
        INSERT OR REPLACE INTO invoice_items 
        (id, invoice_id, product_id, quantity, price, gst_rate, gst_amount, discount_percent, discount_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const txn = db.transaction((rows) => {
        for (const i of rows) {
          insertItem.run(
            i.local_id || null, i.invoice_id, i.product_id, i.quantity,
            i.price, i.gst_rate, i.gst_amount, i.discount_percent || 0, i.discount_amount || 0
          );
        }
      });
      txn(items);
      console.log(`[Restore] ✅ ${items.length} invoice items restored`);
    }

    // 6. Restore Offers
    const { data: offers } = await shopSupabase.from('offers').select('*');
    if (offers && offers.length > 0) {
      for (const off of offers) {
        try {
          db.prepare('INSERT OR REPLACE INTO offers (id, name, status, buy_product_id, buy_quantity, free_product_id, free_quantity) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
            off.local_id || null, off.name, off.status || 1, off.buy_product_id, off.buy_quantity, off.free_product_id, off.free_quantity
          );
        } catch (e) { }
      }
      console.log(`[Restore] ✅ ${offers.length} offers restored`);
    }

    // 7. Restore Held Bills
    const { data: held } = await shopSupabase.from('held_bills').select('*');
    if (held && held.length > 0) {
      for (const h of held) {
        try {
          db.prepare('INSERT OR REPLACE INTO held_bills (id, label, cart_json, customer_json) VALUES (?, ?, ?, ?)').run(
            h.local_id || null, h.label, h.cart_json, h.customer_json
          );
        } catch (e) { }
      }
      console.log(`[Restore] ✅ ${held.length} held bills restored`);
    }

    // 8. Restore Settings
    const { data: cloud_settings } = await shopSupabase.from('shop_settings').select('*');
    if (cloud_settings && cloud_settings.length > 0) {
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      let localSett = {};
      if (fs.existsSync(configPath)) {
        try { localSett = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
      }
      
      for (const s of cloud_settings) {
        localSett[s.key] = s.value;
      }
      
      // If we found a shopId in cloud, adopt it to local process/settings
      if (localSett.shopId) {
        process.env.SHOP_ID = localSett.shopId;
      }
      
      fs.writeFileSync(configPath, JSON.stringify(localSett, null, 2));
      console.log(`[Restore] ✅ Application settings restored and adopted.`);
    }

    return {
      products: products?.length || 0,
      customers: customers?.length || 0,
      invoices: invoices?.length || 0,
      items: items?.length || 0,
      categories: categories?.length || 0,
      offers: offers?.length || 0,
      held_bills: held?.length || 0,
      settings_restored: cloud_settings?.length || 0
    };
  } catch (e) {
    console.error('[Restore] Error:', e.message);
    throw e;
  } finally {
    // 🛡️ Re-enable Foreign Key checks
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

// ── VALIDITY / SUBSCRIPTION SYSTEM ──
async function checkValidity(shopId) {
  // Auto-init Supabase with hardcoded fallback if not ready
  if (!supabase) {
    const SUPA_URL = process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    const SUPA_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
    try { supabase = createClient(SUPA_URL, SUPA_KEY); } catch(e) {}
    console.log('[Validity] 🔌 Auto-initialized Supabase');
  }

  if (!supabase || !shopId) {
    // Offline Check — only used if truly no internet/supabase
    const cached = db.prepare('SELECT * FROM validity_cache ORDER BY id DESC LIMIT 1').get();
    if (cached) {
      const now = new Date();
      const end = new Date(cached.validity_end);
      
      // Strict 12:00 AM cutoff for the day after validity_end
      const cutoff = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, 0, 0, 0);
      const isValid = now < cutoff;
      const daysLeft = Math.ceil((cutoff - now) / 86400000);

      return {
        valid: isValid && !!cached.is_active,
        daysLeft: Math.max(0, daysLeft),
        validityEnd: cached.validity_end,
        isPaid: !!cached.is_paid,
        isActive: !!cached.is_active,
        isPending: !cached.is_active && !cached.ever_activated,
        isOffline: true
      };
    }
    // New registration with no cache: allow app to show (pending activation)
    return { valid: true, isActive: false, daysLeft: 30, isOffline: true, isPending: true };
  }

  try {
    const { data: shop, error } = await supabase
      .from('shops')
      .select('is_active, is_paid, validity_end, shop_supabase_url, shop_supabase_key, activation_requested, ever_activated')
      .eq('id', shopId)
      .single();

    console.log(`[Validity] 🔍 Shop ${shopId} query result:`, shop ? `is_active=${shop.is_active}, ever_activated=${shop.ever_activated}` : 'NOT FOUND', error ? `Error: ${error.message}` : '');

    if (error || !shop) {
      // CRITICAL: Distinguish "not found" (PGRST116) from network errors
      const isNotFound = error && (error.code === 'PGRST116' || error.message?.includes('not found') || error.details?.includes('0 rows'));
      if (isNotFound) {
        console.error("[Validity] \u274c Shop CONFIRMED DELETED:", error);
        // Shop was deleted by admin — clear local settings so app shows registration
        const cfgPath = path.join(app.getPath("userData"), "app_settings.json");
        if (fs.existsSync(cfgPath)) {
          try {
            let s2 = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
            if (s2.shopId === shopId) {
              delete s2.shopId;
              fs.writeFileSync(cfgPath, JSON.stringify(s2, null, 2));
              process.env.SHOP_ID = '';
              console.log(`[Validity] \ud83e\uddf9 Cleared local shopId for deleted shop: ${shopId}`);
            }
          } catch (e) {}
        }
        return { valid: false, isActive: false, isPending: false, needsRegistration: true, daysLeft: 0, note: "Shop deleted by admin. Please register again." };
      }
      // Network error — do NOT wipe local data, use cached validity or assume pending
      console.warn("[Validity] \u26a0\ufe0f Network error checking shop, preserving local state:", error?.message);
      return { valid: true, isActive: false, daysLeft: 30, isOffline: true, isPending: true, note: "Could not reach cloud. Using cached state." };
    }

    const now = new Date();
    const end = new Date(shop.validity_end || (now.getTime() + 30 * 86400000));
    
    // Use same calculation as admin panel: simple diff, ceil
    const diffMs = end - now;
    const daysLeft = Math.max(0, Math.ceil(diffMs / 86400000));
    const isValid = daysLeft > 0 && shop.is_active;

    // Newly registered but never activated — show pending screen, not lockdown
    const isPending = !shop.is_active && !shop.ever_activated;
    
    // Warning phase: last 7 days AND not paid — show payment reminder
    const warningPhase = daysLeft <= 7 && daysLeft > 0 && !shop.is_paid;

    // Cache locally for offline fallback
    db.prepare('DELETE FROM validity_cache').run();
    try {
      db.prepare('INSERT INTO validity_cache (validity_end, is_paid, is_active, ever_activated) VALUES (?, ?, ?, ?)').run(
        end.toISOString(),
        shop.is_paid ? 1 : 0,
        shop.is_active ? 1 : 0,
        shop.ever_activated ? 1 : 0
      );
    } catch(e) { console.warn('[Validity] Cache write error:', e.message); }

    // Initialise Shop-Specific Supabase if provided
    if (shop.shop_supabase_url && shop.shop_supabase_key) {
      initShopSupabase(shop.shop_supabase_url, shop.shop_supabase_key);
    }

    return {
      valid: isValid,
      daysLeft,
      validityEnd: end.toISOString(),
      isActive: !!shop.is_active,
      isPaid: !!shop.is_paid,
      isPending,
      warningPhase,
      isOffline: false
    };
  } catch (e) {
    console.error('[Validity] Query error:', e.message);
    // Fallback to cache on error
    try {
      const cached = db.prepare('SELECT * FROM validity_cache ORDER BY id DESC LIMIT 1').get();
      if (cached) {
        const now2 = new Date();
        const end2 = new Date(cached.validity_end);
        const cutoff2 = new Date(end2.getFullYear(), end2.getMonth(), end2.getDate() + 1, 0, 0, 0);
        return {
          valid: now2 < cutoff2 && !!cached.is_active,
          daysLeft: Math.max(0, Math.ceil((cutoff2 - now2) / 86400000)),
          validityEnd: cached.validity_end,
          isPaid: !!cached.is_paid,
          isActive: !!cached.is_active,
          isOffline: true
        };
      }
    } catch(e2) {}
    return { valid: true, daysLeft: 30, isOffline: true };
  }
}

// ── REALTIME LOCKDOWN LISTENER ──
let controlSubscription = null;
function startControlListener(shopId) {
  if (!supabase || !shopId) {
    console.warn('[Control] ⚠️ Skipping listener: Supabase or ShopId missing');
    return;
  }
  
  if (controlSubscription) {
    console.log('[Control] ℹ️ Listener already active, skipping duplicate.');
    return;
  }

  console.log(`[Control] 📡 Subscribing to Realtime updates for Shop: ${shopId}`);

  controlSubscription = supabase
    .channel(`lockdown_${shopId}`)
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'shops', 
      filter: `id=eq.${shopId}` 
    }, (payload) => {

      if (payload.eventType === 'DELETE') {
        console.log(`[Control] 🗑️ REMOTE DELETE DETECTED. Wiping local data.`);
        const configPath = path.join(app.getPath("userData"), "app_settings.json");
        if (fs.existsSync(configPath)) {
          try {
            let settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (settings.shopId === shopId) {
              delete settings.shopId;
              fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
              process.env.SHOP_ID = '';
            }
          } catch(e) {}
        }
        if (mainWindow) {
           mainWindow.webContents.send('app-lock', { 
             reason: 'Shop Deleted', 
             expiry: '',
             deleted: true
           });
        }
        return;
      }

      if (payload.eventType !== 'UPDATE') return;

      const updated = payload.new;
      console.log('[Control] 🚨 REMOTE UPDATE DETECTED:', updated.is_active ? 'ACTIVE' : 'DEACTIVATED');
      
      const now = new Date();
      const end = new Date(updated.validity_end);
      const cutoff = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, 0, 0, 0);
      const isStillValid = (now < cutoff) && updated.is_active;

      if (!isStillValid) {
        console.log('[Control] 🔒 ENFORCING LOCKDOWN');
        if (mainWindow) {
           mainWindow.webContents.send('app-lock', { 
             reason: !updated.is_active ? 'Account Deactivated' : 'Subscription Expired',
             expiry: updated.validity_end
           });
        }
      } else {
        console.log('[Control] ✅ STATUS OK (REACTIVATED OR VALID)');
        // Close lock if it was open (Optional: implement an unlock sender)
        if (mainWindow) {
            mainWindow.webContents.send('app-unlock');
        }
      }
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'pairing_codes',
      filter: `shop_id=eq.${shopId}`
    }, async (payload) => {
      const inserted = payload.new;
      if (inserted.status === 'reset') {
         console.log('[Control] 📧 Password reset requested, sending email...');
         const configPath = path.join(app.getPath("userData"), "app_settings.json");
         let settings = {};
         try { settings = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
         const targetEmail = settings.shopEmail || settings.ownerEmail;
         if (targetEmail) {
            try {
              await sendOtpEmail(targetEmail, inserted.code);
              console.log(`[Control] ✅ Reset OTP sent to ${targetEmail}`);
            } catch (err) {
              console.error(`[Control] ❌ Failed to send OTP email: ${err.message}`);
            }
         } else {
            console.error('[Control] ❌ No owner email found in settings to send reset code.');
         }
      }
    })
    .subscribe((status) => {
        console.log(`[Control] 🔌 Realtime Subscription Status: ${status}`);
    });
}

// ── SYNC ENGINE: CLOUD CONTROL (MAIN) ──
async function pushStatsSnapshot(shopId) {
  if (!supabase || !shopId) return;
  try {
    const stats = await generateStatsJSON(); // Extracted logic
    await supabase.from('shop_stats').upsert({
      shop_id: shopId,
      stats_json: stats,
      updated_at: new Date().toISOString()
    });

    // 🔥 Ping the shops table so Admin knows they are online
    await supabase.from('shops').update({
       last_ping_at: new Date().toISOString()
    }).eq('id', shopId);
  } catch (e) { }
}

// ── SYNC ENGINE: DATA VAULT (SHOP DB) ──
async function syncToShopCloud() {
  // Delegate to the robust syncToShopSupabase which has smart column detection
  return syncToShopSupabase();
}

async function registerShop(shopId) {
  if (!supabase) return;
  try {
    // 🔒 SAFETY: Check if shop still exists before updating
    // If admin deleted it, do NOT re-create via upsert
    const { data: existing, error: checkErr } = await supabase
      .from('shops').select('id').eq('id', shopId).single();
    
    // CRITICAL: Only treat PGRST116 (not found) as deletion, NOT network errors
    const isNotFound = checkErr && (checkErr.code === 'PGRST116' || checkErr.message?.includes('not found') || checkErr.details?.includes('0 rows'));
    if (isNotFound) {
      console.log(`[Register] 🗑️ Shop ${shopId} CONFIRMED deleted by admin. Clearing local data.`);
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      if (fs.existsSync(configPath)) {
        try {
          let settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          if (settings.shopId === shopId) {
            delete settings.shopId;
            fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
            process.env.SHOP_ID = '';
            console.log(`[Register] 🧹 Local shopId cleared for deleted shop.`);
          }
        } catch (e) {}
      }
      return;
    }
    if (checkErr) {
      console.warn(`[Register] ⚠️ Network error checking shop. Skipping sync.`);
      return;
    }

    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let s = {};
    if (fs.existsSync(configPath)) {
      try { s = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { }
    }
    
    // Use UPDATE instead of UPSERT to never recreate a deleted shop
    // IMPORTANT: Do NOT sync master_key here — it should only be set during
    // registration or password reset to avoid overwriting the owner's password
    const updateData = {
      name: s.storeName || "My Venture",
      owner_name: s.ownerName || "Owner",
      mobile_number: s.ownerMobile || s.storePhone || s.ownerPhone || "",
      shop_email: s.shopEmail || s.ownerEmail || "",
      gst_number: s.gstNumber || "",
      owner_email: s.ownerEmail || "",
      shop_supabase_url: shopSupabaseUrl || undefined,
      shop_supabase_key: shopSupabaseKey || undefined
    };
    
    await supabase.from("shops").update(updateData).eq('id', shopId);
  } catch (e) {
    console.error("[Register] Internal Sync Error:", e.message);
  }
}

// ── GENERATE STATS JSON ──
async function generateStatsJSON() {
  let s = {};
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      s = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch(e) {}
  const lowThreshold = s.lowStockThreshold || 10;
  const expiryDays = s.expiryAlertDays || 3;
  const deadThresholdDays = s.deadStockThresholdDays || 30;

  const today = new Date().toISOString().split("T")[0];
  const inN = new Date(Date.now() + expiryDays * 86400000).toISOString().split("T")[0];

  const totalProducts = db.prepare("SELECT COUNT(*) as c FROM products").get().c;
  const totalCategories = db.prepare("SELECT COUNT(*) as c FROM categories").get().c;
  const todaySales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE date(created_at)=date('now','localtime')").get().t;
  const todayBills = db.prepare("SELECT COUNT(*) as c FROM invoices WHERE date(created_at)=date('now','localtime')").get().c;
  const weeklySales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-7 days')").get().t;
  const monthlySales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-30 days')").get().t;
  const overallSales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices").get().t;
  const expiredCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE expiry_date IS NOT NULL AND expiry_date<?").get(today).c;
  const nearExpiryCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=?").get(today, inN).c;
  const lowStockCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE quantity>0 AND quantity<=?").get(lowThreshold).c;
  const outOfStock = db.prepare("SELECT COUNT(*) as c FROM products WHERE quantity<=0").get().c;

  const todayCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE date(inv.created_at)=date('now','localtime')").get().c;
  const weeklyCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-7 days')").get().c;
  const monthlyCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-30 days')").get().c;
  const overallCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id").get().c;
  const overallBills = db.prepare("SELECT COUNT(*) as c FROM invoices").get().c;

  const topProducts = db.prepare("SELECT p.name, SUM(ii.quantity) as sold, SUM(ii.price*ii.quantity) as revenue FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-30 days') GROUP BY ii.product_id ORDER BY sold DESC LIMIT 8").all();
  const dailySales = db.prepare("SELECT date(created_at,'localtime') as day, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-7 days') GROUP BY day ORDER BY day ASC").all();
  const monthlyBreakdown = db.prepare("SELECT strftime('%Y-%m',created_at,'localtime') as month, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-180 days') GROUP BY month ORDER BY month ASC").all();
  const yearlyBreakdown = db.prepare("SELECT strftime('%Y',created_at,'localtime') as year, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total FROM invoices GROUP BY year ORDER BY year DESC LIMIT 5").all();
  const weeklyBreakdown = db.prepare("SELECT strftime('%W',created_at,'localtime') as week, COALESCE(SUM(total_amount),0) as total, COALESCE(SUM((ii.price - COALESCE(p.cost_price, 0)) * ii.quantity),0) as profit FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE strftime('%Y-%m',inv.created_at,'localtime') = strftime('%Y-%m','now','localtime') GROUP BY week ORDER BY week ASC").all();
  const peakHours = db.prepare("SELECT strftime('%H',created_at,'localtime') as hour, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as revenue FROM invoices WHERE created_at>=datetime('now','-30 days') GROUP BY hour ORDER BY bills DESC LIMIT 24").all();
  const paymentBreakdown = db.prepare("SELECT payment_mode, COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-30 days') GROUP BY payment_mode ORDER BY cnt DESC").all();
  const deadStock = db.prepare(`SELECT name, quantity FROM products WHERE quantity>0 AND created_at <= datetime('now','-${deadThresholdDays} days') AND id NOT IN (SELECT DISTINCT product_id FROM invoice_items ii JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-${deadThresholdDays} days'))`).all();
  
  const recentInvoices = db.prepare("SELECT bill_no, bill_date, customer_name, total_amount FROM invoices ORDER BY created_at DESC LIMIT 50").all();

  // Get subscription info for mobile app
  let subscriptionInfo = {};
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let settings2 = {};
    if (fs.existsSync(configPath)) {
      try { settings2 = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
    }
    const sid = settings2.shopId || process.env.SHOP_ID;
    if (supabase && sid) {
      const { data: shopData } = await supabase.from('shops').select('is_paid, validity_end, is_active').eq('id', sid).single();
      if (shopData) {
        const now2 = new Date();
        const end2 = new Date(shopData.validity_end);
        const dl = Math.max(0, Math.ceil((end2 - now2) / 86400000));
        subscriptionInfo = {
          isPaid: !!shopData.is_paid,
          daysLeft: dl,
          validityEnd: shopData.validity_end,
          warningPhase: dl <= 7 && dl > 0 && !shopData.is_paid,
          isActive: !!shopData.is_active
        };
      }
    }
  } catch (e) {}

  return {
    totalProducts, totalCategories,
    todaySales, todayBills, weeklySales, monthlySales, overallSales,
    expiredCount, nearExpiryCount, lowStockCount, outOfStock,
    todayProfit: todaySales - todayCost,
    overallProfit: overallSales - overallCost,
    topSelling: topProducts.map(p => ({ ...p, total_sold: p.sold })),
    dailySales, monthlySalesBreakdown: monthlyBreakdown,
    peakHours, paymentBreakdown, deadStock,
    recentInvoices,
    subscription: subscriptionInfo,
    settingsSnapshot: {
      storeName: s.storeName,
      storeAddress: s.storeAddress,
      gstNumber: s.gstNumber,
      whatsappNumber: s.ownerPhone
    }
  };
}

// ── SYNC ENGINE: CLOUD CONTROL (MAIN) ──
async function syncToControlPlane(shopId) {
  if (!supabase || !shopId) return;
  try {
    await registerShop(shopId);
    
    // Generate full stats JSON for mobile dashboard snapshot
    const stats = await generateStatsJSON();
    
    await supabase.from('shop_stats').upsert({
      shop_id: shopId,
      stats_json: stats,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('[Sync] Control Plane Error:', e.message);
  }
}

async function logNotification(shopId, type, message) {
  if (!supabase) return;
  try { await supabase.from('notifications').insert({ shop_id: shopId, type, message }); } catch (e) { }
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    frame: false,
    kiosk: true,
    title: "Innoaivators Billing System",
    icon: path.join(__dirname, "assets", "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Dynamically set title if shop is already registered
  const settingsPath = path.join(app.getPath("userData"), "app_settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (s.storeName) {
        mainWindow.setTitle(`${s.storeName} - Innoaivators`);
      }
    } catch (e) { }
  }

  // Handle Fullscreen Toggles — use webContents event instead of globalShortcut
  // to avoid stealing keystrokes from textboxes
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Escape to exit kiosk/fullscreen (only on key down, not repeat)
    if (input.key === 'Escape' && input.type === 'keyDown' && !input.isAutoRepeat) {
      if (mainWindow.isKiosk() || mainWindow.isFullScreen()) {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);
      }
    }
    // F11 to enter kiosk/fullscreen
    if (input.key === 'F11' && input.type === 'keyDown' && !input.isAutoRepeat) {
      mainWindow.setKiosk(true);
      mainWindow.setFullScreen(true);
    }
  });

  // Completely remove the default top menu bar (File, Edit, View, etc.)
  mainWindow.setMenu(null);

  // Force the title to stay "Innoaivators Billing System" regardless of page content
  mainWindow.on('page-title-updated', (e) => e.preventDefault());

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "..", "Frontend", "dist", "index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5174");
  }

  // Start WhatsApp client AFTER the window has loaded so QR events reach the renderer
  mainWindow.webContents.once("did-finish-load", () => {
    initWhatsApp(mainWindow);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    stopDashboardServer();
  });

  // Start the background API & Mobile Dashboard server
  dashboardServerRunning = true;
  startDashboardServer(mainWindow);


  // 🟢 SaaS Control: Start Realtime Listener for immediate deactivation
  const configPath = path.join(app.getPath("userData"), "app_settings.json");
  let currentSettings = {};
  if (fs.existsSync(configPath)) {
    try { currentSettings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) { }
  }
  const currentShopId = currentSettings.shopId || process.env.SHOP_ID;
  
  // 🔒 IMMEDIATE STARTUP CHECK: Verify shop still exists BEFORE any sync
  if (currentShopId) {
    const url = currentSettings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    const key = currentSettings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
    initSupabase(url, key);
    
    if (supabase) {
      // Check immediately if shop was deleted while we were offline
      supabase.from('shops').select('id').eq('id', currentShopId).single()
        .then(({ data, error }) => {
          // CRITICAL: Only treat PGRST116 (row not found) as deletion, NOT network errors
          const isNotFound = error && (error.code === 'PGRST116' || error.message?.includes('not found') || error.details?.includes('0 rows'));
          if (isNotFound) {
            console.log(`[Startup] 🗑️ Shop ${currentShopId} was CONFIRMED deleted by admin. Clearing local data.`);
            try {
              let s = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
              delete s.shopId;
              fs.writeFileSync(configPath, JSON.stringify(s, null, 2));
              process.env.SHOP_ID = '';
            } catch (e) {}
            // Force renderer to reload and show registration
            if (mainWindow) {
              mainWindow.webContents.send('app-lock', { reason: 'Shop Deleted', expiry: '', deleted: true });
            }
          } else if (error) {
            console.warn(`[Startup] ⚠️ Network error checking shop ${currentShopId}. Preserving local data.`);
          } else {
            console.log(`[Startup] ✅ Shop ${currentShopId} verified in cloud.`);
          }
        })
        .catch(() => { console.warn('[Startup] ⚠️ Cloud check failed (offline?). Preserving local data.'); });
    }
    
    startControlListener(currentShopId);
  }

  // 🟢 Background Sync & SaaS Worker (Runs every 10 minutes)
  setInterval(async () => {
    try {
      let intervalSettings = {};
      if (fs.existsSync(configPath)) {
        try { intervalSettings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) { }
      }
      const shopId = intervalSettings.shopId || process.env.SHOP_ID;
      if (!shopId) return;

      // 🔒 PRE-CHECK: Verify shop still exists before syncing
      // This prevents re-creating a shop that was deleted by admin
      if (supabase) {
        const { data: shopExists, error: existErr } = await supabase
          .from('shops').select('id').eq('id', shopId).single();
        // CRITICAL: Only treat PGRST116 (row not found) as deletion, NOT network errors
        const isNotFound = existErr && (existErr.code === 'PGRST116' || existErr.message?.includes('not found') || existErr.details?.includes('0 rows'));
        if (isNotFound) {
          console.log(`[SaaS Worker] 🗑️ Shop ${shopId} CONFIRMED deleted. Clearing local data.`);
          if (intervalSettings.shopId === shopId) {
            delete intervalSettings.shopId;
            fs.writeFileSync(configPath, JSON.stringify(intervalSettings, null, 2));
            process.env.SHOP_ID = '';
          }
          // Notify renderer to show registration screen
          if (mainWindow) {
            mainWindow.webContents.send('app-lock', { 
              reason: 'Shop Deleted', 
              expiry: '',
              deleted: true
            });
          }
          return;
        } else if (existErr) {
          console.warn(`[SaaS Worker] ⚠️ Network error checking shop. Skipping this sync cycle.`);
          return;
        }
      }

      // 1. Sync High-Level Stats to Control Plane (Main Supabase)
      await syncToControlPlane(shopId);

      // 2. Sync Full Data to Shop Supabase (Data Plane)
      if (shopSupabase) await syncToShopCloud();

      // 3. Local Database Backup
      syncToLocalPath();

      // 4. Validity & Alert System
      const validity = await checkValidity(shopId);
      
      // Handle Locking (Redundant to Realtime, acts as a fallback)
      if (!validity.valid && mainWindow) {
        mainWindow.webContents.send('app-lock', { 
          reason: !validity.isActive ? 'Account Deactivated' : 'Subscription Expired',
          expiry: validity.validityEnd
        });
      }

      // WhatsApp reminders for last 4 days of subscription
      if (validity.valid && validity.daysLeft <= 4 && intervalSettings.ownerPhone) {
        const message = `⚠️ *iVA Smart Billing Reminder*\n\nYour shop subscription expires in *${validity.daysLeft} days* (${new Date(validity.validityEnd).toLocaleDateString()}). Please renew today to avoid service interruption.`;
        await sendMessage(intervalSettings.ownerPhone, message);
      }

      // 📦 DAILY INVENTORY ALERTS via WhatsApp
      // Sends once per day. Stops automatically when owner fixes the issues.
      const ownerPhone = intervalSettings.ownerPhone || intervalSettings.ownerMobile;
      if (ownerPhone && validity.valid) {
        const todayDate = new Date().toISOString().split('T')[0];
        const lastAlertDate = intervalSettings._lastInventoryAlertDate || '';
        
        if (lastAlertDate !== todayDate) {
          try {
            const lowThreshold = intervalSettings.lowStockThreshold || 10;
            const expiryDays = intervalSettings.expiryAlertDays || 3;
            const deadDays = intervalSettings.deadStockThresholdDays || 30;
            const todayStr = new Date().toISOString().split('T')[0];
            const nearExpiryDate = new Date(Date.now() + expiryDays * 86400000).toISOString().split('T')[0];

            // 1. Low Stock items (quantity > 0 but below threshold)
            const lowStock = db.prepare(
              "SELECT name, quantity FROM products WHERE quantity > 0 AND quantity <= ? ORDER BY quantity ASC LIMIT 15"
            ).all(lowThreshold);

            // 2. Expired items
            const expired = db.prepare(
              "SELECT name, expiry_date FROM products WHERE expiry_date IS NOT NULL AND expiry_date < ? ORDER BY expiry_date ASC LIMIT 10"
            ).all(todayStr);

            // 3. Near Expiry items (expiring within N days)
            const nearExpiry = db.prepare(
              "SELECT name, expiry_date FROM products WHERE expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= ? ORDER BY expiry_date ASC LIMIT 10"
            ).all(todayStr, nearExpiryDate);

            // 4. Dead Stock (in inventory but not sold in last N days)
            // ONLY flag products that were registered MORE than N days ago
            const deadStock = db.prepare(
              `SELECT name, quantity FROM products WHERE quantity > 0 AND created_at <= datetime('now','-${deadDays} days') AND id NOT IN (SELECT DISTINCT product_id FROM invoice_items ii JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-${deadDays} days')) LIMIT 10`
            ).all();

            // Build message only if there are issues
            let alertParts = [];

            if (expired.length > 0) {
              alertParts.push(`🔴 *EXPIRED PRODUCTS (${expired.length}):*\n` + 
                expired.map(p => `  ❌ ${p.name} (${p.expiry_date})`).join('\n'));
            }

            if (nearExpiry.length > 0) {
              alertParts.push(`🟡 *EXPIRING SOON (${nearExpiry.length}):*\n` + 
                nearExpiry.map(p => `  ⚠️ ${p.name} (${p.expiry_date})`).join('\n'));
            }

            if (lowStock.length > 0) {
              alertParts.push(`🟠 *LOW STOCK (${lowStock.length}):*\n` + 
                lowStock.map(p => `  📦 ${p.name} — ${p.quantity} left`).join('\n'));
            }

            if (deadStock.length > 0) {
              alertParts.push(`⚫ *DEAD STOCK (${deadStock.length}):*\n` + 
                deadStock.map(p => `  🚫 ${p.name} (${p.quantity} units, no sales in ${deadDays}d)`).join('\n'));
            }

            if (alertParts.length > 0) {
              const storeName = intervalSettings.storeName || 'Your Shop';
              const fullMessage = `📊 *${storeName} — Daily Inventory Alert*\n` +
                `📅 ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n` +
                alertParts.join('\n\n') +
                `\n\n_💡 This alert will stop once you update your inventory._\n_Powered by iVA Smart Billing_`;

              await sendMessage(ownerPhone, fullMessage);
              console.log(`[Alerts] 📲 Daily inventory alert sent to ${ownerPhone}`);
            } else {
              console.log('[Alerts] ✅ No inventory issues found. No alert needed.');
            }

            // Mark today as alerted (whether sent or not — no issues = no repeat check)
            intervalSettings._lastInventoryAlertDate = todayDate;
            fs.writeFileSync(configPath, JSON.stringify(intervalSettings, null, 2));
          } catch (alertErr) {
            console.error('[Alerts] ❌ Failed to send inventory alert:', alertErr.message);
          }
        }
      }

    } catch (e) { console.error("[SaaS Worker Error]", e.message); }
  }, 10 * 60 * 1000); // Check every 10 minutes
}

app.whenReady().then(createWindow);

let isQuitting = false;
app.on('before-quit', async (e) => {
  if (isQuitting) return;
  e.preventDefault();
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const shopId = settings.shopId || process.env.SHOP_ID;
      if (shopId && supabase) {
        // Ping offline by setting last_ping_at to a very old date
        await supabase.from('shops').update({
          last_ping_at: new Date(0).toISOString()
        }).eq('id', shopId);
      }
    }
  } catch (err) {}
  isQuitting = true;
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 🟢 GET CATEGORIES
ipcMain.handle("get-categories", async () => {
  return db.prepare("SELECT * FROM categories").all();
});

// 🟢 ADD CATEGORY
ipcMain.handle("add-category", async (event, category) => {
  const { name, gst } = category;
  const result = db.prepare("INSERT INTO categories (name, gst) VALUES (?, ?)").run(name, gst || 0);
  return { id: result.lastInsertRowid, message: "Category added" };
});

// 🟢 ADD PRODUCT (with expiry_date and weight)
ipcMain.handle("add-product", async (event, product) => {
  const {
    name,
    category_id,
    gst_rate,
    product_code,
    price_type,
    price,
    cost_price,
    quantity,
    unit,
    barcode,
    expiry_date,
    image,
    default_discount,
    weight,
    brand,
    product_type,
    stock_unit
  } = product;

  db.prepare(`
    INSERT INTO products 
    (name, category_id, gst_rate, product_code, price_type, price, cost_price, quantity, unit, barcode, expiry_date, image, default_discount, weight, brand, product_type, stock_unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    category_id || null,
    gst_rate || 0,
    product_code || null,
    price_type || 'exclusive',
    price,
    cost_price || 0,
    quantity,
    unit,
    barcode ? String(barcode) : null,
    expiry_date || null,
    image || null,
    default_discount || 0,
    weight || null,
    brand || null,
    product_type || 'packaged',
    stock_unit || null
  );
  // Trigger immediate background sync so new product appears in Supabase + Local DB right away
  setImmediate(async () => {
    try {
      if (shopSupabase) await syncToShopSupabase();
      syncToLocalPath();
    } catch(e) { console.error('[Sync] Background sync after add-product failed:', e.message); }
  });

  return { message: "Product added" };
});

// 🟢 EDIT PRODUCT (with expiry_date and weight)
ipcMain.handle("edit-product", async (event, product) => {
  const { id, name, category_id, gst_rate, product_code, price_type, price, cost_price, quantity, unit, barcode, expiry_date, image, default_discount, weight, brand, product_type, stock_unit } = product;

  db.prepare(`
    UPDATE products 
    SET name=?, category_id=?, gst_rate=?, product_code=?, price_type=?, price=?, cost_price=?, quantity=?, unit=?, barcode=?, expiry_date=?, image=?, default_discount=?, weight=?, brand=?, product_type=?, stock_unit=?, is_synced=0
    WHERE id=?
  `).run(
    name, 
    category_id || null, 
    gst_rate || 0, 
    product_code || null, 
    price_type || 'exclusive', 
    price, 
    cost_price || 0, 
    quantity, 
    unit, 
    barcode ? String(barcode) : null, 
    expiry_date || null, 
    image || null, 
    default_discount || 0, 
    weight || null, 
    brand || null, 
    product_type || 'packaged',
    stock_unit || null,
    id
  );
  // Trigger immediate background sync
  setImmediate(async () => {
    try {
      if (shopSupabase) await syncToShopSupabase();
      syncToLocalPath();
    } catch(e) { console.error('[Sync] Background sync after edit-product failed:', e.message); }
  });

  return { message: "Product updated" };
});

// 🟢 DELETE PRODUCT
ipcMain.handle("delete-product", async (event, id) => {
  db.pragma("foreign_keys = OFF");
  try {
    db.prepare("DELETE FROM products WHERE id=?").run(id);
  } finally {
    db.pragma("foreign_keys = ON");
  }

  // Trigger immediate background sync
  setImmediate(async () => {
    try {
      // 🔄 Explicitly delete from Supabase too!
      if (shopSupabase) {
        await shopSupabase.from('products').delete().eq('local_id', id);
        console.log('[ShopSync] 🗑️ Deleted product from Supabase:', id);
      }
      syncToLocalPath();
    } catch(e) { console.error('[Sync] Background sync after delete-product failed:', e.message); }
  });

  return { message: "Product deleted" };
});

// 🟢 SEND WHATSAPP — AUTOMATIC (via whatsapp-web.js)
ipcMain.handle("send-whatsapp", async (event, phone, message) => {
  return sendMessage(phone, message);
});

ipcMain.handle("whatsapp-status", async () => {
  return getStatus();
});

ipcMain.handle("request-whatsapp-qr", async (event) => {
  const status = getStatus();
  if (status.qr && mainWindow) {
    mainWindow.webContents.send("whatsapp-qr", status.qr);
  }
  return status;
});

ipcMain.handle("reset-whatsapp", async (event) => {
  return resetWhatsApp(mainWindow);
});

// 🟢 GET LOCAL IP FOR EXPO QR CODE
ipcMain.handle("get-local-ip", () => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
});

// 🟢 GET DASHBOARD URL
ipcMain.handle("get-dashboard-url", () => {
  return getTunnelURL();
});

ipcMain.handle("save-app-settings", (event, settings) => {
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
    
    // 🔥 Force an immediate cloud sync so mobile app gets the updated API keys immediately!
    if (settings.shopId || process.env.SHOP_ID) {
      console.log(`[ShopSync] 🤖 Syncing API Keys (Gemini/Groq)...`);
      // Don't await it to avoid blocking UI
      syncStatsToSupabase();
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("get-app-settings", (event) => {
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch (e) { }
  return null;
});

ipcMain.handle("set-window-title", (event, title) => {
  if (mainWindow) {
    mainWindow.setTitle(`${title} - Innoaivators`);
  }
});

ipcMain.handle("ask-ai-consultant", async (event, question) => {
  const q = question.toLowerCase();
  let answer = "I'm sorry, I don't have that data yet. Try asking about sales or stock.";

  if (q.includes("sale") || q.includes("revenue")) {
    const today = db.prepare(`SELECT SUM(total_amount) as t FROM invoices WHERE date(created_at)=date('now')`).get().t || 0;
    answer = `Today's total sales: ₹${today}.`;
  } else if (q.includes("best") || q.includes("top")) {
    const top = db.prepare(`SELECT p.name, SUM(ii.quantity) as q FROM invoice_items ii JOIN products p ON ii.product_id=p.id GROUP BY p.id ORDER BY q DESC LIMIT 1`).get();
    answer = top ? `Top product is ${top.name} (${top.q} sold).` : "No data.";
  } else if (q.includes("stock") || q.includes("low")) {
    const low = db.prepare(`SELECT COUNT(*) as c FROM products WHERE quantity <= 5`).get().c;
    answer = `You have ${low} items on low stock. Check alerts!`;
  } else if (q.includes("customer")) {
    const top = db.prepare(`SELECT customer_name, SUM(total_amount) as t FROM invoices WHERE customer_name != '' GROUP BY customer_phone ORDER BY t DESC LIMIT 1`).get();
    answer = top ? `Best customer: ${top.customer_name} (Lifetime ₹${top.t}).` : "No data.";
  }
  return answer;
});

ipcMain.handle("get-shop-id", () => {
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (settings.shopId) return settings.shopId;
    }
  } catch (e) {}
  return process.env.SHOP_ID || null;
});

// 🟢 WINDOW CONTROLS
ipcMain.handle("minimize-window", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle("close-window", () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle("create-backup", async () => {
  try {
    const backupDir = path.join(os.homedir(), "Documents", "Innoaivators_Backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sourcePath = db.name; // In better-sqlite3, db.name is the file path
    const backupPath = path.join(backupDir, `billing_backup_${timestamp}.db`);
    
    fs.copyFileSync(sourcePath, backupPath);
    
    // Open the folder for them
    shell.showItemInFolder(backupPath);
    
    return { success: true, message: `Backup saved to Documents/Innoaivators_Backups`, path: backupPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("get-sync-status", () => {
  const pendingInvoices = db.prepare("SELECT COUNT(*) as cnt FROM invoices WHERE is_synced = 0").get().cnt;
  const pendingProducts = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE is_synced = 0").get().cnt;
  return { pending: pendingInvoices + pendingProducts };
});


// 🔔 NOTIFICATION HANDLERS (Owner Alerts)
// ============================================================

ipcMain.handle("get-notifications", async (event, opts) => {
  const limit = opts?.limit || 50;
  const unreadOnly = opts?.unreadOnly || false;
  let query = "SELECT * FROM notifications";
  if (unreadOnly) query += " WHERE is_read = 0";
  query += " ORDER BY created_at DESC LIMIT ?";
  const notifications = db.prepare(query).all(limit);
  const unreadCount = db.prepare("SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0").get().cnt;
  return { notifications, unreadCount };
});

ipcMain.handle("mark-notification-read", async (event, id) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id);
  return { message: "Marked as read" };
});

ipcMain.handle("mark-all-notif-read", async () => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0").run();
  return { message: "All marked as read" };
});

ipcMain.handle("delete-notification", async (event, id) => {
  db.prepare("DELETE FROM notifications WHERE id = ?").run(id);
  return { message: "Notification deleted" };
});


// 🟢 GET PRODUCTS WITH CATEGORY GST (Backwards compatible fallback)
ipcMain.handle("get-products-full", () => {
  return db.prepare(`
    SELECT 
      p.*,
      COALESCE(p.gst_rate, c.gst, 0) as category_gst,
      COALESCE(c.name, 'General') as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
  `).all();
});


// 🟢 BULK UPDATE (STOCK ONLY)
ipcMain.handle("bulkUpdateProducts", async (event, updates) => {
  const stmt = db.prepare(`
    UPDATE products 
    SET 
      quantity = quantity + ?,
      is_synced = 0
    WHERE id = ?
  `);

  const transaction = db.transaction((items) => {
    for (const item of items) {
      stmt.run(item.addQty, item.id);
    }
  });

  transaction(updates);

  return { message: "Bulk update success 🔥" };
});


// 🟢 SEARCH CUSTOMER BY PHONE
ipcMain.handle("search-customer", async (event, phone) => {
  return db.prepare("SELECT * FROM customers WHERE phone = ?").get(phone);
});

// 🟢 CREATE INVOICE (CUSTOMER + PAYMENT + DISCOUNT)
ipcMain.handle("create-invoice", async (event, data) => {
  const { cart, customer, paymentMode } = data;
  let total = 0;

  cart.forEach(item => {
    const discountAmt = Number(item.discountAmt || 0);
    total += (item.total + item.gstAmt - discountAmt);
  });

  // Handle Customer Save/Update
  let customerId = null;
  if (customer && (customer.phone || customer.name)) {
    const searchVal = customer.phone || "WALK-IN";
    const existing = db.prepare("SELECT * FROM customers WHERE phone = ?").get(searchVal);
    if (!existing) {
      const res = db.prepare("INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)").run(
        customer.name || "Customer", searchVal, customer.address || ""
      );
      customerId = res.lastInsertRowid;
    } else {
      db.prepare("UPDATE customers SET name = ?, address = ? WHERE id = ?").run(
        customer.name || existing.name, customer.address || existing.address, existing.id
      );
      customerId = existing.id;
    }
  }

  const now = new Date();
  // Use local date (not UTC) to avoid timezone-based month mismatch
  const pad = n => String(n).padStart(2, '0');
  const localDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const currentMonth = `${now.getFullYear()}-${pad(now.getMonth()+1)}`; // "YYYY-MM"

  // Monthly sequential bill numbering — integer only, no floats
  // Uses localtime modifier so IST month boundary is respected
  const lastBill = db.prepare(
    "SELECT bill_no FROM invoices WHERE strftime('%Y-%m', bill_date) = ? ORDER BY bill_no DESC LIMIT 1"
  ).get(currentMonth);
  const nextBillNo = lastBill ? (Math.floor(lastBill.bill_no) + 1) : 1;

  const result = db.prepare(`
    INSERT INTO invoices (bill_no, bill_date, customer_name, customer_phone, customer_address, customer_id, payment_mode, total_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextBillNo,
    localDate,
    customer?.name || "",
    customer?.phone || "",
    customer?.address || "",
    customerId,
    paymentMode || "Cash",
    total
  );

  const invoiceId = result.lastInsertRowid;
  const responseData = { message: "Invoice created successfully! 🔥", invoiceId, billNo: nextBillNo };


  const insertItem = db.prepare(`
    INSERT INTO invoice_items 
    (invoice_id, product_id, quantity, price, gst_rate, gst_amount, discount_percent, discount_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateStock = db.prepare(`
    UPDATE products
    SET quantity = quantity - ?,
        is_synced = 0
    WHERE id = ?
  `);

  const transaction = db.transaction((items) => {
    for (const item of items) {
      insertItem.run(
        invoiceId,
        item.id,
        item.qty,
        item.price,
        item.gstRate,
        item.gstAmt,
        item.discountPercent || 0,
        item.discountAmt || 0
      );

      updateStock.run(item.qty, item.id);
    }
  });

  transaction(cart);

  // 🔥 Trigger immediate cloud sync after local save
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const shopIdValue = settings.shopId || process.env.SHOP_ID;
      if (shopIdValue && supabase) {
        syncToCloud(shopIdValue).catch(e => console.error("[Sync] Post-bill error:", e.message));
      }
    }
  } catch (e) { }

  // 🔥 Also sync to shop's own Supabase + local DB backup
  setImmediate(async () => {
    try {
      if (shopSupabase) await syncToShopSupabase();
      syncToLocalPath();
    } catch(e) { console.error('[Sync] Background sync after invoice failed:', e.message); }
  });

  return responseData;
});

// ============================================================
// 🔥 INVOICE HISTORY HANDLERS
// ============================================================

// Get all invoices (with a mini product list for each)
ipcMain.handle("get-invoices", async () => {
  const invoices = db.prepare(`
    SELECT * FROM invoices ORDER BY created_at DESC
  `).all();

  // Attach a comma-separated product list string for each invoice
  const getItems = db.prepare(`
    SELECT COALESCE(p.name, 'Deleted Product') as name FROM invoice_items ii
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = ?
  `);

  return invoices.map(inv => {
    const items = getItems.all(inv.id);
    return {
      ...inv,
      productsList: items.map(i => i.name).join(', ')
    };
  });
});

// Get full details (line items) for a single invoice
ipcMain.handle("get-invoice-details", async (event, invoiceId) => {
  return db.prepare(`
    SELECT ii.*, COALESCE(p.name, 'Deleted Product') as name 
    FROM invoice_items ii
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = ?
  `).all(invoiceId);
});

// Delete an invoice and its items
ipcMain.handle("delete-invoice", async (event, invoiceId) => {
  db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(invoiceId);
  db.prepare("DELETE FROM invoices WHERE id = ?").run(invoiceId);
  return { message: "Invoice deleted" };
});

// ============================================================
// 🔥 HOLD / RESUME BILL HANDLERS
// ============================================================

// Hold current bill
ipcMain.handle("hold-bill", async (event, { cart, customer, label }) => {
  const heldLabel = label || `Held ${new Date().toLocaleTimeString('en-IN')}`;
  
  const result = db.prepare(`
    INSERT INTO held_bills (label, cart_json, customer_json)
    VALUES (?, ?, ?)
  `).run(
    heldLabel,
    JSON.stringify(cart),
    JSON.stringify(customer || {})
  );

  // ✅ Sync to INDIVIDUAL shop Supabase (held_bills table)
  try {
    if (shopSupabase) {
      const localId = result.lastInsertRowid;
      const { error } = await shopSupabase.from('held_bills').upsert({
        local_id: localId,
        label: heldLabel,
        cart_json: JSON.stringify(cart),
        customer_json: JSON.stringify(customer || {})
      }, { onConflict: 'local_id' });
      
      if (!error) {
        db.prepare('UPDATE held_bills SET is_synced = 1 WHERE id = ?').run(localId);
        console.log('[Hold] ✅ Synced held bill to shop Supabase');
      } else {
        console.error('[Hold] Cloud sync save failed:', JSON.stringify(error));
      }
    }
  } catch(e) {
    console.warn('[Hold] Cloud sync failed (offline mode):', e.message);
  }

  return { message: "Bill held" };
});


// Get all held bills
ipcMain.handle("get-held-bills", async () => {
  const rows = db.prepare("SELECT * FROM held_bills ORDER BY created_at DESC").all();
  return rows.map(r => ({
    ...r,
    cart: JSON.parse(r.cart_json),
    customer: JSON.parse(r.customer_json || '{}')
  }));
});

// Delete (discard) a held bill
ipcMain.handle("delete-held-bill", async (event, id) => {
  db.prepare("DELETE FROM held_bills WHERE id=?").run(id);
  return { message: "Held bill removed" };
});

// ============================================================
// 🔥 EXPIRY & STOCK DASHBOARD REPORTS
// ============================================================

// Get expiry alerts (expired + near-expiry within configurable days, default 3)
ipcMain.handle("get-expiry-alerts", async () => {
  const today = new Date().toISOString().split('T')[0];
  // Read settings for expiry alert days
  let expiryDays = 3;
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expiryDays = settings.expiryAlertDays || 3;
    }
  } catch (e) { }
  const inN = new Date(Date.now() + expiryDays * 86400000).toISOString().split('T')[0];

  const expired = db.prepare(`
    SELECT p.*, c.name as category_name, c.gst as category_gst
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.expiry_date IS NOT NULL AND p.expiry_date < ?
    ORDER BY p.expiry_date ASC
  `).all(today);

  const nearExpiry = db.prepare(`
    SELECT p.*, c.name as category_name, c.gst as category_gst
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.expiry_date IS NOT NULL AND p.expiry_date >= ? AND p.expiry_date <= ?
    ORDER BY p.expiry_date ASC
  `).all(today, inN);

  return { expired, nearExpiry };
});

// Get low-stock and dead-stock products (with dynamic thresholds)
ipcMain.handle("get-stock-alerts", async (event, limits) => {
  const lowThreshold = limits?.lowStock || 5;
  const deadDays = limits?.deadStockDays || 30;

  const lowStock = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.quantity > 0 AND p.quantity <= ?
    ORDER BY p.quantity ASC
  `).all(lowThreshold);

  // Dead stock = quantity > 0 but not sold in last X days
  // AND product must be older than X days (ignore newly added products)
  const deadStock = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.quantity > 0
    AND p.created_at <= datetime('now', ?)
    AND p.id NOT IN (
      SELECT DISTINCT ii.product_id FROM invoice_items ii
      INNER JOIN invoices inv ON ii.invoice_id = inv.id
      WHERE inv.created_at >= datetime('now', ?)
    )
    ORDER BY p.quantity DESC
  `).all(`-${deadDays} days`, `-${deadDays} days`);

  return { lowStock, deadStock };
});

// Get dashboard summary stats
ipcMain.handle("get-dashboard-stats", async () => {
  const today = new Date().toISOString().split('T')[0];
  // Read settings
  let lowThreshold = 10;
  let expiryDays = 3;
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      lowThreshold = settings.lowStockThreshold || 10;
      expiryDays = settings.expiryAlertDays || 3;
    }
  } catch (e) { }
  const inN = new Date(Date.now() + expiryDays * 86400000).toISOString().split('T')[0];

  const totalProducts = db.prepare("SELECT COUNT(*) as cnt FROM products").get().cnt;
  const totalCategories = db.prepare("SELECT COUNT(*) as cnt FROM categories").get().cnt;
  const todaySales = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices
    WHERE date(created_at) = date('now', 'localtime')
  `).get().total;
  const todayBills = db.prepare(`
    SELECT COUNT(*) as cnt FROM invoices
    WHERE date(created_at) = date('now', 'localtime')
  `).get().cnt;
  const expiredCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date < ?
  `).get(today).cnt;
  const nearExpiryCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= ?
  `).get(today, inN).cnt;
  const lowStockCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM products WHERE quantity > 0 AND quantity <= ?
  `).get(lowThreshold).cnt;
  const outOfStock = db.prepare(`
    SELECT COUNT(*) as cnt FROM products WHERE quantity <= 0
  `).get().cnt;

  // Low stock product list for dashboard drilldown
  const lowStockProducts = db.prepare(`
    SELECT p.name, p.quantity, p.unit, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.quantity > 0 AND p.quantity <= ?
    ORDER BY p.quantity ASC
  `).all(lowThreshold);

  // Out of stock product list
  const outOfStockProducts = db.prepare(`
    SELECT p.name, p.unit, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.quantity <= 0
  `).all();

  // Expiring product list
  const expiringProducts = db.prepare(`
    SELECT p.name, p.expiry_date, p.quantity, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.expiry_date IS NOT NULL AND p.expiry_date >= ? AND p.expiry_date <= ?
    ORDER BY p.expiry_date ASC
  `).all(today, inN);

  // Expired product list
  const expiredProducts = db.prepare(`
    SELECT p.name, p.expiry_date, p.quantity, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.expiry_date IS NOT NULL AND p.expiry_date < ?
    ORDER BY p.expiry_date ASC
  `).all(today);

  // Profit Calculations: (Selling Price - Cost Price) * Quantity
  const calculateProfit = (timeframeStr) => {
    return db.prepare(`
      SELECT SUM((ii.price - COALESCE(p.cost_price, 0)) * ii.quantity) as profit
      FROM invoice_items ii
      JOIN products p ON ii.product_id = p.id
      JOIN invoices inv ON ii.invoice_id = inv.id
      WHERE inv.created_at >= datetime('now', '${timeframeStr}')
    `).get().profit || 0;
  };

  const todayProfit = calculateProfit('start of day');
  const weeklyProfit = calculateProfit('-7 days');
  const monthlyProfit = calculateProfit('-30 days');

  // Overall (all-time) profit
  const overallSales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices").get().t;
  const overallCostAll = db.prepare("SELECT COALESCE(SUM((ii.price - COALESCE(p.cost_price, 0)) * ii.quantity),0) as profit FROM invoice_items ii JOIN products p ON ii.product_id = p.id").get().profit || 0;
  const overallBills = db.prepare("SELECT COUNT(*) as c FROM invoices").get().c;

  // Top 5 products sold this month
  const topProducts = db.prepare(`
    SELECT p.name, SUM(ii.quantity) as sold
    FROM invoice_items ii
    JOIN products p ON ii.product_id = p.id
    JOIN invoices inv ON ii.invoice_id = inv.id
    WHERE inv.created_at >= datetime('now', '-30 days')
    GROUP BY ii.product_id
    ORDER BY sold DESC
    LIMIT 5
  `).all();

  const dailySales = db.prepare(`
    SELECT date(created_at) as day, SUM(total_amount) as total, COUNT(*) as bills
    FROM invoices 
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  const monthlySalesBreakdown = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, SUM(total_amount) as total, COUNT(*) as bills
    FROM invoices 
    WHERE created_at >= datetime('now', '-12 months')
    GROUP BY month
    ORDER BY month ASC
  `).all();

  return {
    totalProducts, totalCategories, todaySales, todayBills,
    expiredCount, nearExpiryCount, lowStockCount, outOfStock,
    topProducts, todayProfit, weeklyProfit, monthlyProfit,
    overallProfit: overallCostAll, overallSales, overallBills,
    dailySales, monthlySalesBreakdown,
    lowStockProducts, outOfStockProducts, expiringProducts, expiredProducts
  };
});

// ============================================================
// 🔥 OFFERS HANDLERS
// ============================================================

ipcMain.handle("get-offers", async () => {
  return db.prepare(`
    SELECT o.*, 
           b.name as buy_product_name, 
           f.name as free_product_name
    FROM offers o
    JOIN products b ON o.buy_product_id = b.id
    JOIN products f ON o.free_product_id = f.id
    ORDER BY o.created_at DESC
  `).all();
});

ipcMain.handle("add-offer", async (event, offer) => {
  const { name, status, buy_product_id, buy_quantity, free_product_id, free_quantity } = offer;
  db.prepare(`
    INSERT INTO offers (name, status, buy_product_id, buy_quantity, free_product_id, free_quantity)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, status === undefined ? 1 : status, buy_product_id, buy_quantity, free_product_id, free_quantity);
  return { message: "Offer added" };
});

ipcMain.handle("edit-offer", async (event, offer) => {
  const { id, name, status, buy_product_id, buy_quantity, free_product_id, free_quantity } = offer;
  db.prepare(`
    UPDATE offers SET name=?, status=?, buy_product_id=?, buy_quantity=?, free_product_id=?, free_quantity=?
    WHERE id=?
  `).run(name, status, buy_product_id, buy_quantity, free_product_id, free_quantity, id);
  return { message: "Offer updated" };
});

ipcMain.handle("delete-offer", async (event, id) => {
  db.prepare("DELETE FROM offers WHERE id=?").run(id);
  return { message: "Offer deleted" };
});

ipcMain.handle("toggle-offer-status", async (event, { id, status }) => {
  db.prepare("UPDATE offers SET status=? WHERE id=?").run(status, id);
  return { message: "Offer status updated" };
});

// ============================================================
// 🏪 SHOP REGISTRATION & DEVICE PAIRING
// ============================================================

// Check if shop is registered
ipcMain.handle("get-registration-status", async () => {
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");

    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }

    const shopIdValue = settings.shopId || process.env.SHOP_ID;

    if (!shopIdValue) {
      return { isRegistered: false, shopId: "" };
    }

    // CRITICAL: Verify shop still exists in Supabase (may have been deleted by admin)
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('shops').select('id').eq('id', shopIdValue).single();
        // CRITICAL: Only treat confirmed "not found" as deletion, NOT network errors
        const isNotFound = error && (error.code === 'PGRST116' || error.message?.includes('not found') || error.details?.includes('0 rows'));
        if (isNotFound) {
          console.log(`[Registration] Shop ${shopIdValue} CONFIRMED deleted by admin. Clearing local data.`);
          delete settings.shopId;
          fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
          process.env.SHOP_ID = '';
          return { isRegistered: false, shopId: "" };
        }
        if (error) {
          // Network issue — preserve local state, don't wipe
          console.warn(`[Registration] Network error checking shop. Preserving local state.`);
        }
      } catch (e) {
        // Network error - fall through to local check
        console.warn('[Registration] Could not verify shop online:', e.message);
      }
    }

    return { isRegistered: true, shopId: shopIdValue };
  } catch (e) {
    return { isRegistered: false, shopId: "" };
  }
});

// ============================================================
// 📧 EMAIL VERIFICATION (OTP) SYSTEM
// ============================================================

// Check if email already exists in shops table
ipcMain.handle("check-email-exists", async (event, email) => {
  if (!supabase) {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }
    const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
    if (url && key) initSupabase(url, key);
  }
  if (!supabase) return { exists: false };

  try {
    const { data, error } = await supabase
      .from('shops')
      .select('id')
      .eq('owner_email', email.trim().toLowerCase())
      .limit(1);
    if (error) return { exists: false };
    return { exists: data && data.length > 0 };
  } catch (e) {
    return { exists: false };
  }
});

// Send OTP to email (generates locally, sends via Gmail SMTP)
ipcMain.handle("send-otp", async (event, email) => {
  try {
    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(email.trim().toLowerCase(), { code, expiresAt });

    // Send via Gmail
    await sendOtpEmail(email.trim(), code);
    console.log(`[OTP] \u2705 Code sent to ${email}`);
    return { success: true, message: 'Verification code sent to your email.' };
  } catch (e) {
    console.error('[OTP] \u274c Failed:', e.message);
    return { success: false, error: e.message };
  }
});

// Verify OTP (local verification — instant, no network needed)
ipcMain.handle("verify-otp", async (event, { email, code }) => {
  try {
    const stored = otpStore.get(email.trim().toLowerCase());
    if (!stored) {
      return { success: false, error: 'No verification code found. Click Verify Email first.' };
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(email.trim().toLowerCase());
      return { success: false, error: 'Code expired. Please request a new one.' };
    }
    if (stored.code !== code.trim()) {
      return { success: false, error: 'Invalid code. Please check and try again.' };
    }
    // Success
    otpStore.delete(email.trim().toLowerCase());
    console.log(`[OTP] \u2705 Email ${email} verified!`);
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Verification failed: ' + e.message };
  }
});

// Register shop in Supabase → get UUID
ipcMain.handle("register-shop", async (event, data) => {
  const { shopName, ownerName, mobileNumber, email, shopEmail } = data;

  // Get Supabase client  
  const configPath = path.join(app.getPath("userData"), "app_settings.json");
  let settings = {};
  if (fs.existsSync(configPath)) {
    try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
  }

  const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
  const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';

  if (!url || !key || !url.startsWith('http')) {
    return { success: false, error: "Supabase not configured. Please contact support." };
  }

  initSupabase(url, key);
  if (!supabase) {
    return { success: false, error: "Cloud connection failed. Please check internet." };
  }

  try {
    // Generate a local Shop ID (shop-xxxxxxxx format)
    const newShopId = `shop-${uuidv4().slice(0, 8)}`;
    const systemHwid = getMachineId();

    // Create shop in Supabase (status default is disabled — pending admin activation)
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 86400000);
    const { error } = await supabase
      .from("shops")
      .insert({
        id: newShopId,
        owner_name: ownerName,
        owner_email: email, 
        mobile_number: mobileNumber,
        name: shopName,
        shop_email: shopEmail || email,
        master_key: settings.masterKey || "owner123",
        is_active: false,
        is_paid: true, // Initial 30-day subscription is pre-paid
        ever_activated: false,
        activation_requested: true,
        hardware_id: systemHwid,
        registered_at: now.toISOString(),
        validity_start: now.toISOString(),
        validity_end: end.toISOString()
      });

    if (error) {
      console.error("[Register] Supabase error:", error.message);
      return { success: false, error: error.message };
    }

    // Save carefully to local process
    process.env.SHOP_ID = newShopId;

    // \ud83e\uddf9 CLEAN SLATE: Wipe all local data for a fresh start
    try {
      db.prepare('DELETE FROM products').run();
      db.prepare('DELETE FROM invoices').run();
      db.prepare('DELETE FROM invoice_items').run();
      db.prepare('DELETE FROM categories').run();
      db.prepare('DELETE FROM customers').run();
      db.prepare('DELETE FROM held_bills').run();
      db.prepare('DELETE FROM validity_cache').run();
      try { db.prepare('DELETE FROM offers').run(); } catch(e) {}
      try { db.prepare('DELETE FROM shop_supabase_config').run(); } catch(e) {}
      console.log('[Register] \ud83e\uddf9 Local database wiped for clean start.');
    } catch (e) { console.warn('[Register] DB wipe partial:', e.message); }

    // Save FRESH settings (completely replace old ones)
    const freshSettings = {
      shopId: newShopId,
      storeName: shopName,
      ownerName: ownerName,
      ownerEmail: email,
      shopEmail: shopEmail || email,
      ownerMobile: mobileNumber,
      hardwareId: systemHwid,
      supabaseUrl: settings.supabaseUrl,
      supabaseKey: settings.supabaseKey
    };
    fs.writeFileSync(configPath, JSON.stringify(freshSettings, null, 2));

    // Start realtime listener immediately for this new shop
    setupLicenseRealtime(newShopId);
    startControlListener(newShopId);

    console.log("[Register] ✅ Shop registered and pending activation:", newShopId, "HWID:", systemHwid);
    return { success: true, shopId: newShopId, systemId: systemHwid };
  } catch (e) {
    console.error("[Register] Critical error:", e.message);
    return { success: false, error: "System error: " + e.message };
  }
});

// 🟢 LOGIN TO EXISTING SHOP
ipcMain.handle("login-shop", async (event, data) => {
  const { email, masterKey } = data;

  const configPath = path.join(app.getPath("userData"), "app_settings.json");
  let settings = {};
  if (fs.existsSync(configPath)) {
    try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
  }

  const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
  const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';

  initSupabase(url, key);
  if (!supabase) return { success: false, error: "Cloud connection failed." };

  try {
    // Find shop by email and master key
    const { data: shopRecord, error } = await supabase
      .from("shops")
      .select("*")
      .eq("owner_email", email.trim().toLowerCase())
      .eq("master_key", masterKey)
      .single();

    if (error || !shopRecord) {
      return { success: false, error: "Invalid Email or Master Key. Check your credentials." };
    }

    // Save to local storage
    process.env.SHOP_ID = shopRecord.id;
    settings.shopId = shopRecord.id;
    settings.storeName = shopRecord.name;
    settings.ownerName = shopRecord.owner_name;
    settings.ownerEmail = shopRecord.owner_email;
    settings.shopEmail = shopRecord.shop_email || shopRecord.owner_email;
    settings.ownerMobile = shopRecord.mobile_number;
    settings.masterKey = shopRecord.master_key;
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));

    console.log("[Login] Shop linked successfully:", shopRecord.id);
    return { success: true, shopId: shopRecord.id, name: shopRecord.name };
  } catch (e) {
    return { success: false, error: "Authentication failed: " + e.message };
  }
});

ipcMain.handle("request-activation", async () => {
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }

    const shopId = settings.shopId || process.env.SHOP_ID;
    if (!shopId) return { success: false, error: "Shop not identified." };

    if (!supabase) {
      const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
      const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
      initSupabase(url, key);
    }

    // Flag for activation in control plane
    const { error } = await supabase
      .from("shops")
      .update({ 
        activation_requested: true, 
        last_request_at: new Date().toISOString(),
        request_notes: "Owner requested activation from locked terminal."
      })
      .eq("id", shopId);

    if (error) throw error;
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Generate 6-digit pairing code
// Desktop VALIDATES a pairing code (generated by mobile app)
ipcMain.handle("validate-pairing-code", async (event, code) => {
  if (!supabase) {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }
    const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
    if (url && key) initSupabase(url, key);
  }

  if (!supabase) return { success: false, error: "Supabase not connected" };

  // Load shopId directly from setting since .env may not exist in production
  let shopId = process.env.SHOP_ID;
  if (!shopId) {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      try { const s = JSON.parse(fs.readFileSync(configPath, 'utf-8')); shopId = s.shopId; } catch {}
    }
  }
  if (!shopId || shopId.length < 8) return { success: false, error: "Shop not registered" };

  try {
    // Find matching pending code for this shop
    const { data, error } = await supabase
      .from("pairing_codes")
      .select("*")
      .eq("shop_id", shopId)
      .eq("code", code)
      .eq("status", "pending")
      .single();

    if (error || !data) {
      return { success: false, error: "Invalid code. Make sure you generated a new code in the Owner App." };
    }

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
      // Mark as expired
      await supabase.from("pairing_codes").update({ status: "expired" }).eq("id", data.id);
      return { success: false, error: "Code expired. Generate a new one in the Owner App." };
    }

    // Mark code as used
    await supabase
      .from("pairing_codes")
      .update({ status: "used" })
      .eq("id", data.id);

    console.log(`[Pairing] ✅ Code ${code} validated — device paired!`);
    return { success: true, deviceId: data.device_id };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 🟢 LICENSE CHECK (For Admin Dashboard Activation)
ipcMain.handle("get-license-status", async () => {
  const machineId = getMachineId();
  if (!supabase) {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }
    const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
    if (url && key) initSupabase(url, key);
  }

  if (!supabase) return { is_active: true, hwid: machineId, note: "Offline mode or Supabase not connected" };

  try {
    // Priority: settings file (latest) > env var (may be stale from .env)
    let shopId = "";
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      try { const s = JSON.parse(fs.readFileSync(configPath, 'utf-8')); shopId = s.shopId || ""; } catch {}
    }
    if (!shopId) shopId = process.env.SHOP_ID || "";
    
    console.log(`[License] \ud83d\udd0d Checking license for shopId: ${shopId || 'NONE'}`);
    if (!shopId) return { is_active: false, hwid: machineId, note: "Waiting for registration..." };

    const { data: shopRecord, error } = await supabase
      .from("shops")
      .select("is_active, ever_activated")
      .eq("id", shopId)
      .single();

    if (error || !shopRecord) {
      // CRITICAL: Distinguish "not found" (PGRST116) from network errors
      const isNotFound = error && (error.code === 'PGRST116' || error.message?.includes('not found') || error.details?.includes('0 rows'));
      if (isNotFound) {
        console.log(`[License] \ud83d\uddd1\ufe0f Shop ${shopId} CONFIRMED deleted by admin.`);
        const configPath2 = path.join(app.getPath("userData"), "app_settings.json");
        let settings2 = {};
        if (fs.existsSync(configPath2)) {
          try { settings2 = JSON.parse(fs.readFileSync(configPath2, 'utf-8')); } catch {}
        }
        if (settings2.shopId && settings2.shopId === shopId) {
          console.log(`[License] \ud83d\uddd1\ufe0f Clearing local data for deleted shop: ${shopId}`);
          delete settings2.shopId;
          fs.writeFileSync(configPath2, JSON.stringify(settings2, null, 2));
          process.env.SHOP_ID = "";
        }
        return { is_active: false, needsRegistration: true, hwid: machineId, note: "Shop was deleted by admin. Please register again." };
      }
      // Network error — don't wipe, assume last known state
      console.warn(`[License] \u26a0\ufe0f Network error checking shop ${shopId}. Preserving local state.`);
      return { is_active: true, hwid: machineId, note: "Offline mode — could not verify with cloud." };
    }

    if (!shopRecord.is_active) {
      // Distinguish pending (never activated) vs deactivated (was active before)
      const isPending = !shopRecord.ever_activated;
      return { is_active: false, isPending, hwid: machineId, note: isPending ? "Pending activation. Admin has not yet activated this shop." : "Account deactivated by admin." };
    }

    // Shop is active — DO NOT auto-set ever_activated here.
    // ever_activated should ONLY be set by the Admin Panel when they click Activate.

    console.log(`[License] ✅ Shop ${shopId} is active!`);
    return { is_active: true, hwid: machineId };
  } catch (e) {
    return { is_active: true, hwid: machineId, note: "Sync issue: " + e.message };
  }
});

// Check pairing status
ipcMain.handle("get-pairing-status", async (event, code) => {
  if (!supabase) return { status: "unknown" };

  try {
    let shopId = process.env.SHOP_ID || "";
    if (!shopId) {
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      if (fs.existsSync(configPath)) {
        try { const s = JSON.parse(fs.readFileSync(configPath, 'utf-8')); shopId = s.shopId || ""; } catch {}
      }
    }
    const { data, error } = await supabase
      .from("pairing_codes")
      .select("status, device_id, user_id")
      .eq("shop_id", shopId)
      .eq("code", code)
      .single();

    if (error || !data) return { status: "unknown" };
    return { status: data.status, deviceId: data.device_id, userId: data.user_id };
  } catch {
    return { status: "unknown" };
  }
});

// ============================================================
// 🔗 SHOP SUPABASE CONNECTION (Separate DB per shop)
// ============================================================

// Save shop Supabase credentials
ipcMain.handle("save-shop-supabase", async (event, { url, key }) => {
  try {
    // ⚠️ VALIDATION: Reject global control-plane URL as individual shop DB
    const globalUrl = process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    if (url === globalUrl || url.includes('baawqrqihlhsrghvjlpx')) {
      return { 
        success: false, 
        error: 'This is the Global Control Plane URL — it cannot be used as a Shop Supabase. Please create a SEPARATE Supabase project for this shop.' 
      };
    }

    // Clear existing config
    db.prepare('DELETE FROM shop_supabase_config').run();
    // Insert new config
    db.prepare('INSERT INTO shop_supabase_config (supabase_url, supabase_key, is_connected) VALUES (?, ?, 1)').run(url, key);
    initShopSupabase(url, key);

    // 🔄 CRITICAL: Reset ALL sync flags so everything gets pushed to the NEW Supabase
    db.prepare('UPDATE products SET is_synced = 0').run();
    db.prepare('UPDATE invoices SET is_synced = 0').run();
    db.prepare('UPDATE customers SET is_synced = 0').run();
    try { db.prepare('UPDATE held_bills SET is_synced = 0').run(); } catch(e) {}
    try { db.prepare('UPDATE offers SET is_synced = 0').run(); } catch(e) {}
    try { db.prepare('UPDATE notifications SET is_synced = 0').run(); } catch(e) {}
    console.log('[ShopDB] 🔄 All sync flags reset for new Supabase connection');

    // 🚀 Trigger immediate full sync to the new Supabase
    setImmediate(async () => {
      try {
        await syncToShopSupabase();
        console.log('[ShopDB] ✅ Initial sync to new Supabase complete!');
      } catch(e) { console.error('[ShopDB] Initial sync error:', e.message); }
    });

    // Also save to admin Supabase for reference
    if (supabase) {
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      let settings = {};
      if (fs.existsSync(configPath)) {
        try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
      }
      const shopId = settings.shopId || process.env.SHOP_ID;
      if (shopId) {
        await supabase.from('shops').update({
          shop_supabase_url: url,
          shop_supabase_key: key
        }).eq('id', shopId);
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Get shop Supabase config
ipcMain.handle("get-shop-supabase", async () => {
  try {
    const config = db.prepare('SELECT * FROM shop_supabase_config ORDER BY id DESC LIMIT 1').get();
    return config || null;
  } catch (e) {
    return null;
  }
});

// Test shop Supabase connection
ipcMain.handle("test-shop-connection", async (event, { url, key }) => {
  try {
    const testClient = createClient(url, key);
    // Try to list tables or read from a table
    const { data, error } = await testClient.from('products').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = table not found, which is OK for a fresh database
      return { success: false, error: error.message };
    }
    return { success: true, message: 'Connection successful!' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Manual sync trigger
ipcMain.handle("sync-shop-data", async () => {
  if (!shopSupabase) return { success: false, error: 'Shop Supabase not connected. Enter URL and Key first.' };
  try {
    // Mark all records as unsynced to force full sync
    db.prepare('UPDATE products SET is_synced = 0').run();
    db.prepare('UPDATE invoices SET is_synced = 0').run();
    db.prepare('UPDATE customers SET is_synced = 0').run();
    await syncToShopSupabase();
    return { success: true, message: 'Data synced successfully!' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Restore data from shop's Supabase
ipcMain.handle("restore-from-cloud", async () => {
  if (!shopSupabase) return { success: false, error: 'Shop Supabase not connected. Enter URL and Key first.' };
  try {
    const result = await restoreFromShopSupabase();
    return { success: true, message: `Restored: ${result.products} products, ${result.invoices} invoices, ${result.customers} customers`, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ============================================================
// 💾 LOCAL DATABASE PATH CONFIGURATION
// ============================================================

ipcMain.handle("save-local-db-path", async (event, storagePath) => {
  try {
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
    
    // Save to app_settings.json so db.js finds it next time
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let settings = {};
    if (fs.existsSync(configPath)) settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    const oldPath = settings.localDbPath;
    settings.localDbPath = storagePath;
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));

    // Move existing DB if it's not already there
    const fileName = "billing.db";
    const currentDbPath = oldPath ? path.join(oldPath, fileName) : path.join(app.getPath("userData"), fileName);
    const targetDbPath = path.join(storagePath, fileName);

    if (fs.existsSync(currentDbPath) && currentDbPath !== targetDbPath) {
      try {
        // Better-sqlite3 might have it locked, so we copy then recommend restart
        fs.copyFileSync(currentDbPath, targetDbPath);
      } catch (e) {
        console.error("Failed to move active DB file:", e.message);
      }
    }

    return { success: true, message: `Storage path set to: ${storagePath}. Please RESTART the application to apply changes.` };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("get-local-db-path", async () => {
  try {
    const config = db.prepare('SELECT * FROM local_db_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
    return config ? config.storage_path : '';
  } catch (e) {
    return '';
  }
});

ipcMain.handle("browse-folder", async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Local Database Storage Folder'
    });
    if (result.canceled || !result.filePaths.length) return '';
    return result.filePaths[0];
  } catch (e) {
    return '';
  }
});

// ============================================================
// ⏳ VALIDITY / SUBSCRIPTION SYSTEM
// ============================================================

ipcMain.handle("get-validity", async () => {
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }
    const shopId = settings.shopId || process.env.SHOP_ID;
    
    const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
    
    // Use initSupabase to avoid recreating client and breaking realtime subscriptions
    if (!supabase && url && key) {
      initSupabase(url, key);
    }
    // If still no client, force create one for this query only
    if (!supabase && url && key) {
      supabase = createClient(url, key);
    }

    console.log(`[Validity] 📋 Checking shopId: ${shopId || 'NONE'}, supabase: ${!!supabase}`);

    if (!shopId) return { valid: false, isActive: false, isPending: false, daysLeft: 0 };

    return await checkValidity(shopId);
  } catch (e) {
    console.error('[Validity] ❌ Handler error:', e.message);
    return { valid: true, daysLeft: 0, isActive: false, note: 'Error: ' + e.message };
  }
});

// ── MONTHLY TAX REPORT ──
ipcMain.handle("get-tax-report", async (event, { year, month }) => {
  try {
    // month is 1-indexed (1=Jan, 12=Dec)
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    // Total invoices for the month
    const invoices = db.prepare(`
      SELECT id, bill_no, bill_date, customer_name, total_amount, payment_mode, created_at
      FROM invoices 
      WHERE date(created_at, 'localtime') >= ? AND date(created_at, 'localtime') < ?
      ORDER BY created_at ASC
    `).all(startDate, endDate);

    // Tax breakdown by GST rate
    const taxBreakdown = db.prepare(`
      SELECT 
        ii.gst_rate,
        COUNT(*) as item_count,
        COUNT(DISTINCT ii.invoice_id) as invoice_count,
        COALESCE(SUM(ii.price * ii.quantity), 0) as taxable_amount,
        COALESCE(SUM(ii.gst_amount), 0) as total_tax,
        COALESCE(SUM(ii.price * ii.quantity + ii.gst_amount), 0) as total_with_tax
      FROM invoice_items ii
      JOIN invoices inv ON ii.invoice_id = inv.id
      WHERE date(inv.created_at, 'localtime') >= ? AND date(inv.created_at, 'localtime') < ?
      GROUP BY ii.gst_rate
      ORDER BY ii.gst_rate ASC
    `).all(startDate, endDate);

    // Totals
    const totals = db.prepare(`
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(ii_tax), 0) as total_tax
      FROM invoices inv
      LEFT JOIN (
        SELECT invoice_id, SUM(gst_amount) as ii_tax 
        FROM invoice_items GROUP BY invoice_id
      ) tax ON tax.invoice_id = inv.id
      WHERE date(inv.created_at, 'localtime') >= ? AND date(inv.created_at, 'localtime') < ?
    `).get(startDate, endDate);

    // Payment mode breakdown
    const paymentModes = db.prepare(`
      SELECT payment_mode, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
      FROM invoices
      WHERE date(created_at, 'localtime') >= ? AND date(created_at, 'localtime') < ?
      GROUP BY payment_mode
    `).all(startDate, endDate);

    // Daily summary
    const dailySummary = db.prepare(`
      SELECT 
        date(created_at, 'localtime') as day,
        COUNT(*) as bills,
        COALESCE(SUM(total_amount), 0) as sales
      FROM invoices
      WHERE date(created_at, 'localtime') >= ? AND date(created_at, 'localtime') < ?
      GROUP BY day ORDER BY day ASC
    `).all(startDate, endDate);

    // Shop details from settings
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let shopDetails = {};
    if (fs.existsSync(configPath)) {
      try { shopDetails = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
    }

    return {
      success: true,
      year, month,
      shop: {
        name: shopDetails.storeName || '',
        address: shopDetails.storeAddress || '',
        phone: shopDetails.storePhone || shopDetails.ownerMobile || '',
        gstNumber: shopDetails.gstNumber || '',
        ownerName: shopDetails.ownerName || '',
        email: shopDetails.ownerEmail || ''
      },
      totals: {
        totalInvoices: totals.total_invoices,
        totalSales: totals.total_sales,
        totalTax: totals.total_tax,
        netSales: totals.total_sales - totals.total_tax
      },
      taxBreakdown,
      paymentModes,
      dailySummary,
      invoices: invoices.slice(0, 500) // Limit for performance
    };
  } catch (e) {
    console.error('[TaxReport] Error:', e.message);
    return { success: false, error: e.message };
  }
});
