import { put } from '@vercel/blob';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Парсим FormData
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Конвертируем File в ArrayBuffer, затем в Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Загружаем в Vercel Blob Storage
    const blob = await put(file.name || `image-${Date.now()}.jpg`, buffer, {
      access: 'public',
      contentType: file.type || 'image/jpeg',
    });

    return new Response(
      JSON.stringify({
        url: blob.url,
        pathname: blob.pathname,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Ошибка загрузки в Blob:', error);
    return new Response(
      JSON.stringify({
        error: 'Ошибка загрузки изображения',
        detail: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

