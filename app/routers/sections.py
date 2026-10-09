from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.canvas_client import CanvasAPIError, CanvasClient
from app.deps import get_canvas_client
from app import operations

router = APIRouter(prefix="/api/courses/{course_id}/sections", tags=["sections"])


class CreateSectionBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class PlaceStudentBody(BaseModel):
    user_id: int
    section_id: int


class BulkPlaceBody(BaseModel):
    user_ids: list[int] = Field(min_length=1)
    section_id: int


@router.get("")
async def list_sections(course_id: int, client: CanvasClient = Depends(get_canvas_client)):
    try:
        return await operations.list_course_sections(client, course_id)
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e


@router.post("")
async def create_section(
    course_id: int,
    body: CreateSectionBody,
    client: CanvasClient = Depends(get_canvas_client),
):
    try:
        return await operations.create_section(client, course_id, body.name.strip())
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e


@router.post("/place")
async def place_student(
    course_id: int,
    body: PlaceStudentBody,
    client: CanvasClient = Depends(get_canvas_client),
):
    try:
        results = await operations.bulk_place_in_section(client, course_id, [body.user_id], body.section_id)
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    result = results[0]
    if result["status"] == "error":
        raise HTTPException(status_code=502, detail=result["detail"])
    return result


@router.post("/bulk-place")
async def bulk_place(
    course_id: int,
    body: BulkPlaceBody,
    client: CanvasClient = Depends(get_canvas_client),
):
    try:
        results = await operations.bulk_place_in_section(client, course_id, body.user_ids, body.section_id)
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    return {"results": results}
