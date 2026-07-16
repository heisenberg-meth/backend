/**
 * Centralized Master List of Supported Expense Categories
 * Used across Expense Management, Profit & Loss reporting, and strict validation.
 */
export const SUPPORTED_EXPENSE_CATEGORIES = [
  'Rent',
  'Salary',
  'Utilities',
  'Electricity',
  'Water',
  'Internet',
  'Fuel',
  'Marketing',
  'Repairs',
  'Office Supplies',
  'Insurance',
  'Taxes',
  'Bank Charges',
  'Professional Fees',
  'Travel',
  'Equipment',
  'Maintenance',
  'Miscellaneous',
];

/**
 * Normalizes a category string by trimming and matching case-insensitively
 * against SUPPORTED_EXPENSE_CATEGORIES. Returns the standard Title Case
 * category name if matched, or null if not supported.
 */
export function normalizeCategoryName(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().toLowerCase();
  const matched = SUPPORTED_EXPENSE_CATEGORIES.find(
    (cat) => cat.toLowerCase() === trimmed
  );
  return matched || null;
}
