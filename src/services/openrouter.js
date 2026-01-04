// Конфигурация API
// В production используем относительный путь (API на том же домене)
// В development используем localhost:3001
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:3001/api')

// Выбор модели для генерации через Replicate
// nano-banana поддерживает image-to-image
const REPLICATE_MODEL = import.meta.env.VITE_REPLICATE_MODEL || 'google/nano-banana'

// Сжимает изображение для уменьшения размера Data URI
// Максимальный размер: 1024x1024, качество: 0.8
async function compressImage(file, maxSize = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        // Вычисляем новые размеры с сохранением пропорций
        let width = img.width
        let height = img.height
        
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height * maxSize) / width
            width = maxSize
          } else {
            width = (width * maxSize) / height
            height = maxSize
          }
        }
        
        // Создаем canvas и рисуем сжатое изображение
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        
        // Конвертируем в Data URI с сжатием
        const dataUri = canvas.toDataURL('image/jpeg', quality)
        console.log(`✅ Изображение сжато: ${img.width}x${img.height} → ${width}x${height}`)
        console.log(`  Размер Data URI: ${(dataUri.length / 1024 / 1024).toFixed(2)} MB`)
        resolve(dataUri)
      }
      img.onerror = () => reject(new Error('Ошибка загрузки изображения'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('Ошибка чтения файла'))
    reader.readAsDataURL(file)
  })
}

// Загружает изображение в Replicate Files API и возвращает URL
async function uploadImageToReplicate(photoFile) {
  console.log('📤 Загружаем изображение в Replicate Files API...')
  
  const formData = new FormData()
  formData.append('image', photoFile)
  
  const response = await fetch(`${API_BASE_URL}/upload-image`, {
    method: 'POST',
    body: formData
  })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Ошибка загрузки изображения' }))
    console.error('❌ Ошибка загрузки в Replicate Files API:', errorData)
    throw new Error(errorData.error || errorData.message || `Ошибка загрузки изображения: ${response.status}`)
  }
  
    let data
    try {
      const text = await response.text()
      data = text ? JSON.parse(text) : null
    } catch (e) {
      console.error('Ошибка парсинга ответа upload:', e)
      throw new Error('Некорректный ответ от API при загрузке изображения')
    }
    
    if (!data) {
      throw new Error('Пустой ответ от API при загрузке изображения')
    }
    
    console.log('✅ Изображение загружено в Replicate Files API')
  console.log('  Ответ:', data)
  console.log('  URL изображения:', data.url || data.urls?.get)
  
  // Replicate Files API возвращает объект с полем urls.get (это функция для получения URL)
  // Или может быть просто строка с URL
  let imageUrl = null
  
  // Проверяем разные варианты формата ответа
  if (data.url) {
    imageUrl = data.url
  } else if (data.urls && typeof data.urls.get === 'function') {
    // Если это функция, вызываем её (но обычно это уже строка)
    imageUrl = data.urls.get
  } else if (data.urls && typeof data.urls.get === 'string') {
    imageUrl = data.urls.get
  } else if (typeof data === 'string') {
    imageUrl = data
  } else if (data.urls && data.urls.get) {
    imageUrl = data.urls.get
  }
  
  // Если это объект с полем url внутри
  if (typeof imageUrl === 'object' && imageUrl.url) {
    imageUrl = imageUrl.url
  }
  
  // Replicate Files API возвращает полный URL, начинающийся с https://
  // Не нужно добавлять префикс replicate.delivery
  if (!imageUrl || typeof imageUrl !== 'string') {
    console.error('❌ URL изображения не получен. Полный ответ:', JSON.stringify(data, null, 2))
    throw new Error('URL изображения не получен от Replicate. Проверьте логи сервера.')
  }
  
  // Проверяем, что это валидный URL
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    console.error('❌ Получен невалидный URL:', imageUrl)
    throw new Error('Получен невалидный URL от Replicate Files API')
  }
  
  console.log('✅ Финальный URL изображения:', imageUrl)
  return imageUrl
}

