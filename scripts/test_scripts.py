"""Smoke tests for `scripts/` (Phase 3): basename mapping, data-URL
round-trip, font/image inlining end-to-end, and `render.py` arg parsing.

Run: `pytest scripts/` (see `scripts/requirements-dev.txt`).
WeasyPrint is NOT required — rendering itself stays in the `verify.sh`
pipeline; here only page counting, sheet detection and CLI parsing run.
"""

from __future__ import annotations

import base64
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent


def load(name: str, filename: str | None = None):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / (filename or f"{name}.py"))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


inline_lib = load("inline_lib")
render = load("render")


# --- inline_lib -----------------------------------------------------------

def test_basename_ignores_case_query_hash_and_separators():
    b = inline_lib.basename
    assert b("assets/Cover-Photo.JPG?v=2#x") == "cover-photo.jpg"
    assert b("C:\\Windows\\Fonts\\SEGUISYM.ttf") == "seguisym.ttf"
    assert b("_fonts/NotoSerif-Regular.ttf") == "notoserif-regular.ttf"


def test_data_url_round_trip(tmp_path: Path):
    f = tmp_path / "a.bin"
    f.write_bytes(b"\x00\x01hello")
    url = inline_lib.data_url(f)
    assert url.startswith("data:application/octet-stream;base64,")
    assert base64.b64decode(url.split(",", 1)[1]) == b"\x00\x01hello"
    assert inline_lib.data_url(f, "font/ttf").startswith("data:font/ttf;base64,")


def test_index_files_first_wins_and_extra_overrides(tmp_path: Path, capsys):
    d1, d2 = tmp_path / "one", tmp_path / "two"
    d1.mkdir()
    d2.mkdir()
    (d1 / "A.ttf").write_bytes(b"1")
    (d2 / "a.TTF").write_bytes(b"2")
    other = tmp_path / "override-a.ttf"
    other.write_bytes(b"3")
    # NOTE: extras index by the *file's own* basename (`a.ttf=X` still lands
    # under X's name) — locked here so a future rename is a conscious change.
    index = inline_lib.index_files([d1, d2], [f"ignored={other}"], {".ttf"}, "font")
    assert index["override-a.ttf"] == other
    index2 = inline_lib.index_files([d1, d2], [], {".ttf"}, "font")
    assert index2["a.ttf"] == d1 / "A.ttf"  # first dir wins
    inline_lib.index_files([tmp_path / "missing"], [], {".ttf"}, "font")
    assert "warn" in capsys.readouterr().err


def test_index_files_recursive_finds_nested(tmp_path: Path):
    nested = tmp_path / "assets" / "deep"
    nested.mkdir(parents=True)
    (nested / "hero.png").write_bytes(b"img")
    index = inline_lib.index_files_recursive([tmp_path], [], {".png"}, "image")
    assert index["hero.png"] == nested / "hero.png"


def test_default_output_naming(tmp_path: Path):
    src = tmp_path / "guide.html"
    src.write_text("x")
    assert inline_lib.default_output(src, None) == tmp_path / "guide.inlined.html"
    assert inline_lib.default_output(src, "o.html") == Path("o.html")


# --- inline-local-fonts.py / inline-local-images.py end to end ------------

@pytest.fixture()
def fonts_mod():
    return load("inline_local_fonts", "inline-local-fonts.py")


@pytest.fixture()
def images_mod():
    return load("inline_local_images", "inline-local-images.py")


def _run_main(mod, argv: list[str], monkeypatch) -> int:
    monkeypatch.setattr(sys, "argv", argv)
    return mod.main()


def test_inline_fonts_end_to_end(tmp_path: Path, monkeypatch, fonts_mod):
    fonts = tmp_path / "_fonts"
    fonts.mkdir()
    (fonts / "NotoSerif-Regular.ttf").write_bytes(b"fakefont")
    html = tmp_path / "guide.html"
    html.write_text(
        "<style>@font-face{font-family:N;src:url(\"_fonts/NotoSerif-Regular.ttf\");}"
        "@font-face{font-family:R;src:url(https://cdn.example/r.woff2);}</style>"
        "<div class=\"page\">x</div>"
    )
    rc = _run_main(fonts_mod, ["inline-local-fonts.py", str(html)], monkeypatch)
    assert rc == 0
    out = (tmp_path / "guide.inlined.html").read_text()
    assert "data:font/ttf;base64," in out
    assert "_fonts/NotoSerif-Regular.ttf" not in out
    assert "https://cdn.example/r.woff2" in out  # remote left for the CORS path


def test_inline_fonts_missing_file_errors(tmp_path: Path, monkeypatch, fonts_mod):
    rc = _run_main(fonts_mod, ["inline-local-fonts.py", str(tmp_path / "nope.html")], monkeypatch)
    assert rc == 2


def test_inline_images_end_to_end(tmp_path: Path, monkeypatch, images_mod):
    (tmp_path / "cover-photo.jpg").write_bytes(b"fakejpg")
    (tmp_path / "thumb.jpg").write_bytes(b"thumb")
    html = tmp_path / "guide.html"
    html.write_text(
        "<img src=\"assets/cover-photo.jpg\">"
        "<img srcset=\"thumb.jpg 1x, https://cdn.example/b.jpg 2x\">"
        "<style>.hero{background:url(\"cover-photo.jpg\");}</style>"
        "<div class=\"page\">x</div>"
    )
    rc = _run_main(images_mod, ["inline-local-images.py", str(html)], monkeypatch)
    assert rc == 0
    out = (tmp_path / "guide.inlined.html").read_text()
    assert "cover-photo.jpg" not in out
    assert "thumb.jpg 1x" not in out
    assert "data:image/jpeg;base64," in out
    assert "https://cdn.example/b.jpg" in out  # remote srcset left alone


# --- render.py ------------------------------------------------------------

def test_count_pages_counts_page_tokens():
    assert render.count_pages('<div class="page">a</div><div class="page">b</div>') == 2
    assert render.count_pages('<div class="page active">a</div>') == 1
    assert render.count_pages('<div class="pager">a</div>') == 0
    assert render.count_pages("<p>no pages</p>") == 0


def test_detect_sheet_mode_spots_full_sheet_designs():
    assert render.detect_sheet_mode(".page{height:297mm;}") is True
    assert render.detect_sheet_mode(".page{padding:10mm;}") is False


def test_render_cli_parsing(monkeypatch, capsys):
    with pytest.raises(SystemExit) as e:
        monkeypatch.setattr(sys, "argv", ["render.py", "--help"])
        render.main()
    assert e.value.code == 0
    with pytest.raises(SystemExit) as e2:
        monkeypatch.setattr(sys, "argv", ["render.py", "x.html", "--page-size", "poster"])
        render.main()
    assert e2.value.code == 2
    capsys.readouterr()


def test_render_cli_missing_input_returns_2(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(sys, "argv", ["render.py", str(tmp_path / "nope.html")])
    assert render.main() == 2
