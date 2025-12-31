import { useState } from 'react'
import './ResultCard.css'

function ResultCard({ imageUrl, onDownload }) {
  const [imageError, setImageError] = useState(false)
  
  const handleImageError = () => {
    console.error('Ошибка загрузки изображения:', imageUrl)
    setImageError(true)
  }
  
  return (
    <div className="result-card">
      <div className="result-header">
        <h3 className="result-title">✨ Ваша открытка готова!</h3>
      </div>
      <div className="result-image-container">
        {imageError ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'white' }}>
            <p>Ошибка загрузки изображения</p>
            <p style={{ fontSize: '12px', marginTop: '10px', opacity: 0.7 }}>
              URL: {imageUrl?.substring(0, 100)}...
            </p>
          </div>
        ) : (
          <img 
            src={imageUrl} 
            alt="Generated card" 
            className="result-image"
            onError={handleImageError}
            crossOrigin="anonymous"
          />
        )}
      </div>
      <button className="download-button" onClick={onDownload}>
        💾 Скачать в высоком качестве
      </button>
    </div>
  )
}

export default ResultCard

