import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.pdf_service import _guess_mime_type, _read_image_dimensions, _score_equation_image_candidate


class PdfServiceTests(unittest.TestCase):
    def test_guess_png_mime_type(self) -> None:
        image_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
        self.assertEqual(_guess_mime_type(image_bytes), "image/png")

    def test_read_png_dimensions(self) -> None:
        width = 320
        height = 80
        image_bytes = (
            b"\x89PNG\r\n\x1a\n"
            + b"\x00" * 8
            + width.to_bytes(4, "big")
            + height.to_bytes(4, "big")
            + b"\x00" * 16
        )
        self.assertEqual(_read_image_dimensions(image_bytes, "image/png"), (320, 80))

    def test_scores_wide_equation_images_higher(self) -> None:
        score = _score_equation_image_candidate(b"\x89PNG\r\n\x1a\n" + b"\x00" * 50_000, 640, 120)
        self.assertGreaterEqual(score, 4.0)


if __name__ == "__main__":
    unittest.main()
