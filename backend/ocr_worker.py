"""Serial-number OCR and filtering logic only."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np

MINIMUM_CONFIDENCE = 0.30
MINIMUM_SERIAL_LENGTH = 7
PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
MODEL_DIRECTORY = PROJECT_DIRECTORY / "models" / "paddleocr"


def create_ocr_reader() -> Any:
    """Create PaddleOCR using the project-local models."""
    from paddleocr import PaddleOCR

    return PaddleOCR(
        lang="en",
        use_angle_cls=False,
        use_gpu=False,
        enable_mkldnn=False,
        show_log=False,
        det_model_dir=str(MODEL_DIRECTORY / "en_PP-OCRv3_det_infer"),
        rec_model_dir=str(MODEL_DIRECTORY / "en_PP-OCRv3_rec_infer"),
        cls_model_dir=str(MODEL_DIRECTORY / "ch_ppocr_mobile_v2.0_cls_infer"),
    )


def preprocess_image(image: np.ndarray) -> list[tuple[str, np.ndarray]]:
    """Create contrast variants so OCR can choose the clearest result."""
    enlarged = cv2.resize(image, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
    enhanced = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(gray)
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


def _box_coordinates(result: tuple[Any, str, float]) -> tuple[float, float, float]:
    try:
        x_values = [float(point[0]) for point in result[0]]
        y_values = [float(point[1]) for point in result[0]]
        return (
            min(x_values),
            (min(y_values) + max(y_values)) / 2,
            max(max(y_values) - min(y_values), 1.0),
        )
    except (IndexError, TypeError, ValueError):
        return (0.0, 0.0, 1.0)


def _extract_results(raw_output: Any) -> list[tuple[Any, str, float]]:
    raw_results = raw_output[0] if raw_output and raw_output[0] is not None else []
    results: list[tuple[Any, str, float]] = []
    for raw_result in raw_results:
        if not isinstance(raw_result, (list, tuple)) or len(raw_result) < 2:
            continue
        try:
            recognition = raw_result[1]
            results.append(
                (raw_result[0], str(recognition[0]), float(recognition[1]))
            )
        except (IndexError, TypeError, ValueError):
            continue
    return results


def _group_digit_rows(
    results: list[tuple[Any, str, float]],
    minimum_confidence: float,
) -> list[list[tuple[Any, str, float]]]:
    digit_results = [
        result
        for result in results
        if result[2] >= minimum_confidence
        and re.fullmatch(r"\s*[0-9]+(?:\s+[0-9]+)*\s*", result[1])
    ]
    digit_results.sort(
        key=lambda result: (
            _box_coordinates(result)[1],
            _box_coordinates(result)[0],
        )
    )

    rows: list[list[tuple[Any, str, float]]] = []
    for result in digit_results:
        _, center_y, height = _box_coordinates(result)
        matching_row = None
        for row in rows:
            row_centers = [_box_coordinates(item)[1] for item in row]
            row_heights = [_box_coordinates(item)[2] for item in row]
            row_center = sum(row_centers) / len(row_centers)
            row_height = sum(row_heights) / len(row_heights)
            if abs(center_y - row_center) <= 0.5 * max(height, row_height):
                matching_row = row
                break
        if matching_row is None:
            rows.append([result])
        else:
            matching_row.append(result)
    return rows


def read_serial_number(
    reader: Any,
    image: np.ndarray,
    minimum_confidence: float = MINIMUM_CONFIDENCE,
) -> tuple[str, float, str, np.ndarray]:
    """Return the best digit-only serial row containing at least seven digits."""
    processed_images = preprocess_image(image)
    best_number = ""
    best_confidence = 0.0
    best_variant, best_image = processed_images[0]

    for variant_name, processed_image in processed_images:
        results = _extract_results(reader.ocr(processed_image, cls=False))
        for row in _group_digit_rows(results, minimum_confidence):
            row.sort(key=lambda result: _box_coordinates(result)[0])
            complete_number = "".join(
                re.sub(r"\s", "", detected_text)
                for _, detected_text, _ in row
            )
            if len(complete_number) < MINIMUM_SERIAL_LENGTH:
                continue
            confidence = sum(item[2] for item in row) / len(row)
            if confidence > best_confidence:
                best_number = complete_number
                best_confidence = confidence
                best_variant = variant_name
                best_image = processed_image

    return best_number, best_confidence, best_variant, best_image


def run_worker() -> None:
    """Read image jobs from stdin and emit one JSON OCR result per line."""
    reader = None
    for line in sys.stdin:
        request: dict[str, Any] = {}
        try:
            request = json.loads(line)
            if reader is None:
                reader = create_ocr_reader()
            image = cv2.imread(str(request["image_path"]), cv2.IMREAD_COLOR)
            if image is None:
                raise ValueError("The image could not be decoded.")
            serial, confidence, variant, _ = read_serial_number(
                reader,
                image,
                minimum_confidence=float(request.get("minimum_confidence", 0.30)),
            )
            response = {
                "id": request["id"],
                "detected": bool(serial),
                "serial_number": serial or None,
                "confidence": round(confidence, 4),
                "enhancement": variant if serial else None,
            }
        except Exception as error:
            response = {
                "id": request.get("id"),
                "error": str(error),
            }
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    run_worker()
