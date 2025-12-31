// Конфигурация API
// В production используем относительный путь (API на том же домене)
// В development используем localhost:3001
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:3001/api')

// Выбор модели для генерации через Replicate
// nano-banana поддерживает image-to-image
const REPLICATE_MODEL = import.meta.env.VITE_REPLICATE_MODEL || 'google/nano-banana'

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
  
  const data = await response.json()
  console.log('✅ Изображение загружено в Replicate Files API')
  console.log('  Ответ:', data)
  console.log('  URL изображения:', data.url || data.urls?.get)
  
  // Replicate Files API возвращает объект с полем url или urls.get
  const imageUrl = data.url || data.urls?.get
  
  if (!imageUrl) {
    console.error('❌ URL изображения не получен. Полный ответ:', JSON.stringify(data, null, 2))
    throw new Error('URL изображения не получен от Replicate. Проверьте логи сервера.')
  }
  
  return imageUrl
}

async function waitForPrediction(predictionId) {
  const maxAttempts = 60
  let attempts = 0
  
  while (attempts < maxAttempts) {
    const response = await fetch(`${API_BASE_URL}/predictions/${predictionId}`)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Ошибка проверки статуса' }))
      throw new Error(`Ошибка проверки статуса генерации: ${response.status} - ${errorData.error || 'Неизвестная ошибка'}`)
    }
    
    const data = await response.json()
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
    // Формируем промпт с учетом стиля
    // Для image-to-image промпт должен описывать только изменения фона/стиля
    // Модель автоматически использует человека из исходного изображения
    const fullPrompt = style.prompt
    
    console.log('📝 ПРОМПТ ДЛЯ ГЕНЕРАЦИИ:')
    console.log('  Стиль:', style.name)
    console.log('  Промпт:', fullPrompt)
    console.log('  Длина промпта:', fullPrompt.length, 'символов')

    console.log('Начинаем генерацию...')
    console.log('Загруженное изображение:', photoFile.name, 'размер:', photoFile.size, 'тип:', photoFile.type)
    
    // Пробуем загрузить изображение в Replicate Files API
    // Если не получится (Missing content), используем Data URI как fallback
    let imageInput
    try {
      imageInput = await uploadImageToReplicate(photoFile)
      console.log('✅ Изображение загружено в Replicate Files API, URL:', imageInput)
    } catch (uploadError) {
      console.warn('⚠️ Загрузка в Replicate Files API не работает:', uploadError.message)
      console.warn('⚠️ Используем Data URI как fallback')
      
      // Fallback: конвертируем в Data URI
      const reader = new FileReader()
      imageInput = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(photoFile)
      })
      console.log('✅ Изображение конвертировано в Data URI, длина:', imageInput.length)
    }
    
    // Используем Replicate с выбранной моделью (по умолчанию Nano Banana)
    return await generateWithReplicate(imageInput, fullPrompt, style)
    
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

async function generateWithReplicate(imageInput, fullPrompt, style) {
    // Используем модель из переменной окружения (по умолчанию Nano Banana)
    let modelVersion = REPLICATE_MODEL
    
    console.log('Используем Replicate с моделью:', modelVersion)
    console.log('Промпт:', fullPrompt.substring(0, 100) + '...')
    console.log('Изображение (тип):', imageInput.startsWith('http') ? 'URL' : 'Data URI')
    console.log('Изображение (первые 80 символов):', imageInput.substring(0, 80))
    
    // Формируем запрос в зависимости от модели
    let requestBody
    
    // Формируем запрос в зависимости от модели
    if (modelVersion.includes('flux')) {
      // Flux Pro точно поддерживает image-to-image
      requestBody = {
        version: modelVersion,
        input: {
          prompt: fullPrompt,
          image: imageInput, // URL или Data URI изображения
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
      // Nano Banana поддерживает image-to-image через параметр image
      requestBody = {
        version: modelVersion,
        input: {
          prompt: fullPrompt,
          image: imageInput, // URL или Data URI изображения
          num_outputs: 1,
          aspect_ratio: '1:1',
          strength: 0.95 // Высокое значение для максимального сохранения исходного изображения
        }
      }
      console.log('✅ Используем nano-banana с параметром image')
      
      console.log('🔍 ДЕТАЛЬНАЯ ПРОВЕРКА ЗАПРОСА:')
      console.log('  - Промпт присутствует:', !!fullPrompt, 'Длина:', fullPrompt.length)
      console.log('  - Промпт (первые 200 символов):', fullPrompt.substring(0, 200))
      console.log('  - Изображение присутствует:', !!imageInput)
      console.log('  - Тип изображения:', imageInput.startsWith('http') ? 'URL' : imageInput.startsWith('data:') ? 'Data URI' : 'Неизвестно')
      console.log('  - Длина изображения:', imageInput.length, 'символов')
      console.log('  - Все параметры input:', Object.keys(requestBody.input))
      console.log('  - Значение strength:', requestBody.input.strength)
    } else {
      // Для других моделей
      requestBody = {
        version: modelVersion,
        input: {
          prompt: fullPrompt,
          image: imageInput,
          num_outputs: 1,
          strength: 0.95,
          seed: null
        }
      }
    }
    
    console.log('Отправляем запрос через прокси...')
    console.log('Модель:', modelVersion)
    console.log('Параметры запроса:', {
      ...requestBody.input,
      image: imageInput.startsWith('http') ? '[URL изображения]' : '[Data URI, длина: ' + imageInput.length + ']'
    })
    console.log('Параметры генерации:', {
      strength: requestBody.input.strength,
      aspect_ratio: requestBody.input.aspect_ratio,
      model: modelVersion
    })
    
    const response = await fetch(`${API_BASE_URL}/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Ошибка API' }))
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

    const prediction = await response.json()
    console.log('Prediction создан:', prediction.id)
    
    if (!prediction.id) {
      throw new Error('Некорректный ответ от API: отсутствует ID prediction')
    }
    
    console.log('Ожидаем завершения генерации...')
    const resultUrl = await waitForPrediction(prediction.id)
    console.log('Генерация завершена:', resultUrl)
    
    return resultUrl
}


