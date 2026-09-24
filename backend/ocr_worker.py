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
    """Create PaddleOCR using the project-local models with hardware acceleration."""
    from paddleocr import PaddleOCR

    return PaddleOCR(
        lang="en",
        use_angle_cls=False,
        use_gpu=False,
        enable_mkldnn=True,
        cpu_threads=4,
        show_log=False,
        det_model_dir=str(MODEL_DIRECTORY / "en_PP-OCRv3_det_infer"),
        rec_model_dir=str(MODEL_DIRECTORY / "en_PP-OCRv3_rec_infer"),
        cls_model_dir=str(MODEL_DIRECTORY / "ch_ppocr_mobile_v2.0_cls_infer"),
    )


def preprocess_image(image: np.ndarray) -> list[tuple[str, np.ndarray]]:
    """Create normal and glare-resistant variants for engraved metal text."""
    height, width = image.shape[:2]

    # Scale only if needed for low-resolution images
    full_scale = 1.2 if max(height, width) >= 1200 else (1.5 if max(height, width) >= 800 else 2.0)
    enlarged = cv2.resize(image, None, fx=full_scale, fy=full_scale, interpolation=cv2.INTER_LINEAR) if full_scale != 1.0 else image

    gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (3, 3), 0)
    binary = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        5,
    )

    # Operators place the engraved area near the center.
    center = image[
        int(height * 0.16):int(height * 0.82),
        int(width * 0.18):int(width * 0.82),
    ]

    center_variants: list[tuple[str, np.ndarray]] = []
    if center.size:
        center_gray = cv2.cvtColor(center, cv2.COLOR_BGR2GRAY)
        center_enhanced = cv2.createCLAHE(
            clipLimit=2.0, tileGridSize=(8, 8)
        ).apply(center_gray)
        center_soft = cv2.GaussianBlur(center_enhanced, (0, 0), 1.1)
        center_sharp = cv2.addWeighted(
            center_enhanced, 1.5, center_soft, -0.5, 0
        )
        center_binary = cv2.adaptiveThreshold(
            center_sharp,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            6,
        )

        # Black-hat and top-hat isolate shallow grooves under uneven reflections:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (35, 9))
        dark_grooves = cv2.morphologyEx(
            center_sharp, cv2.MORPH_BLACKHAT, kernel
        )
        bright_grooves = cv2.morphologyEx(
            center_sharp, cv2.MORPH_TOPHAT, kernel
        )
        dark_grooves = cv2.normalize(
            dark_grooves, None, 0, 255, cv2.NORM_MINMAX
        )
        bright_grooves = cv2.normalize(
            bright_grooves, None, 0, 255, cv2.NORM_MINMAX
        )

        center_variants = [
            ("Center original", center),
            ("Center binary", center_binary),
            ("Center enhanced", center_enhanced),
            ("Center sharpened", center_sharp),
            ("Dark grooves", cv2.bitwise_not(dark_grooves)),
            ("Bright grooves", cv2.bitwise_not(bright_grooves)),
        ]

    # Prioritize clean original camera images first so real spaces and dashes are preserved
    raw_variants: list[tuple[str, np.ndarray] | None] = [
        ("Original", image),
        ("Center original", center) if center.size else None,
        ("Original enlarged", enlarged) if full_scale != 1.0 else None,
        *([v for v in center_variants if v[0] != "Center original"]),
        ("Enhanced", enhanced),
        ("Binary", binary),
    ]
    variants = [v for v in raw_variants if v is not None]
    return variants
    return variants


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
    weight_units = {
        "LB", "LBS", "KG", "KGS", "G", "IB", "1B", "KLB", "KLBS", "K1B", "KIB", "KB",
        "N", "KN", "KGF", "LBF", "T", "TON", "TONNE", "TONNES", "GRAM", "GRAMS",
    }
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


