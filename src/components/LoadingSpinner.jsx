import './LoadingSpinner.css'

function LoadingSpinner() {
  return (
    <div className="loading-container">
      <div className="spinner"></div>
      <p className="loading-text">Генерируем вашу открытку...</p>
      <p className="loading-hint">Это может занять 30-60 секунд</p>
    </div>
  )
}

export default LoadingSpinner

