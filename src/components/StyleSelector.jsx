import { useState, useMemo } from 'react'
import './StyleSelector.css'

const CATEGORIES = [
  { id: 'all', name: 'Все' },
  { id: 'новогодние', name: 'Новогодние' },
  { id: 'женские', name: 'Женские' },
  { id: 'мужские', name: 'Мужские' },
  { id: 'аниме', name: 'Аниме' }
]

function StyleSelector({ styles, selectedStyle, onStyleSelect }) {
  const [selectedCategory, setSelectedCategory] = useState('all')

  const filteredStyles = useMemo(() => {
    if (selectedCategory === 'all') {
      return styles
    }
    return styles.filter(style => style.category === selectedCategory)
  }, [styles, selectedCategory])

  return (
    <div className="style-selector">
      <div className="category-chips">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            className={`category-chip ${selectedCategory === category.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>
      <div className="styles-grid">
        {filteredStyles.map((style) => (
          <button
            key={style.id}
            className={`style-card ${selectedStyle.id === style.id ? 'selected' : ''}`}
            onClick={() => onStyleSelect(style)}
          >
            <div className="style-name">{style.name}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default StyleSelector

