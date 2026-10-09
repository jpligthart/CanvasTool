from fastapi import APIRouter, Depends, HTTPException, Query

from app.canvas_client import CanvasAPIError, CanvasClient
from app.deps import get_canvas_client
from app import operations

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("")
async def list_courses(client: CanvasClient = Depends(get_canvas_client)):
    try:
        return await operations.list_teacher_courses(client)
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e.message)) from e


@router.get("/{course_id}/students")
async def course_students(
    course_id: int,
    q: str | None = Query(None, description="Zoek op naam, e-mail, SIS, sectie of groep"),
    client: CanvasClient = Depends(get_canvas_client),
):
    try:
        students = await operations.list_course_students(client, course_id)
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e.message)) from e
    if not q or not q.strip():
        return students
    needle = q.strip().lower()
    filtered = []
    for s in students:
        hay = " ".join(
            [
                s.get("name") or "",
                s.get("email") or "",
                s.get("sis_user_id") or "",
                s.get("login_id") or "",
                " ".join(s.get("section_names") or []),
                " ".join(g["name"] for g in s.get("groups") or []),
            ]
        ).lower()
        if needle in hay:
            filtered.append(s)
    return filtered
