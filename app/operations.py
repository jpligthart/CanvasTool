from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from app.cache import TTL_COURSES, TTL_GRADES, TTL_ME, TTL_ROSTER, cache
from app.canvas_client import CanvasAPIError, CanvasClient, gather_limited


def _course_is_past(course: dict[str, Any]) -> bool:
    state = (course.get("workflow_state") or "").lower()
    if state in ("completed", "deleted"):
        return True
    end_at = course.get("end_at")
    if end_at:
        try:
            end = datetime.fromisoformat(end_at.replace("Z", "+00:00"))
            return end < datetime.now(timezone.utc)
        except ValueError:
            pass
    return False


def _result(user_id: int, status: str, detail: Any = None) -> dict[str, Any]:
    return {"user_id": user_id, "status": status, "detail": detail}


# ---------- Meta & courses ----------


async def get_me(client: CanvasClient) -> dict[str, Any]:
    async def load() -> dict[str, Any]:
        user = await client.request("GET", "/api/v1/users/self/profile")
        return {
            "id": user.get("id"),
            "name": user.get("name"),
            "email": user.get("primary_email") or user.get("email"),
            "login_id": user.get("login_id"),
        }

    return await cache.get_or_load(("me",), TTL_ME, load)


async def list_teacher_courses(client: CanvasClient, *, fresh: bool = False) -> dict[str, list[dict[str, Any]]]:
    async def load() -> dict[str, list[dict[str, Any]]]:
        raw = await client.get_paginated(
            "/api/v1/courses",
            params={
                "enrollment_type": "teacher",
                "include[]": "term",
                "state[]": ["available", "completed", "created", "claimed"],
            },
        )
        active: list[dict[str, Any]] = []
        past: list[dict[str, Any]] = []
        for c in raw:
            term = c.get("term") if isinstance(c.get("term"), dict) else None
            item = {
                "id": c["id"],
                "name": c.get("name") or f"Cursus {c['id']}",
                "course_code": c.get("course_code"),
                "workflow_state": c.get("workflow_state"),
                "term": term.get("name") if term else None,
                "start_at": c.get("start_at"),
                "end_at": c.get("end_at"),
            }
            (past if _course_is_past(c) else active).append(item)
        key = lambda x: (x.get("course_code") or x["name"]).lower()  # noqa: E731
        active.sort(key=key)
        past.sort(key=key)
        return {"active": active, "past": past}

    return await cache.get_or_load(("courses",), TTL_COURSES, load, fresh=fresh)


# ---------- Sections ----------


async def list_course_sections(client: CanvasClient, course_id: int, *, fresh: bool = False) -> list[dict[str, Any]]:
    async def load() -> list[dict[str, Any]]:
        rows = await client.get_paginated(
            f"/api/v1/courses/{course_id}/sections",
            params={"include[]": "total_students"},
        )
        return [
            {
                "id": r["id"],
                "name": r.get("name"),
                "sis_section_id": r.get("sis_section_id"),
                "total_students": r.get("total_students"),
            }
            for r in rows
        ]

    return await cache.get_or_load(("course", course_id, "sections"), TTL_ROSTER, load, fresh=fresh)


async def create_section(client: CanvasClient, course_id: int, name: str) -> dict[str, Any]:
    created = await client.request(
        "POST",
        f"/api/v1/courses/{course_id}/sections",
        json={"course_section": {"name": name}},
    )
    cache.invalidate_course(course_id, ["sections"])
    return {"id": created["id"], "name": created.get("name")}


async def _active_student_enrollments(client: CanvasClient, course_id: int) -> dict[int, list[dict[str, Any]]]:
    rows = await client.get_paginated(
        f"/api/v1/courses/{course_id}/enrollments",
        params={"type[]": "StudentEnrollment", "state[]": "active"},
    )
    by_user: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        by_user[r["user_id"]].append(r)
    return by_user


async def bulk_place_in_section(
    client: CanvasClient,
    course_id: int,
    user_ids: list[int],
    section_id: int,
) -> list[dict[str, Any]]:
    """Enroll each user in the target section, then conclude their other active student enrollments.

    The new enrollment is created before concluding the old one, so a failed
    POST never leaves a student without a section. Grades are kept by Canvas.
    """
    enrollments = await _active_student_enrollments(client, course_id)

    async def place(user_id: int) -> dict[str, Any]:
        current = enrollments.get(user_id, [])
        already = any(e.get("course_section_id") == section_id for e in current)
        others = [e for e in current if e.get("course_section_id") != section_id]
        if already and not others:
            return _result(user_id, "skipped", "Zit al in deze sectie")
        try:
            if not already:
                await client.request(
                    "POST",
                    f"/api/v1/sections/{section_id}/enrollments",
                    json={
                        "enrollment": {
                            "user_id": user_id,
                            "type": "StudentEnrollment",
                            "enrollment_state": "active",
                        }
                    },
                )
            for e in others:
                await client.request(
                    "DELETE",
                    f"/api/v1/courses/{course_id}/enrollments/{e['id']}",
                    params={"task": "conclude"},
                )
        except CanvasAPIError as exc:
            return _result(user_id, "error", exc.message)
        return _result(user_id, "ok", {"concluded_previous": len(others)})

    try:
        return await gather_limited(user_ids, place)
    finally:
        cache.invalidate_course(course_id, ["users", "sections", "grades"])


