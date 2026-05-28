import cloudinary from '../config/cloudinary.js';
import streamifier from 'streamifier';

/**
 * Uploads a file buffer to Cloudinary using a stream.
 * @param {Buffer} fileBuffer - The file buffer to upload.
 * @param {Object} options - Cloudinary upload options (e.g., folder, transformation).
 * @returns {Promise<Object>} - The Cloudinary upload result.
 */
export const uploadToCloudinary = (fileBuffer, options = { folder: 'uploads' }) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });

    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};
