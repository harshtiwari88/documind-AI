import json, pathlib, pytest
from main import Cmd
from scripts.eval_languages import CASES, evaluate
from scripts.eval_whisper import error_rate, status
CODES = {"en-IN","hi-IN","mr-IN","gu-IN","bn-IN","ta-IN","te-IN","kn-IN","ml-IN","pa-IN","ur-PK","es-ES","fr-FR","de-DE","pt-BR","it-IT","ar-SA","zh-CN","ja-JP","ko-KR","ru-RU"}
LANGS = {k: v for k, v in CASES.items() if not k.startswith("_")}

def test_all_21_languages_have_cases(): assert set(LANGS) == CODES and all(len(v) >= 3 for v in LANGS.values())
def test_expected_commands_match_schema():
    for cs in LANGS.values():
        for c in cs: assert c["say"].strip(); Cmd(**c["expect"])
def test_voice_language_selector_lists_the_same_languages():
    # The selector was extracted from Voice.tsx into the shared LANGS module.
    # Test the actual source of truth rather than the thin route component.
    src = (pathlib.Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "langs.ts").read_text(encoding="utf8")
    for code in CODES:
        assert f'"{code}"' in src
def test_scoring_perfect_and_broken():
    lookup = {c["say"]: c["expect"] for cs in LANGS.values() for c in cs}
    assert all(r["status"] == "verified" for r in evaluate(lambda s, l: lookup[s], CASES).values())
    assert all(r["status"] == "failing" for r in evaluate(lambda s, l: {"op": "goto"}, CASES).values())
def test_error_rate_and_status():
    assert error_rate("rotate page four", "rotate page four", "en-IN") == 0
    assert error_rate("旋转第四页", "旋转第四", "zh-CN") == pytest.approx(0.2)
    assert status([0.1, 0.2]) == "untested" and status([0.1, 0.1, 0.2]) == "verified" and status([0.5, 0.6, 0.7]) == "failing"
