"""Metal serial number reader: S captures and reads, Q quits."""

import re
import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch

import cv2
import numpy as np


PREFERRED_CAMERA_ID = 0
CAMERA_IDS_TO_TRY = range(4)
MINIMUM_CONFIDENCE = 0.30
MINIMUM_SERIAL_LENGTH = 7
WINDOW_NAME = "Metal Serial Number Reader"
PROJECT_DIRECTORY = Path(__file__).resolve().parent
DETECTION_MODEL = (
    PROJECT_DIRECTORY / "models" / "paddleocr" / "en_PP-OCRv3_det_infer"
)
RECOGNITION_MODEL = (
    PROJECT_DIRECTORY / "models" / "paddleocr" / "en_PP-OCRv3_rec_infer"
)
CLASSIFICATION_MODEL = (
    PROJECT_DIRECTORY / "models" / "paddleocr" / "ch_ppocr_mobile_v2.0_cls_infer"
)


def create_ocr_reader() -> Any:
    """Create PaddleOCR using project-local models with no runtime download."""
    from paddleocr import PaddleOCR

    return PaddleOCR(
        lang="en",
        use_angle_cls=False,
        use_gpu=False,
        enable_mkldnn=False,
        show_log=False,
        det_model_dir=str(DETECTION_MODEL),
        rec_model_dir=str(RECOGNITION_MODEL),
        cls_model_dir=str(CLASSIFICATION_MODEL),
    )


def preprocess_image(image: np.ndarray) -> list[tuple[str, np.ndarray]]:
    """Create contrast variants so OCR can choose the clearest result."""
    enlarged = cv2.resize(image, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (3, 3), 0)
    binary = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        5,
    )
    return [
        ("Original", enlarged),
        ("Enhanced", enhanced),
        ("Binary", binary),
        ("Inverted", cv2.bitwise_not(binary)),
    ]


def read_serial_number(
    reader: Any,
    image: np.ndarray,
    minimum_confidence: float = MINIMUM_CONFIDENCE,
) -> tuple[str, float, str, np.ndarray]:
    """Read every image variant and return the best valid serial-number row."""
    processed_images = preprocess_image(image)
    best_number = ""
    best_confidence = 0.0
    best_variant, best_image = processed_images[0]

    for variant_name, processed_image in processed_images:
        raw_output: Any = reader.ocr(processed_image, cls=False)
        raw_results: Any = (
            raw_output[0]
            if raw_output and raw_output[0] is not None
            else []
        )
        results: list[tuple[Any, str, float]] = []
        for raw_result in raw_results:
            if not isinstance(raw_result, (list, tuple)) or len(raw_result) < 2:
                continue
            try:
                box: Any = raw_result[0]
                recognition: Any = raw_result[1]
                detected_text = str(recognition[0])
                confidence = float(recognition[1])
            except (IndexError, TypeError, ValueError):
                continue
            results.append((box, detected_text, confidence))

        def box_coordinates(result: tuple[Any, str, float]) -> tuple[float, float, float]:
            try:
                points = result[0]
                x_values = [float(point[0]) for point in points]
                y_values = [float(point[1]) for point in points]
                return (
                    min(x_values),
                    (min(y_values) + max(y_values)) / 2,
                    max(max(y_values) - min(y_values), 1.0),
                )
            except (IndexError, TypeError, ValueError):
                return (0.0, 0.0, 1.0)

        # Keep only digit-only OCR boxes. In particular, do not turn labels such
        # as "25lb" into a false serial fragment by stripping their letters.
        digit_results = [
            result
            for result in results
            if result[2] >= minimum_confidence
            and re.fullmatch(r"\s*[0-9]+(?:\s+[0-9]+)*\s*", result[1])
        ]
        digit_results.sort(key=lambda result: (box_coordinates(result)[1], box_coordinates(result)[0]))

        rows: list[list[tuple[Any, str, float]]] = []
        for result in digit_results:
            _, center_y, height = box_coordinates(result)
            matching_row: list[tuple[Any, str, float]] | None = None
            for row in rows:
                row_centers = [box_coordinates(item)[1] for item in row]
                row_heights = [box_coordinates(item)[2] for item in row]
                row_center = sum(row_centers) / len(row_centers)
                row_height = sum(row_heights) / len(row_heights)
                if abs(center_y - row_center) <= 0.5 * max(height, row_height):
                    matching_row = row
                    break
            if matching_row is None:
                rows.append([result])
            else:
                matching_row.append(result)

        for row in rows:
            row.sort(key=lambda result: box_coordinates(result)[0])
            complete_number = "".join(
                re.sub(r"\s", "", detected_text)
                for _, detected_text, _ in row
            )
            if len(complete_number) < MINIMUM_SERIAL_LENGTH:
                continue

            confidence_values = [confidence for _, _, confidence in row]
            average_confidence = sum(confidence_values) / len(confidence_values)
            if average_confidence > best_confidence:
                best_number = complete_number
                best_confidence = average_confidence
                best_variant = variant_name
                best_image = processed_image

    return best_number, best_confidence, best_variant, best_image


