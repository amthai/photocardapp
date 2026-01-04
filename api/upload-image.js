import fetch from 'node-fetch'
import FormData from 'form-data'
import { Readable, PassThrough } from 'stream'
import { IncomingForm } from 'formidable'
import { readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'

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

    let fileBuffer = null
    let filename = 'photo.jpg'
    let contentType = 'image/jpeg'

    // Используем formidable для парсинга multipart/form-data на Vercel
    const form = new IncomingForm({
      uploadDir: tmpdir(),
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
    })

    let fields, files
    try {
      [fields, files] = await form.parse(req)
    } catch (parseError) {
      console.error('❌ Ошибка парсинга формы:', parseError)
      return res.status(400).json({ 
        error: 'Ошибка парсинга формы', 
        detail: parseError.message 
      })
    }

    console.log('📁 Поля формы:', Object.keys(fields))
    console.log('📁 Файлы:', Object.keys(files))

    // Ищем файл в поле 'image'
    const imageFile = files.image?.[0]
    
    if (!imageFile) {
      console.error('❌ Файл не найден в поле "image"')
      console.error('  Доступные поля:', Object.keys(files))
      return res.status(400).json({ error: 'Изображение не предоставлено', detail: 'Missing content' })
    }

    // Читаем файл
    let tempFilePath = imageFile.filepath
    try {
      fileBuffer = readFileSync(tempFilePath)
      filename = imageFile.originalFilename || 'photo.jpg'
      contentType = imageFile.mimetype || 'image/jpeg'
      console.log('✅ Файл прочитан, размер:', fileBuffer.length, 'байт, тип:', contentType)
    } catch (readError) {
      console.error('❌ Ошибка чтения файла:', readError)
      return res.status(500).json({ error: 'Ошибка чтения файла', detail: readError.message })
    } finally {
      // Удаляем временный файл после чтения
      try {
        if (tempFilePath) {
          unlinkSync(tempFilePath)
          console.log('✅ Временный файл удален')
        }
      } catch (unlinkError) {
        console.warn('⚠️ Не удалось удалить временный файл:', unlinkError)
      }
    }

    console.log('✅ Файл получен, размер:', fileBuffer.length, 'байт, тип:', contentType)

    if (!fileBuffer || fileBuffer.length === 0) {
      console.error('❌ Buffer пустой или отсутствует')
      return res.status(400).json({ error: 'Файл пустой', detail: 'Empty file buffer' })
    }

    console.log('Загружаем файл в Replicate Files API...')
    
    const formData = new FormData()
    
    // Создаем Readable stream с правильной реализацией
    // Stream должен читаться постепенно, а не сразу весь buffer
    let bufferIndex = 0
    const bufferStream = new Readable({
      read(size) {
        // Читаем chunk размером size из buffer
        if (bufferIndex >= fileBuffer.length) {
          this.push(null) // Завершаем stream когда весь buffer прочитан
          return
        }
        
        const chunk = fileBuffer.slice(bufferIndex, bufferIndex + size)
        bufferIndex += chunk.length
        this.push(chunk)
      }
    })
    
    formData.append('file', bufferStream, {
      filename: filename,
      contentType: contentType,
      knownLength: fileBuffer.length
    })
    
    console.log('✅ Stream создан, размер buffer:', fileBuffer.length, 'байт')

    const headers = {
      'Authorization': `Token ${REPLICATE_API_KEY}`,
      ...formData.getHeaders()
    }
    
    console.log('Отправляем в Replicate, размер файла:', fileBuffer.length, 'байт')
    console.log('Content-Type:', headers['content-type']?.substring(0, 80))
    console.log('Buffer is Buffer:', Buffer.isBuffer(fileBuffer))
    
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