// Загружает референс изображение из папки public/img
async function loadReferenceImage(referencePath) {
  console.log('📥 Загружаем референс изображение:', referencePath)
  
  try {
    // Загружаем изображение как blob
    const response = await fetch(referencePath)
    
    if (!response.ok) {
      throw new Error(`Не удалось загрузить референс: ${response.status}`)
    }
    
    const blob = await response.blob()
    
    // Конвертируем blob в File для совместимости с uploadImageToReplicate
    const fileName = referencePath.split('/').pop() || 'reference.jpg'
    const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
    
    console.log('✅ Референс загружен, размер:', file.size, 'байт')
    
    // Загружаем в Replicate Files API
    // Replicate больше не поддерживает Data URI, нужны только URL
    const referenceUrl = await uploadImageToReplicate(file)
    console.log('✅ Референс загружен в Replicate, URL:', referenceUrl)
    return referenceUrl
  } catch (error) {
    console.error('❌ Ошибка загрузки референса:', error)
    throw new Error(`Ошибка загрузки референса: ${error.message}`)
  }
}

async function waitForPrediction(predictionId) {
  const maxAttempts = 60
  let attempts = 0
  
  while (attempts < maxAttempts) {
    // Используем query параметр вместо пути для совместимости с Vercel
    const response = await fetch(`${API_BASE_URL}/predictions?id=${predictionId}`)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Ошибка проверки статуса' }))
      throw new Error(`Ошибка проверки статуса генерации: ${response.status} - ${errorData.error || 'Неизвестная ошибка'}`)
    }
    
    let data
    try {
      const text = await response.text()
      data = text ? JSON.parse(text) : null
    } catch (e) {
      console.error('Ошибка парсинга ответа статуса:', e)
      throw new Error('Некорректный ответ от API при проверке статуса')
    }
    
    if (!data) {
      throw new Error('Пустой ответ от API при проверке статуса')
    }
    
    console.log('Статус prediction:', data.status, 'Output:', data.output)
    
    if (data.status === 'succeeded') {
      if (!data.output) {
        throw new Error('Генерация завершена, но результат отсутствует')
      }
      
      // Replicate может вернуть массив URL или один URL
      let imageUrl
      if (Array.isArray(data.output)) {
        imageUrl = data.output[0]
      } else if (typeof data.output === 'string') {
        imageUrl = data.output
      } else {
        throw new Error('Неожиданный формат результата от API')
      }
      
      if (!imageUrl) {
        throw new Error('URL изображения отсутствует в результате')
      }
      
      console.log('Получен URL изображения:', imageUrl)
      return imageUrl
    }
    
    if (data.status === 'failed' || data.status === 'canceled') {
      const errorMsg = data.error || (typeof data === 'string' ? data : 'Генерация не удалась')
      throw new Error(errorMsg)
    }
    
    // Показываем прогресс
    if (data.status === 'processing' || data.status === 'starting') {
      console.log(`Статус: ${data.status} (попытка ${attempts + 1}/${maxAttempts})`)
    }
    
    // Ждем перед следующей проверкой
    await new Promise(resolve => setTimeout(resolve, 2000))
    attempts++
  }
  
  throw new Error('Превышено время ожидания генерации (2 минуты)')
}

