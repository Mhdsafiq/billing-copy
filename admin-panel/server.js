const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('better-sqlite3');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = 4000;
const JWT_SECRET = 'iva_admin_super_secret_2026';

// ── SUPABASE CLIENT ──
const getSupabase = () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) {
        throw new Error("Supabase URL and Key are required in .env");
    }
    return createClient(url, key);
};

// ── AUTH MIDDLEWARE ──
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminId = decoded.adminId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ── ROUTES: AUTH ──

// Login using SaaS Control Plane
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const supabase = getSupabase();
    // In our V3 schema, admins are in the public.admins table
    const { data: admin, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !admin || password !== admin.password_hash) {
      return res.status(401).json({ error: 'Invalid administrative credentials' });
    }

    const token = jwt.sign({ adminId: admin.id }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ success: true, token, email: admin.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── ROUTES: SHOPS ──

app.get('/api/shops', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: shops, error } = await supabase
      .from('shops')
      .select('*, shop_stats(updated_at, stats_json)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(shops);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Shop Status (Activate / Deactivate)
app.post('/api/shops/:id/toggle', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const supabase = getSupabase();
    
    // 🔥 If activating a shop — auto-renew if unpaid, and mark ever_activated
    if (is_active) {
       const { data: current } = await supabase.from('shops').select('is_paid').eq('id', id).single();
       if (current && !current.is_paid) {
          const now = new Date();
          const end = new Date(now.getTime() + 30 * 86400000);
          await supabase.from('shops').update({ 
            is_active: true,
            is_paid: true, 
            ever_activated: true,
            activation_requested: false,
            validity_start: now.toISOString(),
            validity_end: end.toISOString(),
            payment_status: 'paid',
            software_status: 'active'
          }).eq('id', id);
          return res.json({ success: true, note: "First-time activation: Payment toggled ON & 30 days renewed." });
       } else {
          // Already paid — just activate and mark ever_activated
          const { error } = await supabase
            .from('shops')
            .update({ 
              is_active: true, 
              ever_activated: true,
              activation_requested: false,
              software_status: 'active' 
            })
            .eq('id', id);
          if (error) throw error;
          return res.json({ success: true });
       }
    }

    // Deactivate
    const { error } = await supabase
      .from('shops')
      .update({ is_active: false, software_status: 'deactivated' })
      .eq('id', id);
      
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Toggle Payment Status & Renew Validity
app.post('/api/shops/:id/toggle-payment', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_paid } = req.body;
    const supabase = getSupabase();
    
    if (is_paid) {
      // Renew for 30 days
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 86400000);
      const { error } = await supabase
        .from('shops')
        .update({ 
          is_paid: true, 
          is_active: true,
          validity_start: now.toISOString(),
          validity_end: end.toISOString()
        })
        .eq('id', id);
      if (error) throw error;
      res.json({ success: true, validity_end: end.toISOString() });
    } else {
      const { error } = await supabase
        .from('shops')
        .update({ is_paid: false })
        .eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Validity Info for a specific shop
app.get('/api/shops/:id/validity', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('shops')
      .select('is_active, is_paid, validity_start, validity_end')
      .eq('id', id)
      .single();
    if (error) throw error;
    
    const now = new Date();
    const end = data.validity_end ? new Date(data.validity_end) : null;
    const daysLeft = end ? Math.ceil((end - now) / 86400000) : null;
    
    res.json({ 
      ...data, 
      daysLeft: daysLeft !== null ? Math.max(0, daysLeft) : null,
      warningPhase: daysLeft !== null && daysLeft <= 7 && daysLeft > 0,
      expired: daysLeft !== null && daysLeft <= 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE Validity Days ──
app.post('/api/shops/:id/update-validity', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { days } = req.body;
    if (typeof days !== 'number' || days < 0) {
      return res.status(400).json({ error: 'Invalid days value' });
    }
    const supabase = getSupabase();
    const now = new Date();
    const newEnd = new Date(now.getTime() + days * 86400000);
    const { error } = await supabase
      .from('shops')
      .update({
        validity_start: now.toISOString(),
        validity_end: newEnd.toISOString()
      })
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true, validity_end: newEnd.toISOString(), days });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE Shop + Owner Account ──
app.delete('/api/shops/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    
    // 1. Get shop details (owner email for auth cleanup)
    const { data: shop, error: fetchErr } = await supabase
      .from('shops')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchErr || !shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const ownerEmail = shop.owner_email;
    
    // 2. Delete shop — CASCADE handles: shop_stats, pairing_codes, paired_devices, invoices, products, notifications
    const { error: delErr } = await supabase
      .from('shops')
      .delete()
      .eq('id', id);
    
    if (delErr) throw delErr;
    
    // 3. Try to delete owner's Supabase Auth account (needs service_role key)
    let authDeleted = false;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && ownerEmail) {
      try {
        const adminSb = createClient(process.env.SUPABASE_URL, serviceKey);
        const { data: { users } } = await adminSb.auth.admin.listUsers();
        const authUser = users.find(u => u.email === ownerEmail);
        if (authUser) {
          await adminSb.auth.admin.deleteUser(authUser.id);
          authDeleted = true;
          console.log(`✅ Auth user ${ownerEmail} deleted`);
        }
      } catch (authErr) {
        console.warn(`⚠️ Could not delete auth user ${ownerEmail}:`, authErr.message);
      }
    }
    // 4. Wipe individual shop Supabase DB (Data Plane)
    if (shop.shop_supabase_url && shop.shop_supabase_key) {
      try {
        const shopClient = createClient(shop.shop_supabase_url, shop.shop_supabase_key);
        await Promise.all([
          shopClient.from('invoice_items').delete().neq('id', 0),
          shopClient.from('invoices').delete().neq('id', 0),
          shopClient.from('products').delete().neq('id', 0),
          shopClient.from('categories').delete().neq('id', 0),
          shopClient.from('customers').delete().neq('id', 0),
          shopClient.from('held_bills').delete().neq('id', 0),
          shopClient.from('offers').delete().neq('id', 0),
          shopClient.from('shop_settings').delete().neq('id', 0)
        ]);
        console.log(`🧹 Wiped individual Shop Database for ${shop.name}`);
      } catch (shopDbErr) {
        console.warn(`⚠️ Could not wipe individual database for ${shop.name}:`, shopDbErr.message);
      }
    }
    
    console.log(`🗑️ Shop ${shop.name} (${id}) deleted completely from Control Plane and Data Plane`);
    res.json({ 
      success: true, 
      message: `Shop "${shop.name}" and all data deleted`,
      authDeleted,
      ownerEmail
    });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get comprehensive analytics across all shops
app.get('/api/analytics', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: shops, error } = await supabase.from('shops').select('id, is_active');
    if (error) throw error;
    
    const { data: stats } = await supabase.from('shop_stats').select('stats_json');
    
    let totalRevenue = 0;
    let totalBills = 0;
    
    stats?.forEach(s => {
      if (s.stats_json?.overallSales) totalRevenue += Number(s.stats_json.overallSales);
      if (s.stats_json?.overallBills) totalBills += Number(s.stats_json.overallBills);
    });

    res.json({
      totalShops: shops.length,
      activeShops: shops.filter(s => s.is_active).length,
      totalRevenue,
      totalBills
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Admin Panel Backend running on http://localhost:${PORT}`);
});
