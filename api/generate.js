import Replicate from 'replicate';

const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || 'black-forest-labs/flux-1.1-pro';

if (!REPLICATE_API_KEY) {
  throw new Error('REPLICATE_API_KEY is not set');
}

const replicate = new Replicate({
  auth: REPLICATE_API_KEY
});

// Публичные ссылки референсов (например из Vercel Blob)
const REFERENCE_URLS = {
  newyear: 'https://lbguc3zsh1uyzv3d.public.blob.vercel-storage.com/1767548913407-vay4azsocze.jpeg'
};

function getPublicReferenceUrl(style) {
  if (REFERENCE_URLS[style]) return REFERENCE_URLS[style];
  const host = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  return `${host}/img/${style}.jpeg`;
}

async function assertReachable(url) {
  try {
    const resp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
    if (!resp.ok) {
      throw new Error(`Status ${resp.status}`);
    }
  } catch (err) {
    throw new Error(`URL not reachable: ${url} (${err.message})`);
  }
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_image_url, style = 'newyear', prompt } = await readJsonBody(req);

    if (!user_image_url) {
      return res.status(400).json({ error: 'user_image_url is required' });
    }

    // Используем статичный публичный референс из /public/img
    const referenceUrl = getPublicReferenceUrl(style);

    // Проверяем доступность картинок до вызова модели
    await assertReachable(user_image_url);
    await assertReachable(referenceUrl);

    const finalPrompt =
      prompt ||
      'Festive winter background with snowflakes, Christmas decorations, warm lighting. New Year greeting card style. Photorealistic, high quality.';

    const fullPrompt = `Keep the person's face and appearance from the input image exactly as they are. ${finalPrompt} The person from the original photo should remain unchanged, only the background and style should change. Use the reference image as a style guide for the background and overall composition.`;

    const output = await replicate.run(REPLICATE_MODEL, {
      input: {
        prompt: fullPrompt,
        image: user_image_url,
        ip_adapter_image: referenceUrl,
        num_outputs: 1,
        aspect_ratio: '1:1',
        strength: 0.72,
        guidance_scale: 8.0,
        output_format: 'png',
        output_quality: 90
      }
    });

    let resultUrl;
    if (Array.isArray(output)) {
      resultUrl = output[0];
    } else if (output && typeof output[Symbol.iterator] === 'function' && typeof output !== 'string') {
      resultUrl = [...output][0];
    } else {
      resultUrl = output;
    }

    return res.status(200).json({ image_url: resultUrl });
  } catch (error) {
    console.error('Ошибка генерации:', error);
    return res
      .status(500)
      .json({ error: 'Ошибка генерации', detail: error.message || 'Unknown error' });
  }
}

