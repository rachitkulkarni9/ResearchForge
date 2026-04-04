from io import BytesIO

from pypdf import PdfReader


class PdfExtractionService:
    def extract_text_from_bytes(self, pdf_content: bytes) -> str:
        reader = PdfReader(BytesIO(pdf_content))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n\n".join(page.strip() for page in pages if page.strip())
        return text.strip()
