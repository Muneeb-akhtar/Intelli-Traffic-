"""
Intelli Traffic — Real-time Vehicle Detection
YOLOv8 + OpenCV centroid tracker for Lahore road traffic.

Detects and counts: Cars · Rickshaws/Bikes · Buses/Metro · Trucks

Flask server on port 8081:
  GET  /video        — MJPEG stream with detection overlays
  GET  /api/counts   — JSON totals by vehicle type + current on-screen
  POST /api/reset    — Reset all counters

Usage (from project root):
  .venv\\Scripts\\python.exe ai_module\\vehicle_counter.py
  .venv\\Scripts\\python.exe ai_module\\vehicle_counter.py path/to/video.mp4
"""
import sys, os, time, threading, argparse
from pathlib import Path
from collections import defaultdict

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flask import Flask, Response, jsonify, request
from flask_cors import CORS

try:
    from ultralytics import YOLO
    YOLO_OK = True
except ImportError:
    YOLO_OK = False
    print("[WARN] ultralytics not installed — detection disabled, showing raw video")

# ── Config ────────────────────────────────────────────────────────────────────
PORT         = 8081
YOLO_MODEL   = 'yolov8n.pt'
CONF         = 0.35
TARGET_FPS   = 20
JPEG_QUALITY = 82
FRAME_W      = 1280
FRAME_H      = 720

# YOLO COCO class IDs → Lahore traffic labels
# 1=bicycle, 2=car, 3=motorcycle, 5=bus, 7=truck
VEHICLE_CLS = {
    1: 'Rickshaw/Bike',   # bicycle
    2: 'Car',
    3: 'Rickshaw/Bike',   # motorcycle / auto-rickshaw (3-wheeler)
    5: 'Bus/Metro',
    7: 'Truck',
}

# Relative bounding-box area thresholds for reclassification
# (box_area / frame_area)
RICKSHAW_MAX_AREA = 0.030   # "truck" smaller than this → rickshaw
BUS_MIN_AREA      = 0.045   # "truck" larger than this with tall aspect → bus/metro
CAR_MAX_AREA      = 0.060   # "bus" smaller than this → likely a car/van

# BGR colours for each class
CLS_COLOR = {
    1: (0,   165, 255),   # Bicycle      — orange (same as rickshaw)
    2: (50,  205, 50),    # Car          — green
    3: (0,   165, 255),   # Rickshaw/Bike — orange
    5: (60,  60,  220),   # Bus/Metro    — blue
    7: (180, 50,  220),   # Truck        — purple
}

# Counting line position (normalised Y, 0=top 1=bottom)
COUNT_LINE_Y = 0.60

# ── Centroid Tracker ──────────────────────────────────────────────────────────
class CentroidTracker:
    def __init__(self, max_missing=18, match_dist=90):
        self.tracks: dict[int, dict] = {}
        self.next_id = 0
        self.max_missing = max_missing
        self.match_dist  = match_dist

    def update(self, detections: list[tuple]) -> list[tuple]:
        if not detections:
            for tid in list(self.tracks):
                self.tracks[tid]['missing'] += 1
                if self.tracks[tid]['missing'] > self.max_missing:
                    del self.tracks[tid]
            return []

        unmatched = list(range(len(detections)))
        assigned: dict[int, int] = {}

        for tid, trk in self.tracks.items():
            best_d, best_i = float('inf'), -1
            for i in unmatched:
                cx, cy, _ = detections[i]
                d = ((cx - trk['cx'])**2 + (cy - trk['cy'])**2) ** 0.5
                if d < best_d and d < self.match_dist:
                    best_d, best_i = d, i
            if best_i >= 0:
                assigned[tid] = best_i
                unmatched.remove(best_i)

        for tid, i in assigned.items():
            cx, cy, cls_id = detections[i]
            self.tracks[tid].update(
                prev_cy=self.tracks[tid]['cy'],
                cx=cx, cy=cy, cls=cls_id, missing=0
            )

        for tid in list(self.tracks):
            if tid not in assigned:
                self.tracks[tid]['missing'] += 1
                if self.tracks[tid]['missing'] > self.max_missing:
                    del self.tracks[tid]

        for i in unmatched:
            cx, cy, cls_id = detections[i]
            self.tracks[self.next_id] = {
                'cx': cx, 'cy': cy, 'prev_cy': cy,
                'cls': cls_id, 'missing': 0, 'counted': False,
            }
            self.next_id += 1

        return [
            (t['cx'], t['cy'], t['cls'], tid)
            for tid, t in self.tracks.items()
            if t['missing'] == 0
        ]


