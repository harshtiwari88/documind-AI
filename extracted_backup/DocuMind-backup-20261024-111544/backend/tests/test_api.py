import os
os.environ["AUTH_REQUIRED"] = "false"
import io, fitz, pytest
from fastapi.testclient import TestClient
import main
c = TestClient(main.app)

@pytest.fixture(autouse=True)
def _reset_limits():
    main._hits.clear(); main._auth_hits.clear(); yield

def mk(n=3, text=True):
    d = fitz.open()
    for i in range(n):
        p = d.new_page()
        if text: p.insert_text((72, 72), f"Page {i+1} hello")
    return d.tobytes()

def up(b, name="a.pdf"): return (name, io.BytesIO(b), "application/pdf")

def test_health(): assert c.get("/health").json()["ok"]
def test_merge_integrity():
    r = c.post("/pdf/merge", files=[("files", up(mk(2))), ("files", up(mk(3)))])
    assert r.status_code == 200 and fitz.open(stream=r.content, filetype="pdf").page_count == 5
def test_split_range():
    r = c.post("/pdf/split", files={"file": up(mk(5))}, data={"pages": "2-3,5"})
    assert fitz.open(stream=r.content, filetype="pdf").page_count == 3
def test_bad_range(): assert c.post("/pdf/split", files={"file": up(mk(2))}, data={"pages": "1-9"}).status_code == 422
def test_rotate():
    r = c.post("/pdf/rotate", files={"file": up(mk(2))}, data={"pages": "1", "degrees": "90"})
    assert fitz.open(stream=r.content, filetype="pdf")[0].rotation == 90
def test_invalid_file(): assert c.post("/pdf/text", files={"file": ("x.pdf", io.BytesIO(b"hello"), "application/pdf")}).status_code == 415
def test_corrupted(): assert c.post("/pdf/text", files={"file": ("x.pdf", io.BytesIO(b"%PDF-1.4 garbage"), "application/pdf")}).status_code == 422
def test_oversize(monkeypatch):
    monkeypatch.setattr(main, "MAX_MB", 0)
    assert c.post("/pdf/text", files={"file": up(mk(1))}).status_code == 413
def test_password_protected():
    d = fitz.open(); d.new_page(); b = d.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="pw", owner_pw="pw")
    assert c.post("/pdf/text", files={"file": up(b)}).status_code == 401
    assert c.post("/pdf/text", files={"file": up(b)}, data={"password": "pw"}).status_code == 200
def test_scanned_detection():
    assert c.post("/pdf/text", files={"file": up(mk(2, text=False))}).json()["scanned_pages"] == [1, 2]
def test_ai_requires_consent(): assert c.post("/ai/assist", files={"file": up(mk(1))}).status_code == 400

@pytest.mark.parametrize("utt,out", [("page do ko rotate karo", '{"op":"rotate_page","page":2}'),
                                      ("पेज तीन हटाओ", '{"op":"delete_page","page":3}'), ("gira la página 1", '{"op":"rotate_page","page":1}')])
def test_multilingual_commands(monkeypatch, utt, out):
    async def fake(*a, **k): return out
    monkeypatch.setattr(main, "gemini", fake)
    r = c.post("/ai/command", json={"utterance": utt, "page_count": 5, "current_page": 1})
    assert r.status_code == 200 and r.json()["command"]["op"] in {"rotate_page", "delete_page"}
    assert r.json()["needs_confirmation"] == (out.startswith('{"op":"delete'))
def test_command_rejects_unknown_op(monkeypatch):
    async def fake(*a, **k): return '{"op":"run_shell","text":"rm -rf /"}'
    monkeypatch.setattr(main, "gemini", fake)
    assert c.post("/ai/command", json={"utterance": "x", "page_count": 2, "current_page": 1}).status_code == 422
def test_command_page_out_of_range(monkeypatch):
    async def fake(*a, **k): return '{"op":"delete_page","page":9}'
    monkeypatch.setattr(main, "gemini", fake)
    assert c.post("/ai/command", json={"utterance": "x", "page_count": 2, "current_page": 1}).status_code == 422

