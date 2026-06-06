export function mapDosageFormToPackaging(dosageForm) {
  if (!dosageForm) return 'Pack';
  const form = dosageForm.toUpperCase().trim();

  if (form === 'TABLET' || form === 'CAPSULE') return 'Strip';
  if (form === 'SYRUP' || form === 'DROPS') return 'Bottle';
  if (form === 'OINTMENT' || form === 'CREAM' || form === 'GEL') return 'Tube';
  if (form === 'INJECTION') return 'Vial';

  return 'Pack'; // Default fallback
}

export function validatePricing({ purchasePrice, sellingPrice, mrp }) {
  const pPrice = Number(purchasePrice);
  const sPrice = Number(sellingPrice);
  const m = Number(mrp);

  if (isNaN(pPrice) || pPrice <= 0) {
    return 'Purchase price must be greater than zero';
  }
  if (isNaN(m) || m <= pPrice) {
    return 'MRP must be greater than purchase price';
  }
  if (isNaN(sPrice) || sPrice < pPrice) {
    return 'Selling price must be greater than or equal to purchase price';
  }
  if (sPrice > m) {
    return 'Selling price cannot exceed MRP';
  }
  return null; // Valid
}