# ── Shared State ──────────────────────────────────────────────────────────────
class State:
    def __init__(self):
        self._lock = threading.Lock()
        labels = list(dict.fromkeys(VEHICLE_CLS.values()))  # unique labels
        self.total: dict[str, int]     = {v: 0 for v in labels}
        self.on_screen: dict[str, int] = {v: 0 for v in labels}
        self.history: list[dict]       = []   # rolling 120-point timeline
        self.frame_bytes: bytes = b''
        self.fps_actual:  float = 0.0
        self.video_source: str  = ''
        self._last_snapshot = time.time()

    def reset(self):
        with self._lock:
            for k in self.total:
                self.total[k] = 0
            for k in self.on_screen:
                self.on_screen[k] = 0

    def record_history(self):
        """Call once per second to append a timeline point."""
        now = time.time()
        if now - self._last_snapshot < 1.0:
            return
        self._last_snapshot = now
        with self._lock:
            self.history.append({
                'ts':        int(now),
                'on_screen': sum(self.on_screen.values()),
                'types':     dict(self.on_screen),
            })
            if len(self.history) > 120:
                self.history = self.history[-120:]

    def snapshot(self) -> dict:
        with self._lock:
            return {
                'total':       dict(self.total),
                'on_screen':   dict(self.on_screen),
                'fps':         round(self.fps_actual, 1),
                'source':      self.video_source,
                'grand_total': sum(self.total.values()),
            }

    def get_history(self) -> list:
        with self._lock:
            return list(self.history)

    def set_frame(self, buf: bytes):
        with self._lock:
            self.frame_bytes = buf

    def get_frame(self) -> bytes:
        with self._lock:
            return self.frame_bytes


state   = State()
tracker = CentroidTracker()
yolo_model   = None
_yolo_lock   = threading.Lock()


def load_yolo():
    global yolo_model
    if not YOLO_OK:
        return
    try:
        yolo_model = YOLO(YOLO_MODEL)
        print(f"[YOLO] Model ready: {YOLO_MODEL}")
    except Exception as e:
        print(f"[YOLO] Load failed: {e}")


# ── Drawing ───────────────────────────────────────────────────────────────────
def draw_counting_line(frame: np.ndarray) -> np.ndarray:
    h, w = frame.shape[:2]
    ly = int(COUNT_LINE_Y * h)
    # Dashed yellow counting line
    dash_len, gap_len = 30, 15
    x = 0
    while x < w:
        cv2.line(frame, (x, ly), (min(x + dash_len, w), ly), (0, 220, 255), 2)
        x += dash_len + gap_len
    # Label
    label = "  COUNTING LINE"
    cv2.putText(frame, label, (10, ly - 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 220, 255), 1, cv2.LINE_AA)
    return frame


