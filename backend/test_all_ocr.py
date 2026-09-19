import json
import sys
from pathlib import Path

backend_dir = Path("c:/incoming/backend")
sys.path.insert(0, str(backend_dir))
import ocr_worker
import cv2

temp_dir = Path("c:/incoming/data/temp")
images = sorted(list(temp_dir.glob("*.jpg")))
reader = ocr_worker.create_ocr_reader()

print(f"=== TESTING {len(images)} CAPTURED IMAGES ===")
for i, img_path in enumerate(images):
    img = cv2.imread(str(img_path))
    if img is None:
        continue
    res = ocr_worker.read_multi_values(
        reader,
        img,
        ["serial", "part", "weight"],
        minimum_confidence=0.3,
        expected_part="07-1076 05",
    )
    print(f"\nImage {i+1} [{img_path.name[:8]}...]:")
    for k in ["serial", "part", "weight"]:
        v = res[k]["value"]
        c = res[k]["confidence"]
        var = res[k]["variant"]
        print(f"  {k:7s}: '{v}' (conf: {c:.2f}, variant: {var})")
