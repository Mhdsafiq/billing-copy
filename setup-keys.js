const fs = require('fs');
const path = require('path');

// Red paths relative to root
const envPath = path.join(__dirname, '.env');
const adminPath = path.join(__dirname, 'admin-panel', 'public', 'index.html');
const mobilePath = path.join(__dirname, 'owner-app', 'App.js');

function updateKeys() {
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env file not found in root!");
    return;
  }

  // 1. Read .env
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const urlMatch = envContent.match(/SUPABASE_URL\s*=\s*(.*)/);
  const keyMatch = envContent.match(/SUPABASE_KEY\s*=\s*(.*)/);

  if (!urlMatch || !keyMatch) {
    console.error("❌ Could not find SUPABASE_URL or SUPABASE_KEY in .env");
    return;
  }

  const url = urlMatch[1].trim().replace(/['"]/g, '');
  const key = keyMatch[1].trim().replace(/['"]/g, '');

  console.log(`📡 Found Credentials for: ${url.slice(0, 20)}...`);

  // 2. Update Admin Panel
  if (fs.existsSync(adminPath)) {
    let adminContent = fs.readFileSync(adminPath, 'utf-8');
    adminContent = adminContent.replace(/const SUPABASE_URL = '.*';/, `const SUPABASE_URL = '${url}';`);
    adminContent = adminContent.replace(/const SUPABASE_KEY = '.*';/, `const SUPABASE_KEY = '${key}';`);
    fs.writeFileSync(adminPath, adminContent);
    console.log("✅ Updated Admin Panel index.html");
  }

  // 3. Update Mobile App
  if (fs.existsSync(mobilePath)) {
    let mobileContent = fs.readFileSync(mobilePath, 'utf-8');
    mobileContent = mobileContent.replace(/const SUPABASE_URL = '.*';/, `const SUPABASE_URL = '${url}';`);
    mobileContent = mobileContent.replace(/const SUPABASE_KEY = '.*';/, `const SUPABASE_KEY = '${key}';`);
    fs.writeFileSync(mobilePath, mobileContent);
    console.log("✅ Updated Mobile App App.js");
  }

  console.log("\n🚀 All keys synced from .env! You can now deploy and build without manual editing.");
}

updateKeys();
