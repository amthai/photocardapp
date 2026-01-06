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
          <div className="upload-icon">
            <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="32.7559" y="14.5" width="35" height="50" rx="7.5" stroke="#8F8E96"/>
              <path d="M62.5115 68.3586L34.7641 72.1119C30.3857 72.7041 26.3562 69.6349 25.764 65.2565L21.0724 30.5723C20.4801 26.1939 23.5494 22.1644 27.9278 21.5722L28.3048 21.5212" stroke="#8F8E96" strokeLinecap="round" strokeDasharray="3 3"/>
              <path d="M50.2559 45.5C51.5059 45.5 52.5685 45.0627 53.4439 44.188C54.3192 43.3133 54.7565 42.2507 54.7559 41C54.7552 39.7493 54.3179 38.687 53.4439 37.813C52.5699 36.939 51.5072 36.5013 50.2559 36.5C49.0045 36.4987 47.9422 36.9363 47.0689 37.813C46.1955 38.6897 45.7579 39.752 45.7559 41C45.7539 42.248 46.1915 43.3107 47.0689 44.188C47.9462 45.0653 49.0085 45.5027 50.2559 45.5ZM50.2559 43.5C49.5559 43.5 48.9642 43.2583 48.4809 42.775C47.9975 42.2917 47.7559 41.7 47.7559 41C47.7559 40.3 47.9975 39.7083 48.4809 39.225C48.9642 38.7417 49.5559 38.5 50.2559 38.5C50.9559 38.5 51.5475 38.7417 52.0309 39.225C52.5142 39.7083 52.7559 40.3 52.7559 41C52.7559 41.7 52.5142 42.2917 52.0309 42.775C51.5475 43.2583 50.9559 43.5 50.2559 43.5ZM42.2559 49C41.7059 49 41.2352 48.8043 40.8439 48.413C40.4525 48.0217 40.2565 47.5507 40.2559 47V35C40.2559 34.45 40.4519 33.9793 40.8439 33.588C41.2359 33.1967 41.7065 33.0007 42.2559 33H45.4059L46.6559 31.65C46.8392 31.45 47.0602 31.2917 47.3189 31.175C47.5775 31.0583 47.8482 31 48.1309 31H52.3809C52.6642 31 52.9352 31.0583 53.1939 31.175C53.4525 31.2917 53.6732 31.45 53.8559 31.65L55.1059 33H58.2559C58.8059 33 59.2769 33.196 59.6689 33.588C60.0609 33.98 60.2565 34.4507 60.2559 35V47C60.2559 47.55 60.0602 48.021 59.6689 48.413C59.2775 48.805 58.8065 49.0007 58.2559 49H42.2559Z" fill="#8F8E96"/>
            </svg>
          </div>
          <p className="upload-text">Загрузите вашу фотографию</p>
          <p className="upload-hint">На фотографии должно быть явно видно лицо человека и должно быть хорошее освещение</p>
        </div>
      )}
    </div>
  )
}

export default PhotoUploader

