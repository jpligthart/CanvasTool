from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Iterable
from typing import Any, TypeVar
from urllib.parse import urljoin

import httpx

from app.config import Settings

T = TypeVar("T")
R = TypeVar("R")

MAX_CONCURRENCY = 6
MAX_RETRIES = 3

_http: httpx.AsyncClient | None = None


def _shared_http() -> httpx.AsyncClient:
    global _http
    if _http is None or _http.is_closed:
        _http = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _http


async def close_http() -> None:
    global _http
    if _http is not None and not _http.is_closed:
        await _http.aclose()
    _http = None


class CanvasAPIError(Exception):
    def __init__(self, status_code: int, message: str, body: Any = None) -> None:
        self.status_code = status_code
        self.message = message
        self.body = body
        super().__init__(message)


def _error_message(response: httpx.Response) -> tuple[str, Any]:
    try:
        body: Any = response.json()
    except ValueError:
        body = response.text
    message = response.reason_phrase or "Canvas error"
    if isinstance(body, dict):
        errors = body.get("errors")
        if isinstance(errors, list) and errors and isinstance(errors[0], dict) and errors[0].get("message"):
            message = str(errors[0]["message"])
        elif isinstance(errors, dict) and errors:
            message = "; ".join(f"{k}: {v}" for k, v in errors.items())
        elif body.get("message"):
            message = str(body["message"])
    return message, body


def _is_retryable(response: httpx.Response) -> bool:
    if response.status_code in (429, 502, 503, 504):
        return True
    return response.status_code == 403 and "rate limit exceeded" in response.text.lower()


class CanvasClient:
    def __init__(self, settings: Settings) -> None:
        self.base_url = settings.canvas_base_url.rstrip("/")
        self.token = settings.canvas_api_token

    def _url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        return urljoin(f"{self.base_url}/", path.lstrip("/"))

    async def _send(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
    ) -> httpx.Response:
        http = _shared_http()
        headers = {"Authorization": f"Bearer {self.token}"}
        for attempt in range(MAX_RETRIES + 1):
            response = await http.request(method, self._url(path), headers=headers, params=params, json=json)
            if attempt < MAX_RETRIES and _is_retryable(response):
                await asyncio.sleep(0.5 * 2**attempt)
                continue
            if response.status_code >= 400:
                message, body = _error_message(response)
                raise CanvasAPIError(response.status_code, message, body)
            return response
        raise CanvasAPIError(503, "Canvas niet bereikbaar")

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
    ) -> Any:
        response = await self._send(method, path, params=params, json=json)
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    async def get_paginated(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        per_page: int = 100,
    ) -> list[Any]:
        merged = dict(params or {})
        merged.setdefault("per_page", per_page)
        results: list[Any] = []
        response = await self._send("GET", path, params=merged)
        while True:
            chunk = response.json()
            if isinstance(chunk, list):
                results.extend(chunk)
            else:
                results.append(chunk)
            next_url = _next_link(response.headers.get("Link"))
            if not next_url:
                return results
            response = await self._send("GET", next_url)


async def gather_limited(
    items: Iterable[T],
    fn: Callable[[T], Awaitable[R]],
    limit: int = MAX_CONCURRENCY,
) -> list[R]:
    semaphore = asyncio.Semaphore(limit)

    async def run(item: T) -> R:
        async with semaphore:
            return await fn(item)

    return list(await asyncio.gather(*(run(i) for i in items)))


def _next_link(link_header: str | None) -> str | None:
    if not link_header:
        return None
    for part in link_header.split(","):
        segment = part.strip()
        if 'rel="next"' in segment or "rel=next" in segment:
            start = segment.find("<")
            end = segment.find(">")
            if start >= 0 and end > start:
                return segment[start + 1 : end]
    return None
