"""
Intelli Traffic - 4-Lane Live Dashboard Server
Run: python dashboard_server.py [lane1.mp4 lane2.mp4 lane3.mp4 lane4.mp4]
URL: http://localhost:8080/dashboard
"""
import sys
import threading
import time
import argparse
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

try:
    from ultralytics import YOLO
    YOLO_OK = True
except ImportError:
    YOLO_OK = False
    print("Warning: ultralytics not installed — detection disabled.")

# ── Constants ──────────────────────────────────────────────────────────────
PORT          = 8080
YOLO_MODEL    = 'yolov8n.pt'
TARGET_FPS    = 15
JPEG_QUALITY  = 78

VEHICLE_CLASSES  = {2: 'Car', 3: 'Motorcycle', 5: 'Bus', 7: 'Truck'}
VEHICLE_WEIGHTS  = {'Car': 1.0, 'Motorcycle': 0.5, 'Bus': 2.5, 'Truck': 3.0}
EMERGENCY_CLS    = {5, 7}   # bus / truck flagged as potential emergency
EMERG_CONF_THR   = 0.72

MIN_GREEN   = 10
MAX_GREEN   = 60
DENSITY_CAP = 30
YELLOW_DUR  = 3
ALL_RED_DUR = 2

# ── YOLO model (shared, protected by lock) ─────────────────────────────────
_yolo: 'YOLO | None' = None
_yolo_lock = threading.Lock()


def _load_yolo():
    global _yolo
    if not YOLO_OK:
        return
    try:
        _yolo = YOLO(YOLO_MODEL)
        print(f"[YOLO] Model loaded: {YOLO_MODEL}")
    except Exception as exc:
        print(f"[YOLO] Load failed: {exc}")


