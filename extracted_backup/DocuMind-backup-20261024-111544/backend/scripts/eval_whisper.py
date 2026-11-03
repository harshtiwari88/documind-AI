"""Measures speech recognition per language from YOUR recordings.
Layout: audio_samples/<lang-code>/<name>.wav (or .webm/.mp3) next to <name>.txt holding exactly what was said. Record at least 3 clips per language.
Usage: python -m scripts.eval_whisper --dir audio_samples --model small"""
import argparse, pathlib
from scripts.eval_languages import merge_status
CHAR_LEVEL = {"zh", "ja", "ko"}

def edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1): cur.append(min(prev[j] + 1, cur[-1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]

def error_rate(ref: str, hyp: str, lang: str) -> float:
    norm = lambda s: "".join(c for c in s.lower() if c.isalnum() or c.isspace())
    r, h = norm(ref), norm(hyp)
    if lang.split("-")[0] in CHAR_LEVEL: r, h = list(r.replace(" ", "")), list(h.replace(" ", ""))
    else: r, h = r.split(), h.split()
    return edit_distance(r, h) / max(1, len(r))

def status(rates):
    if len(rates) < 3: return "untested"
    m = sum(rates) / len(rates); return "verified" if m <= 0.25 else "partial" if m <= 0.4 else "failing"

if __name__ == "__main__":
    from faster_whisper import WhisperModel
    ap = argparse.ArgumentParser(); ap.add_argument("--dir", default="audio_samples"); ap.add_argument("--model", default="small"); a = ap.parse_args()
    model = WhisperModel(a.model, device="cpu", compute_type="int8"); res = {}
    for d in sorted(p for p in pathlib.Path(a.dir).iterdir() if p.is_dir()):
        rates = []
        for f in sorted(d.iterdir()):
            if f.suffix.lower() in {".wav", ".webm", ".mp3", ".m4a"} and f.with_suffix(".txt").exists():
                segs, _ = model.transcribe(str(f), language=d.name.split("-")[0]); hyp = " ".join(s.text for s in segs)
                rates.append(error_rate(f.with_suffix(".txt").read_text(encoding="utf8"), hyp, d.name))
        res[d.name] = {"status": status(rates), "passed": len(rates), "total": len(rates), "failures": []}
        print(d.name, status(rates), [round(r, 2) for r in rates])
    merge_status("speech", res)
