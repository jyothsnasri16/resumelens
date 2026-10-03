"""Turn an uploaded resume (PDF, DOCX, TXT) into clean plain text."""
import io
import re

from docx import Document
from pypdf import PdfReader


class ParseError(ValueError):
    """Raised with a user-friendly message when a file cannot be read."""


def extract_text(filename: str, data: bytes) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    try:
        if ext == "pdf":
            text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages)
        elif ext == "docx":
            text = "\n".join(p.text for p in Document(io.BytesIO(data)).paragraphs)
        elif ext in ("txt", "md"):
            text = data.decode("utf-8", errors="ignore")
        else:
            raise ParseError("Upload a PDF, DOCX or TXT file.")
    except ParseError:
        raise
    except Exception as exc:  # corrupt or encrypted files
        raise ParseError("That file could not be read. Try another copy or paste the text.") from exc

    text = re.sub(r"[ \t]+", " ", text).strip()
    if not text:
        raise ParseError("No text found. If this is a scanned PDF, paste the text instead.")
    return text
