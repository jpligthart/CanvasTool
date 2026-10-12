from typing import Any

import pytest

from app import operations
from app.cache import cache
from app.canvas_client import CanvasAPIError


class FakeCanvas:
    def __init__(self, pages: dict[str, list[Any]], fail: set[tuple[str, str]] | None = None) -> None:
        self.pages = pages
        self.fail = fail or set()
        self.calls: list[tuple[str, str]] = []

    async def get_paginated(self, path: str, *, params: dict[str, Any] | None = None, per_page: int = 100):
        self.calls.append(("GET", path))
        return [dict(x) for x in self.pages.get(path, [])]

    async def request(self, method: str, path: str, *, params=None, json=None):
        self.calls.append((method, path))
        if (method, path) in self.fail:
            raise CanvasAPIError(400, "Canvas zegt nee")
        return {}

    def writes(self) -> list[tuple[str, str]]:
        return [c for c in self.calls if c[0] != "GET"]


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def _groups_fixture() -> dict[str, list[Any]]:
    return {
        "/api/v1/courses/1/group_categories": [{"id": 10, "name": "Projecten"}],
        "/api/v1/courses/1/groups": [
            {"id": 100, "name": "Team 1", "group_category_id": 10, "users": [{"id": 1, "name": "Anna"}]},
            {"id": 101, "name": "Team 2", "group_category_id": 10, "users": [{"id": 2, "name": "Bram"}]},
            {"id": 102, "name": "Team 3", "group_category_id": 10, "users": []},
        ],
    }


async def test_group_listing_uses_two_calls_when_users_included():
    fake = FakeCanvas(_groups_fixture())
    cats = await operations.list_group_categories(fake, 1)
    assert len(fake.calls) == 2
    assert [g["member_count"] for g in cats[0]["groups"]] == [1, 1, 0]


async def test_group_listing_falls_back_to_per_group_members():
    pages = _groups_fixture()
    for g in pages["/api/v1/courses/1/groups"]:
        g.pop("users")
    pages["/api/v1/groups/100/users"] = [{"id": 1, "name": "Anna"}]
    fake = FakeCanvas(pages)
    cats = await operations.list_group_categories(fake, 1)
    assert cats[0]["groups"][0]["members"][0]["name"] == "Anna"
    assert len(fake.calls) == 2 + 3


async def test_bulk_group_reads_once_and_moves_users():
    fake = FakeCanvas(_groups_fixture())
    results = await operations.bulk_add_to_group(fake, 1, [1, 2, 3], group_id=101, category_id=10)
    by_user = {r["user_id"]: r for r in results}

    assert by_user[1]["status"] == "ok"
    assert by_user[2]["status"] == "skipped"
    assert by_user[3]["status"] == "ok"
    assert sum(1 for c in fake.calls if c[0] == "GET") == 2
    assert ("DELETE", "/api/v1/groups/100/users/1") in fake.writes()
    assert fake.writes().count(("POST", "/api/v1/groups/101/memberships")) == 2


async def test_bulk_section_skips_existing_and_concludes_after_enroll():
    fake = FakeCanvas(
        {
            "/api/v1/courses/1/enrollments": [
                {"id": 900, "user_id": 1, "course_section_id": 5},
                {"id": 901, "user_id": 2, "course_section_id": 7},
            ]
        }
    )
    results = await operations.bulk_place_in_section(fake, 1, [1, 2], section_id=7)
    by_user = {r["user_id"]: r for r in results}

    assert by_user[2]["status"] == "skipped"
    assert by_user[1]["status"] == "ok"
    assert fake.writes() == [
        ("POST", "/api/v1/sections/7/enrollments"),
        ("DELETE", "/api/v1/courses/1/enrollments/900"),
    ]


async def test_remove_user_from_section_concludes_enrollment():
    fake = FakeCanvas(
        {
            "/api/v1/courses/1/enrollments": [
                {"id": 900, "user_id": 1, "course_section_id": 5},
                {"id": 901, "user_id": 2, "course_section_id": 7},
            ]
        }
    )
    await operations.remove_user_from_section(fake, 1, section_id=5, user_id=1)
    assert ("DELETE", "/api/v1/courses/1/enrollments/900") in fake.writes()


async def test_bulk_section_failed_enroll_keeps_old_enrollment():
    fake = FakeCanvas(
        {"/api/v1/courses/1/enrollments": [{"id": 900, "user_id": 1, "course_section_id": 5}]},
        fail={("POST", "/api/v1/sections/7/enrollments")},
    )
    results = await operations.bulk_place_in_section(fake, 1, [1], section_id=7)
    assert results[0]["status"] == "error"
    assert ("DELETE", "/api/v1/courses/1/enrollments/900") not in fake.writes()


async def test_students_reuse_cached_groups_and_sections():
    pages = _groups_fixture()
    pages["/api/v1/courses/1/sections"] = [{"id": 5, "name": "Klas A"}]
    pages["/api/v1/courses/1/users"] = [
        {
            "id": 1,
            "name": "Anna",
            "enrollments": [{"type": "StudentEnrollment", "enrollment_state": "active", "course_section_id": 5}],
        }
    ]
    fake = FakeCanvas(pages)
    await operations.list_group_categories(fake, 1)
    await operations.list_course_sections(fake, 1)
    before = len(fake.calls)

    students = await operations.list_course_students(fake, 1)
    assert len(fake.calls) - before == 1
    assert students[0]["section_names"] == ["Klas A"]
    assert students[0]["groups"][0]["name"] == "Team 1"
