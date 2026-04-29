import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

let RNWebView = null;
if (Platform.OS !== 'web') {
  try {
    RNWebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn("WebView not available");
  }
}

/* ── CONFIGURATION (MASTER CONTROL PLANE) ── */
const GLOBAL_URL = 'https://baawqrqihlhsrghvjlpx.supabase.co';
const GLOBAL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';

const Store = {
  get(k) { try { return Platform.OS === 'web' ? localStorage.getItem(k) : null; } catch { return null; } },
  set(k, v) { try { if (Platform.OS === 'web') localStorage.setItem(k, v); } catch { } },
  del(k) { try { if (Platform.OS === 'web') localStorage.removeItem(k); } catch { } },
};

const Label = ({ children }) => <Text style={styles.l}>{children}</Text>;
const ErrBox = ({ msg }) => <Text style={styles.eb}>⚠️ {msg}</Text>;
const SuccessBox = ({ msg }) => <Text style={styles.sb}>✅ {msg}</Text>;

// ── PASSWORD INPUT COMPONENT (Defined outside to prevent losing focus during re-renders) ──
const PasswordInput = ({ value, onChangeText, show, onToggle, placeholder, style }) => (
  <View style={{ position: 'relative' }}>
    <TextInput
      style={[style, { paddingRight: 50 }]}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!show}
      placeholderTextColor="#444"
      placeholder={placeholder || '••••••••'}
    />
    <TouchableOpacity
      onPress={onToggle}
      style={{ position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' }}
    >
      <Text style={{ fontSize: 18 }}>{show ? '🙈' : '👁️'}</Text>
    </TouchableOpacity>
  </View>
);

export default function App() {
  // ── SCREENS: loading | register | login | shopId | pairing | forgotEmail | resetVerify | dashboard ──
  const [screen, setScreen] = useState('loading');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Auth fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [shopIdInput, setShopIdInput] = useState('');
  const [pairingCode, setPairingCode] = useState('');

  // Forgot password
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [resetShopId, setResetShopId] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);

  // Dashboard
  const [session, setSession] = useState({ id: null, url: null, key: null });
  const [dashData, setDashData] = useState({ s: {}, ts: '', sh: {} });
  const [dashLoading, setDashLoading] = useState(false);

  const pollRef = useRef(null);

  // ── INIT: Check if already paired ──
  useEffect(() => {
    const init = async () => {
      try {
        const paired = Store.get('iva_paired');
        const sid = Store.get('iva_shop_id');
        const sUrl = Store.get('iva_shop_url');
        const sKey = Store.get('iva_shop_key');
        
        console.log("[Init] Paired:", paired, "SID:", sid);

        if (paired === 'true' && sid) {
          setSession({ id: sid, url: sUrl || null, key: sKey || null });
          setScreen('dashboard');
        } else {
          setScreen('register');
        }
      } catch (e) {
        console.error("[Init] Error:", e);
        setScreen('register');
      }
    };
    init();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── DASHBOARD DATA FETCH ──
  const fetchDashboardData = async () => {
    if (!session.id) {
      setDashLoading(false); 
      return;
    }
    
    // ⏱️ Fail-safe: if network hangs, stop spinner after 5s
    const timer = setTimeout(() => {
      console.log("[Dashboard] Loading timeout reached — forcing render");
      setDashLoading(false);
    }, 5000);

    try {
      setDashLoading(true);
      console.log("[Dashboard] Fetching from:", GLOBAL_URL);
      const statsRes = await fetch(`${GLOBAL_URL}/rest/v1/shop_stats?shop_id=eq.${session.id}&select=stats_json,updated_at`, {
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
      });
      const statsJson = await statsRes.json();
      
      const shopRes = await fetch(`${GLOBAL_URL}/rest/v1/shops?id=eq.${session.id}`, {
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
      });
      const shopData = await shopRes.json();
      
      setDashData({
        s: statsJson?.[0]?.stats_json || {},
        ts: statsJson?.[0]?.updated_at || '',
        sh: shopData?.[0] || { id: session.id }
      });
      setDashLoading(false);
      clearTimeout(timer);
    } catch (e) { 
      console.error("[Dashboard] Fetch Error:", e);
      setDashLoading(false); 
      clearTimeout(timer);
    }
  };

  useEffect(() => {
    if (screen === 'dashboard' && session.id) {
      let handleMsg = null;
      if (Platform.OS === 'web') {
        handleMsg = (e) => {
          if (e.data === 'logout') {
            if (confirm("End this session?")) {
              Store.del('iva_paired'); Store.del('iva_shop_id'); Store.del('iva_shop_url'); Store.del('iva_shop_key'); 
              setScreen('register');
            }
          }
        };
        window.addEventListener('message', handleMsg);
      }
      
      fetchDashboardData();
      const interval = setInterval(fetchDashboardData, 120000);
      
      return () => {
        clearInterval(interval);
        if (Platform.OS === 'web' && handleMsg) {
          window.removeEventListener('message', handleMsg);
        }
      };
    }
  }, [screen, session]);

  // ══════════════════════════════════════════════
  // ── AUTH HANDLERS ──
  // ══════════════════════════════════════════════

  // ── REGISTER: Find existing shop by email, save credentials ──
  const handleRegister = async () => {
    if (!fullName || !email || !password) { setError('All fields are required'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters'); return; }
    setLoading(true); setError('');
    try {
      // Check if shop exists with this email
      const res = await fetch(`${GLOBAL_URL}/rest/v1/shops?or=(owner_email.eq.${email.trim().toLowerCase()},shop_email.eq.${email.trim().toLowerCase()})`, {
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
      });
      const shops = await res.json();

      if (shops && shops.length > 0) {
        const shop = shops[0];

        // 🛡️ SECURITY: Prevent registering an already registered & paired email
        // Scan ALL shops linked to this email. If any are already registered (key !== default), block registration.
        const alreadyRegistered = shops.find(s => s.master_key !== 'owner123');
        if (alreadyRegistered) {
            setError('This email is already registered. Please Login.');
            setLoading(false);
            return;
        }

        // Shop found (newly created from desktop) — update master_key and owner_name
        await fetch(`${GLOBAL_URL}/rest/v1/shops?id=eq.${shop.id}`, {
          method: 'PATCH',
          headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ master_key: password, owner_name: fullName })
        });
        
        // Registration ALWAYS goes to Pair Key page (pairing is mandatory on first setup)
        Store.set('iva_email', email.trim().toLowerCase());
        setShopIdInput(shop.id);
        setSuccess('Account created! Now pair with your desktop.');
        setScreen('shopId');
      } else {
        setError('No shop found with this email. Please register from the Desktop application first.');
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ── LOGIN: Email + Password → Direct to dashboard ──
  const handleLogin = async () => {
    if (!email || !password) { setError('Enter email and password'); return; }
    setLoading(true); setError('');
    try {
      // Try owner_email first
      const encodedEmail = encodeURIComponent(email.trim().toLowerCase());
      const encodedPwd = encodeURIComponent(password);
      
      let res = await fetch(`${GLOBAL_URL}/rest/v1/shops?owner_email=eq.${encodedEmail}&master_key=eq.${encodedPwd}`, {
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
      });
      let users = await res.json();
      
      // Try shop_email if not found (users might be an error object if not ok, so check length)
      if (!users || !Array.isArray(users) || users.length === 0) {
        res = await fetch(`${GLOBAL_URL}/rest/v1/shops?shop_email=eq.${encodedEmail}&master_key=eq.${encodedPwd}`, {
          headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
        });
        users = await res.json();
      }

      if (Array.isArray(users) && users.length > 0) {
        const shop = users[0];
        
        // Login strictly skips the pairing page and goes straight to dashboard
        Store.set('iva_shop_id', shop.id);
        Store.set('iva_shop_url', shop.shop_supabase_url || '');
        Store.set('iva_shop_key', shop.shop_supabase_key || '');
        Store.set('iva_paired', 'true');
        Store.set('iva_email', email.trim().toLowerCase());
        
        setDashData({ s: {}, ts: '', sh: shop });
        setSession({ id: shop.id, url: shop.shop_supabase_url || null, key: shop.shop_supabase_key || null });
        setScreen('dashboard');
      } else {
        setError('Invalid email or password');
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ── PAIRING: Generate code, wait for desktop approval ──
  const generatePairingCode = async () => {
    if (!shopIdInput) { setError('Enter Shop ID'); return; }
    setLoading(true); setError('');
    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await fetch(`${GLOBAL_URL}/rest/v1/pairing_codes`, {
        method: 'POST',
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopIdInput.trim(), code, status: 'pending', expires_at: new Date(Date.now() + 600000).toISOString() })
      });
      setPairingCode(code); setScreen('pairing');
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const res = await fetch(`${GLOBAL_URL}/rest/v1/pairing_codes?shop_id=eq.${shopIdInput.trim()}&code=eq.${code}&status=eq.used`, {
          headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
        });
        const done = await res.json();
        if (done && done.length > 0) { clearInterval(pollRef.current); completePairing(shopIdInput.trim()); }
      }, 3000);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const completePairing = async (sid) => {
    try {
      const res = await fetch(`${GLOBAL_URL}/rest/v1/shops?id=eq.${sid}`, { headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` } });
      const shop = (await res.json())[0];
      if (shop.shop_supabase_url && shop.shop_supabase_key) {
        await Store.set('iva_shop_id', shop.id);
        await Store.set('iva_shop_url', shop.shop_supabase_url);
        await Store.set('iva_shop_key', shop.shop_supabase_key);
        await Store.set('iva_paired', 'true');
        
        setDashData({ s: {}, ts: '', sh: shop });
        setSession({ id: shop.id, url: shop.shop_supabase_url, key: shop.shop_supabase_key });
        setScreen('dashboard');
      } else {
        await Store.set('iva_shop_id', shop.id);
        await Store.set('iva_paired', 'true');
        setDashData({ s: {}, ts: '', sh: shop });
        setSession({ id: shop.id, url: null, key: null });
        setScreen('dashboard');
      }
    } catch (e) { setError(e.message); }
  };

  // ── FORGOT PASSWORD ──
  const handleForgotPassword = async () => {
    if (!email) { setError('Enter your registered email first'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${GLOBAL_URL}/rest/v1/shops?or=(owner_email.eq.${email.trim().toLowerCase()},shop_email.eq.${email.trim().toLowerCase()})&select=id`, {
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
      });
      const shops = await res.json();
      if (!shops || shops.length === 0) { setError('No account found with this email'); setLoading(false); return; }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      setGeneratedCode(code);
      setResetShopId(shops[0].id);

      await fetch(`${GLOBAL_URL}/rest/v1/pairing_codes`, {
        method: 'POST',
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shops[0].id, code, status: 'reset', expires_at: new Date(Date.now() + 600000).toISOString() })
      });

      Alert.alert('Reset Code Sent', `A password reset code has been sent directly to your registered email address.\n\nThis code expires in 10 minutes.`);
      setScreen('resetVerify');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!resetCode || !newPassword || !confirmPassword) { setError('All fields are required'); return; }
    if (resetCode !== generatedCode) { setError('Invalid reset code'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    if (newPassword.length < 4) { setError('Password must be at least 4 characters'); return; }
    setLoading(true); setError('');
    try {
      await fetch(`${GLOBAL_URL}/rest/v1/shops?id=eq.${resetShopId}`, {
        method: 'PATCH',
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ master_key: newPassword })
      });
      setSuccess('Password changed successfully! Login with your new password.');
      setPassword('');
      setResetCode('');
      setNewPassword('');
      setConfirmPassword('');
      setScreen('login');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ══════════════════════════════════════════════
  // ── DASHBOARD HTML BUILDER ──
  // ══════════════════════════════════════════════
  const buildDashboardHtml = (stats, ts, shopInfo, tenUrl, tenKey) => {
    const json = JSON.stringify({ stats, ts, shop: shopInfo, url: tenUrl, key: tenKey })
      .replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
<style>
:root{--bg:#020205;--card:#0a0a0f;--border:#151520;--text:#fff;--text-s:#888;--indigo:#6366f1;--green:#10b981;--red:#ef4444;--orange:#f59e0b;--card-h:#1a1a24}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Lexend',sans-serif;background:var(--bg);color:var(--text);height:100vh;overflow:hidden}
.sb_i{width:48px;height:48px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-s);margin-bottom:20px;border-radius:14px;cursor:pointer;transition:0.2s}
.sb_i.on{color:var(--indigo);background:rgba(99,102,241,0.15);box-shadow:0 0 20px rgba(99,102,241,0.2)}
.sb_i span{font-size:7px;font-weight:700;margin-top:5px;text-transform:uppercase;letter-spacing:1px}
.pg{width:100%;display:none;height:100vh;overflow-y:auto;padding-bottom:120px;scroll-behavior:smooth}.pg.on{display:block}
.hdr{position:sticky;top:0;background:rgba(2,2,5,0.7);backdrop-filter:blur(20px);padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;z-index:1500}
.h_title{font-size:18px;font-weight:900;letter-spacing:1px;background:linear-gradient(90deg,#fff,#888);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.cont{padding:24px}.card{background:var(--card);border:1px solid var(--border);border-radius:28px;padding:22px;margin-bottom:22px;transition:0.3s}
.card:hover{border-color:var(--indigo)}
.lbl{font-size:9px;color:var(--text-s);font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:15px}
.stat_v{font-size:28px;font-weight:900;letter-spacing:-0.5px}
.item{background:var(--card);border:1px solid var(--border);padding:20px;border-radius:22px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
.ai-box{height:350px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
.ai-msg{padding:14px 18px;border-radius:20px;max-width:85%;font-size:13px;line-height:1.6}
.ai-l{background:var(--card-h);align-self:flex-start;border-bottom-left-radius:4px}
.ai-r{background:var(--indigo);align-self:flex-end;border-bottom-right-radius:4px}
.ai-in{display:flex;gap:12px;margin-top:15px;background:var(--card);padding:12px;border-radius:22px;border:1px solid var(--border)}
.ai-in input{flex:1;background:transparent;border:none;color:white;padding:10px;outline:none;font-family:inherit}
.ai-btn{background:var(--indigo);color:white;padding:10px 20px;border-radius:15px;font-weight:800;cursor:pointer;border:none}
.vip-card{display:flex;align-items:center;gap:15px;padding:15px 0;border-bottom:1px solid var(--border)}
.vip-rank{width:32px;height:32px;background:var(--indigo);display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:900;font-size:12px}
.sb{width:76px;height:100vh;border-right:1px solid var(--border);display:flex;flex-direction:column;align-items:center;padding:25px 0;position:fixed;left:-76px;z-index:2000;background:rgba(2,2,5,0.97);backdrop-filter:blur(20px);transition:left 0.25s ease}
.sb.open{left:0}.overlay{display:none;position:fixed;inset:0;z-index:1999;background:rgba(0,0,0,0.5)}.overlay.on{display:block}
.tog{background:rgba(255,255,255,0.05);border:1px solid var(--border);width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:12px;cursor:pointer;flex-shrink:0}
.tog svg{width:18px;height:18px;stroke:var(--text-s);fill:none;stroke-width:2;stroke-linecap:round}
.sb_i svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
</style></head><body>
<div class="overlay" id="overlay" onclick="closeSb()"></div>
<div class="sb" id="sb">
  <div class="sb_i on" data-tab="overview"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span>Overview</span></div>
  <div class="sb_i" data-tab="items"><svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg><span>Items</span></div>
  <div class="sb_i" data-tab="bills"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg><span>Bills</span></div>
  <div class="sb_i" data-tab="cust"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg><span>Clients</span></div>
  <div class="sb_i" data-tab="ai"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg><span>AI</span></div>
  <div class="sb_i" data-tab="prof"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg><span>Profile</span></div>
</div>
<div id="app"></div>
<script>
var D = ${json};
var s = D.stats || {};
function _g(obj){var args=Array.prototype.slice.call(arguments,1);for(var i=0;i<args.length;i++){if(obj==null)return undefined;obj=obj[args[i]];}return obj;}

async function live(path){
  try {
    if(!D.url || D.url==='null' || !D.key) return [];
    var res = await fetch(D.url + "/rest/v1/" + path, { headers: { apikey: D.key, Authorization: 'Bearer '+D.key } });
    return await res.json();
  } catch(e) { return []; }
}

function hdr(tx){ return '<div class="hdr"><div class="h_title">'+tx+'</div><div style="font-size:10px;color:var(--text-s)">'+new Date().toLocaleTimeString()+'</div></div>'; }
function safeLogout(){ if(confirm("Logout from this session?")){ window.ReactNativeWebView ? window.ReactNativeWebView.postMessage("logout") : window.parent.postMessage("logout","*"); } }

async function renderOverviewStats(){
  try {
    var today = new Date(); today.setHours(0,0,0,0);
    var allInvs = await live('invoices?select=local_id,total_amount,created_at&limit=5000');
    var rev = 0; var overallRev = 0;
    allInvs.forEach(function(i){ var amt = parseFloat(i.total_amount || 0); overallRev += amt; if(new Date(i.created_at) >= today) rev += amt; });
    var prods = await live('products?select=local_id,price,cost_price&limit=1000');
    var costMap = {}; prods.forEach(function(p){ costMap[p.local_id] = { cost: parseFloat(p.cost_price || 0), sell: parseFloat(p.price || 0) }; });
    var todayLocalIds = allInvs.filter(function(i){ return new Date(i.created_at) >= today; }).map(function(i){ return i.local_id; }).filter(Boolean);
    var pft = 0;
    if(todayLocalIds.length > 0){
      var items = await live('invoice_items?select=product_id,quantity,price&invoice_id=in.('+todayLocalIds.join(',')+')');
      items.forEach(function(item){ var ci = costMap[item.product_id]; var sellP = parseFloat(item.price || (ci ? ci.sell : 0)); var costP = ci ? ci.cost : 0; pft += (sellP - costP) * parseFloat(item.quantity || 1); });
    }
    var allItems = await live('invoice_items?select=product_id,quantity,price&limit=10000');
    var overallPft = 0;
    allItems.forEach(function(item){ var ci = costMap[item.product_id]; var sellP = parseFloat(item.price || (ci ? ci.sell : 0)); var costP = ci ? ci.cost : 0; overallPft += (sellP - costP) * parseFloat(item.quantity || 1); });
    var el1 = document.getElementById('stat-rev'); var el2 = document.getElementById('stat-pft'); var el3 = document.getElementById('stat-orev'); var el4 = document.getElementById('stat-opft');
    if(el1) el1.textContent = '\\u20b9' + rev.toFixed(0); if(el2) el2.textContent = '\\u20b9' + pft.toFixed(0); if(el3) el3.textContent = '\\u20b9' + overallRev.toFixed(0); if(el4) el4.textContent = '\\u20b9' + overallPft.toFixed(0);
  } catch(e) { console.log('stats err', e); }
}

async function renderOverviewCharts(){
  Chart.defaults.color = "#45455a"; Chart.defaults.font.family = "'Lexend'";
  try {
    var allProds = await live('products?select=local_id,price,cost_price&limit=1000');
    var cMap = {}; allProds.forEach(function(p){ cMap[p.local_id] = { cost: parseFloat(p.cost_price||0), sell: parseFloat(p.price||0) }; });
    var inv1 = await live('invoices?select=local_id,created_at,total_amount&order=created_at.asc&limit=2000');
    var byM = {}; var localIdToMonth = {};
    inv1.forEach(function(i){ var d = new Date(i.created_at); var k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); if(!byM[k]) byM[k] = { lbl: d.toLocaleString('en-US',{month:'short',year:'2-digit'}), sales:0, profit:0 }; byM[k].sales += parseFloat(i.total_amount || 0); if(i.local_id) localIdToMonth[i.local_id] = k; });
    var allItems = await live('invoice_items?select=invoice_id,product_id,quantity,price&limit=5000');
    allItems.forEach(function(item){ var mk2 = localIdToMonth[item.invoice_id]; if(!mk2 || !byM[mk2]) return; var ci = cMap[item.product_id]; var sellP = parseFloat(item.price || (ci ? ci.sell : 0)); var costP = ci ? ci.cost : 0; byM[mk2].profit += (sellP - costP) * parseFloat(item.quantity || 1); });
    var mk = Object.keys(byM).sort();
    new Chart(document.getElementById('c-growth'), { type:'bar', data:{ labels: mk.map(function(k){ return byM[k].lbl; }), datasets:[{ label:'Revenue', data: mk.map(function(k){ return Math.round(byM[k].sales); }), backgroundColor:'rgba(99,102,241,0.9)', borderRadius:8, borderSkipped:false },{ label:'Profit', data: mk.map(function(k){ return Math.round(byM[k].profit); }), backgroundColor:'rgba(16,185,129,0.9)', borderRadius:8, borderSkipped:false }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, labels:{ color:'#888', font:{size:10,weight:'bold'}, boxWidth:10 } } }, scales:{ x:{ grid:{display:false}, ticks:{color:'#555'} }, y:{ grid:{color:'rgba(255,255,255,0.03)'}, ticks:{color:'#555'} } } } });
  } catch(e) { console.log('c1 err', e); }
  try {
    var inv2 = await live('invoices?select=created_at&limit=2000');
    var perHr = {}; for(var h=8; h<=21; h++){ perHr[h] = 0; } inv2.forEach(function(i){ var hr = new Date(i.created_at).getHours(); if(perHr.hasOwnProperty(hr)) perHr[hr]++; });
    var hKeys = Object.keys(perHr).map(Number).sort(function(a,b){ return a-b; }); var hLabels = hKeys.map(function(hr){ return (hr%12||12)+(hr<12?'am':'pm'); }); var hData = hKeys.map(function(hr){ return perHr[hr]; });
    new Chart(document.getElementById('c-peak'), { type:'line', data:{ labels: hLabels, datasets:[{ label:'Bills/Hour', data: hData, borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.1)', tension:0.5, fill:true, pointBackgroundColor:'#6366f1', pointRadius:4 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, labels:{ color:'#888', font:{size:10}, boxWidth:10 } } }, scales:{ x:{ grid:{display:false}, ticks:{color:'#555'} }, y:{ grid:{color:'rgba(255,255,255,0.03)'}, beginAtZero:true, ticks:{color:'#555'} } } } });
  } catch(e) { console.log('c2 err', e); }
  try {
    var wLabels = [], dayKeys = [], dayMap = {};
    for(var j=6; j>=0; j--){ var dd = new Date(); dd.setDate(dd.getDate() - j); dd.setHours(0,0,0,0); var dk = dd.getFullYear()+'-'+(dd.getMonth()+1)+'-'+dd.getDate(); var dl = dd.toLocaleDateString('en-US',{weekday:'short', month:'short', day:'numeric'}); wLabels.push(dl); dayKeys.push(dk); dayMap[dk] = 0; }
    var sinceDate = new Date(); sinceDate.setDate(sinceDate.getDate()-6); sinceDate.setHours(0,0,0,0);
    var inv3 = await live('invoices?select=created_at,total_amount&created_at=gte.'+sinceDate.toISOString()+'&limit=2000');
    inv3.forEach(function(i){ var d = new Date(i.created_at); var dk2 = d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); if(dayMap.hasOwnProperty(dk2)) dayMap[dk2] += parseFloat(i.total_amount || 0); });
    var wData = dayKeys.map(function(k){ return Math.round(dayMap[k]); }); var maxW = Math.max.apply(null, wData);
    new Chart(document.getElementById('c-week'), { type:'bar', data:{ labels: wLabels, datasets:[{ label:'Revenue', data: wData, backgroundColor: wData.map(function(v){ return (v === maxW && maxW > 0) ? '#f59e0b' : 'rgba(245,158,11,0.28)'; }), borderRadius:10, borderSkipped:false }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, labels:{ color:'#888', font:{size:10}, boxWidth:10 } } }, scales:{ x:{ grid:{display:false}, ticks:{color:'#555', font:{size:9}} }, y:{ grid:{color:'rgba(255,255,255,0.03)'}, beginAtZero:true, ticks:{color:'#555'} } } } });
  } catch(e) { console.log('c3 err', e); }
}

var _allProducts = []; var _lowStockList = []; var _expiryList = []; var _deadList = []; var _activeFilter = 'all';
function showFilteredItems(filter) {
  if(_activeFilter === filter) { _activeFilter = 'all'; } else { _activeFilter = filter; }
  var cards = document.querySelectorAll('.inv-filter-card'); cards.forEach(function(c){ c.style.boxShadow = 'none'; c.style.opacity = '0.6'; });
  if(_activeFilter !== 'all') { var activeCard = document.getElementById('fc-'+_activeFilter); if(activeCard) { activeCard.style.boxShadow = '0 0 15px rgba(99,102,241,0.4)'; activeCard.style.opacity = '1'; } } else { cards.forEach(function(c){ c.style.opacity = '1'; }); }
  var listEl = document.getElementById('it-list'); var titleEl = document.getElementById('it-title'); if(!listEl) return;
  var items = []; if(_activeFilter === 'low') { items = _lowStockList; titleEl.textContent = 'Low Stock Items'; } else if(_activeFilter === 'expiry') { items = _expiryList; titleEl.textContent = 'Expiring Soon'; } else if(_activeFilter === 'dead') { items = _deadList; titleEl.textContent = 'Dead Stock'; } else { items = _allProducts; titleEl.textContent = 'Registered Products'; }
  if(items.length === 0) { listEl.innerHTML = '<p style="color:var(--text-s);text-align:center;padding:30px">No items found</p>'; return; }
  var dDays = (D.stats && D.stats.settings && D.stats.settings.deadStockThresholdDays) ? D.stats.settings.deadStockThresholdDays : 30;
  listEl.innerHTML = items.map(function(p){ var badge = ''; if(_activeFilter === 'low' || (_activeFilter === 'all' && p.quantity < 10)) badge = '<span style="font-size:9px;background:rgba(239,68,68,0.15);color:var(--red);padding:2px 8px;border-radius:20px;margin-left:8px">LOW</span>'; var looseBadge = (p.product_type === 'loose') ? '<span style="font-size:9px;background:rgba(99,102,241,0.15);color:var(--indigo);padding:2px 8px;border-radius:20px;margin-left:6px">(Loose)</span>' : ''; var extra = ''; if(_activeFilter === 'expiry' && p.expiry_date) { var ed = new Date(p.expiry_date).toLocaleDateString('en-US',{month:'short',day:'numeric'}); extra = '<div style="font-size:11px;color:var(--text-s)">Expires: <span style="font-weight:bold;color:#f59e0b">'+ed+'</span></div>'; } else if(_activeFilter === 'dead') { extra = '<div style="font-size:11px;color:var(--text-s)">Stock: '+p.quantity+' &middot; No sales '+dDays+'d</div>'; } else { extra = '<div style="font-size:11px;color:var(--text-s)">'+(p.category_name||'')+(p.quantity!==undefined?' &middot; Stock: '+p.quantity:'')+' </div>'; } var priceColor = _activeFilter === 'dead' ? 'var(--orange)' : 'var(--green)'; return '<div class="item"><div><div style="font-weight:800">'+p.name+looseBadge+badge+'</div>'+extra+'</div><div style="color:'+priceColor+';font-weight:800">Rs '+p.price+'</div></div>'; }).join('');
}

async function renderItems(){
  var all = await live('products?limit=500'); _allProducts = all;
  _lowStockList = all.filter(function(p){ return p.quantity > 0 && p.quantity < 10; });
  var dNow = new Date(); dNow.setHours(0,0,0,0); var d30 = new Date(); d30.setDate(dNow.getDate() + 30);
  _expiryList = all.filter(function(p) { if(!p.expiry_date) return false; var ex = new Date(p.expiry_date); return ex >= dNow && ex <= d30; });
  var ac = document.getElementById('all-count'); if(ac) ac.textContent = all.length;
  var lc = document.getElementById('low-count'); if(lc) lc.textContent = _lowStockList.length;
  var ec = document.getElementById('exp-count'); if(ec) ec.textContent = _expiryList.length;
  try { var dSet = {}; if(D.stats && D.stats.deadStock) { D.stats.deadStock.forEach(function(d){ if(d.local_id) dSet[d.local_id]=true; else dSet[d.name]=true; }); } _deadList = all.filter(function(p){ return dSet[p.local_id] || dSet[p.name]; }); var dc = document.getElementById('dead-count'); if(dc) dc.textContent = _deadList.length; } catch(ex){ _deadList = []; }
  showFilteredItems(_activeFilter);
}

async function renderBills(){
  var bills = await live('invoices?select=id,local_id,bill_no,customer_name,created_at,total_amount,payment_mode&order=created_at.desc&limit=50');
  document.getElementById('bl-list').innerHTML = bills.map(function(b){ return '<div class="item" style="cursor:pointer;flex-direction:column;align-items:stretch" onclick="toggleBillItems('+b.local_id+')"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:800">#'+(b.bill_no||'WALK')+' &middot; '+(b.customer_name||'Walk-in')+'</div><div style="font-size:11px;color:var(--text-s)">'+new Date(b.created_at).toLocaleString()+'</div></div><div style="text-align:right"><div style="color:var(--green);font-weight:800">Rs '+b.total_amount+'</div><div style="font-size:9px;color:var(--text-s)">'+(b.payment_mode||'CASH')+'</div></div></div><div id="bi-'+b.local_id+'" style="display:none"></div></div>'; }).join('') || '<p style="text-align:center;padding:40px;color:var(--text-s)">No Bills</p>';
}
async function toggleBillItems(lid){
  var el=document.getElementById('bi-'+lid); if(!el) return;
  if(el.style.display==='block'){el.style.display='none';return;}
  el.style.display='block'; el.innerHTML='<div style="color:var(--text-s);font-size:12px;padding:8px 0">Loading...</div>';
  try{ var items=await live('invoice_items?select=product_id,quantity,price&invoice_id=eq.'+lid); var pids=items.map(function(i){return i.product_id;}); var prods=pids.length?await live('products?select=local_id,name&local_id=in.('+pids.join(',')+')'):[]; var nm={}; prods.forEach(function(p){nm[p.local_id]=p.name;}); el.innerHTML='<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px">'+items.map(function(i){ return '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.03)"><span>'+(nm[i.product_id]||'Item')+' x'+i.quantity+'</span><span style="color:var(--green)">Rs '+(i.price*i.quantity).toFixed(0)+'</span></div>'; }).join('')+'</div>'; }catch(ex){el.innerHTML='<p style="color:var(--text-s);font-size:12px">Error</p>';}
}

async function renderClients(){
  var invoices = await live('invoices?select=customer_name,customer_phone,total_amount');
  var stats = {}; 
  invoices.forEach(function(i){ 
    var p = i.customer_phone; 
    if (!p || p.trim() === '') return; // Skip anonymous walk-ins without a phone number
    var n = i.customer_name || 'Walk-in';
    var k = p; 
    if(!stats[k]) stats[k] = { name: n, phone: p, visits:0, spent:0 }; 
    if(stats[k].name === 'Walk-in' && n !== 'Walk-in') stats[k].name = n; 
    stats[k].visits++; 
    stats[k].spent += parseFloat(i.total_amount || 0); 
  });
  var tops = Object.keys(stats).map(function(k){ return stats[k]; }).sort(function(a,b){ return b.visits !== a.visits ? b.visits - a.visits : b.spent - a.spent; }).slice(0,5);
  document.getElementById("cl-list").innerHTML = tops.map(function(c,i){ return '<div class="vip-card"><div class="vip-rank">'+(i+1)+'</div><div style="flex:1"><div style="font-weight:800">'+c.name+'</div><div style="font-size:10px;color:var(--text-s)">'+(c.phone !== 'Walk-in' ? c.phone : 'No Number')+' &middot; '+c.visits+' Visits</div></div><div style="color:var(--green);font-weight:800">Rs '+c.spent.toFixed(0)+'</div></div>'; }).join('') || '<p style="color:var(--text-s)">No data</p>';
}

async function handleAi(){
  var inp = document.getElementById("ai-i"); if(!inp || !inp.value.trim()) return;
  var q = inp.value.trim();
  var box = document.getElementById("ai-b");
  box.innerHTML += '<div class="ai-msg ai-r">'+q+'</div>';
  inp.value = "";
  var lId = "id"+Date.now();
  box.innerHTML += '<div class="ai-msg ai-l" id="'+lId+'">Thinking...</div>';
  box.scrollTop = box.scrollHeight;
  
  try {
     var gk = D.stats && D.stats.ai_keys && D.stats.ai_keys.gemini ? D.stats.ai_keys.gemini : "";
     var grk = D.stats && D.stats.ai_keys && D.stats.ai_keys.groq ? D.stats.ai_keys.groq : "";
     
     var deadNames = s.deadStock && s.deadStock.length > 0 ? s.deadStock.slice(0,20).map(d => d.name).join(', ') : 'None';
     var lowNames = s.lowStockProducts && s.lowStockProducts.length > 0 ? s.lowStockProducts.slice(0,20).map(p => p.name).join(', ') : 'None';
     var topNames = s.topProducts && s.topProducts.length > 0 ? s.topProducts.slice(0,10).map(p => p.name).join(', ') : 'None';
     
     var topCust = s.customerBehavior && s.customerBehavior.length > 0 ? s.customerBehavior.slice(0,10).map(c => c.customer_name + " (Visits: " + c.visit_count + ", Spent: ₹" + c.total_spent + ")").join(' | ') : 'None';
     var dailyStr = s.dailySalesData && s.dailySalesData.length > 0 ? s.dailySalesData.map(d => d.day + ": Sales ₹" + (d.total?d.total.toFixed(2):0) + ", Profit ₹" + (d.profit?d.profit.toFixed(2):0)).join(' | ') : 'None';
     var recInv = s.recentInvoices && s.recentInvoices.length > 0 ? s.recentInvoices.map(i => "["+i.created_at+"] Bill "+i.bill_no+" to "+(i.customer_name||'Walk-in')+" for ₹"+i.total_amount).join(' | ') : 'None';
     var mthStr = s.monthlySalesBreakdown && s.monthlySalesBreakdown.length > 0 ? s.monthlySalesBreakdown.slice(-12).map(m => m.month + ": Sales ₹" + (m.total?m.total.toFixed(2):0) + ", Profit ₹" + (m.profit?m.profit.toFixed(2):0)).join(' | ') : 'None';
     var yrStr = s.yearlyBreakdown && s.yearlyBreakdown.length > 0 ? s.yearlyBreakdown.map(y => y.year + ": ₹" + y.total).join(' | ') : 'None';
     
     var shopDetails = "SHOP NAME: " + (_g(D,'shop','name') || 'My Shop') + " | GST NUMBER: " + (_g(D,'shop','gst_number') || 'N/A') + " | ADDRESS: " + (_g(D,'shop','address') || 'N/A') + " | PHONE: " + (_g(D,'shop','phone') || 'N/A');
     
     var gstOverall = s.overallTax && s.overallTax.length > 0 ? s.overallTax.map(t => t.gst_rate + "%:₹" + (t.tax?t.tax.toFixed(2):0)).join(', ') : 'None';
     var gstMonthly = s.monthlyTax && s.monthlyTax.length > 0 ? s.monthlyTax.map(t => "["+t.month+"] "+t.gst_rate+"%:₹"+(t.tax?t.tax.toFixed(2):0)).join(', ') : 'None';
     var gstDaily = s.dailyTax && s.dailyTax.length > 0 ? s.dailyTax.map(t => "["+t.day+"] "+t.gst_rate+"%:₹"+(t.tax?t.tax.toFixed(2):0)).join(', ') : 'None';

     var ctx = "SALES TODAY: ₹"+(s.todaySales||0)+" | TODAY PROFIT: ₹"+(s.todayProfit||0)+" | OVERALL SALES: ₹"+(s.overallSales||0)+" | OVERALL PROFIT: ₹"+(s.overallProfit||0);
     var ctx2 = "LOW STOCK ("+(s.lowStockCount||0)+"): "+lowNames+" | DEAD STOCK ("+(s.deadStock?s.deadStock.length:0)+"): "+deadNames+" | TOP PRODUCTS: "+topNames;
     var ctx3 = "BILLS TODAY: "+(s.todayBills||0)+" | TOP CUSTOMERS: "+topCust+" | DAILY SALES & PROFIT (LAST 365 DAYS): "+dailyStr;
     var ctx4 = "MONTHLY SALES & PROFIT: "+mthStr+" | RECENT 150 BILLS (WITH TIME): "+recInv;
     var ctx5 = shopDetails + " | OVERALL GST TAX: " + gstOverall + " | MONTHLY GST TAX: " + gstMonthly + " | DAILY GST TAX (LAST 365 DAYS): " + gstDaily;
     
     var pr = "You are an AI for a shop owner. Only use this database info:\\n" + ctx + "\\n" + ctx2 + "\\n" + ctx3 + "\\n" + ctx4 + "\\n" + ctx5 + "\\n\\nRules:\\n1. Use Professional Markdown formatting (bullet points, bold text for numbers/names).\\n2. If listing multiple items (like products/customers), DO NOT use comma-separated strings; use clean bulleted lists.\\n3. If today's sales/profit is ₹0, explicitly say ₹0 immediately.\\n4. DO NOT invent numbers or names. Use ONLY the data provided.\\n\\nOwner Question: " + q;
     
     var ans = "";
     var usedGroq = false;
     var errMsgs = [];
     
     if (window.ReactNativeWebView) {
       window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'console_log', message: 'Chatbot query: ' + q }));
       window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'console_log', message: 'Using Desktop API Keys -> Gemini: ' + (gk ? 'Yes' : 'No') + ', Groq: ' + (grk ? 'Yes' : 'No') }));
     }

     if (gk) {
       try {
         var res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + gk, {
           method: "POST", headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }] })
         });
         var js = await res.json();
         if(js.error) throw new Error(js.error.message || "Gemini Error");
         ans = js.candidates[0].content.parts[0].text;
       } catch(ge) { 
           errMsgs.push("Gemini: " + ge.message);
           usedGroq = true; 
       }
     } else { usedGroq = true; }
     
     if (usedGroq && !ans) {
        if (!grk) {
            errMsgs.push("Groq: Key missing");
        } else {
            try {
                var gres = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                   method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + grk },
                   body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{role:"user", content:pr}] })
                });
                var gjs = await gres.json();
                if(gjs.error) throw new Error(gjs.error.message || "Groq Error");
                if(gjs.choices) ans = gjs.choices[0].message.content;
            } catch(gre) {
                errMsgs.push("Groq: " + gre.message);
            }
        }
     }
     
     if(!ans) ans = "⚠️ API Error: " + errMsgs.join(" | ");
     
     ans = ans.replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
     document.getElementById(lId).innerHTML = ans;
  } catch(err) {
     document.getElementById(lId).innerHTML = "⚠️ " + err.message;
  }
  box.scrollTop = box.scrollHeight;
}

