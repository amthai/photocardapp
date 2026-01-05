import { put } from '@vercel/blob';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Busboy = require('busboy');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Парсим multipart/form-data
    const busboy = Busboy({ headers: req.headers });

    let fileBuffer = null;
    let fileName = null;
    let contentType = 'image/jpeg';

    await new Promise((resolve, reject) => {
      busboy.on('file', (name, file, info) => {
        const { filename, mimeType } = info;
        fileName = filename || `image-${Date.now()}.jpg`;
        contentType = mimeType || 'image/jpeg';
        
        const chunks = [];
        file.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });

      busboy.on('finish', () => {
        resolve();
      });

      busboy.on('error', (err) => {
        reject(err);
      });

      req.pipe(busboy);
    });

    if (!fileBuffer || !fileName) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Загружаем в Vercel Blob Storage
    const blob = await put(fileName, fileBuffer, {
      access: 'public',
      contentType: contentType,
    });

    return res.status(200).json({
      url: blob.url,
      pathname: blob.pathname,
    });
  } catch (error) {
    console.error('Ошибка загрузки в Blob:', error);
    return res.status(500).json({
      error: 'Ошибка загрузки изображения',
      detail: error.message,
    });
  }
}

