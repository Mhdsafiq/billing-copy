const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  addProduct:          (data)         => ipcRenderer.invoke("add-product", data),
  getProductsFull:     ()             => ipcRenderer.invoke("get-products-full"),
  createInvoice:       (data)         => ipcRenderer.invoke("create-invoice", data),
  getInvoices:         ()             => ipcRenderer.invoke("get-invoices"),
  getInvoiceDetails:   (id)           => ipcRenderer.invoke("get-invoice-details", id),
  deleteInvoice:       (id)           => ipcRenderer.invoke("delete-invoice", id),
  bulkUpdateProducts:  (data)         => ipcRenderer.invoke("bulkUpdateProducts", data),
  getCategories:       ()             => ipcRenderer.invoke("get-categories"),
  addCategory:         (data)         => ipcRenderer.invoke("add-category", data),
  searchCustomer:      (phone)        => ipcRenderer.invoke("search-customer", phone),
  editProduct:         (data)         => ipcRenderer.invoke("edit-product", data),
  deleteProduct:       (id)           => ipcRenderer.invoke("delete-product", id),

  // 🔥 Hold / Resume Bill
  holdBill:            (data)         => ipcRenderer.invoke("hold-bill", data),
  getHeldBills:        ()             => ipcRenderer.invoke("get-held-bills"),
  deleteHeldBill:      (id)           => ipcRenderer.invoke("delete-held-bill", id),

  // 🔥 Offers & Promotions
  getOffers:           ()             => ipcRenderer.invoke("get-offers"),
  addOffer:            (data)         => ipcRenderer.invoke("add-offer", data),
  editOffer:           (data)         => ipcRenderer.invoke("edit-offer", data),
  deleteOffer:         (id)           => ipcRenderer.invoke("delete-offer", id),
  toggleOfferStatus:   (data)         => ipcRenderer.invoke("toggle-offer-status", data),


  // 🔥 Expiry & Stock Reports
  getExpiryAlerts:     ()             => ipcRenderer.invoke("get-expiry-alerts"),
  getStockAlerts:      ()             => ipcRenderer.invoke("get-stock-alerts"),
  getDashboardStats:   ()             => ipcRenderer.invoke("get-dashboard-stats"),

  // 🔥 Owner Mobile Dashboard URL & Cloud Sync
  getLocalIp:          ()             => ipcRenderer.invoke("get-local-ip"),
  getDashboardUrl:     ()             => ipcRenderer.invoke("get-dashboard-url"),
  onTunnelReady:       (cb)           => ipcRenderer.on("tunnel-ready", (_e, data) => cb(data)),
  getShopId:           ()             => ipcRenderer.invoke("get-shop-id"),
  saveAppSettings:     (data)         => ipcRenderer.invoke("save-app-settings", data),
  getAppSettings:      ()             => ipcRenderer.invoke("get-app-settings"),
  setWindowTitle:      (title)        => ipcRenderer.invoke("set-window-title", title),

  // WhatsApp — automatic sending
  sendWhatsapp:        (phone, text)  => ipcRenderer.invoke("send-whatsapp", phone, text),
  getWhatsappStatus:   ()             => ipcRenderer.invoke("whatsapp-status"),
  requestWhatsappQR:   ()             => ipcRenderer.invoke("request-whatsapp-qr"),
  resetWhatsApp:       ()             => ipcRenderer.invoke("reset-whatsapp"),

  // Listen for QR code or status events pushed from main process
  onWhatsappQR:        (cb)           => ipcRenderer.on("whatsapp-qr",     (_e, qr)     => cb(qr)),
  onWhatsappStatus:    (cb)           => ipcRenderer.on("whatsapp-status",  (_e, status) => cb(status)),

  // AI & Analytics
  askAIConsultant:     (question)     => ipcRenderer.invoke("ask-ai-consultant", question),

  // 🔔 Notifications (Owner Alerts)
  getNotifications:    (opts)         => ipcRenderer.invoke("get-notifications", opts),
  markNotificationRead:(id)           => ipcRenderer.invoke("mark-notification-read", id),
  markAllNotifRead:    ()             => ipcRenderer.invoke("mark-all-notif-read"),
  deleteNotification:  (id)           => ipcRenderer.invoke("delete-notification", id),
  getSyncStatus:       ()             => ipcRenderer.invoke("get-sync-status"),
  getLicenseStatus:    ()             => ipcRenderer.invoke("get-license-status"),
  requestActivation:   ()             => ipcRenderer.invoke("request-activation"),

  // 📧 Email Verification (OTP)
  checkEmailExists:    (email)        => ipcRenderer.invoke("check-email-exists", email),
  sendOtp:             (email)        => ipcRenderer.invoke("send-otp", email),
  verifyOtp:           (data)         => ipcRenderer.invoke("verify-otp", data),

  // 🏪 Shop Registration & Pairing
  registerShop:        (data)         => ipcRenderer.invoke("register-shop", data),
  getRegistrationStatus: ()           => ipcRenderer.invoke("get-registration-status"),
  validatePairingCode: (code)         => ipcRenderer.invoke("validate-pairing-code", code),
  getPairingStatus:    (code)         => ipcRenderer.invoke("get-pairing-status", code),

  // 🪟 Window Controls
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  closeWindow:    () => ipcRenderer.invoke("close-window"),
  createBackup:   () => ipcRenderer.invoke("create-backup"),

  // 🔗 Shop Supabase Connection (Separate DB per shop)
  saveShopSupabase:    (data)         => ipcRenderer.invoke("save-shop-supabase", data),
  getShopSupabase:     ()             => ipcRenderer.invoke("get-shop-supabase"),
  syncShopData:        ()             => ipcRenderer.invoke("sync-shop-data"),
  restoreFromCloud:    ()             => ipcRenderer.invoke("restore-from-cloud"),
  testShopConnection:  (data)         => ipcRenderer.invoke("test-shop-connection", data),

  // 💾 Local Database Path
  saveLocalDbPath:     (path)         => ipcRenderer.invoke("save-local-db-path", path),
  getLocalDbPath:      ()             => ipcRenderer.invoke("get-local-db-path"),
  browseFolder:        ()             => ipcRenderer.invoke("browse-folder"),

  // ⏳ Validity / Subscription System
  getValidity:         ()             => ipcRenderer.invoke("get-validity"),
  onValidityWarning:   (cb)           => ipcRenderer.on("validity-warning", (_e, data) => cb(data)),
  onValidityExpired:   (cb)           => ipcRenderer.on("validity-expired", (_e) => cb()),
  onAppLock:           (cb)           => ipcRenderer.on("app-lock", (_e, data) => cb(data)),
  onAppUnlock:         (cb)           => ipcRenderer.on("app-unlock", (_e) => cb()),

  // 📊 Tax Report
  getTaxReport:        (params)       => ipcRenderer.invoke("get-tax-report", params),
});