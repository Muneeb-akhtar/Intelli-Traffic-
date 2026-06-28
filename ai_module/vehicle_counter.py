"""
Intelli Traffic — Multi-Camera Vehicle Detection
4 independent YOLO streams for Lahore road traffic.

Flask server on port 8081:
  GET  /video/<cam_id>        — MJPEG stream with detection overlays
  GET  /api/counts/<cam_id>   — JSON totals for one camera
  GET  /api/counts            — Aggregated totals (all cameras)
  GET  /api/history/<cam_id>  — Rolling history for one camera
  GET  /api/history           — Aggregated history
  POST /api/reset/<cam_id>    — Reset one camera counters
  POST /api/reset             — Reset all cameras
  GET  /api/cameras           — List all cameras
"""
import sys, os, time, threading
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
    print("[WARN] ultralytics not installed — detection disabled")

# ── Config ────────────────────────────────────────────────────────────────────
PORT         = 8081
YOLO_MODEL   = 'yolov8n.pt'
CONF         = 0.35
TARGET_FPS   = 10         # per camera (4 cams × 10 = 40 YOLO calls/s)
JPEG_QUALITY = 78
FRAME_W      = 960
FRAME_H      = 540

VEHICLE_CLS = {
    1: 'Rickshaw/Bike',
    2: 'Car',
    3: 'Rickshaw/Bike',
    5: 'Bus/Metro',
    7: 'Truck',
}

# Thresholds tuned for Lahore side/overhead camera angles.
# rel_area = bounding-box pixels / total frame pixels.
#   Auto-rickshaws appear small-to-medium (< 4 %)
#   Buses/minibuses appear medium            (4 – 9 %)
#   Actual goods trucks appear large         (>= 9 %)
RICKSHAW_MAX_AREA = 0.040   # was 0.030 — catches larger auto-rickshaws
BUS_MEDIUM_MAX    = 0.090   # new upper bound for bus range
CAR_MAX_AREA      = 0.015   # tightened — only truly tiny YOLO-bus boxes → Car

CLS_COLOR = {
    1: (0,   165, 255),
    2: (50,  205, 50),
    3: (0,   165, 255),
    5: (60,  60,  220),
    7: (180, 50,  220),
}

COUNT_LINE_Y = 0.60

# Video files for each camera slot (auto-discovered from project root)
CAMERA_VIDEOS = [
    'frontend/public/Traffic video lahore.mp4',
    'frontend/public/Traffic video lahore 2.mp4',
    'frontend/public/Single line lahore traffic 3.mp4',
    'frontend/public/Single line lahore Traffic 4.mp4',
]

CAMERA_NAMES = [
    'Camera 1 — Lahore Road',
    'Camera 2 — Main Boulevard',
    'Camera 3 — Single Lane A',
    'Camera 4 — Single Lane B',
]

# ── Centroid Tracker ──────────────────────────────────────────────────────────
class CentroidTracker:
    def __init__(self, max_missing=18, match_dist=90):
        self.tracks: dict[int, dict] = {}
        self.next_id = 0
        self.max_missing = max_missing
        self.match_dist  = match_dist

    def update(self, detections):
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
            self.tracks[tid].update(prev_cy=self.tracks[tid]['cy'],
                                    cx=cx, cy=cy, cls=cls_id, missing=0)

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

        return [(t['cx'], t['cy'], t['cls'], tid)
                for tid, t in self.tracks.items() if t['missing'] == 0]


# ── Per-camera State ──────────────────────────────────────────────────────────
class State:
    def __init__(self, name: str, source: str):
        self._lock = threading.Lock()
        labels = list(dict.fromkeys(VEHICLE_CLS.values()))
        self.total: dict[str, int]     = {v: 0 for v in labels}
        self.on_screen: dict[str, int] = {v: 0 for v in labels}
        self.history: list[dict]       = []
        self.frame_bytes: bytes        = b''
        self.fps_actual: float         = 0.0
        self.name                      = name
        self.video_source              = source
        self._last_snapshot            = time.time()

    def reset(self):
        with self._lock:
            for k in self.total:     self.total[k] = 0
            for k in self.on_screen: self.on_screen[k] = 0

    def record_history(self):
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
                'name':        self.name,
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


