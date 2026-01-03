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
    // На Vercel req может быть уже прочитан, поэтому проверяем разные варианты
    let fileBuffer = null
    let filename = 'photo.jpg'
    let contentType = 'image/jpeg'

    // Проверяем, может быть req уже содержит данные
    if (req.body && Buffer.isBuffer(req.body)) {
      fileBuffer = req.body
      filename = req.headers['x-filename'] || 'photo.jpg'
      contentType = req.headers['content-type'] || 'image/jpeg'
    } else {
      // Используем busboy для парсинга multipart/form-data
      const bb = busboy({ 
        headers: req.headers,
        limits: {
          fileSize: 10 * 1024 * 1024 // 10MB лимит
        }
      })

      await new Promise((resolve, reject) => {
        bb.on('file', (name, file, info) => {
          console.log('Получен файл:', name, 'filename:', info.filename, 'mimeType:', info.mimeType)
          if (name === 'image') {
            filename = info.filename || 'photo.jpg'
            contentType = info.mimeType || 'image/jpeg'
            
            const chunks = []
            file.on('data', (chunk) => {
              chunks.push(chunk)
            })
            file.on('end', () => {
              fileBuffer = Buffer.concat(chunks)
              console.log('Файл прочитан, размер:', fileBuffer.length, 'байт')
            })
          } else {
            file.resume()
          }
        })

        bb.on('finish', () => {
          console.log('Busboy finish, fileBuffer:', !!fileBuffer)
          resolve()
        })

        bb.on('error', (err) => {
          console.error('Busboy error:', err)
          reject(err)
        })

        // На Vercel req может быть уже прочитан, поэтому проверяем
        if (req.readable && !req.readableEnded) {
          req.pipe(bb)
        } else {
          // Если req уже прочитан, пробуем использовать req.body
          if (req.body) {
            console.log('req уже прочитан, используем req.body')
            resolve()
          } else {
            reject(new Error('Request body недоступен'))
          }
        }
      })
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      console.error('❌ Файл не получен. req.body type:', typeof req.body)
      console.error('  req.headers:', JSON.stringify(req.headers, null, 2))
      return res.status(400).json({ error: 'Изображение не предоставлено', detail: 'Missing content' })
    }

    console.log('✅ Файл получен, размер:', fileBuffer.length, 'байт, тип:', contentType)

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
    console.log('  Полный ответ Replicate:', JSON.stringify(data, null, 2))
    console.log('  data.url:', data.url)
    console.log('  data.urls:', data.urls)
    console.log('  data.urls?.get:', data.urls?.get)
    
    res.json(data)
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: error.message })
  }
}

