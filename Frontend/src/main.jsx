import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (!window.api) {
  console.log("Running in Web Mode — Polyfilling window.api");
  const API_URL = "http://127.0.0.1:4567/api";
  window.api = {
    addProduct: (d) => fetch(`${API_URL}/products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    editProduct: (d) => fetch(`${API_URL}/products/${d.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    deleteProduct: (id) => fetch(`${API_URL}/products/${id}`, { method: "DELETE" }).then(r => r.json()),
    getProductsFull: () => fetch(`${API_URL}/products/full`).then(r => r.json()),
    createInvoice: (d) => fetch(`${API_URL}/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    getInvoices: () => fetch(`${API_URL}/invoices`).then(r => r.json()),
    getInvoiceDetails: (id) => fetch(`${API_URL}/invoices/${id}/items`).then(r => r.json()),
    deleteInvoice: (id) => fetch(`${API_URL}/invoices/${id}`, { method: "DELETE" }).then(r => r.json()),
    bulkUpdateProducts: (d) => fetch(`${API_URL}/products/bulk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    getCategories: () => fetch(`${API_URL}/categories`).then(r => r.json()),
    searchCustomer: (phone) => fetch(`${API_URL}/customers/${phone}`).then(r => r.json()),
    holdBill: (d) => fetch(`${API_URL}/held-bills`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    getHeldBills: () => fetch(`${API_URL}/held-bills`).then(r => r.json()),
    deleteHeldBill: (id) => fetch(`${API_URL}/held-bills/${id}`, { method: "DELETE" }).then(r => r.json()),
    getDashboardStats: () => fetch(`${API_URL}/stats`).then(r => r.json()),
    getExpiryAlerts: () => fetch(`${API_URL}/expiry`).then(r => r.json()),
    getStockAlerts: () => fetch(`${API_URL}/stock`).then(r => r.json()),
    sendWhatsapp: () => Promise.resolve(),
    onWhatsappQR: () => { },
    onWhatsappStatus: () => { },
    onDashboardReady: () => { },
    onTunnelReady: () => { },
    getDashboardUrl: () => Promise.resolve(null),
    getOffers: () => fetch(`${API_URL}/offers`).then(r => r.json()),
    addOffer: (d) => fetch(`${API_URL}/offers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    editOffer: (d) => fetch(`${API_URL}/offers/${d.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    deleteOffer: (id) => fetch(`${API_URL}/offers/${id}`, { method: "DELETE" }).then(r => r.json()),
    toggleOfferStatus: (d) => fetch(`${API_URL}/offers/${d.id}/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    getNotifications: (o) => fetch(`${API_URL}/notifications?unread=${!!o?.unreadOnly}`).then(r => r.json()),
    saveAppSettings: (d) => { localStorage.setItem("smart_billing_settings", JSON.stringify(d)); return Promise.resolve({ success: true }); },
    getAppSettings: () => Promise.resolve(JSON.parse(localStorage.getItem("smart_billing_settings") || "{}")),
    getSyncStatus: () => Promise.resolve({ pending: 0 }),
    // Shop Registration & Pairing (stubs for web mode)
    registerShop: () => Promise.resolve({ success: false, error: "Registration only works in desktop app" }),
    getRegistrationStatus: () => Promise.resolve({ isRegistered: true, shopId: "web-mode" }),
    validatePairingCode: () => Promise.resolve({ success: false, error: "Pairing only works in desktop app" }),
    getPairingStatus: () => Promise.resolve({ status: "unknown" }),
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
