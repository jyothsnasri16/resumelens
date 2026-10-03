# ResumeLens

Upload a resume, paste a job description, and get an AI fit score, missing skills, a learning roadmap, and
company-specific interview prep. Built with Flask and the Claude API.

## Features
- Resume upload (PDF, DOCX, TXT) or pasted text, with server-side text extraction
- Standalone resume review: skills, strengths, weaknesses, improvements
- Job fit score (0-100). Below 60: missing skills, unmet requirements, learning roadmap
- 60 or above: company-specific interview process, HR questions, technical topics and questions

## Architecture
```
static/            Vanilla JS front end (no build step)
app.py             Flask app factory, routes, validation, error handling
services/parser.py Resume file to clean text
services/analyzer.py All LLM calls (structured output via forced tool use)
tests/             pytest, LLM calls mocked
```
Key decisions
- **Structured output:** the model must call a tool with a JSON schema, so no fragile JSON parsing.
- **Prompt-injection guard:** resume and job text are wrapped in tags and treated as data.
- **Deterministic decision:** the score is clamped and the pass/fail rule lives in code, not in the prompt.
- **Stateless API:** the client sends the resume text back, so there is no database or stored personal data.

## Run it
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # add your ANTHROPIC_API_KEY
python app.py                                         # http://127.0.0.1:5000
pytest
```

## API
| Method | Route | Input | Returns |
|---|---|---|---|
| POST | /api/resume | file or `text` (form data) | `resume_text`, `analysis` |
| POST | /api/match | JSON: `resume_text`, `jd`, `company`, `role` | score, skills, gaps, roadmap |
| POST | /api/prep | same, plus `gaps` | rounds, questions, topics, tips |

## Next steps
Rate limiting, user accounts with saved analyses, streaming responses, Docker deployment.

## Resume bullets
- Built a full-stack AI resume analyzer (Flask, Claude API) that scores resume-to-job fit and generates company-specific interview prep.
- Enforced schema-validated LLM output with forced tool use, plus prompt-injection guards on untrusted resume text.
- Wrote a pytest suite with mocked LLM calls covering file parsing and API validation.
