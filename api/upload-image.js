import FormData from 'form-data'
import { Readable } from 'stream'
import busboy from 'busboy'
import { Readable as StreamReadable } from 'stream'

// Для Vercel serverless functions

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
    console.log('  req.pipe:', typeof req.pipe)
    console.log('  req.on:', typeof req.on)

    let fileBuffer = null
    let filename = 'photo.jpg'
    let contentType = 'image/jpeg'
    let fileReceived = false

    // Используем busboy для парсинга multipart/form-data на Vercel
    const bb = busboy({ 
      headers: req.headers,
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
      }
    })

    await new Promise((resolve, reject) => {
      let hasError = false

      bb.on('file', (name, file, info) => {
        console.log('📁 Получен файл:', name, 'filename:', info.filename, 'mimeType:', info.mimeType)
        fileReceived = true
        
        if (name === 'image') {
          filename = info.filename || 'photo.jpg'
          contentType = info.mimeType || 'image/jpeg'
          
          const chunks = []
          file.on('data', (chunk) => {
            chunks.push(chunk)
            console.log('  Получен chunk, размер:', chunk.length, 'байт, всего chunks:', chunks.length)
          })
          file.on('end', () => {
            fileBuffer = Buffer.concat(chunks)
            console.log('✅ Файл прочитан полностью, размер:', fileBuffer.length, 'байт')
          })
          file.on('error', (err) => {
            console.error('❌ Ошибка чтения файла:', err)
            hasError = true
            reject(err)
          })
        } else {
          file.resume()
        }
      })

      bb.on('finish', () => {
        if (!hasError) {
          console.log('✅ Busboy finish, fileReceived:', fileReceived, 'fileBuffer:', !!fileBuffer, 'размер:', fileBuffer?.length)
          if (!fileBuffer) {
            reject(new Error('Файл не был получен'))
            return
          }
          resolve()
        }
      })

      bb.on('error', (err) => {
        console.error('❌ Busboy error:', err)
        hasError = true
        reject(err)
      })

      // На Vercel req должен быть stream
      if (req.pipe && typeof req.pipe === 'function' && req.readable !== false) {
        console.log('📤 Используем req.pipe()')
        req.pipe(bb)
      } else if (req.on && typeof req.on === 'function') {
        console.log('📤 Используем req.on() события для сбора данных')
        const chunks = []
        req.on('data', (chunk) => {
          chunks.push(chunk)
        })
        req.on('end', () => {
          console.log('📤 Собрано chunks:', chunks.length, 'общий размер:', chunks.reduce((sum, c) => sum + c.length, 0))
          const stream = new StreamReadable()
          chunks.forEach(chunk => stream.push(chunk))
          stream.push(null)
          stream.pipe(bb)
        })
        req.on('error', reject)
      } else {
        console.error('❌ req не поддерживает stream операции')
        console.error('  req type:', typeof req)
        reject(new Error('Request не поддерживает stream'))
      }
    })

    console.log('✅ Файл получен, размер:', fileBuffer.length, 'байт, тип:', contentType)

    if (!fileBuffer || fileBuffer.length === 0) {
      console.error('❌ Buffer пустой или отсутствует')
      return res.status(400).json({ error: 'Файл пустой', detail: 'Empty file buffer' })
    }

    console.log('Загружаем файл в Replicate Files API...')
    console.log('  Buffer размер:', fileBuffer.length, 'байт')
    console.log('  Filename:', filename)
    console.log('  ContentType:', contentType)
    
    const formData = new FormData()
    
    // Создаем Readable stream из Buffer - это должно работать надежно
    const bufferStream = new Readable()
    bufferStream.push(fileBuffer)
    bufferStream.push(null) // Завершаем stream
    
    // Добавляем stream в form-data
    formData.append('file', bufferStream, {
      filename: filename,
      contentType: contentType,
      knownLength: fileBuffer.length
    })
    
    console.log('✅ Stream создан и добавлен в form-data')
    console.log('  Stream readable:', bufferStream.readable)
    console.log('  Stream readableEnded:', bufferStream.readableEnded)
    
    const headers = {
      'Authorization': `Token ${REPLICATE_API_KEY}`,
      ...formData.getHeaders()
    }
    
    console.log('  Headers созданы')
    console.log('  Content-Type:', headers['content-type']?.substring(0, 150))
    console.log('  Authorization присутствует:', !!headers['Authorization'])
    console.log('  Content-Length в headers:', headers['content-length'])
    
    // Используем node-fetch явно
    const nodeFetch = await import('node-fetch')
    const fetchFn = nodeFetch.default
    
    console.log('Отправляем запрос в Replicate API...')
    console.log('  URL: https://api.replicate.com/v1/files')
    console.log('  Method: POST')
    
    const response = await fetchFn('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: headers,
      body: formData
    })
    
    console.log('Ответ Replicate API получен')
    console.log('  Статус:', response.status)
    console.log('  StatusText:', response.statusText)
    
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
    
    return res.json(data)

  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: error.message })
  }
}

