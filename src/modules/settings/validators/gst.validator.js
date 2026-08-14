// Valid GST slabs under Indian tax law
const VALID_GST_SLABS = [0, 0.25, 1, 3, 5, 12, 18, 28];

// GST category validation (no duplicates)
export function validateNoDuplicateCategories(categories) {
  const seen = new Set();
  for (const cat of categories) {
    if (seen.has(cat.category)) {
      return {
        valid: false,
        error: `Duplicate GST category: "${cat.category}". Each category can only have one tax mapping.`,
      };
    }
    seen.add(cat.category);
  }
  return { valid: true };
}

// Validate GST percentage is a legal slab
export function validateGstSlab(percentage) {
  if (VALID_GST_SLABS.includes(percentage)) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Invalid GST slab: ${percentage}%. Legal slabs are: ${VALID_GST_SLABS.join(', ')}%`,
  };
}

// Calculate CGST/SGST/IGST from GST percentage
export function calculateTaxBreakdown(taxableValue, gstPercentage, isInterState = false) {
  const gstAmount = taxableValue * (gstPercentage / 100);

  if (isInterState) {
    return {
      cgst: 0,
      sgst: 0,
      igst: gstAmount,
      total: gstAmount,
    };
  }

  const cgst = gstAmount / 2;
  const sgst = gstAmount / 2;
  return {
    cgst,
    sgst,
    igst: 0,
    total: gstAmount,
  };
}
