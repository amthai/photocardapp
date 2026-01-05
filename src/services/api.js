// API сервис для работы с Node/Vercel функциями
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

/**
 * Загружает изображение в Vercel Blob Storage и возвращает публичный URL
 */
export async function uploadImageToReplicate(photoFile) {
  console.log('📤 Загружаем изображение в Vercel Blob...')
  
  const formData = new FormData()
  formData.append('file', photoFile)
  
  // Используем Vercel Blob endpoint
  const uploadUrl = '/api/upload-image'
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Ошибка загрузки изображения' }))
    console.error('❌ Ошибка загрузки:', errorData)
    throw new Error(errorData.detail || errorData.error || `Ошибка загрузки: ${response.status}`)
  }
  
  const data = await response.json()
  console.log('✅ Изображение загружено в Blob, URL:', data.url)
  return data.url
}

/**
 * Генерирует открытку (асинхронно через prediction API)
 */
export async function generateCard(photoFile, style) {
  try {
    console.log('🎨 Начинаем генерацию открытки...')
    console.log('Стиль:', style.name)
    
    // Загружаем изображение пользователя
    console.log('📤 Загружаем фото пользователя...')
    const userImageUrl = await uploadImageToReplicate(photoFile)
    console.log('✅ Фото пользователя загружено:', userImageUrl)
    
    // Запускаем генерацию (получаем prediction_id)
    console.log('🚀 Отправляем запрос на генерацию...')
    const response = await fetch(`${API_BASE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_image_url: userImageUrl,
        style: style.id,
        prompt: style.prompt
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Ошибка генерации' }))
      console.error('❌ Ошибка генерации:', errorData)
      throw new Error(errorData.detail || errorData.error || `Ошибка генерации: ${response.status}`)
    }
    
    const { prediction_id, status } = await response.json()
    console.log('✅ Генерация запущена, prediction_id:', prediction_id, 'Status:', status)
    
    // Периодически проверяем статус
    const maxAttempts = 120; // 10 минут максимум (120 * 5 сек)
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Ждём 5 секунд
      
      const statusResponse = await fetch(`${API_BASE_URL}/prediction-status?prediction_id=${prediction_id}`)
      
      if (!statusResponse.ok) {
        throw new Error(`Ошибка проверки статуса: ${statusResponse.status}`)
      }
      
      const statusData = await statusResponse.json()
      
      if (statusData.status === 'succeeded') {
        console.log('✅ Генерация завершена:', statusData.image_url)
        return statusData.image_url
      }
      
      if (statusData.status === 'failed') {
        throw new Error(statusData.error || 'Генерация не удалась')
      }
      
      if (statusData.status === 'canceled') {
        throw new Error('Генерация была отменена')
      }
      
      console.log(`⏳ Попытка ${i + 1}/${maxAttempts}, статус: ${statusData.status}`)
    }
    
    throw new Error('Превышено время ожидания генерации (10 минут)')
    
  } catch (error) {
    console.error('❌ Ошибка генерации:', error)
    
    // Улучшаем сообщения об ошибках
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('Не удалось подключиться к серверу. Попробуйте позже.')
    } else if (error.message.includes('402') || error.message.includes('credit')) {
      throw new Error('Недостаточно кредитов на аккаунте Replicate. Пополните баланс.')
    } else if (error.message.includes('429') || error.message.includes('rate limit')) {
      throw new Error('Превышен лимит запросов. Подождите немного и попробуйте снова.')
    } else {
      throw new Error(error.message || 'Произошла ошибка при генерации открытки')
    }
  }
}