def test_register_login_and_protection(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "t.db")); monkeypatch.setattr(main, "AUTH_REQUIRED", True)
    assert c.post("/pdf/text", files={"file": up(mk(1))}).status_code == 401
    assert c.post("/auth/register", json={"email": "A@x.com", "password": "password123"}).status_code == 200
    assert c.post("/auth/register", json={"email": "a@x.com", "password": "password123"}).status_code == 409
    assert c.post("/auth/login", json={"email": "a@x.com", "password": "wrongpass1"}).status_code == 401
    tok = c.post("/auth/login", json={"email": "a@x.com", "password": "password123"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert c.post("/pdf/text", files={"file": up(mk(1))}, headers=h).status_code == 200
    assert c.get("/auth/me", headers=h).json()["email"] == "a@x.com"
def test_bad_token_rejected(monkeypatch):
    monkeypatch.setattr(main, "AUTH_REQUIRED", True)
    assert c.post("/pdf/text", files={"file": up(mk(1))}, headers={"Authorization": "Bearer bad"}).status_code == 401
def test_short_password_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "t.db"))
    assert c.post("/auth/register", json={"email": "b@x.com", "password": "short"}).status_code == 422

def test_feedback_is_used_as_example(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "t.db")); seen = {}
    async def fake(system, user, j=False): seen["s"] = system; return '{"op":"undo"}'
    monkeypatch.setattr(main, "gemini", fake)
    r = c.post("/ai/feedback", json={"utterance": "wapas karo bhai", "command": {"op": "undo"}}); assert r.status_code == 200
    c.post("/ai/command", json={"utterance": "x", "page_count": 2, "current_page": 1})
    assert "wapas karo bhai" in seen["s"] and "Hinglish" in seen["s"]
def test_new_ops_validate(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "t.db"))
    async def fake(*a, **k): return '{"op":"set_style","target":"heading","color":"#1f4fd8"}'
    monkeypatch.setattr(main, "gemini", fake)
    r = c.post("/ai/command", json={"utterance": "headings blue", "page_count": 2, "current_page": 1}).json()
    assert r["command"]["color"] == "#1f4fd8" and r["needs_confirmation"]
def test_bad_color_rejected(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "t.db"))
    async def fake(*a, **k): return '{"op":"set_style","color":"red; drop table"}'
    monkeypatch.setattr(main, "gemini", fake)
    assert c.post("/ai/command", json={"utterance": "x", "page_count": 2, "current_page": 1}).status_code == 422
def test_search_finds_page():
    r = c.post("/pdf/search", files={"file": up(mk(3))}, data={"q": "page 2"}).json()
    assert [h["page"] for h in r["hits"]] == [2]
def test_compare_needs_consent_and_two_files():
    assert c.post("/ai/compare", files=[("files", up(mk(1))), ("files", up(mk(1)))]).status_code == 400
    assert c.post("/ai/compare", files=[("files", up(mk(1)))], data={"consent": "true"}).status_code == 422
def test_batch_compress_zip():
    import zipfile
    r = c.post("/batch/compress", files=[("files", up(mk(1), "a.pdf")), ("files", up(b"nope", "b.pdf"))])
    assert r.status_code == 415
    r = c.post("/batch/compress", files=[("files", up(mk(1), "a.pdf")), ("files", up(mk(2), "b.pdf"))])
    assert sorted(zipfile.ZipFile(io.BytesIO(r.content)).namelist()) == ["a-compressed.pdf", "b-compressed.pdf"]
def test_forgot_needs_smtp(monkeypatch, tmp_path):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    assert c.post("/auth/forgot", json={"email": "a@x.com"}).status_code == 501
def test_reset_flow(monkeypatch, tmp_path):
    import hashlib, time
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "t.db"))
    c.post("/auth/register", json={"email": "r@x.com", "password": "password123"})
    con = main.db(); con.execute("INSERT INTO resets VALUES(?,?,?)", ("r@x.com", hashlib.sha256(b"tok-1234567890").hexdigest(), time.time() + 60)); con.commit(); con.close()
    assert c.post("/auth/reset", json={"token": "tok-1234567890", "password": "newpass456"}).status_code == 200
    assert c.post("/auth/login", json={"email": "r@x.com", "password": "newpass456"}).status_code == 200
    assert c.post("/auth/reset", json={"token": "tok-1234567890", "password": "another789"}).status_code == 400
