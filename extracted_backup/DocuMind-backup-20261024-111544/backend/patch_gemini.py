from pathlib import Path

p = Path("main.py")
s = p.read_text(encoding="utf-8")

old = '''        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
                             headers={"x-goog-api-key": GEMINI_KEY}, json=body)'''

new = '''        async with httpx.AsyncClient(timeout=45) as c:
            for attempt in range(3):
                r = await c.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
                    headers={"x-goog-api-key": GEMINI_KEY},
                    json=body
                )
                if r.status_code not in (429, 500, 502, 503, 504) or attempt == 2:
                    break
                delay = 2 ** (attempt + 1)
                print(f"Gemini HTTP {r.status_code}; retrying in {delay} seconds...")
                await asyncio.sleep(delay)'''

if old not in s:
    print("PATCH NOT APPLIED: original code block not found. main.py was not changed.")
    raise SystemExit(1)

backup = Path("main.py.bak")
if not backup.exists():
    backup.write_text(s, encoding="utf-8")

p.write_text(s.replace(old, new, 1), encoding="utf-8")
print("SUCCESS: Gemini retry added. Backup saved as main.py.bak")
