import prisma from '../../../config/prisma.js';

export const STATIC_ANALYTICS = [
  {
    id: 'an-sales',
    type: 'Analytics',
    title: 'Sales & Revenue Analytics',
    subtitle: 'View revenue trends, hourly sales, and profit margins',
    meta: 'Analytics Workspace',
    path: '/analytics',
    keywords: ['sales', 'revenue', 'analytics', 'profit', 'margin', 'hourly', 'trends'],
  },
  {
    id: 'an-reports',
    type: 'Analytics',
    title: 'Reports Hub & Financial Statements',
    subtitle: 'Export daily registers, tax summaries, and financial reports',
    meta: 'Financial Reports',
    path: '/reports',
    keywords: ['reports', 'export', 'csv', 'tax', 'gst', 'summary', 'finance', 'hub'],
  },
  {
    id: 'an-expiry',
    type: 'Analytics',
    title: 'Expiry Batch Intelligence',
    subtitle: 'Track near-expiry batches, return eligibility, and risk forecasting',
    meta: 'Expiry Intelligence',
    path: '/expiry',
    keywords: [
      'expiry',
      'batches',
      'intelligence',
      'shelf-life',
      'expired',
      'returns',
      'near expiry',
    ],
  },
  {
    id: 'an-lowstock',
    type: 'Analytics',
    title: 'Low Stock Alerts & Restock Intelligence',
    subtitle: 'Check reorder thresholds and predictive restock warnings',
    meta: 'Inventory Intelligence',
    path: '/lowstock',
    keywords: ['low stock', 'reorder', 'stockout', 'shortage', 'alerts', 'restock'],
  },
];

export const STATIC_SETTINGS = [
  {
    id: 'st-system',
    type: 'Settings',
    title: 'System Settings',
    subtitle: 'Configure store profile, currency, GST, and low stock limits',
    meta: 'Settings',
    path: '/settings',
    keywords: ['settings', 'configuration', 'store', 'profile', 'gst', 'preferences', 'tax'],
  },
  {
    id: 'st-team',
    type: 'Settings',
    title: 'Team & Staff Management',
    subtitle: 'Add new staff members and configure role permissions',
    meta: 'User Management',
    path: '/team',
    keywords: ['team', 'staff', 'users', 'roles', 'permissions', 'shifts', 'employees'],
  },
  {
    id: 'st-profile',
    type: 'Settings',
    title: 'Profile & Clinical Credentials',
    subtitle: 'Configure your profile details and security password',
    meta: 'Account Settings',
    path: '/profile',
    keywords: ['profile', 'password', 'security', 'account', 'credentials', 'doctor'],
  },
  {
    id: 'st-notifications',
    type: 'Settings',
    title: 'Notification Preferences',
    subtitle: 'Configure email, SMS, and WhatsApp alerts',
    meta: 'Alerts & Notifications',
    path: '/settings',
    keywords: ['notifications', 'alerts', 'email', 'sms', 'whatsapp'],
  },
];

class GlobalSearchService {
  async searchMedicines(tenantId, query, limit = 20) {
    try {
      const medicines = await prisma.medicine.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { medicineName: { contains: query, mode: 'insensitive' } },
            { genericName: { contains: query, mode: 'insensitive' } },
            { brandName: { contains: query, mode: 'insensitive' } },
            { barcode: { contains: query, mode: 'insensitive' } },
            { sku: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          inventoryBatches: {
            where: {
              deletedAt: null,
              quantity: { gt: 0 },
            },
            select: {
              quantity: true,
            },
          },
        },
        take: limit,
      });

