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

    console.log('📥 Получен запрос на загрузку изображения')
    console.log('  Content-Type:', req.headers['content-type'])
    console.log('  req.readable:', req.readable)
    console.log('  req.readableEnded:', req.readableEnded)
    console.log('  req.body type:', typeof req.body)
    console.log('  req.body is Buffer:', Buffer.isBuffer(req.body))

    let fileBuffer = null
    let filename = 'photo.jpg'
    let contentType = 'image/jpeg'

    // На Vercel нужно использовать busboy с правильной настройкой
    // req может быть не stream, поэтому используем другой подход
    const bb = busboy({ 
      headers: req.headers,
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB лимит
      }
    })

    await new Promise((resolve, reject) => {
      let fileReceived = false

      bb.on('file', (name, file, info) => {
        console.log('📁 Получен файл:', name, 'filename:', info.filename, 'mimeType:', info.mimeType)
        fileReceived = true
        
        if (name === 'image') {
          filename = info.filename || 'photo.jpg'
          contentType = info.mimeType || 'image/jpeg'
          
          const chunks = []
          file.on('data', (chunk) => {
            chunks.push(chunk)
          })
          file.on('end', () => {
            fileBuffer = Buffer.concat(chunks)
            console.log('✅ Файл прочитан, размер:', fileBuffer.length, 'байт')
          })
        } else {
          file.resume()
        }
      })

      bb.on('finish', () => {
        console.log('✅ Busboy finish, fileBuffer:', !!fileBuffer, 'размер:', fileBuffer?.length)
        resolve()
      })

      bb.on('error', (err) => {
        console.error('❌ Busboy error:', err)
        reject(err)
      })

      // На Vercel с bodyParser: false req должен быть stream
      // Пробуем использовать req как stream напрямую
      if (req.readable && typeof req.pipe === 'function') {
        console.log('📤 Используем req.pipe() напрямую')
        req.pipe(bb)
      } else if (req.on && typeof req.on === 'function') {
        // Если req не stream, но есть события, собираем данные
        console.log('📤 Собираем данные через события req')
        const chunks = []
        req.on('data', (chunk) => {
          chunks.push(chunk)
        })
        req.on('end', () => {
          const rawBody = Buffer.concat(chunks)
          console.log('📤 Получен raw body, размер:', rawBody.length)
          const stream = new Readable()
          stream.push(rawBody)
          stream.push(null)
          stream.pipe(bb)
        })
        req.on('error', reject)
        return // Не вызываем resolve здесь, ждем 'end'
      } else {
        console.error('❌ req не является stream и не поддерживает события')
        console.error('  req.readable:', req.readable)
        console.error('  req.pipe:', typeof req.pipe)
        console.error('  req.on:', typeof req.on)
        reject(new Error('Request не поддерживает stream или события'))
      }
    })

    if (!fileBuffer || fileBuffer.length === 0) {
      console.error('❌ Файл не получен после парсинга')
      console.error('  fileBuffer:', !!fileBuffer, fileBuffer?.length)
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

