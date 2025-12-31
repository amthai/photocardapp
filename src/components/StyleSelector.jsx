import './StyleSelector.css'

function StyleSelector({ styles, selectedStyle, onStyleSelect }) {
  return (
    <div className="style-selector">
      <h3 className="style-title">Выберите стиль открытки</h3>
      <div className="styles-grid">
        {styles.map((style) => (
          <button
            key={style.id}
            className={`style-card ${selectedStyle.id === style.id ? 'selected' : ''}`}
            onClick={() => onStyleSelect(style)}
          >
            <div className="style-emoji">{style.emoji}</div>
            <div className="style-name">{style.name}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default StyleSelector

