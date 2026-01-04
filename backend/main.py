from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import replicate
from pathlib import Path
import tempfile
import shutil
from typing import Optional
import uvicorn
import httpx

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Конфигурация
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_KEY")
if not REPLICATE_API_TOKEN:
    raise ValueError("REPLICATE_API_KEY не установлен в переменных окружения")

# Инициализация Replicate
replicate_client = replicate.Client(api_token=REPLICATE_API_TOKEN)

# Путь к референс изображениям
REFERENCE_IMAGES_DIR = Path(__file__).parent.parent / "public" / "img"

# Модель для генерации (можно изменить через env)
REPLICATE_MODEL = os.getenv("REPLICATE_MODEL", "black-forest-labs/flux-1.1-pro")


@app.get("/")
def root():
    return {"message": "Photo Card App API"}


@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Загружает изображение в Replicate Files API и возвращает URL"""
    try:
        # Сохраняем файл во временную директорию
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = tmp_file.name
        
        try:
            # Читаем файл в байты
            with open(tmp_path, "rb") as f:
                file_bytes = f.read()
            
            # Загружаем в Replicate через HTTP API
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.replicate.com/v1/files",
                    headers={"Authorization": f"Token {REPLICATE_API_TOKEN}"},
                    files={"file": (file.filename or "image.jpg", file_bytes, file.content_type or "image/jpeg")}
                )
                response.raise_for_status()
                data = response.json()
                
                # Replicate возвращает объект с полем url или urls.get
                image_url = data.get("url") or (data.get("urls", {}).get("get") if isinstance(data.get("urls"), dict) else None)
                
                if not image_url:
                    raise HTTPException(status_code=500, detail="Replicate не вернул URL файла")
                
                return {"url": image_url, "id": data.get("id", "")}
        finally:
            # Удаляем временный файл
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки изображения: {str(e)}")


@app.post("/api/generate")
async def generate_card(
    user_image_url: str,
    style: str = "newyear",
    prompt: Optional[str] = None
):
    """Генерирует открытку используя Replicate"""
    try:
        # Загружаем референс изображение
        reference_path = REFERENCE_IMAGES_DIR / f"{style}.jpeg"
        if not reference_path.exists():
            raise HTTPException(status_code=404, detail=f"Референс изображение не найдено: {reference_path}")
        
        # Загружаем референс в Replicate
        with open(reference_path, "rb") as f:
            ref_bytes = f.read()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.replicate.com/v1/files",
                headers={"Authorization": f"Token {REPLICATE_API_TOKEN}"},
                files={"file": (f"{style}.jpeg", ref_bytes, "image/jpeg")}
            )
            response.raise_for_status()
            ref_data = response.json()
            reference_url = ref_data.get("url") or (ref_data.get("urls", {}).get("get") if isinstance(ref_data.get("urls"), dict) else None)
        
        if not reference_url:
            raise HTTPException(status_code=500, detail="Не удалось загрузить референс в Replicate")
        
        # Формируем промпт
        if not prompt:
            prompt = "Festive winter background with snowflakes, Christmas decorations, warm lighting. New Year greeting card style. Photorealistic, high quality."
        
        full_prompt = f"Keep the person's face and appearance from the input image exactly as they are. {prompt} The person from the original photo should remain unchanged, only the background and style should change. Use the reference image as a style guide for the background and overall composition."
        
        # Создаем prediction через Replicate SDK
        print(f"🚀 Генерируем с моделью: {REPLICATE_MODEL}")
        print(f"📝 Промпт: {full_prompt[:100]}...")
        print(f"🖼️ Изображение пользователя: {user_image_url[:80]}...")
        print(f"🎨 Референс: {reference_url[:80]}...")
        
        output = replicate_client.run(
            REPLICATE_MODEL,
            input={
                "prompt": full_prompt,
                "image": user_image_url,
                "reference_image": reference_url,
                "num_outputs": 1,
                "aspect_ratio": "1:1",
                "strength": 0.72,
                "guidance_scale": 8.0,
                "output_format": "png",
                "output_quality": 90
            }
        )
        
        # Replicate возвращает список или строку
        if isinstance(output, list):
            result_url = output[0]
        elif hasattr(output, '__iter__') and not isinstance(output, str):
            result_url = list(output)[0]
        else:
            result_url = output
        
        print(f"✅ Генерация завершена: {result_url}")
        return {"image_url": result_url}
        
    except Exception as e:
        print(f"❌ Ошибка генерации: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка генерации: {str(e)}")


@app.get("/api/predictions/{prediction_id}")
async def get_prediction(prediction_id: str):
    """Получает статус prediction"""
    try:
        prediction = replicate_client.predictions.get(prediction_id)
        return {
            "id": prediction.id,
            "status": prediction.status,
            "output": prediction.output
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения prediction: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
