from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.canvas_client import CanvasAPIError, CanvasClient
from app.deps import get_canvas_client
from app import operations

router = APIRouter(prefix="/api/courses/{course_id}/groups", tags=["groups"])


class CreateCategoryBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class CreateGroupBody(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=200)


class GroupMemberBody(BaseModel):
    user_id: int
    group_id: int
    category_id: int


class BulkGroupBody(BaseModel):
    user_ids: list[int] = Field(min_length=1)
    group_id: int
    category_id: int


@router.get("")
async def list_groups(course_id: int, client: CanvasClient = Depends(get_canvas_client)):
    try:
        return await operations.list_group_categories(client, course_id)
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e


@router.post("/categories")
async def create_category(
    course_id: int,
    body: CreateCategoryBody,
    client: CanvasClient = Depends(get_canvas_client),
):
    try:
        return await operations.create_group_category(client, course_id, body.name.strip())
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e


@router.post("")
async def create_group(
    course_id: int,
    body: CreateGroupBody,
    client: CanvasClient = Depends(get_canvas_client),
):
    try:
        return await operations.create_group(client, course_id, body.category_id, body.name.strip())
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e


@router.post("/members")
async def add_member(
    course_id: int,
    body: GroupMemberBody,
    client: CanvasClient = Depends(get_canvas_client),
):
    try:
        results = await operations.bulk_add_to_group(
            client, course_id, [body.user_id], body.group_id, body.category_id
        )
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    result = results[0]
    if result["status"] == "error":
        raise HTTPException(status_code=502, detail=result["detail"])
    return result


@router.delete("/members")
async def remove_member(
    course_id: int,
    body: GroupMemberBody,
    client: CanvasClient = Depends(get_canvas_client),
):
    try:
        await operations.remove_user_from_group(client, course_id, body.group_id, body.user_id)
        return {"ok": True}
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e


@router.post("/bulk-members")
async def bulk_add_members(
    course_id: int,
    body: BulkGroupBody,
    client: CanvasClient = Depends(get_canvas_client),
):
    try:
        results = await operations.bulk_add_to_group(
            client, course_id, body.user_ids, body.group_id, body.category_id
        )
    except CanvasAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    return {"results": results}
