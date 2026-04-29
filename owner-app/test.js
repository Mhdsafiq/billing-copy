import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, StatusBar, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

let WebView = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

// ═══════════════════════════════════════════════════════════════════
//  ⚙️ SUPABASE CONFIG — Set these once from your .env file
//  These are your project's public (anon) keys — safe for client use
// ═══════════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://baawqrqihlhsrghvjlpx.supabase.co';     // e.g. https://abcd1234.supabase.co
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0'; // e.g. eyJhbGciOi...

// Simple persistent storage (works on web + native)
const Store = {
  _mem: {},
  get(k) { try { return Platform.OS === 'web' ? localStorage.getItem(k) : (Store._mem[k] || null); } catch { return null; } },
  set(k, v) { try { if (Platform.OS === 'web') localStorage.setItem(k, v); Store._mem[k] = v; } catch {} },
  del(k) { try { if (Platform.OS === 'web') localStorage.removeItem(k); delete Store._mem[k]; } catch {} },
};

// ═══════════════════════════════════════════════════════════════════
//  OWNER APP
// ═══════════════════════════════════════════════════════════════════
function OwnerApp() {
  // Navigation: register | login | forgot | shopId | pairing | dashboard
  const [screen, setScreen] = useState('login');
  const [sb, setSb] = useState(null); // Supabase client

  // Auth fields
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [authUser, setAuthUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Pairing
  const [shopId, setShopId] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [codeTimer, setCodeTimer] = useState(0);
  const [isPaired, setIsPaired] = useState(false);
  const [deviceId] = useState('dev-' + Math.random().toString(36).substr(2, 8));
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const webviewRef = useRef(null);

  // ── Initialize Supabase on mount ──
  useEffect(() => {
    initClient();
    // Check if already paired
    const savedPaired = Store.get('iva_paired');
    const savedShopId = Store.get('iva_shop_id');
    if (savedPaired === 'true' && savedShopId) {
      setShopId(savedShopId);
      setIsPaired(true);
      setScreen('dashboard');
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const initClient = () => {
    try {
      if (typeof window !== 'undefined' && window.supabase) {
        const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        setSb(client);
        return client;
      }
      return null;
    } catch { return null; }
  };

  const sbFetch = async (table, method, body, query = '') => {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : undefined,
    };
    Object.keys(headers).forEach(k => headers[k] === undefined && delete headers[k]);
    
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.msg || JSON.stringify(data));
    return data;
  };

  const sbAuth = async (endpoint, body) => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || data.message || 'Auth failed');
    return data;
  };

  // ══════════════════════════════════════════════════════
  //  REGISTER SCREEN
  // ══════════════════════════════════════════════════════
  const renderRegister = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}>
        <View style={[s.logoBadge, { backgroundColor: '#22c55e' }]}>
          <Text style={{ fontSize: 26 }}>📝</Text>
        </View>
      </View>
      <Text style={s.heading}>Create Account</Text>
      <Text style={s.subheading}>Register as a shop owner</Text>

      <Label>Owner Name</Label>
      <TextInput style={s.input} value={ownerName} onChangeText={setOwnerName}
        placeholder="Your full name" placeholderTextColor="#555" autoCapitalize="words" />

      <Label>Email Address</Label>
      <TextInput style={s.input} value={email} onChangeText={setEmail}
        placeholder="owner@email.com" placeholderTextColor="#555" autoCapitalize="none" keyboardType="email-address" />

      <Label>Mobile Number</Label>
      <TextInput style={s.input} value={mobile} onChangeText={(t) => setMobile(t.replace(/[^0-9+]/g, ''))}
        placeholder="+91 9876543210" placeholderTextColor="#555" keyboardType="phone-pad" maxLength={15} />

      <Label>Password</Label>
      <TextInput style={s.input} value={password} onChangeText={setPassword}
        placeholder="Min 6 characters" placeholderTextColor="#555" secureTextEntry />

      {error ? <ErrBox msg={error} /> : null}

      <TouchableOpacity style={s.primaryBtn} disabled={loading} onPress={async () => {
        if (!ownerName.trim() || !email.trim() || !mobile.trim() || !password.trim()) {
          setError('Please fill in all fields'); return;
        }
        if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
        setLoading(true); setError('');

        try {
          const authData = await sbAuth('signup', {
            email: email.trim(),
            password,
            data: { owner_name: ownerName.trim(), mobile: mobile.trim() },
          });

          // Check if registration was successful or pending email verification
          if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
            setError('This email is already registered. Please login or reset your password.');
            setLoading(false);
            return;
          }

          Alert.alert('✅ Account Created', 'You can now log in with your email and password.', [
            { text: 'Login', onPress: () => { setError(''); setScreen('login'); } }
          ]);
        } catch (e) {
          setError(e.message);
        }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? '⏳ Creating...' : '🚀 CREATE ACCOUNT'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => { setError(''); setScreen('login'); }}>
        <Text style={s.linkText}>Already have an account? Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ══════════════════════════════════════════════════════
  //  LOGIN SCREEN
  // ══════════════════════════════════════════════════════
  const renderLogin = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}>
        <View style={s.logoBadge}><Text style={{ fontSize: 26 }}>🔐</Text></View>
      </View>
      <Text style={s.heading}>Welcome Back</Text>
      <Text style={s.subheading}>Login to access your shop</Text>

      <Label>Email</Label>
      <TextInput style={s.input} value={email} onChangeText={setEmail}
        placeholder="owner@email.com" placeholderTextColor="#555" autoCapitalize="none" keyboardType="email-address" />

      <Label>Password</Label>
      <TextInput style={s.input} value={password} onChangeText={setPassword}
        placeholder="Enter password" placeholderTextColor="#555" secureTextEntry />

      {error ? <ErrBox msg={error} /> : null}

      <TouchableOpacity style={s.primaryBtn} disabled={loading} onPress={async () => {
        if (!email.trim() || !password.trim()) { setError('Fill in all fields'); return; }
        setLoading(true); setError('');

        try {
          const data = await sbAuth('token?grant_type=password', {
            email: email.trim(),
            password,
          });
          setAuthUser(data.user || data);
          Store.set('iva_auth_token', data.access_token || '');
          
          // Auto-connect magic: search shops by email or by paired_devices
          const myEmail = email.trim();
          let autoShopId = null;

          // 1. Check if Desktop created a shop with this owner_email
          const shops = await sbFetch('shops', 'GET', null, `?owner_email=eq.${myEmail}&select=id,name`);
          if (shops && shops.length > 0) {
            autoShopId = shops[0].id;
          } else {
            // 2. Check if already paired before
            const devs = await sbFetch('paired_devices', 'GET', null, `?user_email=eq.${myEmail}&select=shop_id`);
            if (devs && devs.length > 0) {
              autoShopId = devs[0].shop_id;
            }
          }

          if (autoShopId) {
             Store.set('iva_shop_id', autoShopId);
             Store.set('iva_paired', 'true');
             setShopId(autoShopId);
             setIsPaired(true);

             // Ensure device is registered as active
             await sbFetch('paired_devices', 'POST', {
                shop_id: autoShopId,
                user_id: data.user?.id || null,
                user_email: myEmail,
                device_name: Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Web Browser',
                device_id: deviceId,
                is_active: true,
             });

             setScreen('dashboard');
          } else {
             // Let them manually enter ShopID if not found automatically
             setScreen('shopId');
          }
        } catch (e) {
          setError(e.message);
        }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? '⏳ Logging in...' : '🔑 LOGIN'}</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 }}>
        <TouchableOpacity onPress={() => { setError(''); setScreen('register'); }}>
          <Text style={s.linkText}>Create Account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setError(''); setScreen('forgot'); }}>
          <Text style={[s.linkText, { color: '#f59e0b' }]}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ══════════════════════════════════════════════════════
  //  FORGOT PASSWORD FLOW (OTP based)
  // ══════════════════════════════════════════════════════
  const renderForgot = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}>
        <View style={[s.logoBadge, { backgroundColor: '#f59e0b' }]}>
          <Text style={{ fontSize: 26 }}>🔑</Text>
        </View>
      </View>
      <Text style={s.heading}>Reset Password</Text>
      <Text style={s.subheading}>Enter your email to receive a code</Text>

      <Label>Email</Label>
      <TextInput style={s.input} value={email} onChangeText={setEmail}
        placeholder="owner@email.com" placeholderTextColor="#555" autoCapitalize="none" keyboardType="email-address" />

      {error ? <ErrBox msg={error} /> : null}

      <TouchableOpacity style={[s.primaryBtn, { backgroundColor: '#f59e0b' }]} disabled={loading} onPress={async () => {
        if (!email.trim()) { setError('Enter your email'); return; }
        setLoading(true); setError('');

        try {
          await sbAuth('recover', { email: email.trim() });
          Alert.alert('📧 OTP Sent', 'Check your inbox for the verification code.', [
            { text: 'OK', onPress: () => { setOtp(''); setScreen('forgot_otp'); } }
          ]);
        } catch (e) { setError(e.message); }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? 'Sending...' : '📧 SEND OTP CODE'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => { setError(''); setScreen('login'); }}>
        <Text style={s.linkText}>← Back to Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderForgotOtp = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}><View style={[s.logoBadge, { backgroundColor: '#f59e0b' }]}><Text style={{ fontSize: 26 }}>💬</Text></View></View>
      <Text style={s.heading}>Enter OTP Code</Text>
      <Text style={s.subheading}>Enter the code sent to {email}</Text>

      <Label>Verification Code</Label>
      <TextInput style={s.input} value={otp} onChangeText={setOtp}
        placeholder="6-digit code" placeholderTextColor="#555" keyboardType="numeric" />

      {error ? <ErrBox msg={error} /> : null}

      <TouchableOpacity style={[s.primaryBtn, { backgroundColor: '#f59e0b' }]} disabled={loading} onPress={async () => {
        if (!otp.trim()) { setError('Enter the code from your email'); return; }
        setLoading(true); setError('');
        try {
          const data = await sbAuth('verify', { type: 'recovery', email: email.trim(), token: otp.trim() });
          setResetToken(data.access_token || data.session?.access_token);
          setScreen('forgot_reset');
        } catch (e) { setError(e.message); }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? 'Verifying...' : 'VERIFY CODE'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderForgotReset = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}><View style={[s.logoBadge, { backgroundColor: '#f59e0b' }]}><Text style={{ fontSize: 26 }}>🔒</Text></View></View>
      <Text style={s.heading}>New Password</Text>
      <Text style={s.subheading}>Enter your new password below</Text>

      <Label>New Password</Label>
      <TextInput style={s.input} value={password} onChangeText={setPassword}
        placeholder="Min 6 chars" placeholderTextColor="#555" secureTextEntry />

      <Label>Confirm Password</Label>
      <TextInput style={s.input} value={confirmPassword} onChangeText={setConfirmPassword}
        placeholder="Re-enter password" placeholderTextColor="#555" secureTextEntry />

      {error ? <ErrBox msg={error} /> : null}

      <TouchableOpacity style={[s.primaryBtn, { backgroundColor: '#f59e0b' }]} disabled={loading} onPress={async () => {
        if (!password || password.length < 6) { setError('Password must be 6+ chars'); return; }
        if (password !== confirmPassword) { setError('Passwords do not match'); return; }
        setLoading(true); setError('');
        try {
          await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            method: 'PUT',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${resetToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          });
          Alert.alert('✅ Success', 'Password updated successfully. You can now login.', [
            { text: 'Login', onPress: () => { setPassword(''); setScreen('login'); } }
          ]);
        } catch (e) { setError('Failed to update password. Try again.'); }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? 'Updating...' : 'UPDATE PASSWORD'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ══════════════════════════════════════════════════════
  //  ENTER SHOP ID
  // ══════════════════════════════════════════════════════
  const renderShopId = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}>
        <View style={[s.logoBadge, { backgroundColor: '#06b6d4' }]}>
          <Text style={{ fontSize: 26 }}>🏪</Text>
        </View>
      </View>
      <Text style={s.heading}>Link Your Shop</Text>
      <Text style={s.subheading}>
        Enter the Shop ID from your desktop POS app.{'\n'}
        Find it in Settings or on the sidebar.
      </Text>

      <Label>Shop ID</Label>
      <TextInput style={[s.input, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 }]}
        value={shopId} onChangeText={setShopId}
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" placeholderTextColor="#444" autoCapitalize="none" />

      {error ? <ErrBox msg={error} /> : null}

      <TouchableOpacity style={[s.primaryBtn, { backgroundColor: '#06b6d4' }]} disabled={loading} onPress={async () => {
        const sid = shopId.trim();
        if (!sid || sid.length < 8) { setError('Enter a valid Shop ID'); return; }
        setLoading(true); setError('');

        try {
          // Validate shop exists in Supabase
          const shops = await sbFetch('shops', 'GET', null, `?id=eq.${sid}&select=id,name`);
          if (!shops || shops.length === 0) {
            setError('Shop not found. Check the ID and try again.');
            setLoading(false);
            return;
          }
          Store.set('iva_shop_id', sid);
          setShopId(sid);
          setScreen('pairing');
        } catch (e) { setError(e.message); }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? 'Validating...' : '✅ VALIDATE SHOP'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[s.outlineBtn, { marginTop: 20 }]} onPress={() => {
        setAuthUser(null); setScreen('login');
      }}>
        <Text style={s.outlineBtnText}>← Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ══════════════════════════════════════════════════════
  //  PAIRING SCREEN — Mobile generates code
  // ══════════════════════════════════════════════════════
  const generatePairingCode = async () => {
    setLoading(true); setError('');
    try {
      // Generate 6-digit code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 120000).toISOString(); // 2 minutes

      // Expire old pending codes for this shop
      await fetch(`${SUPABASE_URL}/rest/v1/pairing_codes?shop_id=eq.${shopId}&status=eq.pending`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'expired' }),
      });

      // Insert new code
      await sbFetch('pairing_codes', 'POST', {
        shop_id: shopId,
        code,
        status: 'pending',
        device_id: deviceId,
        user_id: authUser?.id || null,
        expires_at: expiresAt,
      });

      setPairingCode(code);
      setCodeTimer(120);

      // Start countdown
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCodeTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Poll for code being used (desktop entered it)
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const result = await sbFetch('pairing_codes', 'GET', null,
            `?shop_id=eq.${shopId}&code=eq.${code}&select=status`);

          if (result && result[0] && result[0].status === 'used') {
            clearInterval(pollRef.current);
            clearInterval(timerRef.current);

            // Register device as paired
            await sbFetch('paired_devices', 'POST', {
              shop_id: shopId,
              user_id: authUser?.id || null,
              user_email: email,
              device_name: Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Web Browser',
              device_id: deviceId,
              is_active: true,
            });

            Store.set('iva_paired', 'true');
            Store.set('iva_shop_id', shopId);
            setIsPaired(true);
            setScreen('dashboard');
            Alert.alert('✅ Paired!', 'Your device is now linked to the shop. Data will sync automatically.');
          }
        } catch {}
      }, 2000);

    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const renderPairing = () => {
    const isExpired = codeTimer === 0 && pairingCode;
    
    return (
      <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
        <View style={s.logoWrap}>
          <View style={[s.logoBadge, { backgroundColor: '#8b5cf6' }]}>
            <Text style={{ fontSize: 26 }}>🔗</Text>
          </View>
        </View>
        <Text style={s.heading}>Pair Your Device</Text>
        <Text style={s.subheading}>
          Generate a pairing key and enter it{'\n'}in the desktop POS app to link this device.
        </Text>

        {/* Code Display */}
        {pairingCode ? (
          <View style={{ marginVertical: 20 }}>
            <Text style={{ color: '#707085', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', textAlign: 'center', marginBottom: 12 }}>
              Your Pairing Key
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {pairingCode.split('').map((d, i) => (
                <View key={i} style={{
                  width: 46, height: 58, borderRadius: 14,
                  backgroundColor: isExpired ? 'rgba(239,68,68,0.08)' : 'rgba(139,92,246,0.12)',
                  borderWidth: 2, borderColor: isExpired ? 'rgba(239,68,68,0.25)' : 'rgba(139,92,246,0.35)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: isExpired ? '#ef4444' : 'white', fontSize: 26, fontWeight: '900' }}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Timer */}
            {codeTimer > 0 && (
              <View style={{ marginTop: 16 }}>
                <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{
                    width: `${(codeTimer / 120) * 100}%`, height: '100%', borderRadius: 3,
                    backgroundColor: codeTimer > 30 ? '#22c55e' : codeTimer > 10 ? '#f59e0b' : '#ef4444',
                  }} />
                </View>
                <Text style={{ color: codeTimer > 30 ? '#22c55e' : '#f59e0b', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 6 }}>
                  ⏱ Expires in {Math.floor(codeTimer / 60)}:{String(codeTimer % 60).padStart(2, '0')}
                </Text>
              </View>
            )}

            {isExpired && (
              <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 12 }}>
                ⏰ Code expired. Generate a new one.
              </Text>
            )}

            {!isExpired && codeTimer > 0 && (
              <View style={{ backgroundColor: 'rgba(139,92,246,0.08)', borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)' }}>
                <Text style={{ color: '#c4b5fd', fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 6 }}>
                  📋 Enter this code in your desktop app
                </Text>
                <Text style={{ color: '#707085', fontSize: 11, textAlign: 'center', lineHeight: 18 }}>
                  Desktop POS → Click "🔗 Pair Mobile" → Enter the 6-digit key above
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {error ? <ErrBox msg={error} /> : null}

        <TouchableOpacity
          style={[s.primaryBtn, { backgroundColor: '#8b5cf6' }]}
          disabled={loading || (codeTimer > 0 && !isExpired)}
          onPress={generatePairingCode}
        >
          <Text style={s.primaryBtnText}>
            {loading ? '⏳ Generating...' : pairingCode ? '🔄 GENERATE NEW CODE' : '🔑 GENERATE PAIRING KEY'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.outlineBtn, { marginTop: 16 }]} onPress={() => {
          if (timerRef.current) clearInterval(timerRef.current);
          if (pollRef.current) clearInterval(pollRef.current);
          setPairingCode(''); setCodeTimer(0);
          setScreen('shopId');
        }}>
          <Text style={s.outlineBtnText}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ══════════════════════════════════════════════════════
  //  DASHBOARD (Cloud — reads from Supabase)
  // ══════════════════════════════════════════════════════
  const renderDashboard = () => {
    if (!WebView && Platform.OS !== 'web') {
      return <View style={{ flex: 1, backgroundColor: '#06060a', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'white' }}>WebView not available</Text>
      </View>;
    }

    const html = buildDashboardHtml();

    if (Platform.OS === 'web') {
      // Web: use iframe with srcdoc
      return (
        <View style={{ flex: 1, backgroundColor: '#06060a', alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: 480, flex: 1, backgroundColor: '#06060a' }}>
            {React.createElement('iframe', {
              srcDoc: html,
              style: { width: '100%', height: '100%', border: 'none', backgroundColor: '#06060a' },
              title: 'Dashboard',
            })}
          </View>
        </View>
      );
    }

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#06060a' }} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="#06060a" />
        <WebView
          ref={webviewRef}
          source={{ html, baseUrl: 'https://cdn.jsdelivr.net' }}
          style={{ flex: 1, backgroundColor: '#06060a' }}
          bounces={false} overScrollMode="never" originWhitelist={['*']}
          javaScriptEnabled domStorageEnabled mixedContentMode="always"
          startInLoadingState
          onMessage={(event) => {
            if (event.nativeEvent.data === 'logout') {
              Alert.alert('Logout', 'Unpair this device and logout?', [
                { text: 'Cancel' },
                { text: 'Logout', style: 'destructive', onPress: () => {
                  Store.del('iva_paired'); setIsPaired(false); setScreen('login');
                }},
              ]);
            }
          }}
          renderLoading={() => (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={s.loadingText}>Loading Dashboard...</Text>
            </View>
          )}
        />
      </SafeAreaView>
    );
  };

  // ── Build dashboard HTML ──
  const buildDashboardHtml = () => `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,-apple-system,sans-serif;background:#06060a;color:#f0f0f5;-webkit-font-smoothing:antialiased;padding-bottom:60px}
.ld{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:12px}
.sp{width:36px;height:36px;border:3px solid #1a1a24;border-top-color:#6366f1;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.tabs{display:flex;gap:6px;padding:14px 16px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.tab{padding:7px 14px;border-radius:18px;font-size:11px;font-weight:700;border:1px solid #1a1a24;background:#0d0d14;color:#707085;cursor:pointer;white-space:nowrap;text-transform:uppercase;letter-spacing:.04em}
.tab.on{background:rgba(99,102,241,.15);color:#6366f1;border-color:#6366f1}
.pg{display:none;padding:0 16px 16px}.pg.on{display:block}
.card{background:#0d0d14;border:1px solid #1a1a24;border-radius:14px;padding:14px 16px;margin-bottom:8px}
.lbl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#45455a;font-weight:700;margin-bottom:4px}
.val{font-size:16px;font-weight:800}
.row{display:flex;gap:10px}.row>div{flex:1}
</style>
</head><body>
<div class="ld" id="ld"><div class="sp"></div><div style="color:white;font-size:15px;font-weight:700">Loading...</div></div>
<div id="app" style="display:none"></div>
<script>