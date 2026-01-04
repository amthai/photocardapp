import express from 'express'
import cors from 'cors'
import multer from 'multer'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import { put } from '@vercel/blob'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Создаем временную папку для хранения загруженных изображений
const tempUploadsDir = join(__dirname, 'temp-uploads')

// Хранилище для временных файлов (чтобы удалять их позже)
const tempFiles = new Map()

const app = express()
const upload = multer({ 
  storage: multer.memoryStorage(), // Используем memoryStorage, файлы в req.file.buffer
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
})

app.use(cors())

// API ключ можно указать как REPLICATE_API_KEY или VITE_REPLICATE_API_KEY в .env
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY || process.env.VITE_REPLICATE_API_KEY

if (!REPLICATE_API_KEY) {
  console.warn('⚠️  ВНИМАНИЕ: API ключ не найден! Установите REPLICATE_API_KEY или VITE_REPLICATE_API_KEY в .env файле')
}

// ВАЖНО: Роут загрузки должен быть ПЕРЕД express.json() и express.urlencoded()
// Эти middleware ломают multipart/form-data, который нужен для multer

// Временный хостинг изображений - сохраняем файл и отдаем URL
app.post('/api/upload-temp-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Изображение не предоставлено' })
    }

    // Генерируем уникальный ID для файла
    const fileId = randomUUID()
    const originalExt = req.file.originalname.split('.').pop() || 'jpg'
    const newFileName = `${fileId}.${originalExt}`
    const newFilePath = join(tempUploadsDir, newFileName)

    // Сохраняем файл из buffer на диск
    await writeFile(newFilePath, req.file.buffer)

    // Сохраняем информацию о файле для последующего удаления
    tempFiles.set(fileId, {
      path: newFilePath,
      createdAt: Date.now()
    })

    // Удаляем файл через 10 минут
    setTimeout(async () => {
      try {
        await unlink(newFilePath)
        tempFiles.delete(fileId)
      } catch (e) {
        console.error('Ошибка удаления временного файла:', e)
      }
    }, 10 * 60 * 1000)

    // Возвращаем URL для доступа к файлу
    const fileUrl = `${req.protocol}://${req.get('host')}/api/temp-images/${newFileName}`
    
    console.log('✅ Временное изображение загружено:', fileId, 'URL:', fileUrl)
    
    res.json({ 
      url: fileUrl,
      id: fileId
    })
  } catch (error) {
    console.error('Ошибка загрузки временного изображения:', error)
    res.status(500).json({ error: error.message })
  }
})

// Отдача временных изображений
app.get('/api/temp-images/:filename', (req, res) => {
  const filePath = join(tempUploadsDir, req.params.filename)
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Ошибка отдачи файла:', err)
      res.status(404).json({ error: 'Файл не найден' })
    }
  })
})

// Прокси для загрузки изображения в Replicate (старый эндпоинт, оставляем для совместимости)
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    console.log('Получен запрос на загрузку изображения')
    console.log('Content-Type:', req.headers['content-type'])
    console.log('Request body:', req.body)
    console.log('Request file:', req.file ? `Размер: ${req.file.size}, Тип: ${req.file.mimetype}, Имя: ${req.file.originalname}` : 'НЕТ ФАЙЛА')
    console.log('Request files:', req.files)
    
    if (!req.file) {
      console.error('Файл не получен. Проверьте, что поле называется "image"')
      console.error('Headers:', JSON.stringify(req.headers, null, 2))
      console.error('Body keys:', Object.keys(req.body))
      return res.status(400).json({ 
        error: 'Изображение не предоставлено. Убедитесь, что файл отправляется в поле "image"',
        debug: {
          contentType: req.headers['content-type'],
          hasFile: !!req.file,
          bodyKeys: Object.keys(req.body)
        }
      })
    }

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || process.env.BLOB_RW_TOKEN
    if (!blobToken) {
      return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN не настроен' })
    }

    const ext = (req.file.originalname?.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg'
    const blobName = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    console.log('Загружаем файл в Vercel Blob (public)...')
    console.log('  Размер файла:', req.file.buffer.length, 'байт')
    console.log('  Контент-тайп:', req.file.mimetype)
    console.log('  Имя файла:', blobName)

    try {
      const blob = await put(blobName, req.file.buffer, {
        access: 'public',
        contentType: req.file.mimetype || 'image/jpeg',
        addRandomSuffix: false,
        token: blobToken
      })

      console.log('✅ Файл успешно загружен в Blob')
      console.log('  URL:', blob.url)
      res.json({ url: blob.url })
    } catch (uploadErr) {
      console.error('❌ Ошибка загрузки в Blob:', uploadErr)
      res.status(500).json({ error: 'Ошибка загрузки в Blob', detail: uploadErr.message })
    }
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Обработка ошибок multer (должна быть после роута с multer)
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Файл слишком большой (максимум 10MB)' })
    }
    return res.status(400).json({ error: `Ошибка загрузки файла: ${error.message}` })
  }
  next(error)
})