      return medicines.map((med) => {
        const totalStock = (med.inventoryBatches || []).reduce(
          (acc, b) => acc + (b.quantity || 0),
          0,
        );
        const title = med.name || med.medicineName || 'Unnamed Medicine';
        const formAndStrength = [med.dosageForm, med.strength].filter(Boolean).join(' · ');
        const stockInfo = `${totalStock} units in stock`;
        const subtitle = formAndStrength ? `${formAndStrength} · ${stockInfo}` : stockInfo;
        const meta = med.genericName ? `Generic: ${med.genericName}` : med.brandName || 'Medicine';

        return {
          id: `med_${med.id}`,
          type: 'Medicines',
          title,
          subtitle,
          meta,
          path: '/inventory',
          entityId: med.id,
        };
      });
    } catch (err) {
      console.error('Error searching medicines:', err);
      return [];
    }
  }

  async searchSuppliers(tenantId, query, limit = 20) {
    try {
      const suppliers = await prisma.supplier.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { contactPerson: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { gstNumber: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: limit,
      });

      return suppliers.map((sup) => {
        const subtitle =
          [sup.contactPerson, sup.phone].filter(Boolean).join(' · ') || sup.email || 'Supplier';
        const meta = sup.gstNumber ? `GST: ${sup.gstNumber}` : sup.supplierType || 'Supplier';

        return {
          id: `sup_${sup.id}`,
          type: 'Suppliers',
          title: sup.name,
          subtitle,
          meta,
          path: '/suppliers',
          entityId: sup.id,
        };
      });
    } catch (err) {
      console.error('Error searching suppliers:', err);
      return [];
    }
  }

  async searchInvoices(tenantId, query, limit = 20) {
    try {
      const invoices = await prisma.invoice.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { invoiceNumber: { contains: query, mode: 'insensitive' } },
            { customerName: { contains: query, mode: 'insensitive' } },
            { patientName: { contains: query, mode: 'insensitive' } },
            { customerPhone: { contains: query, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return invoices.map((inv) => {
        const customer = inv.customerName || inv.patientName || 'Walk-in Customer';
        const total = Number(inv.totalAmount || 0).toLocaleString('en-IN', {
          maximumFractionDigits: 2,
        });

        return {
          id: `inv_${inv.id}`,
          type: 'Invoices',
          title: inv.invoiceNumber,
          subtitle: `${customer} · ₹${total}`,
          meta: `${inv.paymentStatus || 'Invoice'} · ${inv.status || 'FINAL'}`,
          path: '/billing',
          entityId: inv.id,
        };
      });
    } catch (err) {
      console.error('Error searching invoices:', err);
      return [];
    }
  }

  async searchPrescriptions(tenantId, query, limit = 20) {
    try {
      const prescriptions = await prisma.prescription.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { prescriptionNumber: { contains: query, mode: 'insensitive' } },
            { doctorName: { contains: query, mode: 'insensitive' } },
            { patient: { fullName: { contains: query, mode: 'insensitive' } } },
          ],
        },
        include: {
          patient: {
            select: { fullName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return prescriptions.map((rx) => {
        const patientName = rx.patient?.fullName || 'Unknown Patient';
        const doctorPart = rx.doctorName ? ` · Dr. ${rx.doctorName}` : '';

        return {
          id: `rx_${rx.id}`,
          type: 'Prescriptions',
          title: rx.prescriptionNumber || `Prescription #${rx.id.slice(0, 8)}`,
          subtitle: `Patient: ${patientName}${doctorPart}`,
          meta: rx.status || rx.verificationStatus || 'Prescription',
          path: '/prescriptions',
          entityId: rx.id,
        };
      });
    } catch (err) {
      console.error('Error searching prescriptions:', err);
      return [];
    }
  }

  async searchPatients(tenantId, query, limit = 20) {
    try {
      const patients = await prisma.patient.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { fullName: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query, mode: 'insensitive' } },
            { patientCode: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: limit,
      });

      return patients.map((pat) => ({
        id: `pat_${pat.id}`,
        type: 'Patients',
        title: pat.fullName,
        subtitle: [pat.phone, pat.patientCode].filter(Boolean).join(' · ') || 'Patient Record',
        meta: pat.gender ? `${pat.gender}${pat.age ? ` · ${pat.age}y` : ''}` : 'Patient',
        path: '/patients',
        entityId: pat.id,
      }));
    } catch (err) {
      console.error('Error searching patients:', err);
      return [];
    }
  }

  searchStatic(items, query, limit = 20) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return items.slice(0, limit);

    return items
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.keywords?.some((k) => k.toLowerCase().includes(q)),
      )
      .slice(0, limit);
  }

  async searchGlobal(tenantId, { q = '', category = 'All', limit = 20 }) {
    const query = (q || '').trim();
    const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50);
    const cat = (category || 'All').trim();
    const catLower = cat.toLowerCase();

    // If query is empty and category is static, return static navigation items
    if (!query) {
      if (catLower === 'analytics') {
        return this.searchStatic(STATIC_ANALYTICS, '', safeLimit);
      }
      if (catLower === 'settings') {
        return this.searchStatic(STATIC_SETTINGS, '', safeLimit);
      }
      return [];
    }

    switch (catLower) {
      case 'medicines':
        return this.searchMedicines(tenantId, query, safeLimit);

      case 'suppliers':
        return this.searchSuppliers(tenantId, query, safeLimit);

      case 'invoices':
        return this.searchInvoices(tenantId, query, safeLimit);

      case 'prescriptions':
        return this.searchPrescriptions(tenantId, query, safeLimit);

      case 'patients':
        return this.searchPatients(tenantId, query, safeLimit);

      case 'analytics':
        return this.searchStatic(STATIC_ANALYTICS, query, safeLimit);

      case 'settings':
        return this.searchStatic(STATIC_SETTINGS, query, safeLimit);

      case 'all':
      default: {
        const perCategoryLimit = Math.max(Math.floor(safeLimit / 3), 4);

        const [medicines, suppliers, invoices, prescriptions, analytics, settings] =
          await Promise.all([
            this.searchMedicines(tenantId, query, perCategoryLimit),
            this.searchSuppliers(tenantId, query, perCategoryLimit),
            this.searchInvoices(tenantId, query, perCategoryLimit),
            this.searchPrescriptions(tenantId, query, perCategoryLimit),
            this.searchStatic(STATIC_ANALYTICS, query, 3),
            this.searchStatic(STATIC_SETTINGS, query, 3),
          ]);

        const combined = [
          ...medicines,
          ...suppliers,
          ...invoices,
          ...prescriptions,
          ...analytics,
          ...settings,
        ];

        return combined.slice(0, safeLimit);
      }
    }
  }
}

export default new GlobalSearchService();
