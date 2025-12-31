# 🚀 Инструкция по деплою

## Подготовка к деплою

### 1. Установи зависимости
```bash
npm install
```

### 2. Настрой переменные окружения

Создай файл `.env` (на основе `.env.example`):

```bash
cp .env.example .env
```

Отредактируй `.env`:
```env
# Твой ключ от Replicate API
REPLICATE_API_KEY=r8_xxxxxxxxxxxxxxxxxxxxx

# URL твоего хостинга (замени на реальный домен)
VITE_API_BASE_URL=https://yourdomain.com/api

# Модель (можно не менять)
VITE_REPLICATE_MODEL=google/nano-banana

# Окружение
NODE_ENV=production
PORT=3001
```

### 3. Собери фронтенд

```bash
npm run build
```

Это создаст папку `dist/` со статикой.

---

## Деплой на хостинг

### Вариант 1: VPS (DigitalOcean, AWS, Hetzner и т.д.)

#### 1. Подключись к серверу
```bash
ssh user@your-server.com
```

#### 2. Установи Node.js (если нет)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 3. Скопируй файлы на сервер
```bash
# На локальной машине:
scp -r dist server.js package.json .env user@your-server.com:/var/www/photoCardApp/
```

Или используй Git:
```bash
# На сервере:
git clone https://github.com/your-username/photoCardApp.git /var/www/photoCardApp
cd /var/www/photoCardApp
npm install --production
```

#### 4. Настрой PM2 для автозапуска
```bash
# Установи PM2
sudo npm install -g pm2

# Запусти приложение
cd /var/www/photoCardApp
pm2 start server.js --name "photoCardApp"

# Автозапуск при перезагрузке сервера
pm2 startup
pm2 save
```

#### 5. Настрой Nginx (реверс-прокси)
```bash
sudo nano /etc/nginx/sites-available/photoCardApp
```

Добавь:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Активируй конфиг:
```bash
sudo ln -s /etc/nginx/sites-available/photoCardApp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 6. Настрой SSL (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

### Вариант 2: Render.com (простой деплой)

#### 1. Создай аккаунт на [Render.com](https://render.com)

#### 2. Нажми "New +" → "Web Service"

#### 3. Подключи свой GitHub репозиторий

#### 4. Настрой:
- **Build Command**: `npm install && npm run build`
- **Start Command**: `NODE_ENV=production node server.js`
- **Environment Variables**: Добавь `REPLICATE_API_KEY`

#### 5. Deploy

Render автоматически:
- Установит зависимости
- Соберет проект
- Запустит сервер
- Даст тебе URL типа `https://your-app.onrender.com`

---

### Вариант 3: Vercel (только фронтенд) + Railway (бэкенд)

**Фронтенд на Vercel:**
1. Залогинься в [Vercel](https://vercel.com)
2. Import проекта из GitHub
3. Настрой переменные: `VITE_API_BASE_URL=https://your-backend.railway.app/api`
4. Deploy

**Бэкенд на Railway:**
1. Залогинься в [Railway](https://railway.app)
2. New Project → Deploy from GitHub
3. Выбери репозиторий
4. Добавь переменные: `REPLICATE_API_KEY`, `NODE_ENV=production`
5. Railway автоматически запустит `npm start`

---

## После деплоя

### Проверь работу:
```bash
# Проверь статус сервера
curl https://yourdomain.com/api/predictions
```

### Логи (если используешь PM2):
```bash
pm2 logs photoCardApp
pm2 status
```

### Обновление после изменений:
```bash
# На сервере:
cd /var/www/photoCardApp
git pull
npm run build
pm2 restart photoCardApp
```

---

## Важные моменты

1. **API Key безопасность**: 
   - Никогда не коммить `.env` в Git
   - Используй переменные окружения на хостинге

2. **CORS**: 
   - Обнови `VITE_API_BASE_URL` на продакшн домен
   - В `server.js` CORS уже настроен на `*` (можно сузить)

3. **Размер файлов**: 
   - Multer ограничен 10MB (можно увеличить в `server.js`)

4. **Временные файлы**: 
   - Автоматически удаляются через 10 минут
   - Папка `temp-uploads/` должна быть доступна для записи

5. **Rate Limits**: 
   - Replicate API лимитирован (6 запросов/минуту на бесплатном тарифе)
   - Пополни баланс для увеличения лимитов

---

## 🎉 Готово!

Твое приложение теперь доступно по адресу `https://yourdomain.com`

