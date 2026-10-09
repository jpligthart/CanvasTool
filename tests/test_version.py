from app.version import __version__, read_version


def test_version_matches_file():
    assert __version__ == read_version()
    assert __version__