export async function generateCard(photoFile, style) {
  try {
    // Формируем промпт с учетом стиля и референса
    // Добавляем инструкции по использованию референса для стиля
    let fullPrompt = style.prompt
    if (style.referenceImage) {
      fullPrompt = `${fullPrompt} Use the reference image as a style guide for the background, composition, colors, and overall aesthetic. Match the style and mood of the reference image while keeping the person from the input image unchanged.`
    }
    
    console.log('📝 ПРОМПТ ДЛЯ ГЕНЕРАЦИИ:')
    console.log('  Стиль:', style.name)
    console.log('  Промпт:', fullPrompt)
    console.log('  Длина промпта:', fullPrompt.length, 'символов')

    console.log('Начинаем генерацию...')
    console.log('Загруженное изображение:', photoFile.name, 'размер:', photoFile.size, 'тип:', photoFile.type)
    
    // Загружаем референс изображение
    let referenceImageUrl = null
    if (style.referenceImage) {
      try {
        referenceImageUrl = await loadReferenceImage(style.referenceImage)
        console.log('✅ Референс загружен:', referenceImageUrl)
      } catch (refError) {
        console.warn('⚠️ Не удалось загрузить референс:', refError.message)
        // Продолжаем без референса, но предупреждаем
      }
    }
    
    // Загружаем изображение пользователя в Replicate Files API
    // Replicate больше не поддерживает Data URI, нужны только URL
    let imageInput
    try {
      imageInput = await uploadImageToReplicate(photoFile)
      console.log('✅ Изображение пользователя загружено в Replicate Files API')
      console.log('  URL:', imageInput)
      console.log('  URL валидный:', imageInput.startsWith('http'))
      
      // Проверяем, что URL валидный
      if (!imageInput || !imageInput.startsWith('http')) {
        throw new Error('Получен невалидный URL от Replicate Files API')
      }
    } catch (uploadError) {
      console.error('❌ Ошибка загрузки в Replicate Files API:', uploadError.message)
      throw new Error(`Не удалось загрузить изображение: ${uploadError.message}. Replicate API требует URL, а не Data URI.`)
    }
    
    // Финальная проверка, что изображение есть
    if (!imageInput) {
      throw new Error('Не удалось получить изображение для генерации')
    }
    
    console.log('🔍 ПРОВЕРКА ИЗОБРАЖЕНИЙ ПЕРЕД ОТПРАВКОЙ:')
    console.log('  Изображение пользователя присутствует:', !!imageInput)
    console.log('  Тип:', imageInput.startsWith('http') ? 'URL' : imageInput.startsWith('data:') ? 'Data URI' : 'НЕИЗВЕСТНО')
    console.log('  Длина изображения пользователя:', imageInput.length, 'символов')
    console.log('  Референс присутствует:', !!referenceImageUrl)
    if (referenceImageUrl) {
      console.log('  Референс тип:', referenceImageUrl.startsWith('http') ? 'URL' : referenceImageUrl.startsWith('data:') ? 'Data URI' : 'НЕИЗВЕСТНО')
      console.log('  Референс длина:', referenceImageUrl.length, 'символов')
      console.log('  Референс первые 100 символов:', referenceImageUrl.substring(0, 100))
    }
    
    // Используем Replicate с выбранной моделью (по умолчанию Nano Banana)
    return await generateWithReplicate(imageInput, referenceImageUrl, fullPrompt, style)
    
  } catch (error) {
    console.error('Generation API error:', error)
    
    // Улучшаем сообщение об ошибке для пользователя
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('Не удалось подключиться к серверу. Убедитесь, что backend сервер запущен (npm run dev:server)')
    } else if (error.message.includes('404')) {
      throw new Error('Модель не найдена. Возможно, нужно использовать другую версию модели')
    } else if (error.message.includes('Insufficient credit') || error.message.includes('402')) {
      throw new Error('Недостаточно кредитов на аккаунте. Пополните баланс и подождите несколько минут.')
    } else if (error.message.includes('429') || error.message.includes('throttled') || error.message.includes('rate limit')) {
      // Ошибка rate limit - показываем сообщение как есть (там уже есть информация о времени ожидания)
      throw error
    } else {
      throw new Error(error.message || 'Произошла ошибка при генерации открытки. Проверьте консоль для деталей.')
    }
  }
}

