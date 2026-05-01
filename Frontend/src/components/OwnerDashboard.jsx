import React, { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { IndianRupee, Receipt, Package, AlertTriangle, TrendingUp, Calendar, ShoppingBag, Bell, X, ChevronDown, ChevronUp } from 'lucide-react';

const StatCard = ({ title, value, icon, trend, color, onClick }) => (
  <div className="modern-card animate-up hover-glow" onClick={onClick} style={{ padding: '32px', cursor: onClick ? 'pointer' : 'default', position: 'relative', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', top: 0, right: 0, width: '100px', height: '100px', background: `color`, borderRadius: '0 0 0 100%' }}></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>{title}</div>
        <div style={{ fontSize: '32px', fontWeight: 950, color: '#fff', letterSpacing: '-0.04em' }}>{value}</div>
        {trend && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', fontSize: '12px', fontWeight: 800, color: trend.startsWith('+') ? 'var(--success)' : 'var(--danger)' }}>
            {trend.startsWith('+') ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {trend} <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>vs yesterday</span>
          </div>
        )}
      </div>
      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>
        {icon}
      </div>
    </div>
  </div>
);

function AlertListModal({ title, items, color, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div className="invoice-modal animate-up" onClick={e => e.stopPropagation()} style={{ width: '700px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <h2 className="text-gradient" style={{ margin: 0, fontSize: '28px', fontWeight: 950 }}>{title} REPORT</h2>
          <button onClick={onClose} className="btn-outline" style={{ width: '40px', height: '40px', padding: 0 }}>✕</button>
        </div>
        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', fontSize: '10px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px', textAlign: 'left' }}>Nomenclature</th>
                <th style={{ padding: '16px', textAlign: 'center' }}>Current Reserve</th>
                <th style={{ padding: '16px', textAlign: 'right' }}>Criticality</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '16px', fontWeight: 700 }}>{it.name}</td>
                  <td style={{ padding: '16px', textAlign: 'center', fontWeight: 800 }}>{it.quantity} {it.unit}</td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', fontWeight: 900, color }}>HIGH ALERT</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)' }}>Zero critical incidents found.</div>}
        </div>
        <button onClick={onClose} className="btn-primary" style={{ width: '100%', marginTop: '32px', height: '56px' }}>ACKNOWLEDGE</button>
      </div>
    </div>
  );
}

