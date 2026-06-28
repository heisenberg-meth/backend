export function toSupplierListDto(supplier) {
  return {
    id: supplier.id,
    supplierCode: supplier.supplierCode,
    name: supplier.name,
    drugCategories: supplier.drugCategories ?? [],
    supplierType: supplier.supplierType,
    contactPerson: supplier.contactPerson,
    phone: supplier.phone,
    email: supplier.email,
    gstNumber: supplier.gstNumber,
    address: supplier.address,
    notes: supplier.notes,
    status: supplier.status,
    isPreferred: supplier.isPreferred,
    rating: supplier.rating,
    leadTimeDays: supplier.leadTimeDays,
    paymentTermsDays: supplier.paymentTermsDays,
    totalPurchaseOrders: supplier._count?.purchaseOrders ?? 0,
    qualityScore: supplier.metrics?.qualityScore ?? null,
    reliabilityScore: supplier.metrics?.reliabilityScore ?? null,
  };
}

export function toSupplierDetailDto(supplier) {
  return {
    id: supplier.id,
    supplierCode: supplier.supplierCode,
    name: supplier.name,
    drugCategories: supplier.drugCategories ?? [],
    supplierType: supplier.supplierType,
    contactPerson: supplier.contactPerson,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
    gstNumber: supplier.gstNumber,
    drugLicenseNumber: supplier.drugLicenseNumber,
    licenseExpiry: supplier.licenseExpiry,
    status: supplier.status,
    isPreferred: supplier.isPreferred,
    rating: supplier.rating,
    leadTimeDays: supplier.leadTimeDays,
    paymentTermsDays: supplier.paymentTermsDays,
    creditLimit: supplier.creditLimit,
    outstandingBalance: supplier.outstandingBalance,
    totalPurchases: supplier.totalPurchases,
    lastPurchaseDate: supplier.lastPurchaseDate,
    bankName: supplier.bankName,
    accountNumber: supplier.accountNumber ? maskAccountNumber(supplier.accountNumber) : null,
    ifscCode: supplier.ifscCode,
    totalPurchaseOrders: supplier._count?.purchaseOrders ?? 0,
    totalPurchaseInvoices: supplier._count?.purchaseInvoices ?? 0,
    totalPayments: supplier._count?.payments ?? 0,
    totalReturns: supplier._count?.supplierReturns ?? 0,
    metrics: supplier.metrics
      ? {
          qualityScore: supplier.metrics.qualityScore,
          reliabilityScore: supplier.metrics.reliabilityScore,
          fulfillmentRate: supplier.metrics.fulfillmentRate,
          rejectionRate: supplier.metrics.rejectionRate,
          onTimeDeliveries: supplier.metrics.onTimeDeliveries,
          totalOrders: supplier.metrics.totalOrders,
          averageDeliveryDays: supplier.metrics.averageDeliveryDays,
          returnPercentage: supplier.metrics.returnPercentage,
          expiryIssuePercentage: supplier.metrics.expiryIssuePercentage,
        }
      : null,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
  };
}

export function toSupplierSummaryDto(supplier) {
  return {
    id: supplier.id,
    name: supplier.name,
    rating: supplier.rating,
    leadTimeDays: supplier.leadTimeDays,
    status: supplier.status,
    isPreferred: supplier.isPreferred,
  };
}

function maskAccountNumber(accountNumber) {
  if (!accountNumber || accountNumber.length < 6) return accountNumber;
  const lastFour = accountNumber.slice(-4);
  return `XXXX${lastFour}`;
}
