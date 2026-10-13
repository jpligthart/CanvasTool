from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable, Hashable, Iterable
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


def _kind_of(key: tuple[Hashable, ...]) -> Hashable | None:
    return key[2] if len(key) >= 3 and key[0] == "course" else None


class TTLCache:
    """In-memory TTL cache with in-flight de-duplication.

    A load that started before an invalidation of its course (or of its kind
    within that course) is not stored, so a write never gets overwritten by a
    slower, older read.

    Expired entries are removed on the next cache access, including ones that
    nobody asks for again. A failed reload does not put the old value back.
    """

    def __init__(self) -> None:
        # key -> (expires_at, fetched_at, value), both times monotonic
        self._data: dict[tuple[Hashable, ...], tuple[float, float, Any]] = {}
        self._inflight: dict[tuple[Hashable, ...], asyncio.Future[Any]] = {}
        self._generation: dict[Hashable, int] = {}

    def _generation_of(self, key: tuple[Hashable, ...]) -> tuple[int, int]:
        course = _course_of(key)
        return (
            self._generation.get(course, 0),
            self._generation.get((course, _kind_of(key)), 0),
        )

    def _bump(self, scope: Hashable) -> None:
        self._generation[scope] = self._generation.get(scope, 0) + 1

    def _evict_expired(self) -> None:
        now = time.monotonic()
        expired = [key for key, (expires_at, _, _) in self._data.items() if expires_at <= now]
        for key in expired:
            del self._data[key]

    def newer_than(self, key: tuple[Hashable, ...], max_age: float) -> bool:
        """True when `key` is still inside its TTL and was stored within `max_age` seconds."""
        self._evict_expired()
        hit = self._data.get(key)
        if hit is None:
            return False
        return time.monotonic() - hit[1] <= max_age

    async def get_or_load(
        self,
        key: tuple[Hashable, ...],
        ttl: float,
        loader: Callable[[], Awaitable[T]],
        *,
        fresh: bool = False,
    ) -> T:
        self._evict_expired()
        if fresh:
            self._data.pop(key, None)
        else:
            hit = self._data.get(key)
            if hit is not None:
                return hit[2]

        pending = self._inflight.get(key)
        if pending is not None and not fresh:
            return await asyncio.shield(pending)

        generation = self._generation_of(key)
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._inflight[key] = future
        try:
            value = await loader()
        except BaseException as exc:
            future.set_exception(exc)
            future.exception()
            raise
        else:
            if self._generation_of(key) == generation:
                now = time.monotonic()
                self._data[key] = (now + ttl, now, value)
            future.set_result(value)
            return value
        finally:
            if self._inflight.get(key) is future:
                del self._inflight[key]

    def invalidate_course(self, course_id: int, kinds: Iterable[str] | None = None) -> None:
        """Drop cached data of one course; with `kinds`, only those kinds (e.g. "groups")."""
        self._evict_expired()
        if kinds is None:
            self._bump(course_id)
            doomed = [k for k in self._data if _course_of(k) == course_id]
        else:
            wanted = set(kinds)
            for kind in wanted:
                self._bump((course_id, kind))
            doomed = [k for k in self._data if _course_of(k) == course_id and _kind_of(k) in wanted]
        for key in doomed:
            del self._data[key]

    def invalidate(self, key: tuple[Hashable, ...]) -> None:
        self._evict_expired()
        self._data.pop(key, None)

    def clear(self) -> None:
        for scope in list(self._generation) + [None]:
            self._bump(scope)
        self._data.clear()


cache = TTLCache()
