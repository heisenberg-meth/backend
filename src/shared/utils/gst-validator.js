const GST_STATE_CODES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra', '28': 'Andhra Pradesh (old)',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar', '36': 'Telangana',
  '37': 'Andhra Pradesh (new)', '38': 'Ladakh',
};

const GST_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGst(gstNumber) {
  if (!gstNumber) return { valid: false, error: 'GST number is required' };

  const cleaned = gstNumber.trim().toUpperCase();

  if (cleaned.length !== 15) {
    return { valid: false, error: 'GST number must be exactly 15 characters' };
  }

  if (!GST_PATTERN.test(cleaned)) {
    return { valid: false, error: 'GST number format is invalid. Expected format: 29ABCDE1234F1Z5' };
  }

  const stateCode = cleaned.substring(0, 2);
  if (!GST_STATE_CODES[stateCode]) {
    return { valid: false, error: `Invalid state code '${stateCode}'. Must be a valid Indian state code (01-38)` };
  }

  const checkDigit = cleaned[cleaned.length - 1];
  const calculatedCheckDigit = _calculateGstCheckDigit(cleaned);
  if (checkDigit !== calculatedCheckDigit) {
    return { valid: false, error: `GST checksum validation failed. Expected check digit '${calculatedCheckDigit}', got '${checkDigit}'` };
  }

  return {
    valid: true,
    stateCode,
    stateName: GST_STATE_CODES[stateCode],
    panNumber: cleaned.substring(2, 12),
    error: null,
  };
}

function _calculateGstCheckDigit(gst) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;

  for (let i = 0; i < 14; i++) {
    const char = gst[i];
    const value = chars.indexOf(char);
    let factor = 2;
    if (i % 2 === 0) factor = 1;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }

  const remainder = sum % 36;
  const checkValue = (36 - remainder) % 36;
  return chars[checkValue];
}

export function formatGstState(gstNumber) {
  if (!gstNumber || gstNumber.length < 2) return null;
  const code = gstNumber.substring(0, 2);
  return GST_STATE_CODES[code] || null;
}
