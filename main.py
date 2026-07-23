"""Metal serial number reader: S captures and reads, Q quits."""

import re
import sys

import cv2
import easyocr
import numpy as np


PREFERRED_CAMERA_ID = 0
CAMERA_IDS_TO_TRY = range(4)
MINIMUM_CONFIDENCE = 0.30
WINDOW_NAME = "Metal Serial Number Reader"


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
    reader: easyocr.Reader,
    image: np.ndarray,
    minimum_confidence: float = MINIMUM_CONFIDENCE,
) -> tuple[str, float, str, np.ndarray]:
    """Read every image variant and return the highest-confidence digit sequence."""
    processed_images = preprocess_image(image)
    best_number = ""
    best_confidence = 0.0
    best_variant, best_image = processed_images[0]

    for variant_name, processed_image in processed_images:
        results = reader.readtext(
            processed_image,
            detail=1,
            paragraph=False,
            allowlist="0123456789",
        )
        results.sort(key=lambda result: result[0][0][0])
        number_parts: list[str] = []
        confidence_values: list[float] = []

        for _, detected_text, confidence in results:
            numeric_text = re.sub(r"[^0-9]", "", detected_text)
            if numeric_text and confidence >= minimum_confidence:
                number_parts.append(numeric_text)
                confidence_values.append(float(confidence))

        if not number_parts:
            continue
        complete_number = "".join(number_parts)
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
    print("Loading EasyOCR...")
    reader = easyocr.Reader(["en"], gpu=False, verbose=False)

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


if __name__ == "__main__":
    raise SystemExit(main())
