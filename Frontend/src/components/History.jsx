import React, { useState, useEffect, useCallback } from "react";
import { Receipt, Calendar, FileText, Eye, Trash2, X } from "lucide-react";

export default function History() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [viewItems, setViewItems] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadInvoices = useCallback(() => {
    setLoading(true);
    if (window.api?.getInvoices) {
      window.api.getInvoices().then(data => {
        setInvoices(Array.isArray(data) ? data : []);
        setLoading(false);
      }).catch(() => { setInvoices([]); setLoading(false); });
    } else {
      setInvoices([]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
    const onRefresh = () => {
      setDateFrom("");
      setDateTo("");
      loadInvoices();
    };
    window.addEventListener('soft_refresh', onRefresh);
    return () => window.removeEventListener('soft_refresh', onRefresh);
  }, [loadInvoices]);

  // Group invoices into Today, This Week, This Month, Older
  const groupInvoices = (list) => {
    // Assign sequential displayId based on creation order (oldest -> newest)
    const sequenced = [...list].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    sequenced.forEach((inv, index) => { inv.displayId = index + 1; });

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthAgo = new Date(now.getTime() - 30 * 86400000);

    const groups = { today: [], thisWeek: [], thisMonth: [], older: [] };
    
    // Group in descending order for display (newest first)
    const descending = [...sequenced].reverse();
    descending.forEach(inv => {
      const d = new Date(inv.created_at);
      const dateStr = d.toISOString().split("T")[0];
      if (dateStr === todayStr) groups.today.push(inv);
      else if (d >= weekAgo) groups.thisWeek.push(inv);
      else if (d >= monthAgo) groups.thisMonth.push(inv);
      else groups.older.push(inv);
    });
    return groups;
  };

  const handleViewBill = async (inv) => {
    setViewInvoice(inv);
    setViewLoading(true);
    if (window.api?.getInvoiceDetails) {
      try {
        const items = await window.api.getInvoiceDetails(inv.id);
        setViewItems(Array.isArray(items) ? items : []);
      } catch { setViewItems([]); }
    }
    setViewLoading(false);
  };

  const handleDeleteBill = async (inv) => {
    if (!confirm(`Are you sure you want to delete Invoice #${inv.id}?`)) return;
    if (window.api?.deleteInvoice) {
      await window.api.deleteInvoice(inv.id);
    }
    loadInvoices();
  };

  // Filter invoices by date range
  const filteredInvoices = invoices.filter(inv => {
    if (!dateFrom && !dateTo) return true;
    const d = new Date(inv.created_at).toISOString().split("T")[0];
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  const grouped = groupInvoices(filteredInvoices);

  const renderGroup = (label, bills) => {
    if (bills.length === 0) return null;
    return (
      <div key={label} style={{ marginBottom: 8 }}>
        <div style={{
          padding: '10px 20px', background: 'var(--surface-2)',
          fontWeight: 700, fontSize: 13, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '.04em',
          borderBottom: '1px solid var(--border)'
        }}>{label} ({bills.length})</div>
        {bills.map(inv => (
          <div key={inv.id} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '14px 20px', borderBottom: '1px solid var(--border)',
            transition: 'background .15s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
          onMouseLeave={e => e.currentTarget.style.background = ''}>
            {/* Invoice ID */}
            <div style={{ width: 70, fontWeight: 700, color: 'var(--primary)', fontSize: 14 }}>#{inv.bill_no || inv.id}</div>
            {/* Date */}
            <div style={{ width: 150, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)' }}>
              <Calendar size={14} color="var(--text-3)" />
              {new Date(inv.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
            {/* Customer */}
            <div style={{ width: 160 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{inv.customer_name || 'Walk-in'}</div>
              {inv.customer_phone && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{inv.customer_phone}</div>}
            </div>
            {/* Products */}
            <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inv.productsList}>
              {inv.productsList || '-'}
            </div>
            {/* Total */}
            <div style={{ width: 100, textAlign: 'right', fontWeight: 800, fontSize: 15 }}>
              ₹{Number(inv.total_amount).toFixed(2)}
            </div>
            {/* Payment */}
            <div style={{ width: 70 }}>
              <span style={{
                padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                background: inv.payment_mode === 'Cash' ? '#10b98120' : inv.payment_mode === 'UPI' ? '#8b5cf620' : '#3b82f620',
                color: inv.payment_mode === 'Cash' ? '#10b981' : inv.payment_mode === 'UPI' ? '#8b5cf6' : '#3b82f6'
              }}>{inv.payment_mode}</span>
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => handleViewBill(inv)} title="View Bill"
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', transition: 'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-light)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
                <Eye size={15} />
              </button>
              <button onClick={() => handleDeleteBill(inv)} title="Delete Bill"
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #dc262630', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', transition: 'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Receipt size={24} color="var(--primary)" />
        Billing History

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Date Range Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>From</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', colorScheme: 'light', padding: '4px', background: 'transparent' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>To</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', colorScheme: 'light', padding: '4px', background: 'transparent' }} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Clear</button>
            )}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)' }}>
            {filteredInvoices.length}{filteredInvoices.length !== invoices.length ? ` / ${invoices.length}` : ''} bills
          </span>
        </div>
      </div>

      <div className="modern-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)' }}>Loading history...</div>
          ) : invoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-4)' }}>
              <FileText size={48} style={{ opacity: 0.4, marginBottom: 16 }} />
              <div style={{ fontSize: 15 }}>No billing history available yet.</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Bills will appear here after checkout.</div>
            </div>
          ) : (
            <>
              {renderGroup("Today", grouped.today)}
              {renderGroup("This Week", grouped.thisWeek)}
              {renderGroup("This Month", grouped.thisMonth)}
              {renderGroup("Older", grouped.older)}
            </>
          )}
        </div>
      </div>

      {/* ── View Bill Modal ── */}
      {viewInvoice && (
        <div className="modal-overlay" onClick={() => setViewInvoice(null)}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0 }}>Invoice #{viewInvoice.bill_no || viewInvoice.id}</h2>
              <button onClick={() => setViewInvoice(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
            </div>

            {/* Customer Info */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 20, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>Customer</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{viewInvoice.customer_name || 'Walk-in'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>Phone</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{viewInvoice.customer_phone || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>Date</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(viewInvoice.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
              </div>
            </div>

            {/* Items Table */}
            {viewLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-3)' }}>Loading items...</div>
            ) : (
              <table className="modern-table" style={{ width: '100%', marginBottom: 20 }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: 'center' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>GST</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewItems.map((item, i) => {
                    const lineTotal = (item.price * item.quantity) + (item.gst_amount || 0);
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right' }}>₹{Number(item.price).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>₹{Number(item.gst_amount || 0).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{lineTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Grand Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 10, marginBottom: 20 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 16 }}>Grand Total</span>
                <span style={{
                  marginLeft: 12, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                  background: viewInvoice.payment_mode === 'Cash' ? '#10b98120' : '#8b5cf620',
                  color: viewInvoice.payment_mode === 'Cash' ? '#10b981' : '#8b5cf6'
                }}>{viewInvoice.payment_mode}</span>
              </div>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>₹{Number(viewInvoice.total_amount).toFixed(2)}</span>
            </div>

            <button className="btn btn-outline" onClick={() => setViewInvoice(null)} style={{ width: '100%' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
