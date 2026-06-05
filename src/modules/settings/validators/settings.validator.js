import { z } from 'zod';

// Billing settings schema
export const billingSettingsSchema = z.object({
  invoicePrefix: z.string().max(10).optional(),
  invoiceNumberFormat: z.enum(['SEQUENTIAL', 'DATE_BASED', 'CUSTOM']).optional(),
  autoGenerateInvoice: z.boolean().optional(),
  defaultPaymentMethod: z.string().optional(),
  roundOffEnabled: z.boolean().optional(),
  roundOffMethod: z.enum(['NEAREST', 'UP', 'DOWN']).optional(),
  discountLimit: z.number().min(0).max(100).optional(),
  creditLimitEnabled: z.boolean().optional(),
  defaultCreditDays: z.number().min(0).max(365).optional(),
  autoApplyGST: z.boolean().optional(),
  showTaxBreakdown: z.boolean().optional(),
  footerMessage: z.string().max(500).optional(),
  termsAndConditions: z.string().max(2000).optional(),
});

export const inventorySettingsSchema = z.object({
  lowStockThreshold: z.number().min(0).optional(),
  expiryAlertDays: z.number().min(1).max(365).optional(),
  autoReorderEnabled: z.boolean().optional(),
  fifoEnabled: z.boolean().optional(),
  batchTrackingEnabled: z.boolean().optional(),
  barcodeRequired: z.boolean().optional(),
  autoEscalation: z.boolean().optional(),
  immutableAudit: z.boolean().optional(),
  outOfStockNotification: z.boolean().optional(),
  reorderQuantityMultiplier: z.number().min(1).max(10).optional(),
});

// Notification settings schema
export const notificationSettingsSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  digestEnabled: z.boolean().optional(),
  alertEmail: z.string().email().optional().nullable(),
  lowStockAlert: z.boolean().optional(),
  expiryAlert: z.boolean().optional(),
  orderAlert: z.boolean().optional(),
  paymentAlert: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
  weeklyReport: z.boolean().optional(),
});

// Security settings schema
export const securitySettingsSchema = z.object({
  sessionTimeout: z.number().min(5).max(480).optional(), // minutes
  maxLoginAttempts: z.number().min(1).max(10).optional(),
  passwordMinLength: z.number().min(6).max(32).optional(),
  requirePasswordExpiry: z.boolean().optional(),
  passwordExpiryDays: z.number().min(30).max(365).optional(),
  twoFactorEnabled: z.boolean().optional(),
  ipWhitelistEnabled: z.boolean().optional(),
  auditLogging: z.boolean().optional(),
  dataRetentionDays: z.number().min(30).max(2555).optional(),
});

// Invoice template schema
export const invoiceTemplateSchema = z.object({
  templateName: z.string().max(255).optional(),
  templateType: z.enum(['A4_GST', 'THERMAL_80MM', 'MINIMAL_POS', 'THERMAL_58MM', 'A4']).optional(),
  paperSize: z.string().max(50).optional(),
  showLogo: z.boolean().optional(),
  showDoctorName: z.boolean().optional(),
  showPatientDetails: z.boolean().optional(),
  showBatchNumber: z.boolean().optional(),
  showExpiryDate: z.boolean().optional(),
  showHSNCode: z.boolean().optional(),
  showGSTBreakdown: z.boolean().optional(),
  showQRCode: z.boolean().optional(),
  showDiscount: z.boolean().optional(),
  headerText: z.string().max(500).optional(),
  footerText: z.string().max(1000).optional(),
  logoUrl: z.string().url().optional().nullable(),
  invoicePrefix: z.string().max(10).optional(),
  gstin: z.string().max(15).optional().nullable(),
  storeName: z.string().max(200).optional(),
  changeReason: z.string().max(500).optional(),
});

// Store profile schema
export const storeProfileSchema = z.object({
  businessName: z.string().max(200).optional(),
  gstin: z.string().max(15).optional().nullable(),
  drugLicenseNumber: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().nullable(),
  state: z.string().max(50).optional(),
  stateCode: z.string().max(2).optional(),
  pincode: z.string().max(6).optional(),
  filingFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).optional(),
});

// Alert thresholds schema
export const alertThresholdsSchema = z.object({
  lowStockLevel: z.number().min(0).optional(),
  criticalStockLevel: z.number().min(0).optional(),
  expiryWarningDays: z.number().min(1).max(365).optional(),
  expiryCriticalDays: z.number().min(1).max(90).optional(),
  overstockThreshold: z.number().min(0).optional(),
  slowMovingDays: z.number().min(30).max(365).optional(),
  deadStockDays: z.number().min(90).max(730).optional(),
});

// Integrations schema
export const integrationsSchema = z.object({
  razorpayEnabled: z.boolean().optional(),
  whatsappApiEnabled: z.boolean().optional(),
  smsGatewayEnabled: z.boolean().optional(),
  emailSmtpEnabled: z.boolean().optional(),
  cloudinaryEnabled: z.boolean().optional(),
  tallyExportEnabled: z.boolean().optional(),
  gstPortalEnabled: z.boolean().optional(),
});

// All settings categories schema
export const allSettingsSchema = z.object({
  lowStock: z.number().min(0).optional(),
  expiryDays: z.number().min(1).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  autoEscalation: z.boolean().optional(),
  auditLogging: z.boolean().optional(),
  billing: billingSettingsSchema.optional(),
  inventory: inventorySettingsSchema.optional(),
  notifications: notificationSettingsSchema.optional(),
  security: securitySettingsSchema.optional(),
  invoiceTemplate: invoiceTemplateSchema.optional(),
  storeProfile: storeProfileSchema.optional(),
  alertThresholds: alertThresholdsSchema.optional(),
  integrations: integrationsSchema.optional(),
});
