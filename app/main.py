from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.canvas_client import close_http
from app.routers import courses, grades, groups, meta, sections


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await close_http()


app = FastAPI(title="Cursusbeheer", version="0.1.0", lifespan=lifespan)

app.include_router(meta.router)
app.include_router(courses.router)
app.include_router(sections.router)
app.include_router(groups.router)
app.include_router(grades.router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@app.get("/api")
def api_root():
    return {"name": "cursusbeheer", "api": "/api/me"}


if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        if full_path.startswith("api"):
            return {"detail": "Not Found"}
        index = STATIC_DIR / "index.html"
        if index.is_file():
            return FileResponse(index)
        return {"detail": "Frontend not built"}
