# Photo Card App

Приложение для генерации открыток из фотографий пользователя с использованием Replicate AI.

## Технологии

- **Фронтенд**: React + Vite
- **Бекенд**: Python + FastAPI
- **AI**: Replicate (Flux Pro)

## Установка

### 1. Установка зависимостей фронтенда

```bash
npm install
```

### 2. Установка зависимостей бекенда

```bash
pip install -r requirements.txt
```

### 3. Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
REPLICATE_API_KEY=your_replicate_api_key_here
REPLICATE_MODEL=black-forest-labs/flux-1.1-pro
```

Получить API ключ можно на [replicate.com](https://replicate.com)

## Запуск

### Разработка

1. Запустите Python бекенд (в одном терминале):
```bash
npm run dev:backend
# или
python backend/main.py
```

Бекенд будет доступен на `http://localhost:8000`

2. Запустите React фронтенд (в другом терминале):
```bash
npm run dev
```

Фронтенд будет доступен на `http://localhost:3000`

### Production

1. Соберите фронтенд:
```bash
npm run build
```

2. Запустите бекенд:
```bash
python backend/main.py
```

## Как это работает

1. Пользователь загружает свою фотографию
2. Выбирает стиль открытки (пока только новогодний)
3. Приложение:
   - Загружает фото пользователя в Replicate Files API
   - Загружает референс изображение из `public/img/` в Replicate
   - Отправляет запрос на генерацию в Replicate с промптом
4. Модель генерирует изображение img-to-img используя:
   - Фото пользователя
   - Референс изображение
   - Промпт со стилем

## Структура проекта

```
photoCardApp/
├── backend/
│   └── main.py          # Python FastAPI бекенд
├── src/
│   ├── components/      # React компоненты
│   ├── services/
│   │   └── api.js       # API клиент для работы с бекендом
│   └── App.jsx          # Главный компонент
├── public/
│   └── img/             # Референс изображения для стилей
├── requirements.txt     # Python зависимости
└── package.json         # Node.js зависимости
```

## API Endpoints

- `POST /api/upload-image` - Загрузка изображения в Replicate
- `POST /api/generate` - Генерация открытки
- `GET /api/predictions/{id}` - Получение статуса генерации
