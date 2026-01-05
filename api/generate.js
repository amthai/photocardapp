import fs from 'fs/promises';
import path from 'path';
import Replicate from 'replicate';
import FormData from 'form-data';

const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || 'black-forest-labs/flux-1.1-pro';

if (!REPLICATE_API_KEY) {
  throw new Error('REPLICATE_API_KEY is not set');
}

const replicate = new Replicate({
  auth: REPLICATE_API_KEY
});

/**
 * Reads reference image by style id and uploads it to Replicate Files API.
 */
async function uploadReferenceImage(style) {
  const referencePath = path.join(process.cwd(), 'public', 'img', `${style}.jpeg`);

  let refBuffer;
  try {
    refBuffer = await fs.readFile(referencePath);
  } catch (err) {
    throw new Error(`Reference image not found: ${referencePath}`);
  }

  const formData = new FormData();
  formData.append('file', refBuffer, {
    filename: `${style}.jpeg`,
    contentType: 'image/jpeg'
  });

  const resp = await fetch('https://api.replicate.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Token ${REPLICATE_API_KEY}`
    },
    body: formData
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to upload reference: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  return (
    data.url ||
    (data.urls && typeof data.urls === 'object' ? data.urls.get : null)
  );
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

    const referenceUrl = await uploadReferenceImage(style);
    if (!referenceUrl) {
      return res.status(500).json({ error: 'Failed to get reference URL' });
    }

    const finalPrompt =
      prompt ||
      'Festive winter background with snowflakes, Christmas decorations, warm lighting. New Year greeting card style. Photorealistic, high quality.';

    const fullPrompt = `Keep the person's face and appearance from the input image exactly as they are. ${finalPrompt} The person from the original photo should remain unchanged, only the background and style should change. Use the reference image as a style guide for the background and overall composition.`;

    const output = await replicate.run(REPLICATE_MODEL, {
      input: {
        prompt: fullPrompt,
        image: user_image_url,
        reference_image: referenceUrl,
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

