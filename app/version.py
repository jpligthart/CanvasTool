from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
_VERSION_FILE = _ROOT / "VERSION"


def read_version() -> str:
    if _VERSION_FILE.is_file():
        return _VERSION_FILE.read_text(encoding="utf-8").strip()
    return "0.0.0-dev"


__version__ = read_version()
