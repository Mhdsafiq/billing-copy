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
  const [screen, setScreen] = useState('loading');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [shopIdInput, setShopIdInput] = useState('');
  const [pairingCode, setPairingCode] = useState('');

  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [resetShopId, setResetShopId] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);

  const [session, setSession] = useState({ id: null, url: null, key: null });
  const [dashData, setDashData] = useState({ s: {}, ts: '', sh: {} });
  const [dashLoading, setDashLoading] = useState(false);

  const pollRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      try {
        const paired = Store.get('iva_paired');
        const sid = Store.get('iva_shop_id');
        const sUrl = Store.get('iva_shop_url');
        const sKey = Store.get('iva_shop_key');
        
        if (paired === 'true' && sid) {
          setSession({ id: sid, url: sUrl || null, key: sKey || null });
          setScreen('dashboard');
        } else {
          setScreen('register');
        }
      } catch (e) {
        setScreen('register');
      }
    };
    init();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const fetchDashboardData = async () => {
    if (!session.id) return;
    try {
      setDashLoading(true);
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
    } catch (e) { 
      setDashLoading(false); 
    }
  };

  useEffect(() => {
    if (screen === 'dashboard' && session.id) {
      fetchDashboardData();
      const interval = setInterval(fetchDashboardData, 120000);
      return () => clearInterval(interval);
    }
  }, [screen, session]);

  const handleRegister = async () => {
    if (!fullName || !email || !password) { setError('All fields are required'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${GLOBAL_URL}/rest/v1/shops?or=(owner_email.eq.${email.trim().toLowerCase()},shop_email.eq.${email.trim().toLowerCase()})`, {
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
      });
      const shops = await res.json();
      if (shops && shops.length > 0) {
        const shop = shops[0];
        if (shop.master_key !== 'owner123') {
            setError('This email is already registered. Please Login.');
            setLoading(false);
            return;
        }
        await fetch(`${GLOBAL_URL}/rest/v1/shops?id=eq.${shop.id}`, {
          method: 'PATCH',
          headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ master_key: password, owner_name: fullName })
        });
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

  const handleLogin = async () => {
    if (!email || !password) { setError('Enter email and password'); return; }
    setLoading(true); setError('');
    try {
      const encodedEmail = encodeURIComponent(email.trim().toLowerCase());
      const encodedPwd = encodeURIComponent(password);
      let res = await fetch(`${GLOBAL_URL}/rest/v1/shops?owner_email=eq.${encodedEmail}&master_key=eq.${encodedPwd}`, {
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
      });
      let users = await res.json();
      if (!users || !Array.isArray(users) || users.length === 0) {
        res = await fetch(`${GLOBAL_URL}/rest/v1/shops?shop_email=eq.${encodedEmail}&master_key=eq.${encodedPwd}`, {
          headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
        });
        users = await res.json();
      }
      if (Array.isArray(users) && users.length > 0) {
        const shop = users[0];
        Store.set('iva_shop_id', shop.id);
        Store.set('iva_shop_url', shop.shop_supabase_url || '');
        Store.set('iva_shop_key', shop.shop_supabase_key || '');
        Store.set('iva_paired', 'true');
        setDashData({ s: {}, ts: '', sh: shop });
        setSession({ id: shop.id, url: shop.shop_supabase_url || null, key: shop.shop_supabase_key || null });
        setScreen('dashboard');
      } else { setError('Invalid email or password'); }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

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
      Store.set('iva_shop_id', shop.id);
      Store.set('iva_shop_url', shop.shop_supabase_url || '');
      Store.set('iva_shop_key', shop.shop_supabase_key || '');
      Store.set('iva_paired', 'true');
      setDashData({ s: {}, ts: '', sh: shop });
      setSession({ id: shop.id, url: shop.shop_supabase_url || null, key: shop.shop_supabase_key || null });
      setScreen('dashboard');
    } catch (e) { setError(e.message); }
  };

  const handleForgotPassword = async () => {
    if (!email) { setError('Enter email first'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${GLOBAL_URL}/rest/v1/shops?or=(owner_email.eq.${email.trim().toLowerCase()},shop_email.eq.${email.trim().toLowerCase()})&select=id`, {
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
      });
      const shops = await res.json();
      if (!shops || shops.length === 0) { setError('No account found'); setLoading(false); return; }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setGeneratedCode(code);
      setResetShopId(shops[0].id);
      await fetch(`${GLOBAL_URL}/rest/v1/pairing_codes`, {
        method: 'POST',
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shops[0].id, code, status: 'reset', expires_at: new Date(Date.now() + 600000).toISOString() })
      });
      Alert.alert('Code Sent', `A reset code has been sent to your email.`);
      setScreen('resetVerify');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (resetCode !== generatedCode) { setError('Invalid code'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords mismatch'); return; }
    setLoading(true); setError('');
    try {
      await fetch(`${GLOBAL_URL}/rest/v1/shops?id=eq.${resetShopId}`, {
        method: 'PATCH',
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ master_key: newPassword })
      });
      setSuccess('Success! Please login.');
      setScreen('login');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  /* ── DASHBOARD HTML BUILDER ── */
  const buildDashboardHtml = (stats, ts, shopInfo, tenUrl, tenKey, localApi) => {
    const json = JSON.stringify({ stats, ts, shop: shopInfo, url: tenUrl, key: tenKey, localApi })
      .replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
<style>
:root {
  --bg: #020617;
  --primary: #6366f1;
  --primary-glow: rgba(99, 102, 241, 0.15);
  --success: #10b981;
  --danger: #f43f5e;
  --card: rgba(15, 23, 42, 0.7);
  --border: rgba(255, 255, 255, 0.08);
  --text: #f8fafc;
  --text-dim: #94a3b8;
}
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { font-family: 'Outfit', sans-serif; background: var(--bg); color: var(--text); height: 100vh; overflow: hidden; }

/* ── UI Components ── */
.glass { background: var(--card); border: 1px solid var(--border); backdrop-filter: blur(15px); border-radius: 24px; }
.text-gradient { background: linear-gradient(135deg, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.btn-icon { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 12px; transition: 0.2s; }
.btn-icon.active { background: var(--primary-glow); color: var(--primary); }

/* ── Layout ── */
.header { padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; background: rgba(2,6,23,0.8); backdrop-filter: blur(10px); }
.main { height: calc(100vh - 145px); overflow-y: auto; padding: 20px; }
.nav { height: 75px; background: rgba(15, 23, 42, 0.9); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-around; padding-bottom: 10px; }

/* ── Cards ── */
.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.stat-card { padding: 20px; }
.stat-label { font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.stat-value { font-size: 24px; font-weight: 900; }

/* ── Lists ── */
.item-card { padding: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 16px; }
.item-icon { width: 48px; height: 48px; background: rgba(255,255,255,0.03); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 20px; }

.bill-card { padding: 20px; margin-bottom: 12px; }
.bill-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.bill-tag { background: var(--primary-glow); color: var(--primary); padding: 4px 10px; border-radius: 8px; font-size: 10px; font-weight: 900; }

/* ── AI Chat ── */
.chat-container { height: 100%; display: flex; flex-direction: column; }
.chat-messages { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 12px; }
.msg { max-width: 85%; padding: 14px 18px; border-radius: 20px; font-size: 14px; line-height: 1.5; }
.msg.bot { background: rgba(255,255,255,0.05); align-self: flex-start; border-bottom-left-radius: 4px; }
.msg.user { background: var(--primary); align-self: flex-end; border-bottom-right-radius: 4px; color: white; }
.chat-input-area { padding: 16px; display: flex; gap: 10px; align-items: center; }
.chat-input { flex: 1; height: 50px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 16px; padding: 0 16px; color: white; outline: none; font-size: 15px; }

/* ── Animations ── */
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
.animate { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
</style>
</head><body>

<div class="header">
  <div>
    <div style="font-size: 11px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 2px;">iVA Control Center</div>
    <div id="hdr-title" style="font-size: 20px; font-weight: 900; margin-top: 2px;">Dashboard</div>
  </div>
  <div class="btn-icon glass" onclick="window.ReactNativeWebView.postMessage('logout')">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
  </div>
</div>

<div class="main" id="main-content"></div>

<div class="nav">
  <div class="btn-icon active" onclick="renderTab('overview', this)" id="nav-overview">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
  </div>
  <div class="btn-icon" onclick="renderTab('items', this)">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
  </div>
  <div class="btn-icon" onclick="renderTab('bills', this)">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
  </div>
  <div class="btn-icon" onclick="renderTab('ai', this)">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  </div>
</div>

<script>
const D = ${json};
const s = D.stats || {};
let currentTab = 'overview';

async function live(path){
  if(!D.url || !D.key) return [];
  try {
    const r = await fetch(D.url+"/rest/v1/"+path, {headers:{apikey:D.key, Authorization:'Bearer '+D.key}});
    return await r.json();
  } catch(e) { return []; }
}

async function renderOverview(){
  let html = \`
    <div class="animate">
      <div class="stat-grid">
        <div class="glass stat-card">
          <div class="stat-label">Daily Revenue</div>
          <div class="stat-value">₹\${(s.todaySales||0).toLocaleString()}</div>
        </div>
        <div class="glass stat-card">
          <div class="stat-label">Net Profit</div>
          <div class="stat-value" style="color:var(--success)">₹\${(s.todayProfit||0).toLocaleString()}</div>
        </div>
      </div>
      <div class="glass" style="padding:24px; margin-bottom:20px;">
        <div class="stat-label" style="margin-bottom:16px;">Weekly Growth</div>
        <canvas id="chart1" height="180"></canvas>
      </div>
      <div class="glass" style="padding:24px; margin-bottom:20px;">
        <div class="stat-label" style="margin-bottom:16px;">Top Categories</div>
        <canvas id="chart2" height="200"></canvas>
      </div>
    </div>
  \`;
  document.getElementById('main-content').innerHTML = html;
  
  setTimeout(() => {
    const ctx1 = document.getElementById('chart1').getContext('2d');
    new Chart(ctx1, {
      type: 'line',
      data: {
        labels: (s.dailySalesData || []).slice(-7).map(d => d.day.split('-')[2]),
        datasets: [{
          label: 'Sales',
          data: (s.dailySalesData || []).slice(-7).map(d => d.total),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true, tension: 0.4, borderWidth: 3, pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: '#94a3b8' } }, y: { display: false } }
      }
    });

    const ctx2 = document.getElementById('chart2').getContext('2d');
    new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: (s.topProducts || []).slice(0,4).map(p => p.name),
        datasets: [{
          data: (s.topProducts || []).slice(0,4).map(p => p.quantity),
          backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#f43f5e'],
          borderWidth: 0
        }]
      },
      options: {
        cutout: '80%',
        plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10, weight: '700' }, padding: 20 } } }
      }
    });
  }, 100);
}

async function renderItems(){
  const main = document.getElementById('main-content');
  main.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-dim)">Initializing Inventory Protocol...</div>';
  const data = await live('products?select=*&order=name.asc');
  main.innerHTML = \`<div class="animate">\` + data.map(p => \`
    <div class="glass item-card">
      <div class="item-icon">📦</div>
      <div style="flex:1">
        <div style="font-weight:700; font-size:15px; color:white;">\${p.name}</div>
        <div style="font-size:12px; color:var(--text-dim); margin-top:2px;">₹\${p.price} · \${p.unit}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:16px; font-weight:900; color:\${p.quantity <= 10 ? 'var(--danger)' : 'var(--success)'}">\${p.quantity}</div>
        <div style="font-size:9px; font-weight:800; color:var(--text-dim); text-transform:uppercase;">Stock</div>
      </div>
    </div>
  \`).join('') + \`</div>\`;
}

async function renderBills(){
  const main = document.getElementById('main-content');
  main.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-dim)">Accessing Transaction Ledger...</div>';
  const data = await live('invoices?select=*&order=created_at.desc&limit=25');
  main.innerHTML = \`<div class="animate">\` + data.map(b => \`
    <div class="glass bill-card">
      <div class="bill-header">
        <div class="bill-tag">#\${(b.bill_no || b.id.slice(0,6)).toUpperCase()}</div>
        <div style="font-size:11px; color:var(--text-dim); font-weight:600;">\${new Date(b.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
      </div>
      <div style="font-weight:800; font-size:15px; margin-bottom:12px;">\${b.customer_name || 'Walk-in Customer'}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:12px;">
        <div style="font-size:11px; color:var(--text-dim); font-weight:700; text-transform:uppercase;">\${b.payment_mode}</div>
        <div style="font-size:18px; font-weight:900;">₹\${Number(b.total_amount).toLocaleString()}</div>
      </div>
    </div>
  \`).join('') + \`</div>\`;
}

let aiMessages = [{ role: 'bot', text: '👋 Welcome back! I am your business co-pilot. How can I help you today?' }];
function renderAI(){
  const main = document.getElementById('main-content');
  main.style.padding = '0';
  main.innerHTML = \`
    <div class="chat-container">
      <div class="chat-messages" id="chat-box"></div>
      <div class="chat-input-area glass" style="margin:16px; border-radius:24px;">
        <input class="chat-input" id="ai-input" placeholder="Ask anything about your shop...">
        <div class="btn-icon" style="background:var(--primary); color:white;" onclick="askAI()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </div>
      </div>
    </div>
  \`;
  const box = document.getElementById('chat-box');
  box.innerHTML = aiMessages.map(m => \`
    <div class="msg \${m.role}">\${m.text}</div>
  \`).join('');
  box.scrollTop = box.scrollHeight;
}

async function askAI(){
  const input = document.getElementById('ai-input');
  const text = input.value.trim();
  if(!text) return;
  aiMessages.push({ role: 'user', text });
  input.value = '';
  renderAI();
  try {
    const res = await fetch(D.localApi + '/api/ai/ask', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question:text}) });
    const data = await res.json();
    aiMessages.push({ role: 'bot', text: data.answer || 'Analyzing data...' });
  } catch(e) {
    try {
      const res = await fetch(D.url + '/functions/v1/ai-ask', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+D.key}, body:JSON.stringify({question:text, shop_id:D.shop.id}) });
      const data = await res.json();
      aiMessages.push({ role: 'bot', text: data.answer || 'Consulting cloud brain...' });
    } catch(err) {
      aiMessages.push({ role: 'bot', text: '⚠️ Connection lost. Ensure desktop app is active.' });
    }
  }
  renderAI();
}

function renderTab(tab, el){
  currentTab = tab;
  document.getElementById('main-content').style.padding = '20px';
  document.querySelectorAll('.btn-icon').forEach(x => x.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('hdr-title').innerText = tab.charAt(0).toUpperCase() + tab.slice(1);
  if(tab === 'overview') renderOverview();
  if(tab === 'items') renderItems();
  if(tab === 'bills') renderBills();
  if(tab === 'ai') renderAI();
}

renderTab('overview');
</script></body></html>`;
  };

  const renderDashboard = () => {
    const html = buildDashboardHtml(dashData?.s || {}, dashData?.ts || '', dashData?.sh || {}, session.url, session.key, `http://localhost:4567`);

    if (Platform.OS === 'web') {
      return (
        <View style={{ flex: 1, backgroundColor: '#020617' }}>
          <iframe srcDoc={html} style={{ width: '100%', height: '100%', border: 'none' }} title="Dashboard" />
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        {RNWebView ? (
          <RNWebView 
            source={{ html }} 
            style={{ flex: 1, backgroundColor: '#020617' }}
            originWhitelist={['*']}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={(e) => {
              if (e.nativeEvent.data === 'logout') {
                Alert.alert('Secure Logout', 'Are you sure you want to terminate this session?', [
                  { text: 'Stay' },
                  { text: 'Logout', style: 'destructive', onPress: () => { Store.del('iva_paired'); Store.del('iva_shop_id'); Store.del('iva_shop_url'); Store.del('iva_shop_key'); setScreen('register'); } }
                ]);
              }
            }}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020617' }}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={{ color: '#94a3b8', marginTop: 12 }}>Initializing WebView...</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.c}>
        <StatusBar barStyle="light-content" backgroundColor="#020617" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {screen === 'loading' && <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#6366f1" /></View>}
          {screen === 'register' && (
            <ScrollView contentContainerStyle={styles.sw}>
              <View style={styles.bh}>
                <Text style={styles.bt}>INNO<Text style={{ color: '#6366f1' }}>AIVATORS</Text></Text>
                <Text style={styles.ht}>Owner Registration</Text>
              </View>
              <View style={styles.cg}>
                <Label>Full Name</Label>
                <TextInput style={styles.i} value={fullName} onChangeText={setFullName} placeholderTextColor="#444" placeholder="Enter your name" />
                <Label>Email Address</Label>
                <TextInput style={styles.i} value={email} onChangeText={setEmail} placeholderTextColor="#444" placeholder="owner@email.com" autoCapitalize="none" keyboardType="email-address" />
                <Label>Master Key</Label>
                <PasswordInput value={password} onChangeText={setPassword} show={showPassword} onToggle={() => setShowPassword(!showPassword)} style={styles.i} />
                {error ? <ErrBox msg={error} /> : null}
                {success ? <SuccessBox msg={success} /> : null}
                <TouchableOpacity style={styles.pb} onPress={handleRegister} disabled={loading}>
                  {loading ? <ActivityIndicator color="white" /> : <Text style={styles.pt}>CREATE ACCOUNT</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => { setScreen('login'); setError(''); setSuccess(''); }}>
                  <Text style={{ color: '#64748b', fontSize: 13 }}>Already have an account? <Text style={{ color: '#6366f1', fontWeight: '800' }}>Sign In</Text></Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
          {screen === 'login' && (
            <ScrollView contentContainerStyle={styles.sw}>
              <View style={styles.bh}>
                <Text style={styles.bt}>INNO<Text style={{ color: '#6366f1' }}>AIVATORS</Text></Text>
                <Text style={styles.ht}>Welcome Back</Text>
              </View>
              <View style={styles.cg}>
                <Label>Email ID</Label>
                <TextInput style={styles.i} value={email} onChangeText={setEmail} placeholderTextColor="#444" placeholder="Enter your email" autoCapitalize="none" keyboardType="email-address" />
                <Label>Password</Label>
                <PasswordInput value={password} onChangeText={setPassword} show={showPassword} onToggle={() => setShowPassword(!showPassword)} style={styles.i} />
                {error ? <ErrBox msg={error} /> : null}
                {success ? <SuccessBox msg={success} /> : null}
                <TouchableOpacity style={styles.pb} onPress={handleLogin} disabled={loading}>
                  {loading ? <ActivityIndicator color="white" /> : <Text style={styles.pt}>SIGN IN</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleForgotPassword} style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={{ color: '#f59e0b', fontSize: 13, fontWeight: '700' }}>Forgot Master Key?</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => { setScreen('register'); setError(''); setSuccess(''); }}>
                  <Text style={{ color: '#64748b', fontSize: 13 }}>New to iVA? <Text style={{ color: '#6366f1', fontWeight: '800' }}>Register Shop</Text></Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
          {screen === 'shopId' && (
            <ScrollView contentContainerStyle={styles.sw}>
              <View style={styles.bh}>
                <Text style={styles.h}>🔗 Link Hardware</Text>
                <Text style={styles.sh}>Enter the Shop ID found in your Desktop settings</Text>
              </View>
              <View style={styles.cg}>
                <Label>Hardware Shop ID</Label>
                <TextInput style={styles.i} value={shopIdInput} onChangeText={setShopIdInput} placeholder="shop-XXXXXXXX" placeholderTextColor="#444" autoCapitalize="none" />
                {error ? <ErrBox msg={error} /> : null}
                <TouchableOpacity style={styles.pb} onPress={generatePairingCode} disabled={loading}>
                  {loading ? <ActivityIndicator color="white" /> : <Text style={styles.pt}>INITIATE PAIRING</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
          {screen === 'pairing' && (
            <ScrollView contentContainerStyle={styles.sw}>
              <View style={styles.bh}>
                <Text style={styles.h}>⏳ Authorizing...</Text>
                <Text style={styles.sh}>Enter this code in your Desktop terminal now</Text>
              </View>
              <View style={styles.cg}>
                <Text style={{ fontSize: 52, fontWeight: '900', color: '#6366f1', textAlign: 'center', marginVertical: 30, letterSpacing: 8 }}>{pairingCode}</Text>
                <ActivityIndicator size="small" color="#6366f1" />
                <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20, fontSize: 12 }}>Awaiting secure handshake...</Text>
              </View>
            </ScrollView>
          )}
          {screen === 'resetVerify' && (
            <ScrollView contentContainerStyle={styles.sw}>
              <View style={styles.bh}>
                <Text style={styles.h}>🔐 Reset Key</Text>
                <Text style={styles.sh}>Confirm your identity with the email code</Text>
              </View>
              <View style={styles.cg}>
                <Label>Verification Code</Label>
                <TextInput style={styles.i} value={resetCode} onChangeText={setResetCode} placeholderTextColor="#444" placeholder="6-digit code" keyboardType="number-pad" />
                <Label>New Master Key</Label>
                <PasswordInput value={newPassword} onChangeText={setNewPassword} show={showNewPwd} onToggle={() => setShowNewPwd(!showNewPwd)} placeholder="Enter new key" style={styles.i} />
                <Label>Confirm Key</Label>
                <TextInput style={styles.i} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholderTextColor="#444" placeholder="Confirm new key" />
                {error ? <ErrBox msg={error} /> : null}
                <TouchableOpacity style={styles.pb} onPress={handleResetPassword} disabled={loading}>
                  {loading ? <ActivityIndicator color="white" /> : <Text style={styles.pt}>UPDATE KEY</Text>}
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
  c: { flex: 1, backgroundColor: '#020617' },
  sw: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  bh: { alignItems: 'center', marginBottom: 48 },
  bt: { color: 'white', fontSize: 32, fontWeight: '950', letterSpacing: -1 },
  ht: { color: '#94a3b8', fontSize: 16, fontWeight: '600', marginTop: 8 },
  h: { color: 'white', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  sh: { color: '#64748b', fontSize: 14, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  cg: { backgroundColor: 'rgba(15, 23, 42, 0.5)', borderRadius: 40, padding: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  l: { color: '#64748b', fontSize: 11, fontWeight: '800', marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  i: { backgroundColor: 'rgba(0,0,0,0.2)', color: 'white', padding: 18, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', fontSize: 16, fontWeight: '600' },
  pb: { backgroundColor: '#6366f1', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 6, alignItems: 'center', marginTop: 32, flexDirection: 'row', justifyContent: 'center' },
  pt: { color: 'white', fontWeight: '500', fontSize: 14 },
  eb: { color: '#ef4444', fontSize: 13, marginTop: 16, textAlign: 'center', backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 6, fontWeight: '500' },
  sb: { color: '#10b981', fontSize: 13, marginTop: 16, textAlign: 'center', backgroundColor: 'rgba(16,185,129,0.1)', padding: 12, borderRadius: 6, fontWeight: '500' },
});
