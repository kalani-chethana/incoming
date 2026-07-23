"""Streamlit interface for the metal serial number reader."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO

import cv2
import easyocr
import numpy as np
import pandas as pd
import streamlit as st

from main import read_serial_number


st.set_page_config(
    page_title="ForgeLens serial reader",
    page_icon=":material/document_scanner:",
    layout="wide",
    initial_sidebar_state="collapsed",
)


@st.cache_resource(show_spinner=False)
def load_reader() -> easyocr.Reader:
    """Load the expensive OCR model once for all scans."""
    return easyocr.Reader(["en"], gpu=False, verbose=False)


def decode_image(image_bytes: bytes) -> np.ndarray | None:
    """Decode uploaded image bytes into an OpenCV BGR image."""
    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR)


def encode_png(image: np.ndarray) -> bytes:
    """Encode an OpenCV image as a downloadable PNG."""
    success, encoded = cv2.imencode(".png", image)
    return encoded.tobytes() if success else b""


def initialize_state() -> None:
    defaults = {
        "scan_result": None,
        "scan_history": [],
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


initialize_state()

with st.container(horizontal=True, vertical_alignment="center"):
    with st.container():
        st.title("ForgeLens", anchor=False)
        st.caption("Precision OCR for engraved and stamped metal serial numbers")
    with st.container(horizontal=True, horizontal_alignment="right"):
        st.badge("OCR ready", icon=":material/check_circle:", color="green")
        st.badge("Digits only", icon=":material/pin:", color="blue")

st.space("small")

workspace, results = st.columns([1.45, 1], gap="large", vertical_alignment="top")

with workspace:
    with st.container(border=True):
        st.subheader("Capture a serial", anchor=False)
        st.caption("Fill the frame with one serial number and keep the surface well lit.")

        source = st.segmented_control(
            "Image source",
            ["Camera", "Upload"],
            default="Camera",
            key="image_source",
        )

        image_file = None
        if source == "Camera":
            image_file = st.camera_input(
                "Take a clear photo",
                key="camera_capture",
                help="Use the rear camera on a phone for the sharpest engraving detail.",
            )
        else:
            image_file = st.file_uploader(
                "Choose a photo",
                type=["jpg", "jpeg", "png", "webp"],
                key="image_upload",
                help="Supported formats: JPG, PNG and WebP.",
            )

        with st.expander("Scan settings", icon=":material/tune:"):
            minimum_confidence = st.slider(
                "Minimum character confidence",
                min_value=0.10,
                max_value=0.90,
                value=0.30,
                step=0.05,
                help="Raise this to reject uncertain digits; lower it for faint engravings.",
            )
            show_processed = st.toggle(
                "Show processed image",
                value=True,
                help="Displays the contrast variant that produced the best result.",
            )

        scan_clicked = st.button(
            "Read serial number",
            type="primary",
            icon=":material/document_scanner:",
            disabled=image_file is None,
            width="stretch",
        )

        if image_file is None:
            st.caption(":material/info: Capture or upload an image to enable scanning.")

with results:
    result_panel = st.container(border=True)
    with result_panel:
        st.subheader("Scan result", anchor=False)
        current_result = st.session_state.scan_result

        if current_result is None:
            st.info(
                "Your detected serial number will appear here.",
                icon=":material/center_focus_weak:",
            )
            st.metric("Serial number", "—", border=True)
            st.metric("Confidence", "—", border=True)
        elif current_result["serial"]:
            st.success("Serial number detected", icon=":material/check_circle:")
            st.metric("Serial number", current_result["serial"], border=True)
            st.metric(
                "Confidence",
                current_result["confidence"],
                border=True,
                help="Average OCR confidence across accepted number groups.",
            )
            st.progress(
                current_result["confidence_raw"],
                text=f"Processed with {current_result['variant'].lower()} enhancement",
            )
            with st.container(horizontal=True):
                st.download_button(
                    "Save processed image",
                    data=current_result["processed_png"],
                    file_name=f"serial-{current_result['serial']}.png",
                    mime="image/png",
                    icon=":material/download:",
                    disabled=not current_result["processed_png"],
                )
        else:
            st.warning(
                "No digits were detected. Try moving closer, reducing glare, or lowering the confidence setting.",
                icon=":material/search_off:",
            )
            st.metric("Serial number", "Not detected", border=True)
            st.metric("Confidence", "0%", border=True)

if scan_clicked and image_file is not None:
    image = decode_image(image_file.getvalue())
    if image is None:
        st.error("This image could not be decoded. Please choose another file.", icon=":material/error:")
    else:
        with result_panel, st.status(
            "Reading the metal surface…",
            expanded=True,
        ) as scan_status:
            st.write("Enhancing contrast and isolating digits")
            reader = load_reader()
            serial, confidence, variant, processed = read_serial_number(
                reader,
                image,
                minimum_confidence=minimum_confidence,
            )
            st.write("Comparing OCR results across image variants")
            timestamp = datetime.now().strftime("%H:%M:%S")
            result = {
                "serial": serial,
                "confidence": f"{confidence:.0%}",
                "confidence_raw": confidence,
                "variant": variant,
                "original_png": encode_png(image),
                "processed_png": encode_png(processed),
                "time": timestamp,
            }
            st.session_state.scan_result = result
            if serial:
                st.session_state.scan_history.insert(
                    0,
                    {
                        "Time": timestamp,
                        "Serial number": serial,
                        "Confidence": f"{confidence:.0%}",
                        "Enhancement": variant,
                    },
                )
                st.session_state.scan_history = st.session_state.scan_history[:25]
                scan_status.update(label="Scan complete", state="complete", expanded=False)
                st.toast(f"Detected {serial}", icon=":material/check_circle:")
            else:
                scan_status.update(label="No serial detected", state="error", expanded=False)
        st.rerun()

current_result = st.session_state.scan_result
if current_result is not None and show_processed:
    st.subheader("Best enhancement", anchor=False)
    preview_original, preview_processed = st.columns(2, gap="large")
    with preview_original.container(border=True):
        st.image(
            BytesIO(current_result["original_png"]),
            caption="Captured image",
            width="stretch",
        )
    with preview_processed.container(border=True):
        if current_result["processed_png"]:
            st.image(
                BytesIO(current_result["processed_png"]),
                caption=f"{current_result['variant']} variant used by OCR",
                width="stretch",
            )

if st.session_state.scan_history:
    st.subheader("Recent scans", anchor=False)
    history = pd.DataFrame(st.session_state.scan_history)
    st.dataframe(history, hide_index=True, width="stretch", key="scan_history_table")
    csv_data = history.to_csv(index=False).encode("utf-8")
    with st.container(horizontal=True, horizontal_alignment="right"):
        st.download_button(
            "Export history",
            data=csv_data,
            file_name="forgelens-scan-history.csv",
            mime="text/csv",
            icon=":material/download:",
        )
        if st.button("Clear history", icon=":material/delete:"):
            st.session_state.scan_history = []
            st.rerun()

st.space("small")
st.caption("ForgeLens · Images are processed locally in this app session and are not saved to disk.")
