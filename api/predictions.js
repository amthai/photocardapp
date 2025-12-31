import fetch from 'node-fetch'

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY || process.env.VITE_REPLICATE_API_KEY

    if (!REPLICATE_API_KEY) {
      return res.status(500).json({ error: 'API ключ не настроен' })
    }

    // В Vercel body уже распарсен автоматически для application/json
    // Если это строка, парсим вручную
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch (e) {
        console.error('Ошибка парсинга JSON body:', e)
        return res.status(400).json({ error: 'Invalid JSON in request body' })
      }
    }

    if (!body || !body.input) {
      return res.status(400).json({ error: 'Missing required fields: input' })
    }

    console.log('🔍 ПОЛУЧЕН ЗАПРОС НА СОЗДАНИЕ PREDICTION')
    console.log('  Model version:', body.version)
    console.log('  Input keys:', Object.keys(body.input || {}))
    
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${REPLICATE_API_KEY}`
      },
      body: JSON.stringify(body)
    })

    const responseText = await response.text()
    let data
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error('Ошибка парсинга ответа от Replicate:', e)
      console.error('Ответ (первые 500 символов):', responseText.substring(0, 500))
      return res.status(500).json({ error: 'Invalid response from Replicate API' })
    }
    
    if (!response.ok) {
      console.error('❌ Replicate API error:', response.status)
      console.error('  Ответ Replicate:', JSON.stringify(data, null, 2))
      return res.status(response.status).json(data)
    }

    console.log('✅ Prediction создан успешно:', data.id)
    res.json(data)
  } catch (error) {
    console.error('Prediction error:', error)
    res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

