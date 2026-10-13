import asyncio
import time

from app.cache import TTLCache


async def test_hit_within_ttl_calls_loader_once():
    cache = TTLCache()
    calls = 0

    async def load():
        nonlocal calls
        calls += 1
        return calls

    assert await cache.get_or_load(("course", 1, "x"), 60, load) == 1
    assert await cache.get_or_load(("course", 1, "x"), 60, load) == 1
    assert calls == 1


async def test_concurrent_requests_share_one_load():
    cache = TTLCache()
    calls = 0

    async def load():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return "v"

    results = await asyncio.gather(*(cache.get_or_load(("k",), 60, load) for _ in range(5)))
    assert results == ["v"] * 5
    assert calls == 1


async def test_invalidate_course_drops_only_that_course():
    cache = TTLCache()

    async def load():
        return object()

    a1 = await cache.get_or_load(("course", 1, "x"), 60, load)
    b1 = await cache.get_or_load(("course", 12, "x"), 60, load)
    cache.invalidate_course(1)
    assert await cache.get_or_load(("course", 1, "x"), 60, load) is not a1
    assert await cache.get_or_load(("course", 12, "x"), 60, load) is b1


async def test_invalidate_course_kinds_keeps_other_kinds():
    cache = TTLCache()

    async def load():
        return object()

    groups = await cache.get_or_load(("course", 1, "groups"), 60, load)
    users = await cache.get_or_load(("course", 1, "users"), 60, load)
    cache.invalidate_course(1, ["groups"])
    assert await cache.get_or_load(("course", 1, "groups"), 60, load) is not groups
    assert await cache.get_or_load(("course", 1, "users"), 60, load) is users


async def test_kind_invalidation_discards_inflight_load_of_that_kind_only():
    cache = TTLCache()
    release = asyncio.Event()

    async def slow():
        await release.wait()
        return "stale"

    groups_task = asyncio.create_task(cache.get_or_load(("course", 1, "groups"), 60, slow))
    users_task = asyncio.create_task(cache.get_or_load(("course", 1, "users"), 60, slow))
    await asyncio.sleep(0)
    cache.invalidate_course(1, ["groups"])
    release.set()
    await asyncio.gather(groups_task, users_task)

    async def fresh():
        return "fresh"

    assert await cache.get_or_load(("course", 1, "groups"), 60, fresh) == "fresh"
    assert await cache.get_or_load(("course", 1, "users"), 60, fresh) == "stale"


async def test_load_started_before_invalidation_is_not_stored():
    cache = TTLCache()
    release = asyncio.Event()

    async def slow():
        await release.wait()
        return "stale"

    task = asyncio.create_task(cache.get_or_load(("course", 1, "x"), 60, slow))
    await asyncio.sleep(0)
    cache.invalidate_course(1)
    release.set()
    assert await task == "stale"

    async def fresh():
        return "fresh"

    assert await cache.get_or_load(("course", 1, "x"), 60, fresh) == "fresh"


async def test_failed_load_is_not_cached():
    cache = TTLCache()

    async def boom():
        raise RuntimeError("nope")

    for _ in range(2):
        try:
            await cache.get_or_load(("k",), 60, boom)
        except RuntimeError:
            pass

    async def ok():
        return 1

    assert await cache.get_or_load(("k",), 60, ok) == 1


async def test_expired_entries_are_evicted_on_other_access():
    cache = TTLCache()

    async def load():
        return "kept"

    await cache.get_or_load(("a",), 60, load)
    await cache.get_or_load(("b",), 60, load)
    _, fetched_at, value = cache._data[("a",)]
    cache._data[("a",)] = (time.monotonic() - 1, fetched_at, value)

    assert await cache.get_or_load(("b",), 60, load) == "kept"
    assert ("a",) not in cache._data
    assert ("b",) in cache._data


async def test_expired_value_is_dropped_when_reload_fails():
    cache = TTLCache()
    cache._data[("k",)] = (time.monotonic() - 1, time.monotonic() - 10, "secret")

    async def boom():
        raise RuntimeError("nope")

    try:
        await cache.get_or_load(("k",), 60, boom)
    except RuntimeError:
        pass

    assert ("k",) not in cache._data
