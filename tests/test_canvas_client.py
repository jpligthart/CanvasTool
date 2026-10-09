from app.canvas_client import _next_link


def test_next_link_parses_rel_next():
    header = '<https://canvas.example/api/v1/courses?page=2>; rel="next", <https://canvas.example/api/v1/courses?page=1>; rel="current"'
    assert _next_link(header) == "https://canvas.example/api/v1/courses?page=2"


def test_next_link_none_when_missing():
    assert _next_link(None) is None
    assert _next_link('rel="current"') is None