def test_transcribe_rejects_empty(): assert c.post("/ai/transcribe", files={"audio": ("a.webm", io.BytesIO(b"x"), "audio/webm")}).status_code == 422

def test_replace_text_removes_old_text_and_reports_font():
    d = fitz.open(); p = d.new_page(); p.insert_text((72, 100), "Hello World", fontname="helv", fontsize=14)
    r = c.post("/pdf/replace-text", files={"file": up(d.tobytes())}, data={"page": "1", "find": "World", "replace": "There"})
    assert r.status_code == 200 and r.headers["X-Replaced"] == "1" and r.headers["X-Font-Match"]
    t = fitz.open(stream=r.content, filetype="pdf")[0].get_text()
    assert "World" not in t and "There" in t
def test_replace_text_not_found(): assert c.post("/pdf/replace-text", files={"file": up(mk(1))}, data={"find": "zzzz", "replace": "x"}).status_code == 404
def test_replace_non_latin_needs_font():
    d = fitz.open(); d.new_page().insert_text((72, 100), "Hello", fontname="helv")
    assert c.post("/pdf/replace-text", files={"file": up(d.tobytes())}, data={"find": "Hello", "replace": "नमस्ते"}).status_code == 422
def test_font_upload_validated():
    r = c.post("/pdf/replace-text", files={"file": up(mk(1)), "font": ("f.ttf", io.BytesIO(b"not a font"), "font/ttf")}, data={"find": "Page", "replace": "x"})
    assert r.status_code == 415
import shutil
@pytest.mark.skipif(not shutil.which("tesseract"), reason="tesseract not installed")
def test_scan_replace_roundtrip():
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGB", (1400, 400), "white"); ImageDraw.Draw(im).text((60, 120), "INVOICE TOTAL", fill="black", font=ImageFont.load_default(110))
    b = io.BytesIO(); im.save(b, "PNG"); d = fitz.open(); pg = d.new_page(width=700, height=200); pg.insert_image(pg.rect, stream=b.getvalue())
    r = c.post("/pdf/scan-replace", files={"file": up(d.tobytes())}, data={"find": "INVOICE", "replace": "RECEIPT", "lang": "eng"})
    assert r.status_code == 200 and fitz.open(stream=r.content, filetype="pdf").page_count == 1

@pytest.mark.parametrize("out,ok", [
    ('{"op":"navigate","route":"settings"}', True), ('{"op":"navigate","route":"../etc/passwd"}', False),
    ('{"op":"open_tool","tool":"split","fields":{"pages":"1-3"}}', True), ('{"op":"open_tool","tool":"split","fields":{"Bad Key":"x"}}', False),
    ('{"op":"crop_image","crop":[10,0,10,20]}', True), ('{"op":"crop_image","crop":[10,0,10,200]}', False),
    ('{"op":"add_shape","shape":"ell"}', True), ('{"op":"add_shape","shape":"star; rm -rf"}', False),
    ('{"op":"set_font","target":"heading","font":"times","italic":true}', True), ('{"op":"set_font","font":"comic-sans"}', False),
    ('{"op":"underline","target":"total"}', True), ('{"op":"open_document","name":"invoice"}', True), ('{"op":"set_ui_language","lang":"hi"}', True),
    ('{"op":"set_ui_language","lang":"xx"}', False), ('{"op":"sign_out"}', True), ('{"op":"run_tool"}', True)])
def test_all_command_families_are_schema_checked(monkeypatch, tmp_path, out, ok):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "t.db"))
    async def fake(*a, **k): return out
    monkeypatch.setattr(main, "gemini", fake)
    r = c.post("/ai/command", json={"utterance": "x", "page_count": 3, "current_page": 1})
    assert (r.status_code == 200) == ok