# ── Lane Processor (one background thread per lane) ────────────────────────
class LaneProcessor:
    def __init__(self, idx: int, video_path: str | None):
        self.idx        = idx
        self.label      = f"Lane {idx + 1}"
        self.video_path = video_path
        self.density    = 0
        self.ambulance  = False
        self._raw_frame: np.ndarray | None = None
        self._lock      = threading.Lock()
        t = threading.Thread(target=self._loop, daemon=True, name=f"lane{idx}")
        t.start()

    # ── Public ────────────────────────────────────────────────────────────
    def get_raw(self) -> np.ndarray:
        """Return latest processed frame (without status bar)."""
        with self._lock:
            f = self._raw_frame
        return f.copy() if f is not None else self._blank()

    # ── Private ───────────────────────────────────────────────────────────
    def _loop(self):
        cap = self._open_cap()
        delay = 1.0 / TARGET_FPS

        while True:
            t0 = time.time()

            if cap and cap.isOpened():
                ok, raw = cap.read()
                if not ok:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ok, raw = cap.read()
                frame = raw if ok else self._blank()
            else:
                frame = self._blank()

            frame = cv2.resize(frame, (640, 400))
            frame, density, amb = self._detect(frame)
            self.density   = density
            self.ambulance = amb

            with self._lock:
                self._raw_frame = frame

            time.sleep(max(0.0, delay - (time.time() - t0)))

    def _open_cap(self):
        if self.video_path and Path(self.video_path).exists():
            cap = cv2.VideoCapture(self.video_path)
            if cap.isOpened():
                return cap
        return None

    def _detect(self, frame: np.ndarray):
        density   = 0
        ambulance = False

        cv2.putText(frame, self.label, (10, 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)

        if _yolo is None:
            return frame, density, ambulance

        with _yolo_lock:
            results = _yolo(frame, verbose=False, conf=0.35)[0]

        for box in results.boxes:
            cls_id = int(box.cls[0].item())
            if cls_id not in VEHICLE_CLASSES:
                continue

            conf  = float(box.conf[0].item())
            label = VEHICLE_CLASSES[cls_id]
            density += VEHICLE_WEIGHTS.get(label, 1.0)

            is_emg = cls_id in EMERGENCY_CLS and conf >= EMERG_CONF_THR
            if is_emg:
                ambulance = True

            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            color = (30, 30, 220) if is_emg else (30, 200, 30)

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            txt = f"{label} {conf:.2f}"
            (tw, th), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, 0.44, 1)
            ty = max(y1, th + 6)
            cv2.rectangle(frame, (x1, ty - th - 6), (x1 + tw + 4, ty), color, -1)
            cv2.putText(frame, txt, (x1 + 2, ty - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.44, (255, 255, 255), 1, cv2.LINE_AA)

        return frame, int(density), ambulance

    @staticmethod
    def _blank() -> np.ndarray:
        f = np.zeros((400, 640, 3), np.uint8)
        cv2.putText(f, 'No video', (240, 200),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (70, 70, 70), 2, cv2.LINE_AA)
        return f


# ── Traffic Controller ─────────────────────────────────────────────────────
class TrafficController:
    def __init__(self, n: int = 4):
        self.n         = n
        self.current   = 0
        self.phase     = 'GREEN'
        self.t         = 0.0
        self.emergency: int | None = None
        self._lock     = threading.Lock()
        self._lights   = ['GREEN'] + ['RED'] * (n - 1)
        self._timers   = [MIN_GREEN] + [0] * (n - 1)

    def update(self, dt: float, densities: list[int]):
        with self._lock:
            if self.emergency is not None:
                self._lights = ['RED'] * self.n
                self._lights[self.emergency] = 'GREEN'
                self._timers = [0] * self.n
                self._timers[self.emergency] = 99
                return

            self.t += dt

            if self.phase == 'GREEN':
                g = self._calc_green(densities[self.current])
                remaining = max(0, g - self.t)
                self._timers[self.current] = int(remaining)

                if self.t >= g:
                    self._lights[self.current] = 'YELLOW'
                    self.phase = 'YELLOW'
                    self.t = 0

            elif self.phase == 'YELLOW':
                self._timers[self.current] = 0
                if self.t >= YELLOW_DUR:
                    self._lights[self.current] = 'RED'
                    self.phase = 'ALL_RED'
                    self.t = 0

            elif self.phase == 'ALL_RED':
                if self.t >= ALL_RED_DUR:
                    self.current = (self.current + 1) % self.n
                    g = self._calc_green(densities[self.current])
                    self._lights[self.current] = 'GREEN'
                    self._timers[self.current] = int(g)
                    self.phase = 'GREEN'
                    self.t = 0

    def snapshot(self):
        with self._lock:
            return list(self._lights), list(self._timers)

    def set_emergency(self, lane: int):
        with self._lock:
            self.emergency = lane

    def clear_emergency(self):
        with self._lock:
            self.emergency = None
            self._lights = ['RED'] * self.n
            self._lights[self.current] = 'GREEN'
            self.phase = 'GREEN'
            self.t = 0

    @staticmethod
    def _calc_green(density: int) -> int:
        if density <= 0:
            return MIN_GREEN
        return int(MIN_GREEN + (MAX_GREEN - MIN_GREEN) * min(1.0, density / DENSITY_CAP))


# ── Globals ────────────────────────────────────────────────────────────────
processors: list[LaneProcessor] = []
controller = TrafficController(4)


def _traffic_loop():
    last = time.time()
    while True:
        now = time.time()
        densities = [p.density for p in processors]
        controller.update(now - last, densities)
        last = now
        time.sleep(0.1)


# ── Status bar overlay ─────────────────────────────────────────────────────
def _draw_status(frame: np.ndarray, density: int, ambulance: bool,
                 timer: int, light: str) -> np.ndarray:
    h, w = frame.shape[:2]
    bar_h = 36
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, h - bar_h), (w, h), (15, 15, 15), -1)
    cv2.addWeighted(overlay, 0.82, frame, 0.18, 0, frame)

    amb_text  = "Yes" if ambulance else "No"
    time_text = str(timer) if timer > 0 else "--"
    status    = f"Density: {density}  |  Ambulance: {amb_text}  |  Time: {time_text}"

    amb_color = (60, 60, 220) if ambulance else (200, 200, 200)
    cv2.putText(frame, status, (10, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.58, amb_color, 1, cv2.LINE_AA)
    return frame


# ── MJPEG stream generator ─────────────────────────────────────────────────
def _stream(lane_idx: int):
    delay = 1.0 / TARGET_FPS
    while True:
        t0    = time.time()
        frame = processors[lane_idx].get_raw()

        lights, timers = controller.snapshot()
        frame = _draw_status(frame,
                             processors[lane_idx].density,
                             processors[lane_idx].ambulance,
                             timers[lane_idx],
                             lights[lane_idx])

        ok, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if ok:
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n'
                   + buf.tobytes() + b'\r\n')

        time.sleep(max(0.0, delay - (time.time() - t0)))