def open_camera(
    preferred_camera_id: int = PREFERRED_CAMERA_ID,
) -> tuple[cv2.VideoCapture | None, int | None]:
    """Open the preferred camera, falling back to other common camera indexes."""
    camera_ids = [preferred_camera_id]
    camera_ids.extend(
        camera_id
        for camera_id in CAMERA_IDS_TO_TRY
        if camera_id != preferred_camera_id
    )

    previous_log_level = cv2.getLogLevel()
    cv2.setLogLevel(0)
    try:
        for camera_id in camera_ids:
            camera = cv2.VideoCapture(camera_id, cv2.CAP_DSHOW)
            if not camera.isOpened():
                camera.release()
                camera = cv2.VideoCapture(camera_id)

            if camera.isOpened():
                camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
                camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
                return camera, camera_id

            camera.release()
    finally:
        cv2.setLogLevel(previous_log_level)

    return None, None


def main() -> int:
    camera, camera_id = open_camera()
    if camera is None:
        print(
            "Error: no camera could be opened (tried indexes 0 through 3).\n"
            "Close other camera apps, connect a camera, and try again.",
            file=sys.stderr,
        )
        return 1

    print(f"Using camera {camera_id}")
    print("Loading PaddleOCR...")
    reader = create_ocr_reader()

    detected_serial = "Not captured"
    detected_confidence = 0.0
    print("Metal Serial Number Reader")
    print("Press S in the camera window to capture and read")
    print("Press Q in the camera window to close")

    try:
        while True:
            success, frame = camera.read()
            if not success:
                print("Cannot read camera frame")
                break

            displayed_frame = frame.copy()
            cv2.putText(
                displayed_frame,
                f"Serial: {detected_serial}",
                (30, 50),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.0,
                (0, 255, 0),
                2,
            )
            cv2.putText(
                displayed_frame,
                f"Confidence: {detected_confidence:.2f}",
                (30, 90),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0),
                2,
            )
            cv2.putText(
                displayed_frame,
                "S: Capture and read | Q: Quit",
                (30, displayed_frame.shape[0] - 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 255),
                2,
            )
            cv2.imshow(WINDOW_NAME, displayed_frame)
            key = cv2.waitKey(1) & 0xFF

            if key in (ord("s"), ord("S")):
                print("Reading serial number...")
                serial, confidence, variant, processed = read_serial_number(reader, frame)
                if serial:
                    detected_serial = serial
                    detected_confidence = confidence
                    print(f"Detected serial number: {serial}")
                    print(f"Confidence: {confidence:.2f} ({variant})")
                else:
                    detected_serial = "Not detected"
                    detected_confidence = 0.0
                    print("Serial number not detected")
                cv2.imshow("Processed Image", processed)
            elif key in (ord("q"), ord("Q")):
                break
    finally:
        camera.release()
        cv2.destroyAllWindows()

    return 0


def _ocr_item(text: str, confidence: float, left: float, top: float):
    """Build one fake PaddleOCR result for the embedded tests."""
    box = [
        [left, top],
        [left + 80, top],
        [left + 80, top + 20],
        [left, top + 20],
    ]
    return [box, [text, confidence]]


class _FakeReader:
    def __init__(self, results):
        self.results = results

    def ocr(self, _image, cls=False):
        return [self.results]


class ReadSerialNumberTests(unittest.TestCase):
    def read(self, results):
        image = np.zeros((10, 10, 3), dtype=np.uint8)
        with patch(f"{__name__}.preprocess_image", return_value=[("Test", image)]):
            return read_serial_number(_FakeReader(results), image)

    def test_rejects_alphanumeric_weight_label(self):
        serial, _, _, _ = self.read(
            [
                _ocr_item("25lb", 0.99, 100, 10),
                _ocr_item("7708207", 0.90, 100, 45),
            ]
        )
        self.assertEqual(serial, "7708207")

    def test_does_not_join_numeric_text_from_another_row(self):
        serial, _, _, _ = self.read(
            [
                _ocr_item("25", 0.99, 100, 10),
                _ocr_item("7708207", 0.90, 100, 45),
            ]
        )
        self.assertEqual(serial, "7708207")

    def test_joins_serial_fragments_only_on_the_same_row(self):
        serial, _, _, _ = self.read(
            [
                _ocr_item("770", 0.90, 100, 45),
                _ocr_item("8207", 0.88, 190, 46),
            ]
        )
        self.assertEqual(serial, "7708207")

    def test_rejects_six_digit_number(self):
        serial, _, _, _ = self.read([_ocr_item("123456", 0.99, 100, 45)])
        self.assertEqual(serial, "")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        unittest.main(argv=[sys.argv[0]])
    else:
        raise SystemExit(main())
