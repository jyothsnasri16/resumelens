import logging

from dotenv import load_dotenv
from flask import Flask, jsonify, request

load_dotenv()
log = logging.getLogger(__name__)

from services import analyzer  # noqa: E402  (after load_dotenv so the model env var is read)
from services.parser import ParseError, extract_text  # noqa: E402
from services import search as search_service  # noqa: E402


def fail(message: str, status: int = 400):
    return jsonify(error=message), status


def create_app() -> Flask:
    app = Flask(__name__, static_folder="static", static_url_path="")
    app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB uploads

    @app.get("/")
    def index():
        return app.send_static_file("index.html")

    @app.post("/api/resume")
    def resume():
        """Accepts a file upload or pasted text, returns the text plus a standalone review."""
        try:
            f = request.files.get("file")
            text = extract_text(f.filename, f.read()) if f else (request.form.get("text") or "")
        except ParseError as exc:
            return fail(str(exc))
        text = text.strip()
        if len(text) < 80:
            return fail("The resume looks too short. Add more detail or upload a file.")
        return jsonify(resume_text=text, analysis=analyzer.analyze_resume(text))

    def job_payload():
        data = request.get_json(silent=True) or {}
        resume_text, jd = (data.get("resume_text") or "").strip(), (data.get("jd") or "").strip()
        if not resume_text:
            return None, fail("Analyze a resume first.")
        if len(jd) < 40:
            return None, fail("Paste the full job description.")
        company = (data.get("company") or "the company").strip()[:80]
        role = (data.get("role") or "this role").strip()[:80]
        return (resume_text, jd, company, role, data.get("gaps") or []), None

    @app.post("/api/match")
    def match():
        payload, error = job_payload()
        if error:
            return error
        resume_text = payload[0]
        result = analyzer.match_job(*payload[:4])
        log.info("MATCH resume[0:60]=%r len=%d -> score=%s",
                  resume_text[:60], len(resume_text), result.get("score"))
        return jsonify(result)

    @app.post("/api/prep")
    def prep():
        payload, error = job_payload()
        return error or jsonify(analyzer.interview_prep(*payload))

    @app.post("/api/real-questions")
    def real_questions():
        data = request.get_json(silent=True) or {}
        company, role = (data.get("company") or "").strip()[:80], (data.get("role") or "").strip()[:80]
        if not company or not role:
            return fail("Enter a company and role first.")
        try:
            snippets = search_service.find_interview_questions(company, role)
        except search_service.SearchError as exc:
            return fail(str(exc), 502)
        result = analyzer.real_interview_questions(company, role, snippets)
        for q in result.get("questions", []):
            i = q.get("source_index")
            q["source_url"] = snippets[i]["url"] if isinstance(i, int) and 0 <= i < len(snippets) else ""
        return jsonify(result)

    @app.post("/api/real-skills")
    def real_skills():
        data = request.get_json(silent=True) or {}
        resume_text = (data.get("resume_text") or "").strip()
        company, role = (data.get("company") or "").strip()[:80], (data.get("role") or "").strip()[:80]
        if not resume_text:
            return fail("Analyze a resume first.")
        if not role:
            return fail("Enter a role first.")
        try:
            snippets = search_service.find_role_requirements(company, role)
        except search_service.SearchError as exc:
            return fail(str(exc), 502)
        result = analyzer.real_required_skills(resume_text, company, role, snippets)
        for s in result.get("skills", []):
            i = s.get("source_index")
            s["source_url"] = snippets[i]["url"] if isinstance(i, int) and 0 <= i < len(snippets) else ""
        return jsonify(result)

    @app.errorhandler(413)
    def too_large(_):
        return fail("File is larger than 5 MB.", 413)

    @app.errorhandler(analyzer.AIError)
    def ai_error(exc):
        return fail(str(exc), 502)

    @app.errorhandler(search_service.SearchError)
    def search_error(exc):
        return fail(str(exc), 502)

    return app


app = create_app()  # module-level instance, so gunicorn can run with: gunicorn app:app

if __name__ == "__main__":
    app.run(debug=True)