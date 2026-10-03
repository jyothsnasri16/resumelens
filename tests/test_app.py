import pytest

from app import create_app
from services import analyzer
from services.parser import ParseError, extract_text


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(analyzer, "analyze_resume", lambda text: {"summary": "ok"})
    monkeypatch.setattr(analyzer, "match_job", lambda *a: {"score": 80, "applicable": True})
    return create_app().test_client()


def test_txt_extraction():
    assert extract_text("cv.txt", b"Python   developer") == "Python developer"


def test_rejects_unknown_type():
    with pytest.raises(ParseError):
        extract_text("cv.exe", b"x")


def test_resume_too_short(client):
    assert client.post("/api/resume", data={"text": "hi"}).status_code == 400


def test_resume_ok(client):
    r = client.post("/api/resume", data={"text": "Python developer " * 10})
    assert r.status_code == 200 and r.json["analysis"]["summary"] == "ok"


def test_match_requires_job_description(client):
    r = client.post("/api/match", json={"resume_text": "x" * 100, "jd": "short"})
    assert r.status_code == 400
