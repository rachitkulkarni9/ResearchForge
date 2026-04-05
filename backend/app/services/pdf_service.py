import struct
from io import BytesIO
from typing import Any

from pypdf import PdfReader


def _guess_mime_type(image_bytes: bytes) -> str | None:
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if image_bytes.startswith(b"GIF87a") or image_bytes.startswith(b"GIF89a"):
        return "image/gif"
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    if image_bytes.startswith(b"BM"):
        return "image/bmp"
    return None


def _read_image_dimensions(image_bytes: bytes, mime_type: str | None) -> tuple[int | None, int | None]:
    try:
        if mime_type == "image/png" and len(image_bytes) >= 24:
            width, height = struct.unpack(">II", image_bytes[16:24])
            return width, height

        if mime_type == "image/gif" and len(image_bytes) >= 10:
            width, height = struct.unpack("<HH", image_bytes[6:10])
            return width, height

        if mime_type == "image/bmp" and len(image_bytes) >= 26:
            width, height = struct.unpack("<ii", image_bytes[18:26])
            return abs(width), abs(height)

        if mime_type == "image/jpeg":
            index = 2
            while index + 9 < len(image_bytes):
                if image_bytes[index] != 0xFF:
                    index += 1
                    continue
                marker = image_bytes[index + 1]
                if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                    block_length = struct.unpack(">H", image_bytes[index + 2:index + 4])[0]
                    if index + 2 + block_length > len(image_bytes):
                        break
                    height, width = struct.unpack(">HH", image_bytes[index + 5:index + 9])
                    return width, height
                if marker in {0xD8, 0xD9}:
                    index += 2
                    continue
                block_length = struct.unpack(">H", image_bytes[index + 2:index + 4])[0]
                index += 2 + block_length
    except Exception:
        return None, None

    return None, None


def _score_equation_image_candidate(image_bytes: bytes, width: int | None, height: int | None) -> float:
    byte_size = len(image_bytes)
    score = 0.0

    if 800 <= byte_size <= 400_000:
        score += 1.5
    if 4_000 <= byte_size <= 180_000:
        score += 1.5

    if width and height:
        area = width * height
        aspect_ratio = width / max(height, 1)
        if 10_000 <= area <= 1_800_000:
            score += 1.5
        if aspect_ratio >= 1.6:
            score += 2.5
        elif aspect_ratio >= 1.2:
            score += 1.0
        if height <= 500:
            score += 0.75

    return score


class PdfExtractionService:
    def extract_text_from_bytes(self, pdf_content: bytes) -> str:
        reader = PdfReader(BytesIO(pdf_content))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n\n".join(page.strip() for page in pages if page.strip())
        return text.strip()

    def extract_equation_images_from_bytes(self, pdf_content: bytes, limit: int = 6) -> list[dict[str, Any]]:
        reader = PdfReader(BytesIO(pdf_content))
        candidates: list[dict[str, Any]] = []

        for page_index, page in enumerate(reader.pages, start=1):
            for image_index, image in enumerate(page.images):
                image_bytes = image.data
                mime_type = _guess_mime_type(image_bytes)
                if not mime_type:
                    continue
                width, height = _read_image_dimensions(image_bytes, mime_type)
                score = _score_equation_image_candidate(image_bytes, width, height)
                if score < 2.0:
                    continue
                candidates.append(
                    {
                        "page": page_index,
                        "index": image_index,
                        "name": getattr(image, "name", f"image-{page_index}-{image_index}"),
                        "mime_type": mime_type,
                        "data": image_bytes,
                        "width": width,
                        "height": height,
                        "score": score,
                    }
                )

        candidates.sort(key=lambda item: item["score"], reverse=True)
        return candidates[:limit]