def _extract_serial_from_results(
    results: list[tuple[Any, str, float]],
    minimum_confidence: float = MINIMUM_CONFIDENCE,
    expected_part_digits: str | None = None,
) -> tuple[str, float]:
    """Extract best serial number candidate from an OCR result set."""
    filtered_results = _without_weight_fragments(results)
    best_number = ""
    best_confidence = 0.0
    for row in _group_digit_rows(filtered_results, minimum_confidence):
        row.sort(key=lambda result: _box_coordinates(result)[0])
        combined_text = " ".join(
            detected_text.strip()
            for _, detected_text, _ in row
        )
        complete_number = _format_serial(combined_text)
        digits_only = re.sub(r"[^0-9]", "", complete_number)
        digit_count = len(digits_only)
        if digit_count < MINIMUM_SERIAL_LENGTH:
            continue
        # Never treat expected part number as a serial number
        if expected_part_digits and digits_only == expected_part_digits:
            continue
        confidence = sum(item[2] for item in row) / len(row)
        if confidence > best_confidence:
            best_number = complete_number
            best_confidence = confidence
    return best_number, best_confidence


def _extract_pattern_from_results(
    results: list[tuple[Any, str, float]],
    check_type: str,
    minimum_confidence: float = MINIMUM_CONFIDENCE,
    exclude_digits: set[str] | None = None,
    expected_value: str | None = None,
) -> tuple[str, float]:
    """Extract best part or weight candidate from an OCR result set."""
    patterns = {
        "part": re.compile(r"^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$", re.I),
        "weight": re.compile(
            r"^\d+(?:\.\d+)?\s*(?:KLBS?|K1B|KIB|KB|KGF|LBF|LBS?|1B|IB|KGS?|KN|N|G|T)$",
            re.I,
        ),
    }
    pattern = patterns.get(check_type)
    if pattern is None:
        return "", 0.0

    weight_units_pattern = re.compile(
        r"(?:KLBS?|K1B|KIB|KB|KGF|LBF|LBS?|1B|IB|KGS?|KN|N|G|T)$", re.I
    )

    # Safe exclude set: NEVER exclude the expected part number
    safe_exclude_digits: set[str] = set(exclude_digits or ())
    expected_digits = (
        re.sub(r"[^0-9]", "", expected_value) if expected_value else None
    )
    if expected_digits:
        safe_exclude_digits.discard(expected_digits)

    candidates: list[tuple[str, float]] = []

    # 1. Direct bounding boxes and sub-matches for labeled text (e.g. "PART: 07-1076 05", "CAP: 1klb")
    for _, text, confidence in results:
        candidates.append((text, confidence))
        if check_type == "part":
            sub_matches = re.findall(r"[A-Z0-9]+(?:[ -][A-Z0-9]+)+", text, re.I)
            for sub in sub_matches:
                candidates.append((sub, confidence))
        elif check_type == "weight":
            sub_matches = re.findall(
                r"\d+(?:\.\d+)?\s*(?:KLBS?|K1B|KIB|KB|KGF|LBF|LBS?|1B|IB|KGS?|KN|N|G|T)\b",
                text,
                re.I,
            )
            for sub in sub_matches:
                candidates.append((sub, confidence))

    # 2. Grouped rows for adjacent boxes (e.g. "07-1076" followed by "05", or "1" followed by "klb")
    for row in _group_text_rows(results, minimum_confidence):
        for start in range(len(row)):
            for end in range(start + 2, len(row) + 1):
                section = row[start:end]
                spaced = " ".join(item[1].strip() for item in section)
                confidence = sum(item[2] for item in section) / len(section)
                candidates.append((spaced, confidence))

    best_value, best_confidence = "", 0.0
    best_digit_count = 0

    for text, confidence in candidates:
        if check_type == "part":
            raw_clean = re.sub(r"\s+", "", text)
            # Never treat weight text (containing LB/KG units) as a part number
            if weight_units_pattern.search(raw_clean):
                continue
            normalized = _normalize_ocr_serial_text(text).strip()
            normalized = re.sub(r"\s*-\s*", "-", normalized)
            normalized = re.sub(r"\s+", " ", normalized)
            digits_only = re.sub(r"[^0-9]", "", normalized)

            # Never treat serial number digits as a part number
            if safe_exclude_digits and digits_only in safe_exclude_digits:
                continue
        else:
            normalized = re.sub(r"\s+", "", text).upper()
            # Normalize KLB variations: 1k1b, 1kib, 1klbs, 1kb -> 1KLB
            normalized = re.sub(r"K(?:IB|1B|LB)S?$", "KLB", normalized)
            if (expected_value and "KLB" in expected_value.upper()) or "KB" in normalized:
                normalized = re.sub(r"(?<=\d)KB$", "KLB", normalized)
            # Normalize force units: KGF & LBF
            normalized = re.sub(r"(?<=\d)KGF$", "KGF", normalized)
            normalized = re.sub(r"(?<=\d)LBF$", "LBF", normalized)
            # Normalize LB & KG variations
            normalized = re.sub(r"(?<=\d)(?:IB|1B|LBS)$", "LB", normalized)
            normalized = re.sub(r"(?<=\d)(?:KGS?|K9)$", "KG", normalized)
            # Normalize Newton & Kilonewton
            normalized = re.sub(r"(?<=\d)KN$", "KN", normalized)
            normalized = re.sub(r"(?<=\d)N$", "N", normalized)
            # Normalize Metric Tonne & Gram
            normalized = re.sub(r"(?<=\d)(?:TONNE?S?|T)$", "T", normalized)
            normalized = re.sub(r"(?<=\d)(?:GRAMS?|G)$", "G", normalized)

        enough_digits = (
            check_type != "part"
            or len(re.sub(r"[^0-9]", "", normalized)) >= 4
        )
        if (
            confidence >= minimum_confidence
            and enough_digits
            and pattern.fullmatch(normalized)
        ):
            digits_only = re.sub(r"[^0-9]", "", normalized)
            digit_count = len(digits_only)
            if check_type == "part" and expected_digits:
                matches_expected = (digits_only == expected_digits)
                best_matches_expected = (
                    re.sub(r"[^0-9]", "", best_value) == expected_digits
                    if best_value
                    else False
                )
                if matches_expected and not best_matches_expected:
                    is_better = True
                elif not matches_expected and best_matches_expected:
                    is_better = False
                else:
                    is_better = confidence > best_confidence
            elif check_type == "weight" and expected_value:
                norm_exp = re.sub(r"\s+", "", expected_value).upper()
                norm_exp = re.sub(r"K(?:IB|1B|LB)S?$", "KLB", norm_exp)
                norm_exp = re.sub(r"(?<=\d)KB$", "KLB", norm_exp)
                norm_exp = re.sub(r"(?<=\d)KGF$", "KGF", norm_exp)
                norm_exp = re.sub(r"(?<=\d)LBF$", "LBF", norm_exp)
                norm_exp = re.sub(r"(?<=\d)(?:IB|1B|LBS)$", "LB", norm_exp)
                norm_exp = re.sub(r"(?<=\d)(?:KGS?|K9)$", "KG", norm_exp)
                norm_exp = re.sub(r"(?<=\d)KN$", "KN", norm_exp)
                norm_exp = re.sub(r"(?<=\d)N$", "N", norm_exp)
                norm_exp = re.sub(r"(?<=\d)(?:TONNE?S?|T)$", "T", norm_exp)
                norm_exp = re.sub(r"(?<=\d)(?:GRAMS?|G)$", "G", norm_exp)
                matches_expected = (normalized == norm_exp)
                best_matches_expected = (best_value == norm_exp if best_value else False)
                if matches_expected and not best_matches_expected:
                    is_better = True
                elif not matches_expected and best_matches_expected:
                    is_better = False
                else:
                    is_better = confidence > best_confidence
            else:
                is_better = (
                    digit_count > best_digit_count
                    if check_type == "part"
                    else confidence > best_confidence
                )
                if (
                    check_type == "part"
                    and digit_count == best_digit_count
                    and confidence > best_confidence
                ):
                    is_better = True

            if is_better:
                best_value = normalized
                best_confidence = confidence
                best_digit_count = digit_count
    return best_value, best_confidence


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
        number, confidence = _extract_serial_from_results(
            results, minimum_confidence
        )
        if number and confidence > best_confidence:
            best_number = number
            best_confidence = confidence
            best_variant = variant_name
            best_image = processed_image
            if confidence >= 0.85 and len(re.sub(r"\D", "", number)) >= MINIMUM_SERIAL_LENGTH:
                break

    return best_number, best_confidence, best_variant, best_image