async function generateWithReplicate(imageInput, referenceImageUrl, fullPrompt, style) {
    // Используем модель из переменной окружения (по умолчанию Nano Banana)
    let modelVersion = REPLICATE_MODEL
    
    console.log('Используем Replicate с моделью:', modelVersion)
    console.log('Промпт:', fullPrompt.substring(0, 100) + '...')
    console.log('Изображение пользователя (тип):', imageInput.startsWith('http') ? 'URL' : 'Data URI')
    console.log('Изображение пользователя (первые 80 символов):', imageInput.substring(0, 80))
    console.log('Референс изображение:', referenceImageUrl ? 'Присутствует' : 'Отсутствует')
    
    // Формируем запрос в зависимости от модели
    let requestBody
    
    // Формируем запрос в зависимости от модели
    if (modelVersion.includes('flux')) {
      // Flux Pro точно поддерживает image-to-image
      requestBody = {
        version: modelVersion,
        input: {
          prompt: fullPrompt,
          image: imageInput, // URL или Data URI изображения пользователя
          reference_image: referenceImageUrl, // Референс изображение
          num_outputs: 1,
          aspect_ratio: '1:1',
          output_format: 'png',
          output_quality: 90,
          strength: 0.9 // Сила влияния исходного изображения (0.9 = сильное сохранение лица)
          // Не передаем seed - Flux Pro не принимает null, и без seed будет случайный
        }
      }
      console.log('✅ Используем Flux Pro - точно поддерживает image-to-image')
    } else if (modelVersion.includes('nano-banana')) {
      // Nano Banana: пробуем image-to-image с init_image + reference_image
      // Передаем и image, и init_image одинаково, чтобы принудить модель использовать входное фото
      requestBody = {
        version: modelVersion,
        input: {
          prompt: fullPrompt,
          image: imageInput,        // URL изображения пользователя
          init_image: imageInput,   // дублируем в init_image для совместимости
          num_outputs: 1,
          aspect_ratio: '1:1',
          strength: 0.9,            // чуть ниже, чтобы дать место стилю, но сохранить лицо
          guidance_scale: 8.0       // слегка повышаем, чтобы промпт и референс сильнее влияли
        }
      }
      
      // Добавляем референс как reference_image и control_image (некоторые модели используют control_image)
      if (referenceImageUrl) {
        requestBody.input.reference_image = referenceImageUrl
        requestBody.input.control_image = referenceImageUrl
        console.log('✅ Референс добавлен как reference_image и control_image')
      }
      
      console.log('✅ Используем nano-banana с image, init_image и reference/control image')
      console.log('  image URL:', imageInput.substring(0, 120))
      if (referenceImageUrl) {
        console.log('  reference/control URL:', referenceImageUrl.substring(0, 120))
      }
      
      console.log('🔍 ДЕТАЛЬНАЯ ПРОВЕРКА ЗАПРОСА:')
      console.log('  - Промпт присутствует:', !!fullPrompt, 'Длина:', fullPrompt.length)
      console.log('  - Промпт (первые 200 символов):', fullPrompt.substring(0, 200))
      console.log('  - Изображение пользователя присутствует:', !!imageInput)
      console.log('  - Тип изображения пользователя:', imageInput.startsWith('http') ? 'URL' : 'Data URI')
      console.log('  - Длина изображения пользователя:', imageInput.length, 'символов')
      console.log('  - Референс присутствует:', !!referenceImageUrl)
      console.log('  - Все параметры input:', Object.keys(requestBody.input))
      console.log('  - Значение strength:', requestBody.input.strength)
    } else {
      // Для других моделей
      requestBody = {
        version: modelVersion,
        input: {
          prompt: fullPrompt,
          image: imageInput,
          reference_image: referenceImageUrl, // Референс изображение
          num_outputs: 1,
          strength: 0.98, // Высокое значение для сохранения исходного изображения
          guidance_scale: 7.5,
          seed: null
        }
      }
    }
    
    // Финальная проверка перед отправкой
    if (!requestBody.input.image) {
      throw new Error('КРИТИЧЕСКАЯ ОШИБКА: Изображение отсутствует в запросе!')
    }
    
    // Проверяем, что изображение действительно в запросе
    const requestBodyString = JSON.stringify(requestBody)
    
    console.log('🔍 ФИНАЛЬНАЯ ПРОВЕРКА ПЕРЕД ОТПРАВКОЙ:')
    console.log('  Модель:', modelVersion)
    console.log('  Изображение пользователя (URL):', requestBody.input.image)
    console.log('  Референс (URL):', requestBody.input.reference_image || 'Отсутствует')
    console.log('  Размер JSON запроса:', requestBodyString.length, 'символов')
    console.log('  Параметры input:', Object.keys(requestBody.input))
    
    const response = await fetch(`${API_BASE_URL}/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: requestBodyString
    })

    if (!response.ok) {
      let errorData
      try {
        const text = await response.text()
        errorData = text ? JSON.parse(text) : { error: 'Ошибка API' }
      } catch (e) {
        console.error('Ошибка парсинга ответа API:', e)
        errorData = { error: `API ошибка: ${response.status}` }
      }
      console.error('API ошибка:', errorData)
      
      if (response.status === 402) {
        throw new Error(errorData.detail || errorData.title || 'Недостаточно кредитов на аккаунте Replicate. Пополните баланс на https://replicate.com/account/billing#billing')
      }
      
      if (response.status === 429) {
        // Rate limit exceeded - показываем понятное сообщение
        const retryAfter = errorData.retry_after || 1
        const message = errorData.detail || 'Превышен лимит запросов. Подождите немного и попробуйте снова.'
        throw new Error(`${message} Попробуйте через ${retryAfter} секунд.`)
      }
      
      throw new Error(errorData.error?.message || errorData.error || errorData.detail || `API ошибка: ${response.status}`)
    }

    let prediction
    try {
      const text = await response.text()
      prediction = text ? JSON.parse(text) : null
    } catch (e) {
      console.error('Ошибка парсинга ответа prediction:', e)
      throw new Error('Некорректный ответ от API при создании prediction')
    }
    
    if (!prediction) {
      throw new Error('Пустой ответ от API')
    }
    
    console.log('Prediction создан:', prediction.id)
    
    if (!prediction.id) {
      throw new Error('Некорректный ответ от API: отсутствует ID prediction')
    }
    
    console.log('Ожидаем завершения генерации...')
    const resultUrl = await waitForPrediction(prediction.id)
    console.log('Генерация завершена:', resultUrl)
    
    return resultUrl
}