def draw_vehicle_box(frame, x1, y1, x2, y2, label: str, conf: float, cls_id: int):
    col = CLS_COLOR.get(cls_id, (200, 200, 200))
    cv2.rectangle(frame, (x1, y1), (x2, y2), col, 2)
    txt = f"{label}  {conf:.2f}"
    (tw, th), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, 0.46, 1)
    ty = max(y1, th + 8)
    cv2.rectangle(frame, (x1, ty - th - 6), (x1 + tw + 8, ty + 2), col, -1)
    cv2.putText(frame, txt, (x1 + 4, ty - 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.46, (255, 255, 255), 1, cv2.LINE_AA)


def draw_hud(frame: np.ndarray, fps: float):
    h, w = frame.shape[:2]
    snap = state.snapshot()

    # Top bar background
    cv2.rectangle(frame, (0, 0), (w, 44), (10, 10, 10), -1)

    # Title
    cv2.putText(frame, "INTELLI TRAFFIC  —  VEHICLE DETECTION", (12, 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(frame, f"FPS: {fps:.1f}   TOTAL COUNTED: {snap['grand_total']}",
                (12, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (180, 180, 180), 1, cv2.LINE_AA)

    # Right: per-type counts panel
    panel_x = w - 310
    panel_h = 44 + len(VEHICLE_CLS) * 28 + 10
    cv2.rectangle(frame, (panel_x - 8, 44), (w, 44 + panel_h), (15, 15, 15), -1)
    cv2.rectangle(frame, (panel_x - 8, 44), (w, 44 + panel_h), (50, 50, 50), 1)

    cv2.putText(frame, "TYPE           ON SCREEN   TOTAL",
                (panel_x, 66),
                cv2.FONT_HERSHEY_SIMPLEX, 0.40, (140, 140, 140), 1, cv2.LINE_AA)

    for i, (cls_id, label) in enumerate(VEHICLE_CLS.items()):
        col = CLS_COLOR[cls_id]
        y = 90 + i * 28
        on_s  = snap['on_screen'].get(label, 0)
        total = snap['total'].get(label, 0)
        cv2.putText(frame, f"{label:<18} {on_s:>3}         {total:>5}",
                    (panel_x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.44, col, 1, cv2.LINE_AA)

    return frame


# ── Processing Loop ───────────────────────────────────────────────────────────
def processing_loop(video_path: str | None):
    delay = 1.0 / TARGET_FPS
    fps_timer  = time.time()
    fps_frames = 0

    cap = _open_cap(video_path)

    while True:
        t0 = time.time()

        if cap is None or not cap.isOpened():
            frame = _blank_frame(FRAME_W, FRAME_H)
        else:
            ok, raw = cap.read()
            if not ok:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # loop video
                ok, raw = cap.read()
            frame = raw if ok else _blank_frame(FRAME_W, FRAME_H)
            frame = cv2.resize(frame, (FRAME_W, FRAME_H))

        h, w = frame.shape[:2]
        line_y = int(COUNT_LINE_Y * h)

        # ── YOLO detection ──────────────────────────────────────────────────
        detections: list[tuple] = []
        raw_boxes:  list[tuple] = []

        if yolo_model is not None:
            with _yolo_lock:
                results = yolo_model(frame, verbose=False, conf=CONF)[0]

            for box in results.boxes:
                cls_id = int(box.cls[0].item())
                if cls_id not in VEHICLE_CLS:
                    continue
                conf_val = float(box.conf[0].item())
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                # ── Size-based reclassification ──────────────────────────
                box_w   = x2 - x1
                box_h   = y2 - y1
                rel_area = (box_w * box_h) / (w * h)
                aspect   = box_h / max(box_w, 1)

                if cls_id == 7:  # YOLO says "truck"
                    if rel_area < RICKSHAW_MAX_AREA:
                        cls_id = 3   # too small → rickshaw/bike
                    elif rel_area > BUS_MIN_AREA and aspect > 0.85:
                        cls_id = 5   # tall & large → metro/bus

                if cls_id == 5:  # YOLO says "bus"
                    if rel_area < CAR_MAX_AREA and aspect < 0.7:
                        cls_id = 2   # small & wide → car/van

                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2
                detections.append((cx, cy, cls_id))
                raw_boxes.append((x1, y1, x2, y2, cls_id, conf_val))

        # ── Tracker update ──────────────────────────────────────────────────
        tracked = tracker.update(detections)

        # ── On-screen counts ────────────────────────────────────────────────
        cur_on: dict[str, int] = {v: 0 for v in VEHICLE_CLS.values()}
        for cx, cy, cls_id, tid in tracked:
            label = VEHICLE_CLS.get(cls_id, 'Car')
            cur_on[label] += 1

        with state._lock:
            state.on_screen = cur_on.copy()

        # ── Line-crossing counts ─────────────────────────────────────────────
        for cx, cy, cls_id, tid in tracked:
            trk = tracker.tracks.get(tid)
            if trk is None or trk.get('counted'):
                continue
            # Vehicle crosses counting line moving downward
            if trk['prev_cy'] < line_y <= cy:
                trk['counted'] = True
                label = VEHICLE_CLS.get(cls_id, 'Car')
                with state._lock:
                    state.total[label] = state.total.get(label, 0) + 1

        # ── Draw ─────────────────────────────────────────────────────────────
        draw_counting_line(frame)

        for x1, y1, x2, y2, cls_id, conf_val in raw_boxes:
            draw_vehicle_box(frame, x1, y1, x2, y2, VEHICLE_CLS[cls_id], conf_val, cls_id)

        # Tracker dots
        for cx, cy, cls_id, tid in tracked:
            col = CLS_COLOR.get(cls_id, (200, 200, 200))
            cv2.circle(frame, (cx, cy), 5, col, -1)
            cv2.circle(frame, (cx, cy), 5, (255, 255, 255), 1)

        # FPS
        fps_frames += 1
        elapsed = time.time() - fps_timer
        if elapsed >= 1.0:
            state.fps_actual = fps_frames / elapsed
            fps_frames = 0
            fps_timer  = time.time()

        draw_hud(frame, state.fps_actual)
        state.record_history()

        # ── Encode ───────────────────────────────────────────────────────────
        ok2, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if ok2:
            state.set_frame(buf.tobytes())

        time.sleep(max(0.0, delay - (time.time() - t0)))


def _open_cap(path: str | None):
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        print(f"[VIDEO] Not found: {path}")
        return None
    cap = cv2.VideoCapture(str(p))
    if cap.isOpened():
        print(f"[VIDEO] Opened: {path}")
        return cap
    print(f"[VIDEO] Failed to open: {path}")
    return None


def _blank_frame(w, h):
    f = np.zeros((h, w, 3), np.uint8)
    lines = [
        "No video source found.",
        "Place a traffic video in the project and restart.",
    ]
    for i, line in enumerate(lines):
        (tw, _), _ = cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 1)
        cv2.putText(f, line, ((w - tw) // 2, h // 2 + i * 36),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (80, 80, 80), 1, cv2.LINE_AA)
    return f


# ── Flask ─────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)


def _mjpeg_gen():
    while True:
        frame = state.get_frame()
        if frame:
            yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame + b'\r\n'
        time.sleep(1.0 / TARGET_FPS)


@app.route('/video')
def video():
    return Response(_mjpeg_gen(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/api/counts')
def api_counts():
    return jsonify(state.snapshot())


@app.route('/api/reset', methods=['POST'])
def api_reset():
    state.reset()
    return jsonify({'ok': True})


@app.route('/api/history')
def api_history():
    return jsonify(state.get_history())

@app.route('/health')
def health():
    return jsonify({'ok': True, 'yolo': YOLO_OK, 'fps': state.fps_actual})


# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('video', nargs='?', default=None)
    parser.add_argument('--port', type=int, default=PORT)
    args = parser.parse_args()

    video_path = args.video

    # Auto-discover video — check common locations
    if not video_path:
        candidates = [
            'frontend/public/Traffic video lahore.mp4',
            'Traffic video lahore.mp4',
            'frontend/public/traffic_4way_simulation.mp4',
            'traffic_4way_simulation.mp4',
            'traffic_processed.mp4',
        ]
        for c in candidates:
            if Path(c).exists():
                video_path = c
                break

    state.video_source = video_path or 'none'

    print("\n  Intelli Traffic — Vehicle Detection")
    print("  ─────────────────────────────────────────────────")
    print(f"  Video  : {video_path or 'No file found (blank feed)'}")
    print(f"  YOLO   : {YOLO_MODEL if YOLO_OK else 'DISABLED (install ultralytics)'}")
    print(f"  Stream : http://localhost:{args.port}/video")
    print(f"  API    : http://localhost:{args.port}/api/counts")
    print(f"  Detects: Car · Rickshaw/Bike · Bus/Metro · Truck\n")

    load_yolo()
    t = threading.Thread(target=processing_loop, args=(video_path,), daemon=True)
    t.start()

    app.run(host='0.0.0.0', port=args.port, threaded=True)


if __name__ == '__main__':
    main()