export default function OwnerDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const fetchStats = async () => {
    if (window.api?.getDashboardStats) {
      const data = await window.api.getDashboardStats();
      setStats(data);
    }
    setLoading(false);
  };

  const loadNotifs = async () => {
    if (window.api?.getNotifications) {
      const res = await window.api.getNotifications({ limit: 30 });
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    }
  };

  useEffect(() => {
    fetchStats();
    loadNotifs();
    const interval = setInterval(loadNotifs, 30000);
    window.addEventListener('soft_refresh', fetchStats);
    return () => {
      clearInterval(interval);
      window.removeEventListener('soft_refresh', fetchStats);
    };
  }, []);

  const markAllRead = async () => {
    if (window.api?.markNotificationsRead) {
      await window.api.markNotificationsRead();
      loadNotifs();
    }
  };

  if (loading) return (
    <div className="flex-center" style={{ height: '100vh', flexDirection: 'column', gap: '20px' }}>
       <div className="animate-spin" style={{ width: '48px', height: '48px', border: '4px solid var(--primary-glow)', borderTopColor: 'var(--primary)', borderRadius: '50%' }}></div>
       <div style={{ fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '1px' }}>SYNCHRONIZING ANALYTICS...</div>
    </div>
  );

  return (
    <div className="animate-fade" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '48px', gap: '24px' }}>
          <div>
            <h1 className="text-gradient" style={{ margin: 0, fontSize: '42px', fontWeight: 950, letterSpacing: '-0.04em' }}>Command Center</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginTop: '6px', fontWeight: 500 }}>Real-time telemetry and operational intelligence</p>
          </div>
          
          <div style={{ display: 'flex', gap: '16px', position: 'relative' }}>
            <button onClick={() => setShowNotifPanel(!showNotifPanel)} className="btn-outline" style={{ width: '60px', height: '60px', padding: 0, position: 'relative' }}>
              <Bell size={24} />
              {unreadCount > 0 && <span className="flex-center" style={{ position: 'absolute', top: '15px', right: '15px', width: '20px', height: '20px', background: 'var(--danger)', borderRadius: '50%', fontSize: '10px', fontWeight: 950, border: '2px solid #020617' }}>{unreadCount}</span>}
            </button>
            
            {showNotifPanel && (
              <div className="glass-panel animate-up" style={{ position: 'absolute', top: '75px', right: 0, width: '400px', zIndex: 1000, padding: 0, overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }}>
                <div style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <div style={{ fontWeight: 900, fontSize: '14px' }}>OPERATIONAL ALERTS</div>
                   <button onClick={markAllRead} style={{ fontSize: '11px', fontWeight: 900, color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>MARK ALL READ</button>
                </div>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>No active alerts</div>
                  ) : notifications.map(n => (
                    <div key={n.id} style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', background: n.is_read ? 'transparent' : 'rgba(99,102,241,0.05)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: n.type === 'expiry' ? 'var(--danger)' : 'var(--warning)', marginBottom: '4px' }}>{n.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{n.message}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '8px', fontWeight: 800 }}>{new Date(n.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Top Metrics */}
        <div className="grid-4" style={{ gap: '24px', marginBottom: '48px' }}>
          <StatCard title="Daily Revenue" value={`₹${stats?.salesToday?.total || 0}`} icon="💰" color="#10b981" trend="+12.5%" />
          <StatCard title="Transaction Count" value={stats?.salesToday?.count || 0} icon="📄" color="#6366f1" trend="+4.2%" />
          <StatCard title="Inventory Depth" value={stats?.inventoryCount || 0} icon="📦" color="#f59e0b" />
          <StatCard title="Active Campaigns" value={stats?.offersCount || 0} icon="📢" color="#8b5cf6" />
        </div>

        {/* Charts Section */}
        <div className="grid-2" style={{ gap: '32px', marginBottom: '48px' }}>
          <div className="modern-card" style={{ padding: '32px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '32px' }}>Revenue Trajectory (Weekly)</h3>
            <div style={{ height: '350px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.weeklyTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: 'var(--text-dim)', fontSize: 11, fontWeight: 700}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-dim)', fontSize: 11, fontWeight: 700}} dx={-10} />
                  <Tooltip 
                    contentStyle={{ background: '#0f172a', border: '1px solid var(--primary)', borderRadius: '12px', fontSize: '12px', fontWeight: 800 }} 
                    itemStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="amount" stroke="var(--primary)" strokeWidth={4} fillOpacity={0.1} fill="var(--primary)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="modern-card" style={{ padding: '32px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '32px' }}>Top Performing Entities</h3>
            <div style={{ height: '350px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.topProducts || []} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#fff', fontSize: 11, fontWeight: 800}} width={120} />
                  <Tooltip cursor={{fill: 'rgba(255,255,255,0.02)'}} contentStyle={{ background: '#0f172a', border: '1px solid var(--primary)', borderRadius: '12px' }} />
                  <Bar dataKey="total_sales" fill="var(--primary)" radius={[0, 8, 8, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Inventory Critical Alerts */}
        <div className="modern-card" style={{ padding: '32px' }}>
           <h3 style={{ fontSize: '11px', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '32px' }}>Inventory Health Protocol</h3>
           <div className="grid-4" style={{ gap: '20px' }}>
              {[
                { label: 'CRITICAL STOCK', value: stats?.lowStockItems?.length || 0, icon: '⚠️', color: '#ef4444', key: 'lowStock' },
                { label: 'DEPLETED STOCK', value: stats?.outOfStockItems?.length || 0, icon: '🚫', color: '#64748b', key: 'outOfStock' },
                { label: 'EXPIRING SOON', value: stats?.expiringItems?.length || 0, icon: '⌛', color: '#f59e0b', key: 'expiring' },
                { label: 'EXPIRED ASSETS', value: stats?.expiredItems?.length || 0, icon: '💀', color: '#ef4444', key: 'expired' }
              ].map(item => (
                <div key={item.key} onClick={() => setActiveModal(item.key)} className="glass-panel hover-glow" style={{ padding: '24px', cursor: 'pointer', border: `1px solid ${item.color}30`, textAlign: 'center' }}>
                   <div style={{ fontSize: '32px', marginBottom: '12px' }}>{item.icon}</div>
                   <div style={{ fontSize: '24px', fontWeight: 950, color: item.color }}>{item.value}</div>
                   <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-dim)', marginTop: '4px', letterSpacing: '1px' }}>{item.label}</div>
                </div>
              ))}
           </div>
        </div>
      </div>

      {activeModal && (
        <AlertListModal 
          title={activeModal.toUpperCase()} 
          items={stats?.[`${activeModal}Items`] || []} 
          onClose={() => setActiveModal(null)} 
          color={activeModal.includes('Stock') ? '#ef4444' : '#f59e0b'}
        />
      )}
    </div>
  );
}
