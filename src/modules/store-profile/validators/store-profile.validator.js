const INDIAN_STATE_CODES = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
  '39',
  '40',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
  '49',
  '50',
  '51',
  '52',
  '53',
  '54',
  '55',
  '56',
  '57',
  '58',
  '59',
  '60',
  '61',
  '62',
  '63',
  '64',
  '65',
  '66',
  '67',
  '68',
  '69',
  '70',
  '71',
  '72',
  '73',
  '74',
  '75',
  '76',
  '77',
  '78',
  '79',
  '80',
  '81',
  '82',
  '83',
  '84',
  '85',
  '86',
  '87',
  '88',
  '89',
  '90',
  '91',
  '92',
  '93',
  '94',
  '95',
  '96',
  '97',
];

const GSTIN_CHECKSUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function validateGstinChecksum(gstin) {
  const codeMap = {};
  for (let i = 0; i < GSTIN_CHECKSUM_CHARS.length; i++) {
    codeMap[GSTIN_CHECKSUM_CHARS[i]] = i;
  }

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const charCode = codeMap[gstin[i]];
    if (charCode === undefined) return false;
    const factor = i % 2 === 0 ? 1 : 2;
    const product = charCode * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }

  const remainder = sum % 36;
  const expectedChecksum = GSTIN_CHECKSUM_CHARS[remainder];
  return gstin[14] === expectedChecksum;
}

export function validateGstin(gstin) {
  if (!gstin) return { valid: true, error: null };

  const normalized = gstin.trim().toUpperCase();

  if (normalized.length !== 15) {
    return { valid: false, error: 'GSTIN must be exactly 15 characters' };
  }

  const stateCode = normalized.substring(0, 2);
  if (!INDIAN_STATE_CODES.includes(stateCode)) {
    return { valid: false, error: `Invalid GSTIN state code: ${stateCode}` };
  }

  const panPattern = normalized.substring(2, 12);
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(panPattern)) {
    return {
      valid: false,
      error: 'Invalid PAN structure in GSTIN (positions 3-12 must be AAAAA9999A)',
    };
  }

  const entityType = normalized[12];
  if (!/^[A-Z0-9]$/.test(entityType)) {
    return { valid: false, error: 'Invalid GSTIN entity type character (position 13)' };
  }

  if (normalized[13] !== 'Z') {
    return { valid: false, error: 'GSTIN position 14 must be "Z"' };
  }

  if (!validateGstinChecksum(normalized)) {
    return { valid: false, error: 'Invalid GSTIN checksum' };
  }

  return { valid: true, error: null, stateCode, pan: panPattern };
}

export function validateDrugLicense(licenseNumber) {
  if (!licenseNumber) return { valid: true, error: null };

  const patterns = [
    /^DL-\d{4}-\d{3,6}$/i,
    /^DL\/\d{4}\/\d{3,6}$/i,
    /^DL\d{10,15}$/i,
    /^[A-Z]{2}-DL-\d{4}-\d{3,6}$/i,
  ];

  const isValid = patterns.some((p) => p.test(licenseNumber.trim()));
  if (!isValid) {
    return {
      valid: false,
      error:
        'Invalid drug license format. Expected: DL-YYYY-NNN, DL/YYYY/NNN, DLNNNNNNNNNN, or XX-DL-YYYY-NNN',
    };
  }

  return { valid: true, error: null };
}

export function validatePan(pan) {
  if (!pan) return { valid: true, error: null };

  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(pan.trim().toUpperCase())) {
    return { valid: false, error: 'Invalid PAN format. Expected: AAAAA9999A' };
  }

  return { valid: true, error: null, pan: pan.trim().toUpperCase() };
}

export function validatePhone(phone) {
  if (!phone) return { valid: true, error: null };

  const phoneRegex = /^\+?[0-9]{10,15}$/;
  if (!phoneRegex.test(phone.trim())) {
    return {
      valid: false,
      error: 'Invalid phone number. Expected 10-15 digits, optionally prefixed with +',
    };
  }

  return { valid: true, error: null };
}

export function validateEmail(email) {
  if (!email) return { valid: true, error: null };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true, error: null };
}

export function validatePincode(pincode) {
  if (!pincode) return { valid: true, error: null };

  const pincodeRegex = /^[0-9]{6}$/;
  if (!pincodeRegex.test(pincode.trim())) {
    return { valid: false, error: 'Invalid pincode. Expected 6 digits' };
  }

  return { valid: true, error: null };
}

export function validateLogoUrl(url) {
  if (!url) return { valid: true, error: null };

  try {
    new URL(url);
    return { valid: true, error: null };
  } catch {
    return { valid: false, error: 'Invalid logo URL. Must be a valid URL' };
  }
}
