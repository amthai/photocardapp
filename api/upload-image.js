import fetch from 'node-fetch'
import FormData from 'form-data'
import { Readable } from 'stream'
import busboy from 'busboy'

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

    // Парсим multipart/form-data с помощью busboy
    const bb = busboy({ headers: req.headers })
    let fileBuffer = null
    let filename = 'photo.jpg'
    let contentType = 'image/jpeg'

    await new Promise((resolve, reject) => {
      bb.on('file', (name, file, info) => {
        if (name === 'image') {
          filename = info.filename || 'photo.jpg'
          contentType = info.mimeType || 'image/jpeg'
          
          const chunks = []
          file.on('data', (chunk) => {
            chunks.push(chunk)
          })
          file.on('end', () => {
            fileBuffer = Buffer.concat(chunks)
          })
        } else {
          file.resume()
        }
      })

      bb.on('finish', () => {
        resolve()
      })

      bb.on('error', (err) => {
        reject(err)
      })

      req.pipe(bb)
    })

    if (!fileBuffer) {
      return res.status(400).json({ error: 'Изображение не предоставлено' })
    }

    console.log('Загружаем файл в Replicate Files API...')
    
    const formData = new FormData()
    const bufferStream = new Readable()
    bufferStream.push(fileBuffer)
    bufferStream.push(null)
    
    formData.append('file', bufferStream, {
      filename: filename,
      contentType: contentType,
      knownLength: fileBuffer.length
    })

    const headers = {
      'Authorization': `Token ${REPLICATE_API_KEY}`,
      ...formData.getHeaders()
    }
    
    const response = await fetch('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: headers,
      body: formData
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Ошибка Replicate API:', response.status, errorText)
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }
      return res.status(response.status).json(errorData)
    }

    const data = await response.json()
    console.log('✅ Файл успешно загружен в Replicate Files API')
    
    res.json(data)
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: error.message })
  }
}

