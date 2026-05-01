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

  return (
    <div className="animate-up" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '48px', flexWrap: 'wrap', gap: '24px' }}>
          <div>
            <h1 className="text-gradient" style={{ margin: 0, fontSize: '42px', fontWeight: 950, letterSpacing: '-0.04em' }}>Ledger Records</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginTop: '6px', fontWeight: 500 }}>Audit and review all historical transaction protocols</p>
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 900, color: 'var(--text-dim)', marginBottom: '8px', textTransform: 'uppercase' }}>Epoch Start</label>
              <input type="date" className="input-premium" style={{ height: '48px' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 900, color: 'var(--text-dim)', marginBottom: '8px', textTransform: 'uppercase' }}>Epoch End</label>
              <input type="date" className="input-premium" style={{ height: '48px' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div style={{ textAlign: 'right', marginLeft: '24px' }}>
              <div style={{ fontSize: '32px', fontWeight: 950, color: 'var(--primary)', lineHeight: 1 }}>{filteredInvoices.length}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Total Records</div>
            </div>
          </div>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
          {loading ? (
            <div className="flex-center" style={{ height: '300px', flexDirection: 'column', gap: '16px' }}>
              <div className="animate-spin" style={{ width: '40px', height: '40px', border: '4px solid var(--primary-glow)', borderTopColor: 'var(--primary)', borderRadius: '50%' }}></div>
              <div style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Retrieving Ledger...</div>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="glass-panel flex-center" style={{ height: '300px', flexDirection: 'column', gap: '20px', opacity: 0.5 }}>
              <FileText size={64} style={{ color: 'var(--text-dim)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>No Transactions Found</div>
                <div style={{ fontSize: '14px', color: 'var(--text-dim)' }}>Try adjusting your date filters</div>
              </div>
            </div>
          ) : (
            <>
              {Object.entries(grouped).map(([key, bills]) => {
                if (bills.length === 0) return null;
                const labels = { today: 'Today', thisWeek: 'This Week', thisMonth: 'This Month', older: 'Older Transactions' };
                return (
                  <div key={key} className="animate-fade">
                    <h3 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {labels[key]} <div style={{ flex: 1, height: '1px', background: 'var(--primary-glow)' }}></div>
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {bills.map(inv => (
                        <div key={inv.id} className="glass-panel hover-glow" style={{ display: 'flex', alignItems: 'center', padding: '20px 30px', cursor: 'pointer', transition: '0.3s' }} onClick={() => handleViewBill(inv)}>
                          <div style={{ width: '80px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 800 }}>INV #</div>
                            <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--primary)' }}>{inv.bill_no || inv.id}</div>
                          </div>
                          
                          <div style={{ width: '180px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 800 }}>DATE & TIME</div>
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>{new Date(inv.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                          </div>

                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 800 }}>CUSTOMER</div>
                            <div style={{ fontSize: '14px', fontWeight: 700 }}>{inv.customer_name || 'Walk-in Customer'}</div>
                            {inv.customer_phone && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{inv.customer_phone}</div>}
                          </div>

                          <div style={{ width: '120px', textAlign: 'center' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '4px' }}>PAYMENT</div>
                            <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '10px', fontWeight: 800, background: inv.payment_mode === 'Cash' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)', color: inv.payment_mode === 'Cash' ? 'var(--success)' : 'var(--primary)' }}>
                              {inv.payment_mode.toUpperCase()}
                            </span>
                          </div>

                          <div style={{ width: '150px', textAlign: 'right' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 800 }}>TOTAL AMOUNT</div>
                            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-main)' }}>₹{Number(inv.total_amount).toFixed(2)}</div>
                          </div>

                          <div style={{ marginLeft: '40px', display: 'flex', gap: '10px' }}>
                            <button onClick={(e) => { e.stopPropagation(); handleViewBill(inv); }} className="btn-outline" style={{ width: '40px', height: '40px', padding: 0 }}><Eye size={18} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteBill(inv); }} className="btn-outline" style={{ width: '40px', height: '40px', padding: 0, color: 'var(--danger)', borderColor: 'rgba(244, 63, 94, 0.2)' }}><Trash2 size={18} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── DETAIL MODAL ── */}
      {viewInvoice && (
        <div className="modal-overlay" onClick={() => setViewInvoice(null)}>
          <div className="glass-panel animate-fade" onClick={e => e.stopPropagation()} style={{ width: '600px', padding: '40px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}>
              <div>
                <h2 className="text-gradient" style={{ margin: 0, fontSize: '24px', fontWeight: 900 }}>Invoice Detail</h2>
                <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginTop: '4px' }}>Transaction ID: {viewInvoice.id}</div>
              </div>
              <button onClick={() => setViewInvoice(null)} className="btn-outline" style={{ width: '40px', height: '40px', padding: 0 }}><X size={24} /></button>
            </div>

            <div className="grid-2" style={{ gap: '20px', marginBottom: '30px' }}>
              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Customer Details</div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '8px' }}>{viewInvoice.customer_name || 'Walk-in'}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{viewInvoice.customer_phone || 'No phone provided'}</div>
              </div>
              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Billing Info</div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '8px' }}>Bill #{viewInvoice.bill_no || viewInvoice.id}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{new Date(viewInvoice.created_at).toLocaleString()}</div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', marginBottom: '30px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--glass-border)' }}>
                    <th style={{ textAlign: 'left', padding: '15px 20px', fontSize: '11px', color: 'var(--text-dim)' }}>PRODUCT</th>
                    <th style={{ textAlign: 'center', padding: '15px 20px', fontSize: '11px', color: 'var(--text-dim)' }}>QTY</th>
                    <th style={{ textAlign: 'right', padding: '15px 20px', fontSize: '11px', color: 'var(--text-dim)' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {viewItems.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '15px 20px' }}>
                        <div style={{ fontWeight: 700, fontSize: '13px' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>₹{item.price} per unit</div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '15px 20px', fontWeight: 600 }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right', padding: '15px 20px', fontWeight: 800 }}>₹{((item.price * item.quantity) + (item.gst_amount || 0)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 30px', background: 'var(--primary-glow)', borderRadius: '20px', border: '1px solid var(--primary)' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Net Payable Amount</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Paid via {viewInvoice.payment_mode}</div>
              </div>
              <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-main)' }}>₹{Number(viewInvoice.total_amount).toFixed(2)}</div>
            </div>

            <button onClick={() => setViewInvoice(null)} className="btn-primary" style={{ width: '100%', marginTop: '30px', padding: '16px' }}>CLOSE VIEW</button>
          </div>
        </div>
      )}
    </div>
  );
}
