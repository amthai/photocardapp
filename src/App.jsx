import { useState, useEffect } from 'react'
import { initTelegramWebApp } from './utils/telegram'
import PhotoUploader from './components/PhotoUploader'
import StyleSelector from './components/StyleSelector'
import GenerateButton from './components/GenerateButton'
import LoadingSpinner from './components/LoadingSpinner'
import ResultCard from './components/ResultCard'
import { generateCard } from './services/openrouter'
import './App.css'

const CARD_STYLES = [
  {
    id: 'newyear',
    name: 'Новогодняя',
    emoji: '🎄',
    prompt: 'Festive winter background with snowflakes, Christmas decorations, warm lighting. New Year greeting card style. Photorealistic, high quality.',
    reference: 'winter holiday card with people'
  },
  {
    id: 'travel',
    name: 'Путешествие',
    emoji: '✈️',
    prompt: 'Exotic travel background with locations, suitcases, maps, famous landmarks. Travel adventure greeting card style. Photorealistic, high quality.',
    reference: 'travel adventure card with people'
  },
  {
    id: 'romantic',
    name: 'Романтическая',
    emoji: '💕',
    prompt: 'Romantic background with hearts, flowers, soft lighting, warm colors. Romantic greeting card style. Photorealistic, high quality.',
    reference: 'romantic card with couple'
  },
  {
    id: 'birthday',
    name: 'День рождения',
    emoji: '🎂',
    prompt: 'Festive background with balloons, confetti, cake, party decorations. Birthday greeting card style. Photorealistic, high quality.',
    reference: 'birthday party card with people'
  },
  {
    id: 'nature',
    name: 'Природа',
    emoji: '🌲',
    prompt: 'Natural background with landscapes, trees, flowers, mountains, peaceful natural scenes. Nature greeting card style. Photorealistic, high quality.',
    reference: 'nature landscape card with people'
  }
]

function App() {
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [selectedStyle, setSelectedStyle] = useState(CARD_STYLES[0])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedCard, setGeneratedCard] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    initTelegramWebApp()
  }, [])

  const handlePhotoSelect = (file) => {
    setSelectedPhoto(file)
    setGeneratedCard(null)
    setError(null)
  }

  const handleStyleSelect = (style) => {
    setSelectedStyle(style)
    setGeneratedCard(null)
    setError(null)
  }

  const handleGenerate = async () => {
    if (!selectedPhoto) {
      setError('Пожалуйста, загрузите фотографию')
      return
    }

    setIsGenerating(true)
    setError(null)
    setGeneratedCard(null)

    try {
      const result = await generateCard(selectedPhoto, selectedStyle)
      setGeneratedCard(result)
    } catch (err) {
      setError(err.message || 'Произошла ошибка при генерации открытки')
      console.error('Generation error:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="app">
      <div className="container">
        <h1 className="title">🎴 Фото-Открытки</h1>
        <p className="subtitle">Создайте уникальную открытку с вашей фотографией</p>

        <PhotoUploader 
          onPhotoSelect={handlePhotoSelect}
          selectedPhoto={selectedPhoto}
        />

        <StyleSelector
          styles={CARD_STYLES}
          selectedStyle={selectedStyle}
          onStyleSelect={handleStyleSelect}
        />

        <GenerateButton
          onClick={handleGenerate}
          disabled={!selectedPhoto || isGenerating}
        />

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {isGenerating && <LoadingSpinner />}

        {generatedCard && (
          <ResultCard
            imageUrl={generatedCard}
            onDownload={async () => {
              try {
                console.log('Начинаем скачивание изображения:', generatedCard)
                // Загружаем изображение для скачивания в высоком качестве
                const response = await fetch(generatedCard, {
                  mode: 'cors',
                  credentials: 'omit'
                })
                
                if (!response.ok) {
                  throw new Error(`Ошибка загрузки: ${response.status} ${response.statusText}`)
                }
                
                const blob = await response.blob()
                console.log('Blob создан, размер:', blob.size, 'тип:', blob.type)
                
                if (blob.size === 0) {
                  throw new Error('Получен пустой файл')
                }
                
                const url = window.URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = `photo-card-${Date.now()}.png`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                window.URL.revokeObjectURL(url)
              } catch (error) {
                console.error('Ошибка скачивания:', error)
                alert(`Ошибка скачивания: ${error.message}. Попробуйте открыть изображение в новой вкладке.`)
                // Fallback: просто открываем в новой вкладке
                window.open(generatedCard, '_blank')
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

export default App

