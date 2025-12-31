import { useRef, useState, useEffect } from 'react'
import './PhotoUploader.css'

function PhotoUploader({ onPhotoSelect, selectedPhoto }) {
  const fileInputRef = useRef(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (selectedPhoto) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result)
      }
      reader.readAsDataURL(selectedPhoto)
    } else {
      setPreview(null)
    }
  }, [selectedPhoto])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type.startsWith('image/')) {
        onPhotoSelect(file)
      } else {
        alert('Пожалуйста, выберите изображение')
      }
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="photo-uploader">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      
      {preview ? (
        <div className="photo-preview">
          <img src={preview} alt="Preview" />
          <button 
            className="change-photo-btn"
            onClick={handleClick}
          >
            Изменить фото
          </button>
        </div>
      ) : (
        <div className="upload-area" onClick={handleClick}>
          <div className="upload-icon">📷</div>
          <p className="upload-text">Нажмите, чтобы загрузить фото</p>
          <p className="upload-hint">или выберите из галереи</p>
        </div>
      )}
    </div>
  )
}

export default PhotoUploader

