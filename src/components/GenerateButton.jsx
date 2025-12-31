import './GenerateButton.css'

function GenerateButton({ onClick, disabled }) {
  return (
    <button
      className={`generate-button ${disabled ? 'disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      ✨ Сделать открытку
    </button>
  )
}

export default GenerateButton