# ── Global YOLO (shared, serialized via lock) ─────────────────────────────────
yolo_model  = None
_yolo_lock  = threading.Lock()


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
def draw_counting_line(frame):
    h, w = frame.shape[:2]
    ly = int(COUNT_LINE_Y * h)
    dash_len, gap_len = 30, 15
    x = 0
    while x < w:
        cv2.line(frame, (x, ly), (min(x + dash_len, w), ly), (0, 220, 255), 2)
        x += dash_len + gap_len
    cv2.putText(frame, "  COUNTING LINE", (10, ly - 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 220, 255), 1, cv2.LINE_AA)


def draw_vehicle_box(frame, x1, y1, x2, y2, label, conf, cls_id):
    col = CLS_COLOR.get(cls_id, (200, 200, 200))
    cv2.rectangle(frame, (x1, y1), (x2, y2), col, 2)
    txt = f"{label}  {conf:.2f}"
    (tw, th), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
    ty = max(y1, th + 8)
    cv2.rectangle(frame, (x1, ty - th - 6), (x1 + tw + 8, ty + 2), col, -1)
    cv2.putText(frame, txt, (x1 + 4, ty - 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)


def draw_hud(frame, state: State):
    h, w = frame.shape[:2]
    snap = state.snapshot()

    cv2.rectangle(frame, (0, 0), (w, 40), (10, 10, 10), -1)
    cv2.putText(frame, state.name, (10, 14),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(frame,
                f"FPS: {snap['fps']:.1f}   TOTAL: {snap['grand_total']}",
                (10, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1, cv2.LINE_AA)

    panel_x = w - 260
    rows = list(dict.fromkeys(VEHICLE_CLS.values()))
    panel_h = 40 + len(rows) * 24 + 10
    cv2.rectangle(frame, (panel_x - 8, 40), (w, 40 + panel_h), (15, 15, 15), -1)
    cv2.rectangle(frame, (panel_x - 8, 40), (w, 40 + panel_h), (50, 50, 50), 1)

    for i, label in enumerate(rows):
        cls_id = next(k for k, v in VEHICLE_CLS.items() if v == label)
        col = CLS_COLOR[cls_id]
        y = 62 + i * 24
        on_s  = snap['on_screen'].get(label, 0)
        total = snap['total'].get(label, 0)
        cv2.putText(frame, f"{label:<16} {on_s:>2}  {total:>4}",
                    (panel_x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.38, col, 1, cv2.LINE_AA)


# ── Processing Loop (one per camera thread) ───────────────────────────────────
def processing_loop(state: State, tracker: CentroidTracker, video_path: str | None):
    delay = 1.0 / TARGET_FPS
    fps_timer, fps_frames = time.time(), 0

    cap = _open_cap(video_path)

    while True:
        t0 = time.time()

        if cap is None or not cap.isOpened():
            frame = _blank_frame(FRAME_W, FRAME_H, state.name)
        else:
            ok, raw = cap.read()
            if not ok:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, raw = cap.read()
            frame = raw if ok else _blank_frame(FRAME_W, FRAME_H, state.name)
            frame = cv2.resize(frame, (FRAME_W, FRAME_H))

        h, w = frame.shape[:2]
        line_y = int(COUNT_LINE_Y * h)

        detections, raw_boxes = [], []

        if yolo_model is not None:
            with _yolo_lock:
                results = yolo_model(frame, verbose=False, conf=CONF)[0]

            for box in results.boxes:
                cls_id = int(box.cls[0].item())
                if cls_id not in VEHICLE_CLS:
                    continue
                conf_val = float(box.conf[0].item())
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                bw, bh = x2 - x1, y2 - y1
                rel_area = (bw * bh) / (w * h)
                aspect   = bh / max(bw, 1)

                # ── Reclassify YOLO "truck" (cls 7) by bounding-box size.
                # Side/overhead cameras show buses wider than tall, so the
                # old `aspect > 0.85` check was always False for buses —
                # everything stayed "Truck". Remove aspect check entirely.
                if cls_id == 7:
                    if rel_area < RICKSHAW_MAX_AREA:
                        cls_id = 3          # small  → Rickshaw/Bike
                    elif rel_area < BUS_MEDIUM_MAX:
                        cls_id = 5          # medium → Bus/Metro
                    # else rel_area >= 0.090: stays as Truck (large goods vehicle)

                # ── Only downgrade YOLO "bus" (cls 5) to Car if it is tiny.
                # The old threshold (6 %) was too loose and turned real buses into cars.
                if cls_id == 5:
                    if rel_area < CAR_MAX_AREA and aspect < 0.55:
                        cls_id = 2          # very tiny wide box → Car

                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2
                detections.append((cx, cy, cls_id))
                raw_boxes.append((x1, y1, x2, y2, cls_id, conf_val))

        tracked = tracker.update(detections)

        cur_on: dict[str, int] = {v: 0 for v in VEHICLE_CLS.values()}
        for cx, cy, cls_id, tid in tracked:
            cur_on[VEHICLE_CLS.get(cls_id, 'Car')] += 1

        with state._lock:
            state.on_screen = cur_on.copy()

        for cx, cy, cls_id, tid in tracked:
            trk = tracker.tracks.get(tid)
            if trk is None or trk.get('counted'):
                continue
            if trk['prev_cy'] < line_y <= cy:
                trk['counted'] = True
                label = VEHICLE_CLS.get(cls_id, 'Car')
                with state._lock:
                    state.total[label] = state.total.get(label, 0) + 1

        draw_counting_line(frame)
        for x1, y1, x2, y2, cls_id, conf_val in raw_boxes:
            draw_vehicle_box(frame, x1, y1, x2, y2, VEHICLE_CLS[cls_id], conf_val, cls_id)
        for cx, cy, cls_id, tid in tracked:
            col = CLS_COLOR.get(cls_id, (200, 200, 200))
            cv2.circle(frame, (cx, cy), 4, col, -1)
            cv2.circle(frame, (cx, cy), 4, (255, 255, 255), 1)

        fps_frames += 1
        elapsed = time.time() - fps_timer
        if elapsed >= 1.0:
            state.fps_actual = fps_frames / elapsed
            fps_frames = 0
            fps_timer  = time.time()

        draw_hud(frame, state)
        state.record_history()

        ok2, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if ok2:
            state.set_frame(buf.tobytes())

        time.sleep(max(0.0, delay - (time.time() - t0)))


def _open_cap(path):
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


def _blank_frame(w, h, cam_name=''):
    f = np.zeros((h, w, 3), np.uint8)
    for i, line in enumerate([cam_name, "No video source found."]):
        (tw, _), _ = cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
        cv2.putText(f, line, ((w - tw) // 2, h // 2 + i * 36),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (80, 80, 80), 1, cv2.LINE_AA)
    return f


# ── Signal Controller ─────────────────────────────────────────────────────────
class SignalController:
    MIN_GREEN   = 10    # s — minimum green before switching
    MAX_GREEN   = 55    # s — maximum green before forced switch
    YELLOW_DUR  = 3     # s
    ALL_RED_DUR = 2     # s
    MAX_WAIT    = 90    # s — starvation limit

    def __init__(self):
        self._lock         = threading.Lock()
        self.signals       = {i: 'RED' for i in range(1, 5)}
        self.active        = None        # cam_id currently GREEN
        self._next         = None        # cam_id to activate after ALL_RED
        self.phase         = 'STARTUP'   # STARTUP|GREEN|YELLOW|ALL_RED|EMERGENCY
        self.phase_start   = time.time()
        self.phase_dur     = 0.0
        self.scores        = {i: 0.0 for i in range(1, 5)}
        self.wait_times    = {i: 0.0 for i in range(1, 5)}
        self.overrides     = {i: None  for i in range(1, 5)}
        self.override_exp  = {i: 0.0   for i in range(1, 5)}
        self.emergency     = False
        self.cycle_count   = 0
        self._last_tick    = time.time()
        self._tp_buf: list[tuple] = []   # (timestamp, delta) for throughput

    # ── public snapshot ────────────────────────────────────────────────────────
    def snapshot(self) -> dict:
        with self._lock:
            now     = time.time()
            elapsed = now - self.phase_start
            remain  = max(0.0, self.phase_dur - elapsed)
            cutoff  = now - 60
            tp      = sum(c for ts, c in self._tp_buf if ts > cutoff)
            waits   = list(self.wait_times.values())
            avg_w   = sum(waits) / max(len(waits), 1)
            eff     = max(0, min(100, int((1 - avg_w / self.MAX_WAIT) * 100)))
            return {
                'signals':        {str(k): v for k, v in self.signals.items()},
                'active_cam':     self.active,
                'phase':          self.phase,
                'phase_elapsed':  round(elapsed, 1),
                'phase_duration': round(self.phase_dur, 1),
                'time_remaining': round(remain, 1),
                'scores':         {str(k): round(v, 1) for k, v in self.scores.items()},
                'wait_times':     {str(k): round(v, 1) for k, v in self.wait_times.items()},
                'overrides':      {str(k): v for k, v in self.overrides.items()},
                'emergency':      self.emergency,
                'cycle_count':    self.cycle_count,
                'throughput':     int(tp),
                'avg_wait':       round(avg_w, 1),
                'efficiency':     eff,
            }

    # ── override entry point ───────────────────────────────────────────────────
    def apply_override(self, cam_id: int | None, action: str):
        with self._lock:
            if action == 'EMERGENCY':
                self.emergency = not self.emergency
                if self.emergency:
                    for i in range(1, 5): self.signals[i] = 'RED'
                    self.active = None
                    self.phase  = 'EMERGENCY'
                else:
                    self.phase       = 'ALL_RED'
                    self.phase_start = time.time()
                    self.phase_dur   = self.ALL_RED_DUR
                return
            if cam_id is None:
                return
            if action == 'FORCE_GREEN':
                self.overrides[cam_id]    = 'FORCE_GREEN'
                self.override_exp[cam_id] = time.time() + 30
                if self.active != cam_id:
                    self._begin_switch(cam_id)
            elif action == 'HOLD_RED':
                self.overrides[cam_id]    = 'HOLD_RED'
                self.override_exp[cam_id] = time.time() + 300
                if self.active == cam_id:
                    nxt = self._best_excl(cam_id)
                    if nxt: self._begin_switch(nxt)
            elif action == 'EXTEND':
                if self.active == cam_id and self.phase == 'GREEN':
                    self.phase_dur = min(self.phase_dur + 10, self.MAX_GREEN)
            elif action == 'CLEAR':
                self.overrides[cam_id]    = None
                self.override_exp[cam_id] = 0

    # ── tick — called every 0.5 s ──────────────────────────────────────────────
    def tick(self):
        with self._lock:
            now = time.time()
            dt  = now - self._last_tick
            self._last_tick = now

            if self.emergency:
                return

            # expire overrides
            for i in range(1, 5):
                if self.overrides[i] and now > self.override_exp[i]:
                    self.overrides[i] = None

            # update wait times
            for i in range(1, 5):
                if i == self.active and self.phase == 'GREEN':
                    self.wait_times[i] = 0.0
                else:
                    self.wait_times[i] = min(self.wait_times[i] + dt, 999)

            # track throughput
            total_now = 0
            for i in range(1, 5):
                c = get_cam(i)
                if c: total_now += c['state'].snapshot()['grand_total']
            # store delta
            total_prev = sum(getattr(self, '_total_prev', {}).get(i, 0) for i in range(1, 5))
            delta = max(0, total_now - total_prev)
            if delta: self._tp_buf.append((now, delta))
            self._tp_buf = [(ts, c) for ts, c in self._tp_buf if ts > now - 60]
            self._total_prev = {
                i: (get_cam(i)['state'].snapshot()['grand_total'] if get_cam(i) else 0)
                for i in range(1, 5)
            }

            self._update_scores()

            elapsed = now - self.phase_start

            if self.phase == 'STARTUP':
                best = self._best()
                if best: self._go_green(best)

            elif self.phase == 'GREEN':
                forced = next((i for i, o in self.overrides.items()
                               if o == 'FORCE_GREEN' and i != self.active), None)
                if forced and elapsed >= 3:
                    self._begin_switch(forced); return

                best   = self._best()
                better = (best and best != self.active and
                          self.scores[best] > self.scores.get(self.active or 0, 0) * 1.4)
                if elapsed >= self.phase_dur or (elapsed >= self.MIN_GREEN and better):
                    nxt = best if (best and best != self.active) else self._best_excl(self.active)
                    if nxt: self._begin_switch(nxt)

            elif self.phase == 'YELLOW':
                if elapsed >= self.YELLOW_DUR:
                    if self.active: self.signals[self.active] = 'RED'
                    self.active      = None
                    self.phase       = 'ALL_RED'
                    self.phase_start = now
                    self.phase_dur   = self.ALL_RED_DUR

            elif self.phase == 'ALL_RED':
                if elapsed >= self.ALL_RED_DUR:
                    nxt = self._next or self._best()
                    self._next = None
                    if nxt: self._go_green(nxt)

    # ── internals ─────────────────────────────────────────────────────────────
    def _update_scores(self):
        for i in range(1, 5):
            cam = get_cam(i)
            if not cam: self.scores[i] = 0; continue
            snap   = cam['state'].snapshot()
            on_s   = sum(snap['on_screen'].values())
            wait   = self.wait_times[i]
            trucks = snap['on_screen'].get('Truck', 0)
            buses  = snap['on_screen'].get('Bus/Metro', 0)
            score  = on_s * 2.0 + wait * 1.2 + trucks * 3.0 + buses * 2.5
            if self.overrides[i] == 'HOLD_RED': score = -9999
            if wait > self.MAX_WAIT: score += 500
            self.scores[i] = score

    def _best(self):
        c = [i for i in range(1, 5) if self.overrides.get(i) != 'HOLD_RED']
        return max(c, key=lambda k: self.scores[k]) if c else None

    def _best_excl(self, excl):
        c = [i for i in range(1, 5) if i != excl and self.overrides.get(i) != 'HOLD_RED']
        return max(c, key=lambda k: self.scores[k]) if c else None

    def _begin_switch(self, next_cam):
        self._next = next_cam
        if self.active: self.signals[self.active] = 'YELLOW'
        self.phase       = 'YELLOW'
        self.phase_start = time.time()
        self.phase_dur   = self.YELLOW_DUR

    def _go_green(self, cam_id):
        cam = get_cam(cam_id)
        on_s = sum(cam['state'].snapshot()['on_screen'].values()) if cam else 0
        dur  = min(self.MAX_GREEN, max(self.MIN_GREEN, on_s * 2 + 12))
        for i in range(1, 5):
            self.signals[i] = 'GREEN' if i == cam_id else 'RED'
        self.active      = cam_id
        self.phase       = 'GREEN'
        self.phase_start = time.time()
        self.phase_dur   = dur
        self.cycle_count += 1


# ── Camera instances ──────────────────────────────────────────────────────────
cameras: list[dict] = []   # [{'id', 'state', 'tracker'}]
signal_ctrl: SignalController | None = None


def build_cameras():
    for idx, (video_path, name) in enumerate(zip(CAMERA_VIDEOS, CAMERA_NAMES)):
        cam_id = idx + 1
        resolved = video_path if Path(video_path).exists() else None
        if not resolved:
            print(f"[CAM {cam_id}] Video not found: {video_path}")
        state   = State(name=name, source=resolved or 'none')
        tracker = CentroidTracker()
        cameras.append({'id': cam_id, 'state': state, 'tracker': tracker,
                        'video': resolved, 'name': name})


def get_cam(cam_id: int) -> dict | None:
    for c in cameras:
        if c['id'] == cam_id:
            return c
    return None


# ── Analytics & Safety Event Log ──────────────────────────────────────────────
_event_lock      = threading.Lock()
analytics_buffer: list[dict] = []
safety_log:       list[dict] = []

CAMERA_DIRECTIONS = {1: 'Northbound', 2: 'Southbound', 3: 'Eastbound', 4: 'Westbound'}


def log_safety_event(event_type: str, message: str):
    from datetime import datetime
    entry = {'timestamp': datetime.now().isoformat(), 'type': event_type, 'message': message}
    with _event_lock:
        safety_log.append(entry)
        if len(safety_log) > 300:
            safety_log[:] = safety_log[-300:]


def record_analytics():
    if not cameras:
        return
    from datetime import datetime
    now   = datetime.now()
    total = 0
    counts: dict[str, int] = {}
    for cam in cameras:
        snap      = cam['state'].snapshot()
        direction = CAMERA_DIRECTIONS.get(cam['id'], f"Camera {cam['id']}")
        counts[direction] = snap['grand_total']
        total += snap['grand_total']
    avg_wait   = 0.0
    congestion = min(100, int(total / 3))
    if signal_ctrl:
        sig      = signal_ctrl.snapshot()
        avg_wait = sig['avg_wait']
        congestion = min(100, int(100 - sig['efficiency']))
    record = {
        'timestamp':          now.isoformat(),
        'hour':               now.strftime('%H:%M'),
        'counts':             counts,
        'totalVehicles':      total,
        'averageWaitSeconds': round(avg_wait, 1),
        'congestionIndex':    congestion,
    }
    with _event_lock:
        analytics_buffer.append(record)
        if len(analytics_buffer) > 100:
            analytics_buffer[:] = analytics_buffer[-100:]


def analytics_loop():
    time.sleep(3)           # let cameras warm up first
    while True:
        try:
            record_analytics()
        except Exception as e:
            print(f"[ANALYTICS] error: {e}")
        time.sleep(10)      # record every 10 s for responsive charts


# ── Flask ─────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)


def _mjpeg_gen(state: State):
    while True:
        frame = state.get_frame()
        if frame:
            yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame + b'\r\n'
        time.sleep(1.0 / TARGET_FPS)


@app.route('/video/<int:cam_id>')
def video_cam(cam_id):
    cam = get_cam(cam_id)
    if not cam:
        return 'Camera not found', 404
    return Response(_mjpeg_gen(cam['state']),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

# Backward-compat single stream (serves camera 1)
@app.route('/video')
def video_default():
    return video_cam(1)


@app.route('/api/counts/<int:cam_id>')
def api_counts_cam(cam_id):
    cam = get_cam(cam_id)
    if not cam:
        return jsonify({'error': 'not found'}), 404
    return jsonify(cam['state'].snapshot())


@app.route('/api/counts')
def api_counts_all():
    labels = list(dict.fromkeys(VEHICLE_CLS.values()))
    agg_total    = {v: 0 for v in labels}
    agg_on_screen = {v: 0 for v in labels}
    fps_sum = 0.0
    for cam in cameras:
        snap = cam['state'].snapshot()
        for v in labels:
            agg_total[v]     += snap['total'].get(v, 0)
            agg_on_screen[v] += snap['on_screen'].get(v, 0)
        fps_sum += snap['fps']
    return jsonify({
        'total':       agg_total,
        'on_screen':   agg_on_screen,
        'fps':         round(fps_sum / max(len(cameras), 1), 1),
        'source':      'all cameras',
        'grand_total': sum(agg_total.values()),
    })


@app.route('/api/history/<int:cam_id>')
def api_history_cam(cam_id):
    cam = get_cam(cam_id)
    if not cam:
        return jsonify([])
    return jsonify(cam['state'].get_history())


@app.route('/api/history')
def api_history_all():
    if not cameras:
        return jsonify([])
    # Merge histories by timestamp, summing on_screen
    merged: dict[int, dict] = {}
    for cam in cameras:
        for pt in cam['state'].get_history():
            ts = pt['ts']
            if ts not in merged:
                merged[ts] = {'ts': ts, 'on_screen': 0, 'types': {}}
            merged[ts]['on_screen'] += pt['on_screen']
            for k, v in pt.get('types', {}).items():
                merged[ts]['types'][k] = merged[ts]['types'].get(k, 0) + v
    return jsonify(sorted(merged.values(), key=lambda x: x['ts']))


@app.route('/api/reset/<int:cam_id>', methods=['POST'])
def api_reset_cam(cam_id):
    cam = get_cam(cam_id)
    if cam:
        cam['state'].reset()
    return jsonify({'ok': True})


@app.route('/api/reset', methods=['POST'])
def api_reset_all():
    for cam in cameras:
        cam['state'].reset()
    return jsonify({'ok': True})


@app.route('/api/cameras')
def api_cameras():
    return jsonify([{'id': c['id'], 'name': c['name'],
                     'source': c['video']} for c in cameras])


@app.route('/snapshot/<int:cam_id>')
def snapshot_cam(cam_id):
    cam = get_cam(cam_id)
    if not cam:
        return 'Camera not found', 404
    frame = cam['state'].get_frame()
    if not frame:
        return 'No frame yet', 503
    return Response(frame, mimetype='image/jpeg',
                    headers={'Cache-Control': 'no-cache, no-store',
                             'Access-Control-Allow-Origin': '*'})

@app.route('/api/signals')
def api_signals():
    if signal_ctrl is None:
        return jsonify({'error': 'not ready'}), 503
    return jsonify(signal_ctrl.snapshot())


@app.route('/api/signals/override', methods=['POST'])
def api_signals_override():
    if signal_ctrl is None:
        return jsonify({'error': 'not ready'}), 503
    data   = request.get_json(force=True, silent=True) or {}
    cam_id = data.get('cam_id')
    action = data.get('action', '')
    if cam_id is not None:
        cam_id = int(cam_id)
    signal_ctrl.apply_override(cam_id, action)
    direction = CAMERA_DIRECTIONS.get(cam_id, f"Camera {cam_id}") if cam_id else ''
    if action == 'EMERGENCY':
        sig = signal_ctrl.snapshot()
        if sig['emergency']:
            log_safety_event('EMERGENCY_START', 'Emergency stop activated — all signals held RED')
        else:
            log_safety_event('EMERGENCY_STOP', 'Emergency cleared — resuming automatic control')
    elif cam_id is not None:
        if action == 'FORCE_GREEN':
            log_safety_event('OVERRIDE_START', f'Force green applied to {direction} (Camera {cam_id})')
        elif action == 'HOLD_RED':
            log_safety_event('OVERRIDE_START', f'Hold red applied to {direction} (Camera {cam_id})')
        elif action == 'CLEAR':
            log_safety_event('OVERRIDE_STOP', f'Override cleared for {direction} (Camera {cam_id})')
        elif action == 'EXTEND':
            log_safety_event('SETTINGS_CHANGE', f'Green phase extended +10s for {direction} (Camera {cam_id})')
    return jsonify({'ok': True})


@app.route('/health')
def health():
    return jsonify({'ok': True, 'yolo': YOLO_OK,
                    'cameras': len(cameras)})


@app.route('/api/status')
def api_status():
    sig = signal_ctrl.snapshot() if signal_ctrl else {}
    return jsonify({
        'ok':           True,
        'cameras':      len(cameras),
        'yolo':         YOLO_OK,
        'analytics':    len(analytics_buffer),
        'safety_logs':  len(safety_log),
        'signal_phase': sig.get('phase', 'STARTUP'),
        'cycle_count':  sig.get('cycle_count', 0),
    })


@app.route('/api/analytics')
def api_analytics():
    with _event_lock:
        return jsonify(list(analytics_buffer))


@app.route('/api/safety-logs')
def api_safety_logs():
    with _event_lock:
        return jsonify(list(reversed(safety_log)))


# ── Entry point ───────────────────────────────────────────────────────────────
def signal_loop():
    while True:
        if signal_ctrl:
            try:
                signal_ctrl.tick()
            except Exception as e:
                print(f"[SIGNAL] tick error: {e}")
        time.sleep(0.5)


def main():
    global signal_ctrl
    build_cameras()

    print("\n  Intelli Traffic — Multi-Camera Vehicle Detection + Signal Control")
    print("  ──────────────────────────────────────────────────────────────────")
    for cam in cameras:
        status = cam['video'] or 'NOT FOUND'
        print(f"  [{cam['id']}] {cam['name']}: {status}")
    print(f"  YOLO    : {YOLO_MODEL if YOLO_OK else 'DISABLED'}")
    print(f"  Signals : http://localhost:{PORT}/api/signals")
    print(f"  Stream  : http://localhost:{PORT}/video/<1-4>\n")

    load_yolo()

    # Start camera processing threads
    for cam in cameras:
        t = threading.Thread(
            target=processing_loop,
            args=(cam['state'], cam['tracker'], cam['video']),
            daemon=True
        )
        t.start()

    # Start signal controller
    signal_ctrl = SignalController()
    threading.Thread(target=signal_loop, daemon=True).start()
    print("[SIGNAL] Controller started — adaptive 4-lane management active")

    # Start analytics recorder
    threading.Thread(target=analytics_loop, daemon=True).start()
    print("[ANALYTICS] Recording every 30s → /api/analytics | /api/safety-logs")

    app.run(host='0.0.0.0', port=PORT, threaded=True)


if __name__ == '__main__':
    main()
