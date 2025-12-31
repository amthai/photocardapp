export function initTelegramWebApp() {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp
    tg.ready()
    tg.expand()
    
    // Настраиваем цветовую схему
    tg.setHeaderColor('#667eea')
    tg.setBackgroundColor('#667eea')
    
    return tg
  }
  return null
}

