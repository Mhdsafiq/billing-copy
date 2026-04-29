import React, { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { IndianRupee, Receipt, Package, AlertTriangle, TrendingUp, Calendar, ShoppingBag, Bell, X, ChevronDown, ChevronUp } from 'lucide-react';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ── Alert Drilldown Modal ── */
function AlertListModal({ title, icon, color, items, columns, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="invoice-modal" style={{ maxWidth: 600, maxHeight: "80vh" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{icon}</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text-1)" }}>{title}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)" }}><X size={20} /></button>
        </div>
        
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-4)" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            No items in this category
          </div>
        ) : (
          <div style={{ overflowY: "auto", maxHeight: "55vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", background: "var(--surface-2)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--text-2)" }}>#</th>
                  {columns.map((col, i) => (
                    <th key={i} style={{ padding: "10px 12px", textAlign: col.align || "left", fontWeight: 700, color: "var(--text-2)" }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px", color: "var(--text-4)", fontSize: 12 }}>{idx + 1}</td>
                    {columns.map((col, i) => (
                      <td key={i} style={{ padding: "10px 12px", textAlign: col.align || "left", fontWeight: col.bold ? 700 : 400, color: col.color || "var(--text-1)" }}>
                        {col.render ? col.render(item) : item[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button onClick={onClose} className="btn-outline" style={{ padding: "8px 30px" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function OwnerDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState(null); // 'lowStock', 'outOfStock', 'expiring', 'expired'
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        if (window.api?.getDashboardStats) {
          const data = await window.api.getDashboardStats();
          setStats(data);
        }
      } catch (e) {
        console.error("Dashboard fetch error:", e);
      }
      setLoading(false);
    };
    fetchStats();

    // Load notifications
    const loadNotifs = async () => {
      try {
        if (window.api?.getNotifications) {
          const res = await window.api.getNotifications({ limit: 30 });
          setNotifications(res.notifications || []);
          setUnreadCount(res.unreadCount || 0);
        }
      } catch(e) {}
    };
    loadNotifs();
    const doRefresh = () => {
      fetchStats();
      loadNotifs();
    };

    const notifInterval = setInterval(loadNotifs, 30000); // refresh every 30s
    window.addEventListener('soft_refresh', doRefresh);

    return () => {
      clearInterval(notifInterval);
      window.removeEventListener('soft_refresh', doRefresh);
    };
  }, []);

  const markAllRead = async () => {
    await window.api?.markAllNotifRead?.();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
  };

  const markRead = async (id) => {
    await window.api?.markNotificationRead?.(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          Loading Dashboard...
        </div>
      </div>
    );
  }

  // Build daily chart data
  const dailySalesData = stats?.dailySales?.length > 0
    ? stats.dailySales.map(d => ({
        name: new Date(d.day).toLocaleDateString('en-IN', { weekday: 'short' }),
        sales: d.total || 0,
        bills: d.bills || 0
      }))
    : dayNames.map(d => ({ name: d, sales: 0, bills: 0 }));

  const monthlyData = stats?.monthlySalesBreakdown?.length > 0
    ? stats.monthlySalesBreakdown.map(m => ({
        name: m.month,
        total: m.total || 0,
        bills: m.bills || 0
      }))
    : [];

  const todaySales = stats?.todaySales || 0;
  const todayBills = stats?.todayBills || 0;
  const lowStockCount = stats?.lowStockCount || 0;
  const outOfStockCount = stats?.outOfStock || 0;
  const nearExpiryCount = stats?.nearExpiryCount || 0;
  const expiredCount = stats?.expiredCount || 0;
  const totalProducts = stats?.totalProducts || 0;
  const todayProfit = stats?.todayProfit || 0;
  const weeklyProfit = stats?.weeklyProfit || 0;
  const monthlyProfit = stats?.monthlyProfit || 0;

  // Helper for notification icon color based on type
  const notifIcon = (type) => {
    switch(type) {
      case 'LOW_STOCK': return { icon: '📉', color: '#f59e0b' };
      case 'OUT_OF_STOCK': return { icon: '🚫', color: '#ef4444' };
      case 'EXPIRY': return { icon: '⚠️', color: '#ef4444' };
      case 'NEAR_EXPIRY': return { icon: '⏰', color: '#f97316' };
      case 'DEAD_STOCK': return { icon: '💀', color: '#6b7280' };
      default: return { icon: '🔔', color: '#3b82f6' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, position: 'relative' }}>
      
      {/* Header with notification bell */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="page-title" style={{ margin: 0 }}>Business Dashboard</div>
        
        {/* Notification Bell */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNotifPanel(!showNotifPanel)}
            style={{
              width: 42, height: 42, borderRadius: 12,
              background: showNotifPanel ? 'var(--primary)' : 'var(--surface-2)',
              border: '1px solid var(--border)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', transition: 'all 0.2s'
            }}
          >
            <Bell size={20} color={showNotifPanel ? '#fff' : 'var(--text-2)'} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: '#ef4444', color: '#fff',
                fontSize: 10, fontWeight: 800, borderRadius: '50%',
                width: 20, height: 20, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
                animation: 'pulse 2s infinite'
              }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {/* Notification Panel */}
          {showNotifPanel && (
            <div style={{
              position: 'absolute', top: 50, right: 0, width: 380,
              background: 'white', borderRadius: 16,
              border: '1px solid var(--border)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
              zIndex: 100, overflow: 'hidden'
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 20px', borderBottom: '1px solid var(--border)',
                background: 'var(--surface-2)'
              }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-1)' }}>
                  🔔 Notifications {unreadCount > 0 && <span style={{ color: '#ef4444' }}>({unreadCount})</span>}
                </div>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--primary)',
                    background: 'none', border: 'none', cursor: 'pointer'
                  }}>Mark all read</button>
                )}
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
                    No notifications yet
                  </div>
                ) : notifications.map(n => {
                  const ni = notifIcon(n.type);
                  return (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (!n.is_read) markRead(n.id);
                        // Open relevant modal based on type
                        if (n.type === 'LOW_STOCK') setActiveModal('lowStock');
                        else if (n.type === 'OUT_OF_STOCK') setActiveModal('outOfStock');
                        else if (n.type === 'EXPIRY') setActiveModal('expired');
                        else if (n.type === 'NEAR_EXPIRY') setActiveModal('expiring');
                        setShowNotifPanel(false);
                      }}
                      style={{
                        display: 'flex', gap: 12, padding: '14px 20px',
                        borderBottom: '1px solid var(--border)',
                        background: n.is_read ? 'transparent' : '#f0f9ff',
                        cursor: 'pointer', transition: 'background 0.15s'
                      }}
                    >
                      <div style={{ fontSize: 20, flexShrink: 0 }}>{ni.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: n.is_read ? 500 : 700, fontSize: 13, color: 'var(--text-1)', marginBottom: 2 }}>{n.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>{n.message}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 4 }}>
                          {new Date(n.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0, marginTop: 6 }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <StatCard icon={<IndianRupee size={22} />} label="Today's Sales" value={"₹" + todaySales.toLocaleString('en-IN')} color="#0052cc" />
        <StatCard icon={<Receipt size={22} />} label="Today's Bills" value={todayBills} color="#8b5cf6" />
        <StatCard icon={<TrendingUp size={22} />} label="Today's Profit" value={"₹" + todayProfit.toLocaleString('en-IN')} color="#10b981" />
        <StatCard icon={<Package size={22} />} label="Total Products" value={totalProducts} color="#3b82f6" />
        
        {/* Clickable Alert Cards */}
        <StatCard
          icon={<AlertTriangle size={22} />}
          label="Low Stock"
          value={lowStockCount}
          color="#f59e0b"
          alert={lowStockCount > 0}
          onClick={() => lowStockCount > 0 && setActiveModal('lowStock')}
          clickable={lowStockCount > 0}
        />
        <StatCard
          icon="🚫" label="Out of Stock"
          value={outOfStockCount}
          color="#ef4444"
          alert={outOfStockCount > 0}
          onClick={() => outOfStockCount > 0 && setActiveModal('outOfStock')}
          clickable={outOfStockCount > 0}
        />
        <StatCard
          icon="⏰" label="Expiring Soon"
          value={nearExpiryCount}
          color="#f97316"
          alert={nearExpiryCount > 0}
          onClick={() => nearExpiryCount > 0 && setActiveModal('expiring')}
          clickable={nearExpiryCount > 0}
        />
        <StatCard
          icon="⚠️" label="Expired"
          value={expiredCount}
          color="#dc2626"
          alert={expiredCount > 0}
          onClick={() => expiredCount > 0 && setActiveModal('expired')}
          clickable={expiredCount > 0}
        />
      </div>

      {/* Profit Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        <div className="modern-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today's Profit</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: todayProfit >= 0 ? '#10b981' : 'var(--danger)' }}>₹{todayProfit.toLocaleString('en-IN')}</div>
        </div>
        <div className="modern-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Weekly Profit</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: weeklyProfit >= 0 ? '#10b981' : 'var(--danger)' }}>₹{weeklyProfit.toLocaleString('en-IN')}</div>
        </div>
        <div className="modern-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly Profit</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: monthlyProfit >= 0 ? '#10b981' : 'var(--danger)' }}>₹{monthlyProfit.toLocaleString('en-IN')}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Sales Trend Chart */}
        <div className="modern-card">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} color="var(--text-3)" />
            7-Day Sales Trend
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySalesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-3)', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-3)', fontSize: 12}} />
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: 'var(--shadow-md)' }} />
                <Area type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Consultant Box */}
        <div className="modern-card" style={{ display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, #0284c710 0%, #0284c705 100%)', border: '1px solid #0284c720' }}>
           <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8, color: '#0284c7' }}>
              <TrendingUp size={20} />
              AI Business Consultant
           </div>
           <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>Ask me anything about your today's sales, stock status, or top customers.</p>
           
           <div style={{ flex: 1, overflowY: 'auto', marginBottom: 15, fontSize: 13 }}>
              <div style={{ background: 'white', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                 {stats?.aiResponse || "I am ready to help you optimize your business! Ask below:"}
              </div>
           </div>

           <div style={{ display: 'flex', gap: 8 }}>
              <input 
                 onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                       const resp = await window.api.askAIConsultant(e.currentTarget.value);
                       setStats(prev => ({ ...prev, aiResponse: resp }));
                       e.currentTarget.value = "";
                    }
                 }}
                 placeholder="Type & press Enter..." 
                 style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} 
              />
           </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Peak Time Analysis */}
        <div className="modern-card">
           <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>📊 Peak Timing (Hourly)</div>
           <div style={{ width: '100%', height: 200 }}>
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={stats?.peakHours || []} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} />
                 <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                 <Tooltip />
                 <Bar dataKey="bills" fill="var(--primary)" radius={[2, 2, 0, 0]} />
               </BarChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Top Products */}
        <div className="modern-card">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={18} color="var(--text-3)" />
            Top Selling (30d)
          </div>
          {stats?.topProducts?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {stats.topProducts.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < stats.topProducts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{i+1}</div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>{p.sold} sold</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-4)' }}>No sales data yet</div>
          )}
        </div>
      </div>

      {/* Monthly Breakdown */}
      {monthlyData.length > 0 && (
        <div className="modern-card">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={18} color="var(--text-3)" />
            Monthly Sales Breakdown
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-3)', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-3)', fontSize: 12}} />
                <Tooltip cursor={{fill: 'var(--surface-2)'}} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: 'var(--shadow-md)' }} />
                <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── ALERT DRILLDOWN MODALS ── */}
      {activeModal === 'lowStock' && (
        <AlertListModal
          title={`Low Stock Products (${lowStockCount})`}
          icon="📉" color="#f59e0b"
          items={stats?.lowStockProducts || []}
          columns={[
            { key: 'name', label: 'Product Name', bold: true },
            { key: 'quantity', label: 'Stock Left', align: 'center', color: '#f59e0b', bold: true },
            { key: 'unit', label: 'Unit', align: 'center' },
            { key: 'category_name', label: 'Category' }
          ]}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'outOfStock' && (
        <AlertListModal
          title={`Out of Stock Products (${outOfStockCount})`}
          icon="🚫" color="#ef4444"
          items={stats?.outOfStockProducts || []}
          columns={[
            { key: 'name', label: 'Product Name', bold: true },
            { key: 'unit', label: 'Unit', align: 'center' },
            { key: 'category_name', label: 'Category' }
          ]}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'expiring' && (
        <AlertListModal
          title={`Expiring Soon (${nearExpiryCount})`}
          icon="⏰" color="#f97316"
          items={stats?.expiringProducts || []}
          columns={[
            { key: 'name', label: 'Product Name', bold: true },
            { label: 'Expiry Date', render: (item) => new Date(item.expiry_date).toLocaleDateString('en-IN'), align: 'center', color: '#f97316', bold: true },
            { label: 'Days Left', render: (item) => { const d = Math.ceil((new Date(item.expiry_date) - new Date()) / 86400000); return d <= 0 ? 'Today!' : `${d} days`; }, align: 'center', color: '#ef4444', bold: true },
            { key: 'quantity', label: 'Stock', align: 'center' }
          ]}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'expired' && (
        <AlertListModal
          title={`Expired Products (${expiredCount})`}
          icon="⚠️" color="#dc2626"
          items={stats?.expiredProducts || []}
          columns={[
            { key: 'name', label: 'Product Name', bold: true },
            { label: 'Expired On', render: (item) => new Date(item.expiry_date).toLocaleDateString('en-IN'), align: 'center', color: '#ef4444', bold: true },
            { key: 'quantity', label: 'Stock', align: 'center' },
            { key: 'category_name', label: 'Category' }
          ]}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, alert, onClick, clickable }) {
  return (
    <div
      className="modern-card"
      onClick={onClick}
      style={{
        padding: 20, position: 'relative',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'all 0.2s',
        ...(clickable ? { borderColor: `${color}40` } : {})
      }}
      onMouseOver={e => { if (clickable) e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseOut={e => { if (clickable) e.currentTarget.style.transform = 'none'; }}
    >
      {alert && (
        <div style={{ position: 'absolute', top: 16, right: 16, width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)', boxShadow: '0 0 0 4px var(--danger-bg)' }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: typeof icon === 'string' ? 22 : undefined }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)' }}>{value}</div>
        </div>
      </div>
      {clickable && (
        <div style={{ fontSize: 10, color, fontWeight: 700, marginTop: 8, textAlign: 'right' }}>
          Click to view list →
        </div>
      )}
    </div>
  );
}
