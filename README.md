# Metal Serial Number Reader

ForgeLens is a camera and image-upload interface for reading engraved or stamped metal serial numbers. It compares multiple enhanced image variants and uses PaddleOCR to return digits with a confidence score.

## First-time setup

```powershell
cd C:\incoming
python -m venv venv
.\venv\Scripts\python.exe -m pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
```

## Run

```powershell
cd C:\incoming
.\venv\Scripts\streamlit.exe run streamlit_app.py
```

Open the local URL shown in the terminal. Capture a photo with the browser camera or upload an existing image. Processing starts automatically, and the camera resets when the result is ready. The first scan may take a moment while PaddleOCR loads; later scans are faster.

The original OpenCV desktop interface remains available with `python main.py`.
