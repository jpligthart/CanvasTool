from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable, Hashable
from typing import Any, TypeVar

T = TypeVar("T")

TTL_ME = 60 * 60
TTL_COURSES = 30 * 60
TTL_ROSTER = 15 * 60
TTL_GRADES = 5 * 60


def _course_of(key: tuple[Hashable, ...]) -> int | None:
    if len(key) >= 2 and key[0] == "course":
        return key[1]  # type: ignore[return-value]
    return None


class TTLCache:
    """In-memory TTL cache with in-flight de-duplication.

    A load that started before an invalidation of its course is not stored,
    so a write never gets overwritten by a slower, older read.
    """

    def __init__(self) -> None:
        self._data: dict[tuple[Hashable, ...], tuple[float, Any]] = {}
        self._inflight: dict[tuple[Hashable, ...], asyncio.Future[Any]] = {}
        self._generation: dict[int | None, int] = {}

    async def get_or_load(
        self,
        key: tuple[Hashable, ...],
        ttl: float,
        loader: Callable[[], Awaitable[T]],
        *,
        fresh: bool = False,
    ) -> T:
        if fresh:
            self._data.pop(key, None)
        else:
            hit = self._data.get(key)
            if hit and hit[0] > time.monotonic():
                return hit[1]

        pending = self._inflight.get(key)
        if pending is not None and not fresh:
            return await asyncio.shield(pending)

        course = _course_of(key)
        generation = self._generation.get(course, 0)
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._inflight[key] = future
        try:
            value = await loader()
        except BaseException as exc:
            future.set_exception(exc)
            future.exception()
            raise
        else:
            if self._generation.get(course, 0) == generation:
                self._data[key] = (time.monotonic() + ttl, value)
            future.set_result(value)
            return value
        finally:
            if self._inflight.get(key) is future:
                del self._inflight[key]

    def invalidate_course(self, course_id: int) -> None:
        self._generation[course_id] = self._generation.get(course_id, 0) + 1
        for key in [k for k in self._data if _course_of(k) == course_id]:
            del self._data[key]

    def invalidate(self, key: tuple[Hashable, ...]) -> None:
        self._data.pop(key, None)

    def clear(self) -> None:
        for course in list(self._generation) + [None]:
            self._generation[course] = self._generation.get(course, 0) + 1
        self._data.clear()


cache = TTLCache()
