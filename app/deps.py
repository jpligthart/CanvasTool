from fastapi import HTTPException

from app.canvas_client import CanvasClient
from app.config import get_settings


def get_canvas_client() -> CanvasClient:
    settings = get_settings()
    if not settings.canvas_configured:
        raise HTTPException(
            status_code=503,
            detail="Canvas is niet geconfigureerd. Vul CANVAS_BASE_URL en CANVAS_API_TOKEN in .env in.",
        )
    return CanvasClient(settings)
