import { put } from '@vercel/blob'
import busboy from 'busboy'
import { Readable as StreamReadable } from 'stream'

// Для Vercel serverless functions
// Используем Vercel Blob Storage с токеном

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

    // Загружаем в Vercel Blob Storage с токеном
    console.log('📤 Загружаем файл в Vercel Blob Storage...')
    console.log('  Buffer размер:', fileBuffer.length, 'байт')
    console.log('  Filename:', filename)
    console.log('  ContentType:', contentType)

    try {
      // Токен Vercel Blob Storage
      const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || 'blobs store_lbgUC3ZSH1uYZv3d'
      
      // Генерируем уникальное имя файла
      const timestamp = Date.now()
      const randomId = Math.random().toString(36).substring(2, 15)
      const extension = filename.split('.').pop() || 'jpg'
      const blobName = `images/${timestamp}-${randomId}.${extension}`

      // Загружаем в Vercel Blob с токеном
      const blob = await put(blobName, fileBuffer, {
        contentType: contentType,
        access: 'public', // Публичный доступ для Replicate
        addRandomSuffix: false, // Уже добавили случайный ID
        token: BLOB_READ_WRITE_TOKEN // Передаем токен явно
      })

      console.log('✅ Файл успешно загружен в Vercel Blob Storage')
      console.log('  URL:', blob.url)
      
      if (!blob.url || !blob.url.startsWith('http')) {
        throw new Error('Получен невалидный URL от Vercel Blob')
      }

      return res.json({ url: blob.url })
    } catch (blobError) {
      console.error('❌ Ошибка загрузки в Vercel Blob:', blobError)
      return res.status(500).json({ 
        error: 'Ошибка загрузки в Vercel Blob Storage', 
        detail: blobError.message 
      })
    }

  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: error.message })
  }
}

