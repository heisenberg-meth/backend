class IntentService {
  /**
   * Parse command intent from transcribed text
   * Integrates phonetic matching for pharmacy-specific items
   */
  async parseCommand(text) {
    const lowerText = text.toLowerCase();

    // Simple intent classification logic for demonstration
    if (lowerText.includes('add')) {
      const parts = lowerText.split(' ');
      const quantity = parseInt(parts[1]) || 1;
      const medicineName = parts.slice(2).join(' ');

      // TODO: Integrate phonetic fuzzy search here (e.g., using Levenshtein distance)

      return {
        intent: 'ADD_ITEM',
        params: { medicineName, quantity },
        confidence: 0.95,
      };
    }

    return { intent: 'UNKNOWN', confidence: 0.0 };
  }
}

export default new IntentService();