# ── Flask app ──────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)


@app.route('/dashboard')
def dashboard():
    return DASHBOARD_HTML


@app.route('/video/<int:lane_id>')
def video_feed(lane_id: int):
    if lane_id < 1 or lane_id > 4:
        return 'Invalid lane', 404
    return Response(_stream(lane_id - 1),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/api/state')
def api_state():
    lights, timers = controller.snapshot()
    return jsonify({
        'lights':     lights,
        'timers':     timers,
        'densities':  [p.density   for p in processors],
        'ambulances': [p.ambulance for p in processors],
    })


@app.route('/api/emergency', methods=['POST'])
def api_emergency():
    data   = request.get_json(force=True) or {}
    action = data.get('action', 'stop')
    lane   = int(data.get('lane', 0))
    if action == 'start' and 0 <= lane < 4:
        controller.set_emergency(lane)
        return jsonify({'ok': True, 'msg': f'Emergency active on Lane {lane + 1}'})
    controller.clear_emergency()
    return jsonify({'ok': True, 'msg': 'Emergency cleared'})


# ── Embedded HTML ──────────────────────────────────────────────────────────
DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Traffic Dashboard - ITMS</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#111;color:#eee;font-family:'Segoe UI',sans-serif;min-height:100vh}
  h1{text-align:center;padding:18px 0 12px;font-size:1.9rem;letter-spacing:.04em;
     color:#fff;border-bottom:2px solid #222}
  .emergency-bar{display:flex;justify-content:center;gap:10px;padding:10px;
                 background:#1a1a1a;border-bottom:1px solid #2a2a2a;flex-wrap:wrap}
  .emergency-bar button{padding:7px 18px;border:none;border-radius:6px;
                         cursor:pointer;font-size:.8rem;font-weight:600;transition:.15s}
  .btn-emg{background:#c0392b;color:#fff}
  .btn-emg:hover{background:#e74c3c}
  .btn-emg.active{background:#e74c3c;box-shadow:0 0 10px rgba(231,76,60,.6)}
  .btn-clear{background:#27ae60;color:#fff}
  .btn-clear:hover{background:#2ecc71}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px;max-width:1440px;margin:0 auto}
  .cell{background:#1c1c1c;border-radius:10px;overflow:hidden;
        border:1px solid #2a2a2a;display:flex;align-items:stretch}
  .tlight{width:54px;background:#0d0d0d;display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:10px;padding:12px 0;
          border-right:1px solid #222;flex-shrink:0}
  .bulb{width:26px;height:26px;border-radius:50%;transition:box-shadow .3s,background .3s}
  .bulb-r{background:#3a0a0a} .bulb-y{background:#3a2d00} .bulb-g{background:#0a2a0a}
  .bulb-r.on{background:#e74c3c;box-shadow:0 0 14px #e74c3c}
  .bulb-y.on{background:#f1c40f;box-shadow:0 0 14px #f1c40f}
  .bulb-g.on{background:#2ecc71;box-shadow:0 0 14px #2ecc71}
  .feed{flex:1;display:flex;flex-direction:column}
  .feed img{width:100%;height:auto;display:block;object-fit:cover}
  .feed-loading{flex:1;display:flex;align-items:center;justify-content:center;
                min-height:200px;color:#444;font-size:.85rem}
  @media(max-width:800px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<h1>Live Traffic Dashboard</h1>

<div class="emergency-bar">
  <strong style="align-self:center;margin-right:6px;font-size:.82rem;color:#aaa">
    EMERGENCY OVERRIDE:
  </strong>
  <button class="btn-emg" id="emg0" onclick="setEmergency(0)">🚨 Lane 1</button>
  <button class="btn-emg" id="emg1" onclick="setEmergency(1)">🚨 Lane 2</button>
  <button class="btn-emg" id="emg2" onclick="setEmergency(2)">🚨 Lane 3</button>
  <button class="btn-emg" id="emg3" onclick="setEmergency(3)">🚨 Lane 4</button>
  <button class="btn-clear" onclick="clearEmergency()">✅ Clear Emergency</button>
</div>

<div class="grid" id="grid">
</div>

<script>
const N = 4;
let activeEmergency = -1;

// Build grid cells
const grid = document.getElementById('grid');
for (let i = 0; i < N; i++) {
  grid.innerHTML += `
    <div class="cell" id="cell${i}">
      <div class="tlight" id="tl${i}">
        <div class="bulb bulb-r" id="r${i}"></div>
        <div class="bulb bulb-y" id="y${i}"></div>
        <div class="bulb bulb-g" id="g${i}"></div>
      </div>
      <div class="feed">
        <img src="/video/${i+1}" alt="Lane ${i+1}" onerror="this.style.display='none'">
      </div>
    </div>`;
}

function applyLight(idx, state) {
  document.getElementById('r'+idx).className = 'bulb bulb-r' + (state === 'RED'    ? ' on' : '');
  document.getElementById('y'+idx).className = 'bulb bulb-y' + (state === 'YELLOW' ? ' on' : '');
  document.getElementById('g'+idx).className = 'bulb bulb-g' + (state === 'GREEN'  ? ' on' : '');
}

async function pollState() {
  try {
    const r = await fetch('/api/state');
    const d = await r.json();
    for (let i = 0; i < N; i++) {
      applyLight(i, d.lights[i]);
    }
  } catch(e) { /* silent */ }
}

async function setEmergency(lane) {
  activeEmergency = lane;
  document.querySelectorAll('[id^=emg]').forEach(b => b.classList.remove('active'));
  document.getElementById('emg'+lane).classList.add('active');
  await fetch('/api/emergency', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({action:'start', lane})
  });
}

async function clearEmergency() {
  activeEmergency = -1;
  document.querySelectorAll('[id^=emg]').forEach(b => b.classList.remove('active'));
  await fetch('/api/emergency', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({action:'stop'})
  });
}

setInterval(pollState, 500);
pollState();
</script>
</body>
</html>
"""


# ── Entry point ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='4-Lane Traffic Dashboard Server')
    parser.add_argument('videos', nargs='*', help='Video files for lanes 1-4')
    parser.add_argument('--port', type=int, default=PORT)
    args = parser.parse_args()

    # Resolve video sources (fill missing lanes with fallback)
    fallback_videos = [
        'traffic_4way_simulation.mp4',
        'traffic_processed.mp4',
    ]
    fallback = next((v for v in fallback_videos if Path(v).exists()), None)

    video_sources: list[str | None] = []
    for i in range(4):
        if i < len(args.videos) and Path(args.videos[i]).exists():
            video_sources.append(args.videos[i])
        else:
            video_sources.append(fallback)

    print("\n  Intelli Traffic — 4-Lane Dashboard")
    print("  ─────────────────────────────────────")
    for i, v in enumerate(video_sources):
        status = v if v else '✗ no video (blank feed)'
        print(f"  Lane {i+1}: {status}")

    # Init lane processors
    for i, v in enumerate(video_sources):
        processors.append(LaneProcessor(i, v))

    # Load YOLO (blocking, so it's ready before first frame)
    _load_yolo()

    # Start traffic control loop
    threading.Thread(target=_traffic_loop, daemon=True, name='ctrl').start()

    port = args.port
    print(f"\n  Dashboard → http://localhost:{port}/dashboard")
    print("  Press Ctrl-C to stop\n")
    app.run(host='0.0.0.0', port=port, threaded=True, use_reloader=False)


if __name__ == '__main__':
    main()
