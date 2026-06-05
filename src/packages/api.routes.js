export const API_ROUTES = {
  // Auth
  AUTH_ME: '/auth/me',
  AUTH_LOGIN: '/auth/login',
  AUTH_REGISTER: '/auth/register',
  AUTH_REFRESH: '/auth/refresh',
  AUTH_LOGOUT: '/auth/logout',

  // Profile & Users
  USERS_PROFILE: '/users/profile',
  USERS_PROFILE_PASSWORD: '/users/profile/password',
  USERS_AVATAR: '/uploads/avatar',
  USERS_SESSIONS: '/users/sessions',
  USERS_2FA_ENABLE: '/users/2fa/enable',
  USERS_2FA_DISABLE: '/users/2fa/disable',
  USERS_2FA_VERIFY: '/users/2fa/verify',

  // Team
  TEAM: '/team',
  TEAM_SHIFTS: '/team/shifts',
  TEAM_SHIFTS_START: '/team/shifts/start',
  TEAM_SHIFTS_ACTIVE: '/team/shifts/active',
  TEAM_PERFORMANCE: '/team/performance',
  TEAM_PERFORMANCE_OVERVIEW: '/team/performance/overview',
  TEAM_BILLING_PERFORMANCE: '/team/billing-performance',

  // Inventory
  INVENTORY_MEDICINES: '/inventory/medicines',
  INVENTORY_SEARCH: '/inventory/medicines/search',
  INVENTORY_CATEGORIES: '/inventory/categories',
  INVENTORY_MANUFACTURERS: '/inventory/manufacturers',
  INVENTORY_BATCHES: '/inventory/batches',
  INVENTORY_LOW_STOCK: '/inventory/medicines/low-stock',
  INVENTORY_MEDICINES_AUTOCOMPLETE: '/inventory/medicines/autocomplete',
  INVENTORY_MASTER: '/inventory/medicine-master',
  INVENTORY_BATCH_RECALL: '/inventory/batch-recall',
  INVENTORY_EXPIRY_NEAR: '/inventory/expiry/near',
  INVENTORY_EXPIRY_SUMMARY: '/inventory/expiry/summary',
  INVENTORY_BARCODE_GENERATE: '/inventory/barcode/generate',

  // Billing
  BILLING_INVOICES: '/billing/invoices',
  BILLING_RETURNS: '/billing/returns',

  // Payments
  PAYMENTS_CREATE_ORDER: '/payments/create-order',
  PAYMENTS_VERIFY: '/payments/verify',
  PAYMENTS_HISTORY: '/payments/history',
  PAYMENTS_STATUS: '/payments/status',
  PAYMENTS_RECOVER: '/payments/recover',

  // Analytics & AI
  ANALYTICS_STATS: '/analytics/stats',
  AI_ANOMALY: '/ai/anomaly-detection',
  AI_FORECAST: '/ai/demand-forecast',

  // Sales
  SALES: '/sales',
  SALES_HOURLY: '/analytics/hourly-sales',

  // Settings
  SETTINGS: '/settings',
  SETTINGS_GST: '/settings/gst',
  SETTINGS_INVENTORY: '/settings/inventory',
  SETTINGS_BILLING: '/settings/billing',
  SETTINGS_TAX: '/settings/tax',
  SETTINGS_NOTIFICATIONS: '/settings/notifications',
  SETTINGS_LOYALTY: '/settings/loyalty',
  SETTINGS_SECURITY: '/settings/security',
  SETTINGS_INVOICE_TEMPLATE: '/settings/invoice-template',
  SETTINGS_STORE_PROFILE: '/settings/store-profile',

  // Subscriptions
  SUBSCRIPTIONS_STATUS: '/subscriptions/status',
  SUBSCRIPTIONS_ACTIVATE: '/subscriptions/activate',

  // Prescriptions
  PRESCRIPTIONS: '/prescriptions',

  // Patients
  PATIENTS: '/patients',
  PATIENTS_SEARCH: '/patients/search',
  PATIENTS_RECENT: '/patients/recent',

  // Stock
  STOCK: '/stock',

  // Suppliers
  SUPPLIERS: '/suppliers',
  SUPPLIERS_STATS: '/suppliers/stats',

  // Import
  IMPORT_BULK: '/import/bulk',

  // Purchases & Procurements
  PURCHASES_ORDERS: '/purchase-orders',
  PURCHASES_AUTO_GENERATE: '/purchase-orders/auto-generate',
  PURCHASES_RECEIVE: '/purchase/receive',
  PURCHASES_RETURNS: '/purchase/returns',
  PROCUREMENTS: '/purchase-orders', // Mapping to main orders list

  // Reports
  REPORTS_SALES: '/reports/sales',
  REPORTS_PURCHASES: '/reports/purchases',
  REPORTS_FINANCE: '/reports/finance',
  REPORTS_EXPIRY: '/reports/expiry',

  // Expenses
  EXPENSES: '/accounting/expenses',

  // Notifications & Ops
  NOTIFICATIONS_HISTORY: '/notifications/ops/history',
  NOTIFICATIONS_METRICS: '/notifications/ops/queues/metrics',
  NOTIFICATIONS_RETRY: '/notifications/ops/retry',

  // Communications & Loyalty
  COMMUNICATIONS: '/communications',
  LOYALTY: '/loyalty',
};
