import FormData from 'form-data'
import { Readable } from 'stream'
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
    console.log('  Buffer размер:', fileBuffer.length, 'байт')
    console.log('  Filename:', filename)
    console.log('  ContentType:', contentType)
    
    const formData = new FormData()
    
    // Пробуем использовать Buffer напрямую - form-data должен поддерживать это
    // Если не работает, используем stream
    try {
      formData.append('file', fileBuffer, {
        filename: filename,
        contentType: contentType,
        knownLength: fileBuffer.length
      })
      console.log('✅ Buffer добавлен напрямую в form-data')
    } catch (bufferError) {
      console.log('⚠️ Buffer не работает, используем stream:', bufferError.message)
      // Fallback: используем stream
      const bufferStream = new Readable()
      bufferStream.push(fileBuffer)
      bufferStream.push(null)
      
      formData.append('file', bufferStream, {
        filename: filename,
        contentType: contentType,
        knownLength: fileBuffer.length
      })
      console.log('✅ Stream добавлен в form-data')
    }
    
    const headers = {
      'Authorization': `Token ${REPLICATE_API_KEY}`,
      ...formData.getHeaders()
    }
    
    console.log('  Content-Type:', headers['content-type']?.substring(0, 100))
    
    // Используем node-fetch явно
    const nodeFetch = await import('node-fetch')
    const fetchFn = nodeFetch.default
    
    console.log('Отправляем запрос в Replicate API...')
    
    const response = await fetchFn('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: headers,
      body: formData
    })
    
    console.log('Ответ Replicate API, статус:', response.status)
    
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

