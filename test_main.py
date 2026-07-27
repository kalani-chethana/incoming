import unittest
from unittest.mock import patch

import numpy as np

from main import read_serial_number


def ocr_item(text: str, confidence: float, left: float, top: float):
    box = [
        [left, top],
        [left + 80, top],
        [left + 80, top + 20],
        [left, top + 20],
    ]
    return [box, [text, confidence]]


class FakeReader:
    def __init__(self, results):
        self.results = results

    def ocr(self, _image, cls=False):
        return [self.results]


class ReadSerialNumberTests(unittest.TestCase):
    def read(self, results):
        image = np.zeros((10, 10, 3), dtype=np.uint8)
        with patch("main.preprocess_image", return_value=[("Test", image)]):
            return read_serial_number(FakeReader(results), image)

    def test_rejects_alphanumeric_weight_label(self):
        serial, _, _, _ = self.read(
            [
                ocr_item("25lb", 0.99, 100, 10),
                ocr_item("7708207", 0.90, 100, 45),
            ]
        )
        self.assertEqual(serial, "7708207")

    def test_does_not_join_numeric_text_from_another_row(self):
        serial, _, _, _ = self.read(
            [
                ocr_item("25", 0.99, 100, 10),
                ocr_item("7708207", 0.90, 100, 45),
            ]
        )
        self.assertEqual(serial, "7708207")

    def test_joins_serial_fragments_only_on_the_same_row(self):
        serial, _, _, _ = self.read(
            [
                ocr_item("770", 0.90, 100, 45),
                ocr_item("8207", 0.88, 190, 46),
            ]
        )
        self.assertEqual(serial, "7708207")

    def test_rejects_six_digit_number(self):
        serial, _, _, _ = self.read([ocr_item("123456", 0.99, 100, 45)])
        self.assertEqual(serial, "")


if __name__ == "__main__":
    unittest.main()
