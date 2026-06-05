import bwipjs from 'bwip-js';

class BarcodeService {
  /**
   * Generate a barcode image as a Buffer
   */
  async generateBarcode(text, type = 'code128') {
    return new Promise((resolve, reject) => {
      bwipjs.toBuffer(
        {
          bcid: type, // Barcode type
          text: text, // Text to encode
          scale: 3, // 3x scaling factor
          height: 10, // Bar height, in millimeters
          includetext: true, // Show human-readable text
          textxalign: 'center',
        },
        (err, png) => {
          if (err) {
            reject(err);
          } else {
            resolve(png);
          }
        },
      );
    });
  }
}

export default new BarcodeService();