async def remove_user_from_section(
    client: CanvasClient, course_id: int, section_id: int, user_id: int
) -> None:
    enrollments = await _active_student_enrollments(client, course_id)
    targets = [e for e in enrollments.get(user_id, []) if e.get("course_section_id") == section_id]
    if not targets:
        raise CanvasAPIError(404, "Geen actieve inschrijving in deze sectie")
    try:
        for e in targets:
            await client.request(
                "DELETE",
                f"/api/v1/courses/{course_id}/enrollments/{e['id']}",
                params={"task": "conclude"},
            )
    finally:
        cache.invalidate_course(course_id, ["users", "sections", "grades"])


# ---------- Groups ----------


def _member(u: dict[str, Any]) -> dict[str, Any]:
    return {"id": u["id"], "name": u.get("name") or u.get("sortable_name"), "email": u.get("email")}


async def list_group_categories(
    client: CanvasClient, course_id: int, *, fresh: bool = False
) -> list[dict[str, Any]]:
    async def load() -> list[dict[str, Any]]:
        categories, groups = await asyncio.gather(
            client.get_paginated(f"/api/v1/courses/{course_id}/group_categories"),
            client.get_paginated(f"/api/v1/courses/{course_id}/groups", params={"include[]": "users"}),
        )
        missing = [g for g in groups if "users" not in g]
        if missing:
            member_lists = await gather_limited(
                missing, lambda g: client.get_paginated(f"/api/v1/groups/{g['id']}/users")
            )
            for g, members in zip(missing, member_lists):
                g["users"] = members

        by_category: dict[int, dict[str, Any]] = {
            c["id"]: {"id": c["id"], "name": c.get("name"), "groups": []} for c in categories
        }
        for g in groups:
            category = by_category.get(g.get("group_category_id"))
            if category is None:
                continue
            members = [_member(u) for u in g.get("users") or []]
            category["groups"].append(
                {
                    "id": g["id"],
                    "name": g.get("name"),
                    "max_membership": g.get("max_membership"),
                    "member_count": len(members),
                    "members": members,
                }
            )
        return list(by_category.values())

    return await cache.get_or_load(("course", course_id, "groups"), TTL_ROSTER, load, fresh=fresh)


async def create_group_category(client: CanvasClient, course_id: int, name: str) -> dict[str, Any]:
    created = await client.request("POST", f"/api/v1/courses/{course_id}/group_categories", json={"name": name})
    cache.invalidate_course(course_id, ["groups"])
    return {"id": created["id"], "name": created.get("name")}


async def create_group(client: CanvasClient, course_id: int, category_id: int, name: str) -> dict[str, Any]:
    created = await client.request("POST", f"/api/v1/group_categories/{category_id}/groups", json={"name": name})
    cache.invalidate_course(course_id, ["groups"])
    return {"id": created["id"], "name": created.get("name")}


async def bulk_add_to_group(
    client: CanvasClient,
    course_id: int,
    user_ids: list[int],
    group_id: int,
    category_id: int,
) -> list[dict[str, Any]]:
    """Add users to a group; a user in another group of the same set is moved out of it."""
    categories = await list_group_categories(client, course_id, fresh=True)
    category = next((c for c in categories if c["id"] == category_id), None)
    if category is None or not any(g["id"] == group_id for g in category["groups"]):
        raise CanvasAPIError(404, "Groep of groepset niet gevonden")

    current_group: dict[int, int] = {}
    for g in category["groups"]:
        for m in g["members"]:
            current_group[m["id"]] = g["id"]

    async def add(user_id: int) -> dict[str, Any]:
        previous = current_group.get(user_id)
        if previous == group_id:
            return _result(user_id, "skipped", "Zit al in deze groep")
        try:
            await client.request("POST", f"/api/v1/groups/{group_id}/memberships", json={"user_id": user_id})
        except CanvasAPIError as exc:
            return _result(user_id, "error", exc.message)
        if previous is not None:
            try:
                await client.request("DELETE", f"/api/v1/groups/{previous}/users/{user_id}")
            except CanvasAPIError as exc:
                if exc.status_code != 404:
                    return _result(user_id, "error", f"Toegevoegd, maar niet uit vorige groep gehaald: {exc.message}")
        return _result(user_id, "ok", {"removed_from_group_ids": [previous] if previous else []})

    try:
        return await gather_limited(user_ids, add)
    finally:
        cache.invalidate_course(course_id, ["groups"])


async def remove_user_from_group(client: CanvasClient, course_id: int, group_id: int, user_id: int) -> None:
    try:
        await client.request("DELETE", f"/api/v1/groups/{group_id}/users/{user_id}")
    finally:
        cache.invalidate_course(course_id, ["groups"])


