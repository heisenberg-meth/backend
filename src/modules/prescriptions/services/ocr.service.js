import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

class OcrService {
  MEDICINE_MAP = {
    'dolo': 'Dolo 650',
    'doloo': 'Dolo 650',
    'paracetamol': 'Paracetamol 650',
    'crocin': 'Crocin 500',
    'azithral': 'Azithral 500',
    'azithromycin': 'Azithromycin 500',
    'amox': 'Amoxicillin 500',
    'amoxicillin': 'Amoxicillin 500',
    'metformin': 'Metformin 500',
    'glucophage': 'Metformin 500',
    'omeprazole': 'Omeprazole 20',
    'pantoprazole': 'Pantoprazole 40',
    'atorvastatin': 'Atorvastatin 10',
    'amlodipine': 'Amlodipine 5',
    'losartan': 'Losartan 50',
    'telma': 'Telma 40',
  };

  async processOcr(text, tenantId) {
    if (!text || !text.trim()) {
      throw new Error('No text provided for OCR extraction');
    }

    const lowerText = text.toLowerCase();
    const extracted = [];
    const matchedMedicines = new Set();

    for (const [keyword, medicineName] of Object.entries(this.MEDICINE_MAP)) {
      if (lowerText.includes(keyword) && !matchedMedicines.has(medicineName)) {
        matchedMedicines.add(medicineName);
        extracted.push({
          originalText: keyword,
          matchedMedicine: medicineName,
          confidence: keyword === this.fuzzyMatch(keyword, lowerText) ? 0.9 : 0.7,
        });
      }
    }

    const dosagePattern = /(\d+\s*(?:tablet|tab|mg|ml|capsule|caps))/gi;
    const dosages = text.match(dosagePattern) || [];

    const frequencyPattern = /(\d+\s*times?\s*(?:a|per)\s*day|twice\s*daily|once\s*daily|thrice\s*daily|OD|BD|TDS|QID)/gi;
    const frequencies = text.match(frequencyPattern) || [];

    const doctorPattern = /(?:Dr\.?|Doctor)\s+([A-Za-z ]+)/i;
    const doctorMatch = text.match(doctorPattern);
    const doctorName = doctorMatch ? doctorMatch[1].trim() : null;

    const patientPattern = /(?:Patient|Name|Pt\.?)\s*:?\s*(.+)/i;
    const patientMatch = text.match(patientPattern);
    const patientName = patientMatch ? patientMatch[1].trim() : null;

    const result = {
      rawText: text,
      extractedMedicines: extracted,
      detectedDoctor: doctorName,
      detectedPatient: patientName,
      detectedDosages: dosages,
      detectedFrequencies: frequencies,
      medicineCount: extracted.length,
      confidence: extracted.length > 0 ? 0.75 : 0.1,
    };

    emitLocalEvent(EVENTS.OCR_COMPLETED, {
      tenantId,
      medicineCount: extracted.length,
      confidence: result.confidence,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[OCR] Processed prescription text, extracted ${extracted.length} medicines`);
    return result;
  }

  fuzzyMatch(keyword, text) {
    if (text.includes(keyword)) return keyword;
    const words = text.split(/\s+/);
    for (const word of words) {
      const distance = this.levenshteinDistance(keyword, word);
      if (distance <= 1) return word;
    }
    return null;
  }

  levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        matrix[i][j] = a[i - 1] === b[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
    return matrix[a.length][b.length];
  }
}

export default new OcrService();
