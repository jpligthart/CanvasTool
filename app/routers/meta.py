from fastapi import APIRouter, Depends, HTTPException

from app.cache import cache
from app.canvas_client import CanvasAPIError, CanvasClient
from app.config import get_settings
from app.deps import get_canvas_client
from app import operations

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/me")
async def api_me(client: CanvasClient = Depends(get_canvas_client)):
    settings = get_settings()
    try:
        profile = await operations.get_me(client)
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    host = settings.canvas_base_url.rstrip("/")
    token = settings.canvas_api_token
    masked = f"{token[:4]}…{token[-4:]}" if len(token) > 8 else "****"
    return {
        "connected": True,
        "host": host,
        "token_preview": masked,
        "user": profile,
    }


@router.get("/health")
async def health():
    settings = get_settings()
    return {"ok": True, "canvas_configured": settings.canvas_configured}


@router.post("/cache/clear")
async def clear_cache(course_id: int | None = None):
    if course_id is None:
        cache.invalidate(("courses",))
    else:
        cache.invalidate_course(course_id)
    return {"ok": True}
