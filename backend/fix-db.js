const Database = require('better-sqlite3');
const path = require('path');

const dbPath = "C:\\Users\\Mohammed Safiq\\Documents\\Innoaivators Billing\\Ajith store\\billing.db";
console.log("Opening DB at:", dbPath);

try {
    const db = new Database(dbPath);
    console.log("Checking products table...");
    const info = db.prepare("PRAGMA table_info(products)").all();
    const hasCol = info.some(c => c.name === 'category_name');
    
    if (!hasCol) {
        console.log("Adding category_name column...");
        db.exec("ALTER TABLE products ADD COLUMN category_name TEXT;");
        console.log("Column added successfully!");
    } else {
        console.log("Column already exists.");
    }
    db.close();
} catch (e) {
    console.error("Error:", e.message);
}