def test_ai_assist_page_filter_preserves_original_page_numbers(monkeypatch):
    async def fake(system, user, json_mode=False):
        assert '[p.3]' in user and '[p.1]' not in user and '[p.2]' not in user
        return 'The selected page says Page 3. [p.3]'
    monkeypatch.setattr(main, 'gemini', fake)
    r = c.post('/ai/assist', files={'file': up(mk(3))}, data={'task':'summary', 'pages':'3', 'consent':'true'})
    assert r.status_code == 200, r.text
    assert [s['page'] for s in r.json()['sources']] == [3]

def test_ai_assist_summary_samples_document_end(monkeypatch):
    async def fake(system, user, json_mode=False):
        assert '[p.1]' in user
        assert '[p.45]' in user
        return 'Summary across document.'
    monkeypatch.setattr(main, 'gemini', fake)
    d = fitz.open()
    for i in range(45):
        page = d.new_page()
        page.insert_text((72, 72), f'Unique content for page {i + 1}')
    r = c.post('/ai/assist', files={'file': up(d.tobytes())}, data={'task':'summary', 'consent':'true'})
    assert r.status_code == 200, r.text
    assert 45 in [s['page'] for s in r.json()['sources']]

def test_ai_assist_chat_requires_question():
    r = c.post('/ai/assist', files={'file': up(mk(1))}, data={'task':'chat', 'consent':'true'})
    assert r.status_code == 422 and 'question' in r.text.lower()

def test_ai_assist_translate_requires_target_language():
    r = c.post('/ai/assist', files={'file': up(mk(1))}, data={'task':'translate', 'consent':'true'})
    assert r.status_code == 422 and 'target language' in r.text.lower()

@pytest.mark.skipif(not shutil.which("tesseract"), reason="tesseract not installed")
def test_searchable_ocr_preserves_page_count_and_reports_pages():
    from PIL import Image, ImageDraw, ImageFont
    d = fitz.open()
    p = d.new_page(width=500, height=200); p.insert_text((40, 50), "Selectable page text")
    im = Image.new("RGB", (1000, 400), "white")
    ImageDraw.Draw(im).text((50, 100), "INVOICE TOTAL 12345", fill="black", font=ImageFont.load_default(size=72))
    b = io.BytesIO(); im.save(b, "PNG")
    p = d.new_page(width=500, height=200); p.insert_image(p.rect, stream=b.getvalue())
    r = c.post("/pdf/ocr", files={"file": up(d.tobytes())}, data={"lang": "eng"})
    assert r.status_code == 200, r.text
    out = fitz.open(stream=r.content, filetype="pdf")
    assert out.page_count == 2
    assert "Selectable page text" in out[0].get_text()
    assert "INVOICE" in out[1].get_text().upper()
    assert r.headers.get("X-OCR-Pages") == "2"
    assert r.headers.get("X-Skipped-Pages") == "1"

@pytest.mark.skipif(not shutil.which("tesseract"), reason="tesseract not installed")
def test_ocr_text_returns_confidence_and_page_validation():
    d = fitz.open(); p = d.new_page(width=500, height=180)
    p.insert_text((40, 70), "OCR CONFIDENCE CHECK 123")
    r = c.post("/pdf/ocr-text", files={"file": up(d.tobytes())}, data={"page": "1", "lang": "eng"})
    assert r.status_code == 200 and "OCR" in r.json()["text"].upper()
    assert all({"text", "conf", "uncertain"} <= set(w) for w in r.json()["words"])
    assert c.post("/pdf/ocr-text", files={"file": up(d.tobytes())}, data={"page": "2", "lang": "eng"}).status_code == 422

def test_ocr_rejects_invalid_language_code():
    assert c.post("/pdf/ocr", files={"file": up(mk(1, text=False))}, data={"lang": "eng;rm"}).status_code == 422

def test_ocr_reports_missing_language_pack(monkeypatch):
    monkeypatch.setattr(main, "_require_ocr_languages", lambda lang: (_ for _ in ()).throw(main.HTTPException(422, "OCR language data not installed: xyz.")))
    r = c.post("/pdf/ocr", files={"file": up(mk(1, text=False))}, data={"lang": "eng"})
    assert r.status_code == 422 and "language data not installed" in r.json()["detail"]

