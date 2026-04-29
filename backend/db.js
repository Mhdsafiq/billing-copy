/**
 * INNOAIVATORS Smart Billing — Database Layer
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

let db;
let dbPath;

const getSettingsFilePaths = () => {
    const paths = [];
    try {
        if (app) paths.push(path.join(app.getPath("userData"), "app_settings.json"));
    } catch(e) {}
    if (process.env.APPDATA) paths.push(path.join(process.env.APPDATA, "innoaivators-billing", "app_settings.json"));
    paths.push(path.join(__dirname, "app_settings.json"));
    paths.push(path.join(process.cwd(), "app_settings.json"));
    return paths;
};

const getPersistedSettings = () => {
    const paths = getSettingsFilePaths();
    for (const p of paths) {
        if (fs.existsSync(p)) {
            try {
                const data = JSON.parse(fs.readFileSync(p, "utf8"));
                if (data && (data.localDbPath || data.shopId)) return data;
            } catch (e) {}
        }
    }
    return null;
};

const initDB = () => {
    const settings = getPersistedSettings();
    let folder = "";

    try {
        const docs = app.getPath("documents");
        const baseDir = path.join(docs, "Innoaivators Billing");

        // ── Real-world safe: scan for ANY existing billing.db first ──
        // If one already exists (even if storeName changed), use it.
        // Only create a new folder on fresh install.
        let foundExisting = false;
        if (fs.existsSync(baseDir)) {
            const subFolders = fs.readdirSync(baseDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);
            for (const sub of subFolders) {
                const candidate = path.join(baseDir, sub, "billing.db");
                if (fs.existsSync(candidate)) {
                    folder = path.join(baseDir, sub);
                    foundExisting = true;
                    break;
                }
            }
        }

        // Fresh install — create folder with storeName
        if (!foundExisting) {
            const storeFolderName = (settings && settings.storeName) 
                ? settings.storeName.replace(/[<>:"/\\|?*]/g, '') // sanitize
                : "My Store";
            folder = path.join(baseDir, storeFolderName);
        }

    } catch (e) {
        folder = path.join(__dirname, "shops");
    }

    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    
    dbPath = path.join(folder, "billing.db");
    console.log(`[DB] 🎯 Targeted path for user: ${dbPath}`);
    
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

    // 1. Full Schema Initialization
    db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            gst DECIMAL(5,2) DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category_id INTEGER,
            category_name TEXT,
            price DECIMAL(12,2) NOT NULL,
            cost_price DECIMAL(12,2) DEFAULT 0,
            quantity DECIMAL(12,2) DEFAULT 0,
            unit TEXT DEFAULT 'pcs',
            barcode TEXT,
            product_code TEXT,
            price_type TEXT DEFAULT 'exclusive',
            default_discount DECIMAL(5,2) DEFAULT 0,
            weight TEXT,
            product_type TEXT DEFAULT 'packaged',
            brand TEXT,
            gst_rate DECIMAL(5,2) DEFAULT 0,
            expiry_date TEXT,
            image TEXT,
            is_synced INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(category_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            phone TEXT UNIQUE,
            address TEXT,
            points INTEGER DEFAULT 0,
            is_synced INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_no TEXT,
            bill_date TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            customer_address TEXT,
            customer_id INTEGER,
            payment_mode TEXT,
            total_amount DECIMAL(12,2),
            is_synced INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(customer_id) REFERENCES customers(id)
        );

        CREATE TABLE IF NOT EXISTS invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER,
            product_id INTEGER,
            quantity DECIMAL(12,2),
            price DECIMAL(12,2),
            gst_rate DECIMAL(5,2),
            gst_amount DECIMAL(12,2),
            hsn_code TEXT,
            discount_percent DECIMAL(5,2) DEFAULT 0,
            discount_amount DECIMAL(12,2) DEFAULT 0,
            FOREIGN KEY(invoice_id) REFERENCES invoices(id),
            FOREIGN KEY(product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS offers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          type TEXT,
          value DECIMAL(12,2),
          min_amount DECIMAL(12,2),
          buy_product_id INTEGER,
          free_product_id INTEGER,
          buy_qty INTEGER DEFAULT 0,
          free_qty INTEGER DEFAULT 0,
          start_date TEXT,
          end_date TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS held_bills (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT,
          cart_json TEXT,
          customer_json TEXT,
          is_synced INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS shop_supabase_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supabase_url TEXT,
            supabase_key TEXT,
            is_connected INTEGER DEFAULT 0,
            last_synced TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT,
          message TEXT,
          type TEXT,
          is_read INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS validity_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          validity_end TEXT,
          is_paid INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 0,
          ever_activated INTEGER DEFAULT 0,
          cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Self-Healing Migrations
    const migrate = (t, c, d) => {
        try {
            const info = db.prepare(`PRAGMA table_info(${t})`).all();
            if (!info.some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`);
        } catch (e) {}
    };

    migrate('products', 'gst_rate', 'DECIMAL(5,2) DEFAULT 0');
    migrate('products', 'product_code', 'TEXT');
    migrate('products', 'price_type', "TEXT DEFAULT 'exclusive'");
    migrate('products', 'default_discount', 'DECIMAL(5,2) DEFAULT 0');
    migrate('products', 'weight', 'TEXT');
    migrate('products', 'product_type', "TEXT DEFAULT 'packaged'");
    migrate('products', 'stock_unit', 'TEXT');
    migrate('products', 'brand', 'TEXT');
    migrate('products', 'category_name', 'TEXT');
    migrate('customers', 'is_synced', 'INTEGER DEFAULT 0');
    migrate('invoice_items', 'discount_percent', 'DECIMAL(5,2) DEFAULT 0');
    migrate('invoice_items', 'discount_amount', 'DECIMAL(12,2) DEFAULT 0');
    // 🔄 held_bills — upgrade old schema to new one
    migrate('held_bills', 'label', 'TEXT');
    migrate('held_bills', 'cart_json', 'TEXT');
    migrate('held_bills', 'customer_json', 'TEXT');
    migrate('held_bills', 'is_synced', 'INTEGER DEFAULT 0');
    
    // offers — add new fields
    migrate('offers', 'status', 'INTEGER DEFAULT 1');
    migrate('offers', 'buy_quantity', 'INTEGER DEFAULT 0');
    migrate('offers', 'free_quantity', 'INTEGER DEFAULT 0');
    migrate('offers', 'is_synced', 'INTEGER DEFAULT 0');

    // notifications — sync status
    migrate('notifications', 'is_synced', 'INTEGER DEFAULT 0');

    // invoices — add bill_no as INTEGER (was TEXT in old schema)
    migrate('invoices', 'bill_no', 'INTEGER');


    // NOTE: shop_supabase_config is ONLY populated when admin explicitly sets
    // an individual shop Supabase URL via the Settings → Cloud Sync screen.
    // DO NOT auto-populate from SUPABASE_URL (that is the GLOBAL control plane,
    // NOT an individual shop DB). Auto-populating caused ALL shops' billing data
    // to mix in the shared global database.
    console.log("[DB] ✅ Schema ready. Shop cloud config must be set via Settings.");

    return db;
};

module.exports = initDB();
module.exports.getDbPath = () => dbPath;