def read_multi_values(
    reader: Any,
    image: np.ndarray,
    check_types: list[str],
    minimum_confidence: float = MINIMUM_CONFIDENCE,
    expected_part: str | None = None,
    expected_weight: str | None = None,
    exclude_serial: str | None = None,
) -> dict[str, dict[str, Any]]:
    """Extract multiple check types (serial, weight, part) with early-exit optimization."""
    targets = set(check_types)
    best_matches: dict[str, dict[str, Any]] = {
        ct: {"value": "", "confidence": 0.0, "variant": ""}
        for ct in ("serial", "part", "weight")
    }

    expected_part_digits = (
        re.sub(r"\D", "", expected_part) if expected_part else None
    )

    exclude_digits: set[str] = set()
    if exclude_serial:
        exclude_digits.add(re.sub(r"\D", "", exclude_serial))
    if expected_part_digits:
        exclude_digits.discard(expected_part_digits)

    all_variant_results: list[tuple[str, list[tuple[Any, str, float]]]] = []
    for variant_name, processed_image in preprocess_image(image):
        results = _extract_results(reader.ocr(processed_image, cls=False))
        all_variant_results.append((variant_name, results))

        if "serial" in targets:
            serial_val, serial_conf = _extract_serial_from_results(
                results, minimum_confidence, expected_part_digits=expected_part_digits
            )
            if serial_val and serial_conf > best_matches["serial"]["confidence"]:
                best_matches["serial"] = {
                    "value": serial_val,
                    "confidence": serial_conf,
                    "variant": variant_name,
                }
                s_digs = re.sub(r"\D", "", serial_val)
                if s_digs and s_digs != expected_part_digits:
                    exclude_digits.add(s_digs)

        if "weight" in targets or "serial" in targets:
            val, conf = _extract_pattern_from_results(
                results, "weight", minimum_confidence, expected_value=expected_weight
            )
            if val and conf > best_matches["weight"]["confidence"]:
                best_matches["weight"] = {
                    "value": val,
                    "confidence": conf,
                    "variant": variant_name,
                }

        if "part" in targets:
            val, conf = _extract_pattern_from_results(
                results,
                "part",
                minimum_confidence,
                exclude_digits=exclude_digits,
                expected_value=expected_part,
            )
            if val:
                cur_digits = re.sub(r"\D", "", val)
                best_val = best_matches["part"]["value"]
                best_digits = re.sub(r"\D", "", best_val) if best_val else ""

                cur_matches_exp = (
                    (cur_digits == expected_part_digits)
                    if expected_part_digits
                    else False
                )
                best_matches_exp = (
                    (best_digits == expected_part_digits)
                    if expected_part_digits and best_val
                    else False
                )

                if cur_matches_exp and not best_matches_exp:
                    is_better = True
                elif not cur_matches_exp and best_matches_exp:
                    is_better = False
                elif len(cur_digits) > len(best_digits):
                    is_better = True
                elif len(cur_digits) < len(best_digits):
                    is_better = False
                elif (
                    best_matches["part"]["variant"] in ("Original", "Center original")
                    and best_matches["part"]["confidence"] >= 0.70
                ):
                    is_better = False
                else:
                    is_better = conf > best_matches["part"]["confidence"]

                if is_better:
                    best_matches["part"] = {
                        "value": val,
                        "confidence": conf,
                        "variant": variant_name,
                    }

        # Early exit check: stop as soon as active step targets are satisfied
        serial_ok = ("serial" not in targets) or (
            bool(best_matches["serial"]["value"])
            and len(re.sub(r"\D", "", best_matches["serial"]["value"])) >= MINIMUM_SERIAL_LENGTH
            and best_matches["serial"]["confidence"] >= 0.55
        )
        part_ok = ("part" not in targets) or (
            bool(best_matches["part"]["value"])
            and (
                (expected_part_digits and re.sub(r"\D", "", best_matches["part"]["value"]) == expected_part_digits)
                or (not expected_part_digits and best_matches["part"]["confidence"] >= 0.55)
            )
        )
        weight_ok = ("weight" not in targets) or (
            bool(best_matches["weight"]["value"])
            and best_matches["weight"]["confidence"] >= 0.55
        )

        if serial_ok and part_ok and weight_ok:
            break

    # Final check: if nothing was selected yet and expected_part is set,
    # do a targeted search for expected_part_digits across all OCR results
    if "part" in targets and not best_matches["part"]["value"] and expected_part_digits:
        for variant_name, results in all_variant_results:
            for _, text, conf in results:
                clean = re.sub(r"\D", "", text)
                if expected_part_digits in clean or clean == expected_part_digits:
                    best_matches["part"] = {
                        "value": text.strip(),
                        "confidence": max(conf, 0.95),
                        "variant": variant_name,
                    }
                    break
            if best_matches["part"]["value"]:
                break

    return best_matches