def test_admin_analytics_requires_allowlisted_email(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "analytics.db"))
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")
    user_token = main.make_token(1, "user@example.com")
    admin_token = main.make_token(2, "admin@example.com")
    assert c.get("/admin/analytics", headers={"Authorization": f"Bearer {user_token}"}).status_code == 403
    r = c.get("/admin/analytics", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert set(["summary", "features", "daily", "recent_activity", "users"]).issubset(r.json())

def test_admin_analytics_counts_events(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "analytics.db"))
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")
    con = main.db()
    now = __import__("time").time()
    con.execute("INSERT INTO users(email,pw,created) VALUES(?,?,?)", ("person@example.com", "hash", now))
    con.execute("INSERT INTO analytics_events(email,event,path,created) VALUES(?,?,?,?)", ("person@example.com", "login", "/auth/login", now))
    con.execute("INSERT INTO analytics_events(email,event,path,created) VALUES(?,?,?,?)", ("person@example.com", "PDF Tools", "/pdf/merge", now))
    con.commit(); con.close()
    token = main.make_token(99, "admin@example.com")
    result = c.get("/admin/analytics?days=7", headers={"Authorization": f"Bearer {token}"}).json()
    assert result["summary"]["total_users"] == 1
    assert result["summary"]["active_users"] == 1
    assert result["summary"]["logins"] == 1
    assert result["features"][0]["name"] == "PDF Tools"


# ---- audit additions (security + analytics accuracy) ----
def test_admin_address_cannot_be_claimed_without_setup_key(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "adm.db"))
    monkeypatch.setenv("ADMIN_EMAILS", "boss@example.com"); monkeypatch.setenv("ADMIN_SETUP_KEY", "setup-key-123")
    body = {"email": "boss@example.com", "password": "password123"}
    assert c.post("/auth/register", json=body).status_code == 403
    assert c.post("/auth/register", json={**body, "admin_key": "wrong"}).status_code == 403
    r = c.post("/auth/register", json={**body, "admin_key": "setup-key-123"})
    assert r.status_code == 200 and r.json()["admin"] is True

def test_admin_address_stays_reserved_when_no_setup_key_configured(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "adm2.db"))
    monkeypatch.setenv("ADMIN_EMAILS", "boss@example.com"); monkeypatch.delenv("ADMIN_SETUP_KEY", raising=False)
    assert c.post("/auth/register", json={"email": "boss@example.com", "password": "password123", "admin_key": ""}).status_code == 403

def test_failed_requests_are_not_counted_as_feature_use(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "an.db"))
    h = {"Authorization": "Bearer " + main.make_token(5, "u@example.com")}
    def events():
        con = main.db()
        try: return con.execute("SELECT COUNT(*) FROM analytics_events").fetchone()[0]
        finally: con.close()
    assert c.post("/pdf/split", files={"file": up(mk(2))}, data={"pages": "1-9"}, headers=h).status_code == 422
    assert events() == 0
    assert c.post("/pdf/text", files={"file": up(mk(1))}, headers=h).status_code == 200
    assert events() == 1

def test_token_without_exp_is_rejected(monkeypatch):
    import jwt
    monkeypatch.setattr(main, "AUTH_REQUIRED", True)
    tok = jwt.encode({"sub": "1", "email": "a@x.com"}, main.JWT_SECRET, algorithm="HS256")
    assert c.get("/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401

def test_forgot_does_not_reveal_whether_account_exists(monkeypatch, tmp_path):
    import extras
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "f.db")); monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    def boom(*a, **k): raise main.HTTPException(502, "Could not send the email.")
    monkeypatch.setattr(extras, "_mail", boom)
    c.post("/auth/register", json={"email": "real@x.com", "password": "password123"})
    assert c.post("/auth/forgot", json={"email": "real@x.com"}).status_code == 200
    assert c.post("/auth/forgot", json={"email": "ghost@x.com"}).status_code == 200
