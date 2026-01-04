// API сервис для работы с Python бекендом
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:8000/api')

/**
 * Загружает изображение в Replicate и возвращает URL
 */
export async function uploadImageToReplicate(photoFile) {
  console.log('📤 Загружаем изображение в Replicate...')
  
  const formData = new FormData()
  formData.append('file', photoFile)
  
  const response = await fetch(`${API_BASE_URL}/upload-image`, {
    method: 'POST',
    body: formData
  })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Ошибка загрузки изображения' }))
    console.error('❌ Ошибка загрузки:', errorData)
    throw new Error(errorData.detail || errorData.error || `Ошибка загрузки: ${response.status}`)
  }
  
  const data = await response.json()
  console.log('✅ Изображение загружено, URL:', data.url)
  return data.url
}

/**
 * Генерирует открытку
 */
export async function generateCard(photoFile, style) {
  try {
    console.log('🎨 Начинаем генерацию открытки...')
    console.log('Стиль:', style.name)
    
    // Загружаем изображение пользователя
    console.log('📤 Загружаем фото пользователя...')
    const userImageUrl = await uploadImageToReplicate(photoFile)
    console.log('✅ Фото пользователя загружено:', userImageUrl)
    
    // Отправляем запрос на генерацию
    // Референс загружается на бекенде автоматически
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
    
    const data = await response.json()
    console.log('✅ Генерация завершена:', data.image_url)
    return data.image_url
    
  } catch (error) {
    console.error('❌ Ошибка генерации:', error)
    
    // Улучшаем сообщения об ошибках
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('Не удалось подключиться к серверу. Убедитесь, что Python бекенд запущен (python backend/main.py)')
    } else if (error.message.includes('402') || error.message.includes('credit')) {
      throw new Error('Недостаточно кредитов на аккаунте Replicate. Пополните баланс.')
    } else if (error.message.includes('429') || error.message.includes('rate limit')) {
      throw new Error('Превышен лимит запросов. Подождите немного и попробуйте снова.')
    } else {
      throw new Error(error.message || 'Произошла ошибка при генерации открытки')
    }
  }
}