# ---------- Students ----------


async def _list_course_users(
    client: CanvasClient, course_id: int, *, fresh: bool = False
) -> list[dict[str, Any]]:
    async def load() -> list[dict[str, Any]]:
        users = await client.get_paginated(
            f"/api/v1/courses/{course_id}/users",
            params={"enrollment_type[]": "student", "include[]": ["enrollments", "email"]},
        )
        result: list[dict[str, Any]] = []
        for u in users:
            section_ids: list[int] = []
            grades: dict[str, Any] = {}
            active = False
            for e in u.get("enrollments") or []:
                if e.get("type") != "StudentEnrollment" or e.get("enrollment_state") != "active":
                    continue
                active = True
                sid = e.get("course_section_id")
                if sid:
                    section_ids.append(sid)
                if not grades and isinstance(e.get("grades"), dict):
                    grades = e["grades"]
            result.append(
                {
                    "id": u["id"],
                    "name": u.get("name") or u.get("sortable_name"),
                    "email": u.get("email"),
                    "sis_user_id": u.get("sis_user_id"),
                    "login_id": u.get("login_id"),
                    "section_ids": section_ids,
                    "active_enrollment": active,
                    "current_score": grades.get("current_score"),
                    "final_score": grades.get("final_score"),
                    "current_grade": grades.get("current_grade"),
                    "final_grade": grades.get("final_grade"),
                }
            )
        result.sort(key=lambda s: (s.get("name") or "").lower())
        return result

    return await cache.get_or_load(("course", course_id, "users"), TTL_ROSTER, load, fresh=fresh)


async def list_course_students(client: CanvasClient, course_id: int) -> list[dict[str, Any]]:
    """Students enriched with section and group names; each part is cached on its own,
    so a group change only reloads groups."""
    users, sections, categories = await asyncio.gather(
        _list_course_users(client, course_id),
        list_course_sections(client, course_id),
        list_group_categories(client, course_id),
    )
    section_name = {s["id"]: s["name"] for s in sections}
    groups_by_user: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for cat in categories:
        for g in cat["groups"]:
            for m in g["members"]:
                groups_by_user[m["id"]].append({"id": g["id"], "name": g["name"], "category_id": cat["id"]})

    return [
        {
            "id": u["id"],
            "name": u.get("name"),
            "email": u.get("email"),
            "sis_user_id": u.get("sis_user_id"),
            "login_id": u.get("login_id"),
            "section_ids": u["section_ids"],
            "section_names": [section_name.get(sid, f"Sectie {sid}") for sid in u["section_ids"]],
            "groups": groups_by_user.get(u["id"], []),
        }
        for u in users
    ]


# ---------- Assignments & grades (read-only) ----------


async def list_assignments(client: CanvasClient, course_id: int) -> list[dict[str, Any]]:
    async def load() -> list[dict[str, Any]]:
        rows = await client.get_paginated(f"/api/v1/courses/{course_id}/assignments")
        return [
            {
                "id": r["id"],
                "name": r.get("name"),
                "due_at": r.get("due_at"),
                "points_possible": r.get("points_possible"),
                "published": r.get("published"),
            }
            for r in rows
        ]

    return await cache.get_or_load(("course", course_id, "assignments"), TTL_GRADES, load)


async def list_submissions(client: CanvasClient, course_id: int, assignment_id: int) -> list[dict[str, Any]]:
    async def load() -> list[dict[str, Any]]:
        rows = await client.get_paginated(
            f"/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions",
            params={"include[]": "user"},
        )
        return [
            {
                "user_id": r.get("user_id"),
                "user_name": (r.get("user") or {}).get("name"),
                "score": r.get("score"),
                "grade": r.get("grade"),
                "workflow_state": r.get("workflow_state"),
                "submitted_at": r.get("submitted_at"),
            }
            for r in rows
        ]

    return await cache.get_or_load(("course", course_id, "submissions", assignment_id), TTL_GRADES, load)


async def course_grade_summary(client: CanvasClient, course_id: int) -> list[dict[str, Any]]:
    """One row per active student.

    A teacher token already gets `grades` on each enrollment from the users
    call, so this does not walk `/enrollments` again. The users payload is
    refreshed when it is older than the grade TTL.
    """

    async def load() -> list[dict[str, Any]]:
        users_key = ("course", course_id, "users")
        refresh = not cache.newer_than(users_key, TTL_GRADES)
        users = await _list_course_users(client, course_id, fresh=refresh)
        return [
            {
                "user_id": u["id"],
                "name": u.get("name"),
                "current_score": u.get("current_score"),
                "final_score": u.get("final_score"),
                "current_grade": u.get("current_grade"),
                "final_grade": u.get("final_grade"),
            }
            for u in users
            if u.get("active_enrollment")
        ]

    return await cache.get_or_load(("course", course_id, "grades"), TTL_GRADES, load)
