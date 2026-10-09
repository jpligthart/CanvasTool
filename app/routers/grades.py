from fastapi import APIRouter, Depends, HTTPException

from app.canvas_client import CanvasAPIError, CanvasClient
from app.deps import get_canvas_client
from app import operations

router = APIRouter(prefix="/api/courses/{course_id}", tags=["grades"])


@router.get("/assignments")
async def assignments(course_id: int, client: CanvasClient = Depends(get_canvas_client)):
    try:
        return await operations.list_assignments(client, course_id)
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e.message)) from e


@router.get("/assignments/{assignment_id}/submissions")
async def submissions(
    course_id: int,
    assignment_id: int,
    client: CanvasClient = Depends(get_canvas_client),
):
    try:
        return await operations.list_submissions(client, course_id, assignment_id)
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e.message)) from e


@router.get("/grade-summary")
async def grade_summary(course_id: int, client: CanvasClient = Depends(get_canvas_client)):
    try:
        return await operations.course_grade_summary(client, course_id)
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e.message)) from e