// Увеличиваем лимит размера тела запроса для больших Base64 изображений (50MB)
// Эти middleware применяются только к запросам, которые не обработаны выше
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Прокси для создания prediction
app.post('/api/predictions', async (req, res) => {
  try {
    if (!REPLICATE_API_KEY) {
      return res.status(500).json({ error: 'API ключ не настроен' })
    }

    console.log('🔍 ПОЛУЧЕН ЗАПРОС НА СОЗДАНИЕ PREDICTION')
    console.log('  Model version:', req.body.version)
    console.log('  Input keys:', Object.keys(req.body.input || {}))
    console.log('  Has prompt:', !!req.body.input?.prompt, 'Длина:', req.body.input?.prompt?.length)
    console.log('  Prompt (первые 200 символов):', req.body.input?.prompt?.substring(0, 200))
    console.log('  Has image:', !!req.body.input?.image)
    console.log('  Image type:', typeof req.body.input?.image)
    if (req.body.input?.image) {
      const img = req.body.input.image
      console.log('  Image starts with:', img.substring(0, 80))
      console.log('  Image length:', img.length)
      console.log('  Image is valid Data URI:', img.startsWith('data:image/'))
    }
    console.log('  Strength:', req.body.input?.strength)
    console.log('  Aspect ratio:', req.body.input?.aspect_ratio)
    console.log('  Все параметры input:', JSON.stringify(Object.keys(req.body.input || {})))
    
    // Проверяем, что промпт и изображение точно есть
    if (!req.body.input?.prompt) {
      console.error('❌ ОШИБКА: Промпт отсутствует в запросе!')
    }
    if (!req.body.input?.image) {
      console.error('❌ ОШИБКА: Изображение отсутствует в запросе!')
    }

    // Проверяем размер тела запроса
    const requestBodyString = JSON.stringify(req.body)
    console.log('  Размер тела запроса:', requestBodyString.length, 'символов')
    console.log('  Промпт в JSON:', requestBodyString.includes(req.body.input?.prompt?.substring(0, 50) || ''))
    console.log('  Изображение в JSON:', requestBodyString.includes('data:image/'))
    
    // Используем node-fetch для консистентности
    const nodeFetch = await import('node-fetch')
    const fetchFn = nodeFetch.default
    
    const response = await fetchFn('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${REPLICATE_API_KEY}`
      },
      body: requestBodyString
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error('❌ Replicate API error:', response.status)
      console.error('  Ответ Replicate:', JSON.stringify(data, null, 2))
      return res.status(response.status).json(data)
    }

    console.log('✅ Prediction создан успешно:', data.id)
    console.log('  Status:', data.status)
    res.json(data)
  } catch (error) {
    console.error('Prediction error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Прокси для проверки статуса prediction
app.get('/api/predictions/:id', async (req, res) => {
  try {
    if (!REPLICATE_API_KEY) {
      return res.status(500).json({ error: 'API ключ не настроен' })
    }

    // Используем node-fetch для консистентности
    const nodeFetch = await import('node-fetch')
    const fetchFn = nodeFetch.default
    
    const response = await fetchFn(`https://api.replicate.com/v1/predictions/${req.params.id}`, {
      headers: {
        'Authorization': `Token ${REPLICATE_API_KEY}`
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      return res.status(response.status).json(data)
    }

    res.json(data)
  } catch (error) {
    console.error('Status check error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Статические файлы из dist после сборки
const distPath = join(__dirname, 'dist')
app.use(express.static(distPath))

// SPA fallback - все не-API запросы отдают index.html
// ВАЖНО: Должен быть ПОСЛЕДНИМ, после всех API роутов
app.get('*', (req, res, next) => {
  // Пропускаем API роуты
  if (req.path.startsWith('/api')) {
    return next()
  }
  // Для всех остальных запросов отдаем index.html
  res.sendFile(join(distPath, 'index.html'), (err) => {
    if (err) {
      console.error('Ошибка отдачи index.html:', err)
      res.status(500).send('Internal Server Error')
    }
  })
})

// Создаем папку для временных загрузок при старте сервера
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const PORT = process.env.PORT || 3001

// Инициализация при старте сервера
async function initServer() {
  try {
    if (!existsSync(tempUploadsDir)) {
      await mkdir(tempUploadsDir, { recursive: true })
      console.log('✅ Временная папка для загрузок создана:', tempUploadsDir)
    } else {
      console.log('✅ Временная папка для загрузок уже существует:', tempUploadsDir)
    }
  } catch (error) {
    console.error('❌ Ошибка создания папки для загрузок:', error)
  }
  
  app.listen(PORT, () => {
    console.log('🚀 ========================================')
    console.log(`   Photo Card App Server`)
    console.log(`   Порт: ${PORT}`)
    console.log(`   URL: http://localhost:${PORT}`)
    console.log(`   Окружение: ${process.env.NODE_ENV || 'development'}`)
    console.log(`   API ключ: ${REPLICATE_API_KEY ? '✅ Найден' : '❌ НЕ НАЙДЕН'}`)
    console.log('🚀 ========================================')
  })
}

initServer()