def read_typed_value(
    reader: Any,
    image: np.ndarray,
    check_type: str,
    minimum_confidence: float = MINIMUM_CONFIDENCE,
    expected_part: str | None = None,
    expected_weight: str | None = None,
    exclude_serial: str | None = None,
) -> tuple[str, float, str]:
    """Read one value according to the active UI step."""
    matches = read_multi_values(
        reader,
        image,
        [check_type],
        minimum_confidence,
        expected_part=expected_part,
        expected_weight=expected_weight,
        exclude_serial=exclude_serial,
    )
    result = matches.get(check_type, {"value": "", "confidence": 0.0, "variant": ""})
    return result["value"], result["confidence"], result["variant"]


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
            check_types = request.get("check_types")
            if not isinstance(check_types, list) or not check_types:
                check_types = ["serial", "part", "weight"]
            if check_type not in check_types:
                check_types.append(check_type)
            expected_part = request.get("expected_part")
            expected_weight = request.get("expected_weight")
            exclude_serial = request.get("exclude_serial")

            multi_results = read_multi_values(
                reader,
                image,
                check_types,
                minimum_confidence=float(request.get("minimum_confidence", 0.30)),
                expected_part=str(expected_part) if expected_part else None,
                expected_weight=str(expected_weight) if expected_weight else None,
                exclude_serial=str(exclude_serial) if exclude_serial else None,
            )
            primary = multi_results.get(
                check_type, {"value": "", "confidence": 0.0, "variant": ""}
            )
            detected_values = {
                k: v["value"] or None for k, v in multi_results.items()
            }
            has_any = any(v["value"] for v in multi_results.values())
            response = {
                "id": request["id"],
                "detected": bool(primary["value"]) or has_any,
                "value": primary["value"] or None,
                "serial_number": multi_results.get("serial", {}).get("value") or None,
                "check_type": check_type,
                "confidence": round(primary["confidence"], 4),
                "enhancement": primary["variant"] if primary["value"] else None,
                "values": detected_values,
            }
        except Exception as error:
            response = {
                "id": request.get("id"),
                "error": str(error),
            }
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    run_worker()
