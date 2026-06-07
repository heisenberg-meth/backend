import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../../uploads/imports');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = path.extname(file.originalname) || '.csv';
    cb(null, `import-${uniqueSuffix}${ext}`);
  },
});

import { fileTypeFromFile } from 'file-type';

const validateMagicBytes = async (req, file, cb) => {
  // This is a custom function that should be used as middleware *after* multer saves the file.
  // Alternatively, we can export a wrapper.
};

const upload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls', '.jpg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Only CSV, Excel, Images and PDF are allowed.`));
    }
  },
});

const uploadMiddleware = async (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return next();

    const allowedMimes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'image/jpeg',
      'image/png',
      'application/pdf',
    ];

    const type = await fileTypeFromFile(req.file.path);

    // CSVs might not have magic bytes recognized by file-type, so type could be undefined
    if (type && !allowedMimes.includes(type.mime)) {
      fs.unlinkSync(req.file.path);
      return next(new Error('Invalid file content detected'));
    }

    next();
  });
};

export default uploadMiddleware;
