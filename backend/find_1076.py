import sys
from pathlib import Path
sys.path.insert(0, "c:/incoming/backend")
import ocr_worker, cv2

reader = ocr_worker.create_ocr_reader()
for p in Path("c:/incoming/data/temp").glob("*.jpg"):
    img = cv2.imread(str(p))
    if img is None: continue
    variants = ocr_worker.preprocess_image(img)
    for vname, vimg in variants[:3]:
        res = ocr_worker._extract_results(reader.ocr(vimg, cls=False))
        for box, text, conf in res:
            if "1076" in text or "07" in text:
                print(f"{p.name} [{vname}]: text={repr(text)} conf={conf:.2f}")