function openSb(){document.getElementById('sb').classList.add('open');document.getElementById('overlay').classList.add('on');}
function closeSb(){document.getElementById('sb').classList.remove('open');document.getElementById('overlay').classList.remove('on');}
function hdrWithTog(tx){ return '<div class="hdr"><div class="tog" onclick="openSb()"><svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></div><div class="h_title">'+tx+'</div><div style="width:38px"></div></div>'; }

var _currentTab = 'overview'; try { _currentTab = sessionStorage.getItem('iva_tab') || 'overview'; } catch(e){}
function render(){
  var ov = '<div id="pg-overview" class="pg on">'+hdrWithTog("Overview")+'<div class="cont">' + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">' + '<div class="card" style="margin:0;border-left:4px solid var(--indigo)"><div class="lbl">Revenue Today</div><div class="stat_v" style="color:var(--indigo);font-size:22px" id="stat-rev">...</div></div>' + '<div class="card" style="margin:0;border-left:4px solid var(--green)"><div class="lbl">Profit Today</div><div class="stat_v" style="color:var(--green);font-size:22px" id="stat-pft">...</div></div>' + '</div>' + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:25px">' + '<div class="card" style="margin:0;border-left:4px solid var(--indigo)"><div class="lbl">Overall Sales</div><div class="stat_v" style="font-size:18px;color:var(--indigo)" id="stat-orev">...</div></div>' + '<div class="card" style="margin:0;border-left:4px solid #10b981"><div class="lbl">Overall Profit</div><div class="stat_v" style="font-size:18px;color:#10b981" id="stat-opft">...</div></div>' + '</div>' + '<div class="card"><div class="lbl">Sales vs Profit &mdash; Monthly</div><div style="height:220px"><canvas id="c-growth"></canvas></div></div>' + '<div class="card"><div class="lbl">Peak Hours</div><div style="height:190px"><canvas id="c-peak"></canvas></div></div>' + '<div class="card"><div class="lbl">Last 7 Days</div><div style="height:190px"><canvas id="c-week"></canvas></div></div>' + '</div></div>';
  var it = '<div id="pg-items" class="pg">'+hdrWithTog("Inventory")+'<div class="cont">' + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">' + '<div class="card inv-filter-card" id="fc-all" data-filter="all" style="margin:0;padding:12px;border-bottom:3px solid var(--indigo);cursor:pointer"><div class="lbl">Products</div><div style="font-size:18px;font-weight:900;color:var(--indigo)" id="all-count">...</div></div>' + '<div class="card inv-filter-card" id="fc-low" data-filter="low" style="margin:0;padding:12px;border-bottom:3px solid var(--red);cursor:pointer"><div class="lbl">Low Stock</div><div style="font-size:18px;font-weight:900;color:var(--red)" id="low-count">...</div></div>' + '<div class="card inv-filter-card" id="fc-expiry" data-filter="expiry" style="margin:0;padding:12px;border-bottom:3px solid #f59e0b;cursor:pointer"><div class="lbl">Near Expiry</div><div style="font-size:18px;font-weight:900;color:#f59e0b" id="exp-count">...</div></div>' + '<div class="card inv-filter-card" id="fc-dead" data-filter="dead" style="margin:0;padding:12px;border-bottom:3px solid var(--orange);cursor:pointer"><div class="lbl">Dead Stock</div><div style="font-size:18px;font-weight:900;color:var(--orange)" id="dead-count">...</div></div>' + '</div>' + '<div class="lbl" style="margin:5px 0 10px" id="it-title">All Products</div><div id="it-list"><div style="text-align:center;padding:40px;color:var(--text-s)">Loading...</div></div></div></div>';
  var bl = '<div id="pg-bills" class="pg">'+hdrWithTog("Invoices")+'<div class="cont"><div id="bl-list"><div style="text-align:center;padding:40px;color:var(--text-s)">Loading...</div></div></div></div>';
  var cl = '<div id="pg-cust" class="pg">'+hdrWithTog("Clients")+'<div class="cont"><div class="card"><div class="lbl">Top Spenders</div><div id="cl-list"><div style="color:var(--text-s)">Loading...</div></div></div></div></div>';
  var _shopId = _g(D,'shop','id') || 'Unknown';
  var _shopName = _g(D,'shop','name') || _g(D,'shop','store_name') || _g(D,'shop','owner_name') || 'My Shop';
  var _ownerName = _g(D,'shop','owner_name') || '-';
  var _gstNum = _g(D,'shop','gst_number') || 'Not Set';
  var _email = _g(D,'shop','shop_email') || _g(D,'shop','owner_email') || '-';
  var _hasGemini = _g(D,'stats','ai_keys','gemini') ? 'OK' : 'X';
  var _hasGroq = _g(D,'stats','ai_keys','groq') ? 'OK' : 'X';
  var ai = '<div id="pg-ai" class="pg">'+hdrWithTog("AI Consultant")+'<div class="cont"><div style="font-size:10px;color:var(--text-4);margin-bottom:10px;text-align:center">Shop ID: '+_shopId+' | Keys: G:'+_hasGemini+' GR:'+_hasGroq+'</div><div class="card" style="background:var(--card-h)"><div class="ai-box" id="ai-b"><div class="ai-msg ai-l">iVA Elite online. All systems live.</div></div><div class="ai-in"><input id="ai-i" placeholder="Ask about sales, profit..."><button class="ai-btn" onclick="handleAi()">SEND</button></div></div></div></div>';
  var pf = '<div id="pg-prof" class="pg">'+hdrWithTog("Profile")+'<div class="cont"><div style="text-align:center;padding:40px 0"><div style="font-size:48px;margin-bottom:15px">&#x1F3E2;</div><h2 style="font-weight:900">'+_shopName+'</h2><div style="color:var(--indigo);font-weight:800;font-size:12px;margin-top:5px">'+_shopId+'</div></div><div class="card"><div class="lbl">Owner</div><div style="font-weight:700">'+_ownerName+'</div><div class="lbl" style="margin-top:20px">GST Number</div><div style="font-weight:900;color:var(--green)">'+_gstNum+'</div><div class="lbl" style="margin-top:20px">Email</div><div style="font-weight:700">'+_email+'</div></div><button onclick="safeLogout()" style="width:100%;padding:20px;background:#1a1a24;color:var(--red);border-radius:24px;border:1px solid #301010;font-weight:900;cursor:pointer;margin-top:30px;font-family:Lexend">LOGOUT</button></div></div>';
  document.getElementById('app').innerHTML = ov + it + bl + cl + ai + pf;
  document.querySelectorAll('.pg').forEach(function(p){ p.classList.remove('on'); }); document.querySelectorAll('.sb_i').forEach(function(s){ s.classList.remove('on'); });
  var targetPg = document.getElementById('pg-'+_currentTab); if(targetPg) targetPg.classList.add('on');
  var targetSb = document.querySelector('.sb_i[data-tab="'+_currentTab+'"]'); if(targetSb) targetSb.classList.add('on');
  document.body.addEventListener('click', function(e){ var sbi = e.target.closest('.sb_i'); if(sbi){ var tab = sbi.getAttribute('data-tab'); _currentTab = tab; try{sessionStorage.setItem('iva_tab', tab);}catch(e){} document.querySelectorAll('.pg').forEach(function(p){ p.classList.remove('on'); }); document.querySelectorAll('.sb_i').forEach(function(s){ s.classList.remove('on'); }); document.getElementById('pg-'+tab).classList.add('on'); sbi.classList.add('on'); closeSb(); } var fc = e.target.closest('.inv-filter-card'); if(fc){ var f = fc.getAttribute('data-filter'); if(f) showFilteredItems(f); } });
  renderOverviewStats(); renderOverviewCharts(); renderItems(); renderBills(); renderClients();
}
try { render(); } catch(e) { document.getElementById('app').innerHTML = '<div style="padding:40px;text-align:center;color:#888"><h2 style="color:#fff;margin-bottom:10px">Dashboard</h2><p>Loading data...</p></div>'; }
<\/script></body></html>`;
  };

  // ══════════════════════════════════════════════
  // ── RENDER SCREENS ──
  // ══════════════════════════════════════════════

  const renderDashboard = () => {
    // Render immediate HTML using whatever dashData is available
    const html = buildDashboardHtml(dashData?.s || {}, dashData?.ts || '', dashData?.sh || {}, session.url, session.key);

    if (Platform.OS === 'web') {
      return (
        <View style={{ flex: 1, backgroundColor: '#020205' }}>
          <iframe srcDoc={html} style={{ width: '100%', height: '100%', border: 'none' }} title="Dashboard" />
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        {RNWebView ? (
          <RNWebView source={{ html }} style={{ flex: 1, backgroundColor: '#020205' }}
            onMessage={(e) => {
              try {
                const data = JSON.parse(e.nativeEvent.data);
                if (data.type === 'console_log') {
                  console.log("-----------------------------------------");
                  console.log("[Mobile Chatbot] " + data.message);
                  console.log("-----------------------------------------");
                  return;
                }
              } catch(err) {
                // Not JSON, ignore
              }

              if (e.nativeEvent.data === 'logout') {
                Alert.alert('Logout', 'End this session?', [
                  { text: 'Cancel' },
                  { text: 'Logout', style: 'destructive', onPress: () => { Store.del('iva_paired'); Store.del('iva_shop_id'); Store.del('iva_shop_url'); Store.del('iva_shop_key'); setScreen('register'); } }
                ]);
              }
            }}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: 'white' }}>Loading...</Text></View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.c}>
        <StatusBar barStyle="light-content" backgroundColor="#020205" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {screen === 'loading' && <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator size="large" color="#6366f1" /></View>}
          {screen === 'register' && (
            <ScrollView contentContainerStyle={styles.sw}>
              <View style={styles.bh}>
                <Text style={styles.bt}>INNO<Text style={{ color: '#6366f1' }}>AIVATORS</Text></Text>
                <Text style={[styles.h, { fontSize: 18, marginTop: 8 }]}>Owner Registration</Text>
              </View>
              <View style={styles.cg}>
                <Label>Owner Name</Label>
                <TextInput style={styles.i} value={fullName} onChangeText={setFullName} placeholderTextColor="#444" placeholder="Your full name" />
                <Label>Email ID</Label>
                <TextInput style={styles.i} value={email} onChangeText={setEmail} placeholderTextColor="#444" placeholder="owner@email.com" autoCapitalize="none" keyboardType="email-address" />
                <Label>Password</Label>
                <PasswordInput value={password} onChangeText={setPassword} show={showPassword} onToggle={() => setShowPassword(!showPassword)} style={styles.i} />
                {error ? <ErrBox msg={error} /> : null}
                {success ? <SuccessBox msg={success} /> : null}
                <TouchableOpacity style={styles.pb} onPress={handleRegister} disabled={loading}>
                  {loading ? <ActivityIndicator color="white" /> : <Text style={styles.pt}>REGISTER</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => { setScreen('login'); setError(''); setSuccess(''); }}>
                  <Text style={{ color: '#888', fontSize: 13 }}>Already have an account? <Text style={{ color: '#6366f1', fontWeight: '700' }}>Login</Text></Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
          {screen === 'login' && (
            <ScrollView contentContainerStyle={styles.sw}>
              <View style={styles.bh}>
                <Text style={styles.bt}>INNO<Text style={{ color: '#6366f1' }}>AIVATORS</Text></Text>
                <Text style={[styles.h, { fontSize: 18, marginTop: 8 }]}>Owner Login</Text>
              </View>
              <View style={styles.cg}>
                <Label>Email ID</Label>
                <TextInput style={styles.i} value={email} onChangeText={setEmail} placeholderTextColor="#444" placeholder="owner@email.com" autoCapitalize="none" keyboardType="email-address" />
                <Label>Password</Label>
                <PasswordInput value={password} onChangeText={setPassword} show={showPassword} onToggle={() => setShowPassword(!showPassword)} style={styles.i} />
                {error ? <ErrBox msg={error} /> : null}
                {success ? <SuccessBox msg={success} /> : null}
                <TouchableOpacity style={styles.pb} onPress={handleLogin} disabled={loading}>
                  {loading ? <ActivityIndicator color="white" /> : <Text style={styles.pt}>LOGIN</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { handleForgotPassword(); }} style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={{ color: '#f59e0b', fontSize: 13, fontWeight: '700' }}>Forgot Password?</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ marginTop: 16, alignItems: 'center' }} onPress={() => { setScreen('register'); setError(''); setSuccess(''); }}>
                  <Text style={{ color: '#888', fontSize: 13 }}>Don't have an account? <Text style={{ color: '#6366f1', fontWeight: '700' }}>Register</Text></Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
          {screen === 'shopId' && (
            <ScrollView contentContainerStyle={styles.sw}>
              <View style={styles.bh}>
                <Text style={styles.h}>🔗 Link Desktop</Text>
                <Text style={styles.sh}>Enter your Shop ID from the desktop app</Text>
              </View>
              <View style={styles.cg}>
                <Label>Shop ID</Label>
                <TextInput style={styles.i} value={shopIdInput} onChangeText={setShopIdInput} placeholder="shop-XXXXXXXX" placeholderTextColor="#444" autoCapitalize="none" />
                {error ? <ErrBox msg={error} /> : null}
                <TouchableOpacity style={styles.pb} onPress={generatePairingCode} disabled={loading}>
                  {loading ? <ActivityIndicator color="white" /> : <Text style={styles.pt}>GENERATE PAIR CODE</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
          {screen === 'pairing' && (
            <ScrollView contentContainerStyle={styles.sw}>
              <View style={styles.bh}>
                <Text style={styles.h}>⏳ Waiting for Desktop</Text>
                <Text style={styles.sh}>Enter this code in your Desktop Terminal</Text>
              </View>
              <View style={styles.cg}>
                <Text style={{ fontSize: 52, fontWeight: '900', color: '#6366f1', textAlign: 'center', marginVertical: 30, letterSpacing: 10 }}>{pairingCode}</Text>
                <ActivityIndicator size="small" color="#6366f1" style={{ marginTop: 10 }} />
                <Text style={{ color: '#555', textAlign: 'center', marginTop: 12, fontSize: 11 }}>Waiting for desktop approval...</Text>
              </View>
            </ScrollView>
          )}
          {screen === 'resetVerify' && (
            <ScrollView contentContainerStyle={styles.sw}>
              <View style={styles.bh}>
                <Text style={styles.h}>🔐 Reset Password</Text>
                <Text style={styles.sh}>Enter the code sent to your email</Text>
              </View>
              <View style={styles.cg}>
                <Label>Reset Code</Label>
                <TextInput style={styles.i} value={resetCode} onChangeText={setResetCode} placeholderTextColor="#444" placeholder="6-digit code" keyboardType="number-pad" />
                <Label>New Password</Label>
                <PasswordInput value={newPassword} onChangeText={setNewPassword} show={showNewPwd} onToggle={() => setShowNewPwd(!showNewPwd)} placeholder="New password" style={styles.i} />
                <Label>Confirm Password</Label>
                <TextInput style={styles.i} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholderTextColor="#444" placeholder="Confirm password" />
                {error ? <ErrBox msg={error} /> : null}
                <TouchableOpacity style={styles.pb} onPress={handleResetPassword} disabled={loading}>
                  {loading ? <ActivityIndicator color="white" /> : <Text style={styles.pt}>CHANGE PASSWORD</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.ob} onPress={() => { setScreen('login'); setError(''); }}>
                  <Text style={styles.ot}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
          {screen === 'dashboard' && renderDashboard()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#020205' },
  sw: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  bh: { alignItems: 'center', marginBottom: 40 },
  bt: { color: 'white', fontSize: 26, fontWeight: '900' },
  h: { color: 'white', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  sh: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 10 },
  cg: { backgroundColor: '#0a0a0f', borderRadius: 32, padding: 30, borderWidth: 1, borderColor: '#151520' },
  l: { color: '#888', fontSize: 10, fontWeight: '800', marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  i: { backgroundColor: '#020205', color: 'white', padding: 18, borderRadius: 20, borderWidth: 1, borderColor: '#151520' },
  pb: { backgroundColor: '#6366f1', padding: 20, borderRadius: 20, alignItems: 'center', marginTop: 24 },
  pt: { color: 'white', fontWeight: '800', fontSize: 16 },
  ob: { padding: 18, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#151520', marginTop: 15 },
  ot: { color: '#888', fontWeight: '700' },
  eb: { color: '#ef4444', fontSize: 12, marginTop: 16, textAlign: 'center', backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 12 },
  sb: { color: '#22c55e', fontSize: 12, marginTop: 16, textAlign: 'center', backgroundColor: 'rgba(34,197,94,0.1)', padding: 12, borderRadius: 12 },
});
