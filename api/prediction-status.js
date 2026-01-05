import Replicate from 'replicate';

const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;

if (!REPLICATE_API_KEY) {
  throw new Error('REPLICATE_API_KEY is not set');
}

const replicate = new Replicate({
  auth: REPLICATE_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prediction_id } = req.query;
  if (!prediction_id) {
    return res.status(400).json({ error: 'prediction_id is required' });
  }

  try {
    const prediction = await replicate.predictions.get(prediction_id);
    
    if (prediction.status === 'succeeded') {
      const output = prediction.output;
      let resultUrl;
      if (Array.isArray(output)) {
        resultUrl = output[0];
      } else if (output && typeof output[Symbol.iterator] === 'function' && typeof output !== 'string') {
        resultUrl = [...output][0];
      } else {
        resultUrl = output;
      }
      return res.status(200).json({ 
        status: 'succeeded',
        image_url: resultUrl 
      });
    }
    
    if (prediction.status === 'failed') {
      return res.status(500).json({ 
        status: 'failed',
        error: prediction.error || 'Generation failed' 
      });
    }

    if (prediction.status === 'canceled') {
      return res.status(500).json({ 
        status: 'canceled',
        error: 'Generation was canceled' 
      });
    }

    // В процессе (starting, processing)
    return res.status(200).json({ 
      status: prediction.status,
      message: 'Генерация в процессе...' 
    });
  } catch (error) {
    console.error('Ошибка проверки статуса:', error);
    return res.status(500).json({ 
      error: 'Ошибка проверки статуса',
      detail: error.message 
    });
  }
}

