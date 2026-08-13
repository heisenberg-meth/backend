class InventoryCalculationService {
  /**
   * Calculate total available stock across multiple batches.
   *
   * @param {Array} batches - Array of inventory batch objects
   * @returns {number} The total available quantity
   */
  calculateAvailableStock(batches) {
    if (!Array.isArray(batches)) return 0;
    return batches.reduce((sum, b) => {
      const avail =
        b.availableQuantity !== undefined
          ? b.availableQuantity
          : Math.max(0, (b.quantity || 0) - (b.reservedQuantity || 0));
      return sum + avail;
    }, 0);
  }

  /**
   * Calculate total reserved stock across multiple batches.
   *
   * @param {Array} batches - Array of inventory batch objects
   * @returns {number} The total reserved quantity
   */
  calculateReservedStock(batches) {
    if (!Array.isArray(batches)) return 0;
    return batches.reduce((sum, b) => sum + (b.reservedQuantity || 0), 0);
  }

  /**
   * Calculate the total monetary value of available stock.
   *
   * @param {Array} batches - Array of inventory batch objects
   * @returns {number} The total stock value
   */
  calculateStockValue(batches) {
    if (!Array.isArray(batches)) return 0;
    return batches.reduce((sum, b) => {
      const avail =
        b.availableQuantity !== undefined
          ? b.availableQuantity
          : Math.max(0, (b.quantity || 0) - (b.reservedQuantity || 0));
      return sum + avail * (b.purchasePrice || 0);
    }, 0);
  }
}

export default new InventoryCalculationService();
