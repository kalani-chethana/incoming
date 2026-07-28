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
    enlarged = cv2.resize(image, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
    enhanced = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(gray)
    soft = cv2.GaussianBlur(enhanced, (0, 0), 1.2)
    sharpened = cv2.addWeighted(enhanced, 1.9, soft, -0.9, 0)
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
        ("Sharpened", sharpened),
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
    digit_results: list[tuple[Any, str, float]] = []
    for box, detected_text, confidence in results:
        normalized_text = _normalize_ocr_serial_text(detected_text)
        if (
            confidence >= minimum_confidence
            and re.fullmatch(
                r"\s*[0-9]+(?:\s*[-]\s*[0-9]+)*(?:\s+[0-9]+)*\s*",
                normalized_text,
            )
        ):
            digit_results.append((box, normalized_text, confidence))
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


def _group_text_rows(
    results: list[tuple[Any, str, float]],
    minimum_confidence: float,
) -> list[list[tuple[Any, str, float]]]:
    """Group OCR fragments that are physically printed on the same row."""
    accepted = [result for result in results if result[2] >= minimum_confidence]
    accepted.sort(
        key=lambda result: (_box_coordinates(result)[1], _box_coordinates(result)[0])
    )
    rows: list[list[tuple[Any, str, float]]] = []
    for result in accepted:
        _, center_y, height = _box_coordinates(result)
        matching_row = None
        for row in rows:
            centers = [_box_coordinates(item)[1] for item in row]
            heights = [_box_coordinates(item)[2] for item in row]
            if abs(center_y - sum(centers) / len(centers)) <= 0.5 * max(
                height, sum(heights) / len(heights)
            ):
                matching_row = row
                break
        if matching_row is None:
            rows.append([result])
        else:
            matching_row.append(result)
    for row in rows:
        row.sort(key=lambda result: _box_coordinates(result)[0])
    return rows


def _normalize_ocr_serial_text(detected_text: str) -> str:
    """Correct common OCR substitutions found in small engraved serials."""
    character_map = str.maketrans(
        {
            "O": "0",
            "Q": "0",
            "I": "1",
            "L": "1",
            "|": "1",
            "Z": "2",
            "S": "5",
            "G": "6",
            "B": "8",
            "_": "-",
            "–": "-",
            "—": "-",
            ".": "-",
        }
    )
    return detected_text.upper().translate(character_map)


def _without_weight_fragments(
    results: list[tuple[Any, str, float]],
) -> list[tuple[Any, str, float]]:
    """Exclude a numeric box when its next same-row box is a weight unit."""
    weight_units = {"LB", "LBS", "KG", "G", "IB", "1B"}
    excluded: set[int] = set()
    for unit_index, unit_result in enumerate(results):
        unit_text = re.sub(r"[^A-Z0-9]", "", unit_result[1].upper())
        if unit_text not in weight_units:
            continue
        unit_x, unit_y, unit_height = _box_coordinates(unit_result)
        nearest_index = None
        nearest_gap = float("inf")
        for number_index, number_result in enumerate(results):
            number_text = number_result[1].strip()
            if not re.fullmatch(r"\d+(?:\.\d+)?", number_text):
                continue
            number_x, number_y, number_height = _box_coordinates(number_result)
            if number_x >= unit_x:
                continue
            if abs(number_y - unit_y) > 0.5 * max(number_height, unit_height):
                continue
            gap = unit_x - number_x
            if gap < nearest_gap:
                nearest_gap = gap
                nearest_index = number_index
        if nearest_index is not None:
            excluded.add(nearest_index)
        excluded.add(unit_index)
    return [result for index, result in enumerate(results) if index not in excluded]


def _format_serial(detected_text: str) -> str:
    """Preserve the detected hyphen/space pattern in grouped serials."""
    stripped_text = detected_text.strip()
    digits = re.sub(r"[^0-9]", "", stripped_text)
    groups = re.findall(r"[0-9]+", stripped_text)
    group_lengths = [len(group) for group in groups]
    separators = re.findall(r"[^0-9]+", stripped_text)
    if len(digits) == 8 and group_lengths in ([2, 4, 2], [2, 6]):
        normalized_separators = [
            "-" if "-" in separator else " "
            for separator in separators
        ]
        return "".join(
            group + (
                normalized_separators[index]
                if index < len(normalized_separators)
                else ""
            )
            for index, group in enumerate(groups)
        )
    return re.sub(r"\s", "", stripped_text)


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
        results = _without_weight_fragments(results)
        for row in _group_digit_rows(results, minimum_confidence):
            row.sort(key=lambda result: _box_coordinates(result)[0])
            combined_text = " ".join(
                detected_text.strip()
                for _, detected_text, _ in row
            )
            complete_number = _format_serial(combined_text)
            digit_count = len(re.sub(r"[^0-9]", "", complete_number))
            if digit_count < MINIMUM_SERIAL_LENGTH:
                continue
            confidence = sum(item[2] for item in row) / len(row)
            if confidence > best_confidence:
                best_number = complete_number
                best_confidence = confidence
                best_variant = variant_name
                best_image = processed_image

    return best_number, best_confidence, best_variant, best_image


def read_typed_value(
    reader: Any,
    image: np.ndarray,
    check_type: str,
    minimum_confidence: float = MINIMUM_CONFIDENCE,
) -> tuple[str, float, str]:
    """Read one value according to the active UI step."""
    if check_type == "serial":
        value, confidence, variant, _ = read_serial_number(
            reader, image, minimum_confidence
        )
        return value, confidence, variant

    patterns = {
        "part": re.compile(r"^\d+(?:[ -]\d+)*$"),
        "weight": re.compile(r"^\d+(?:\.\d+)?\s*(?:LB|LBS|KG|G)$", re.I),
    }
    pattern = patterns.get(check_type)
    if pattern is None:
        raise ValueError("check_type must be serial, part, or weight.")

    best_value, best_confidence, best_variant = "", 0.0, ""
    best_digit_count = 0
    for variant_name, processed_image in preprocess_image(image):
        results = _extract_results(reader.ocr(processed_image, cls=False))
        candidates = [(text, confidence) for _, text, confidence in results]
        for row in _group_text_rows(results, minimum_confidence):
            # Try contiguous fragments as well as the complete row. PaddleOCR
            # commonly returns "25" and "lb" as two boxes on the same line.
            for start in range(len(row)):
                for end in range(start + 2, len(row) + 1):
                    section = row[start:end]
                    combined = "".join(item[1].strip() for item in section)
                    spaced = " ".join(item[1].strip() for item in section)
                    confidence = sum(item[2] for item in section) / len(section)
                    candidates.append((combined, confidence))
                    candidates.append((spaced, confidence))

        for text, confidence in candidates:
            if check_type == "part":
                normalized = _normalize_ocr_serial_text(text).strip()
                normalized = re.sub(r"\s*-\s*", "-", normalized)
                normalized = re.sub(r"\s+", " ", normalized)
            else:
                # Keep LB/KG unit letters; the serial correction map changes
                # L/B/G into digits and is intentionally not used for weight.
                normalized = re.sub(r"\s+", "", text).upper()
                normalized = re.sub(r"(?<=\d)(?:IB|1B)$", "LB", normalized)
            enough_digits = (
                check_type != "part"
                or len(re.sub(r"[^0-9]", "", normalized)) >= 4
            )
            if (
                confidence >= minimum_confidence
                and enough_digits
                and pattern.fullmatch(normalized)
            ):
                digit_count = len(re.sub(r"[^0-9]", "", normalized))
                is_better = (
                    digit_count > best_digit_count
                    if check_type == "part"
                    else confidence > best_confidence
                )
                if (
                    is_better
                    or (
                        check_type == "part"
                        and digit_count == best_digit_count
                        and confidence > best_confidence
                    )
                ):
                    best_value = normalized
                    best_confidence = confidence
                    best_variant = variant_name
                    best_digit_count = digit_count
    return best_value, best_confidence, best_variant


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
            check_type = str(request.get("check_type", "serial"))
            value, confidence, variant = read_typed_value(
                reader,
                image,
                check_type,
                minimum_confidence=float(request.get("minimum_confidence", 0.30)),
            )
            response = {
                "id": request["id"],
                "detected": bool(value),
                "value": value or None,
                "serial_number": value or None,
                "check_type": check_type,
                "confidence": round(confidence, 4),
                "enhancement": variant if value else None,
            }
        except Exception as error:
            response = {
                "id": request.get("id"),
                "error": str(error),
            }
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    run_worker()
