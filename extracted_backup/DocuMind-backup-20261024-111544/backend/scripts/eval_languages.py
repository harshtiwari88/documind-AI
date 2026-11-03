"""Measures how well the AI turns each language's phrases into the right command.
Usage (backend running, GEMINI_API_KEY set):  python -m scripts.eval_languages --api http://localhost:8000 --email you@x.com --password yourpass
Writes LANGUAGE_REPORT.md and ../frontend/public/lang_status.json. This checks TEXT understanding only; use eval_whisper.py for speech."""
import argparse, json, pathlib
CASES = json.loads((pathlib.Path(__file__).resolve().parent.parent / "tests" / "lang_cases.json").read_text(encoding="utf8"))
STATUS_FILE = pathlib.Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "lang_status.json"

def matches(got: dict, expect: dict) -> bool:
    return got.get("op") == expect["op"] and ("page" not in expect or got.get("page") == expect["page"])

def evaluate(call, cases=CASES):
    """call(utterance, lang) -> command dict (may raise). Returns {lang: {passed, total, status, failures}}."""
    out = {}
    for lang, items in cases.items():
        if lang.startswith("_"): continue
        fails, ok = [], 0
        for c in items:
            try: got = call(c["say"], lang)
            except Exception as e: got = {"error": str(e)}
            if matches(got, c["expect"]): ok += 1
            else: fails.append({"say": c["say"], "expected": c["expect"], "got": got})
        r = ok / len(items)
        out[lang] = {"passed": ok, "total": len(items), "status": "verified" if r == 1 else "partial" if r >= 0.67 else "failing", "failures": fails}
    return out

def merge_status(key: str, results: dict):
    cur = json.loads(STATUS_FILE.read_text(encoding="utf8")) if STATUS_FILE.exists() else {}
    for lang, r in results.items(): cur.setdefault(lang, {})[key] = r["status"]
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True); STATUS_FILE.write_text(json.dumps(cur, ensure_ascii=False, indent=1), encoding="utf8")

if __name__ == "__main__":
    import httpx
    ap = argparse.ArgumentParser(); ap.add_argument("--api", default="http://localhost:8000"); ap.add_argument("--email"); ap.add_argument("--password"); a = ap.parse_args()
    h = {}
    if a.email:
        r = httpx.post(f"{a.api}/auth/login", json={"email": a.email, "password": a.password}); r.raise_for_status(); h = {"Authorization": "Bearer " + r.json()["token"]}
    def call(say, lang):
        r = httpx.post(f"{a.api}/ai/command", headers=h, timeout=60, json={"utterance": say, "language": lang.split("-")[0], "page_count": 8, "current_page": 1})
        r.raise_for_status(); return r.json()["command"]
    res = evaluate(call); merge_status("text", res)
    lines = ["# Language report (text understanding)", "", "| Language | Passed | Status |", "|---|---|---|"] + [f"| {l} | {r['passed']}/{r['total']} | {r['status']} |" for l, r in res.items()]
    for l, r in res.items():
        for f in r["failures"]: lines.append(f"\n- {l}: `{f['say']}` expected {f['expected']} got {f['got']}")
    pathlib.Path("LANGUAGE_REPORT.md").write_text("\n".join(lines), encoding="utf8"); print("\n".join(lines[:30]))
