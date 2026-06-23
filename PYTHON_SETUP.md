# 🚦 4-Way Vision-Based Smart Traffic System - Python Implementation

A **production-ready Python system** for adaptive traffic signal control using AI-powered vehicle detection, density analysis, and real-time dashboard visualization.

---

## 📋 Table of Contents

- [System Overview](#system-overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Running the System](#running-the-system)
- [Component Details](#component-details)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## 🎯 System Overview

This Python-based traffic control system replaces traditional fixed-time traffic signals with **intelligent, density-based adaptive control**. The system:

1. **Generates synthetic 4-way traffic video** with realistic vehicle patterns
2. **Detects and classifies vehicles** using YOLOv8 (car, motorcycle, truck, bus, ambulance)
3. **Calculates traffic density scores** weighted by vehicle type
4. **Dynamically adjusts signal timing** based on real-time lane congestion
5. **Detects emergency vehicles** (ambulances) for priority routing
6. **Provides real-time visualization** via Streamlit dashboard

### Key Features

| Feature | Details |
|---------|---------|
| **AI Model** | YOLOv8 nano (real-time detection) |
| **Input** | Video streams (MP4 format) |
| **Vehicle Detection** | Cars, motorcycles, buses, trucks, ambulances |
| **ROI Processing** | 4 distinct zones (North, South, East, West) |
| **Timing Logic** | Dynamic green duration: min=10s, max=60s |
| **Emergency Override** | Ambulance detection → 60s green for that lane |
| **Dashboard** | Real-time Streamlit UI with controls |
| **Output** | Processed video + state logs (JSONL) |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│   INPUT: Video Stream (MP4)                             │
│   traffic_4way_simulation.mp4                           │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────▼─────────────┐
        │  Phase 1: Video Generator │
        │ (generate_traffic_video.py)
        │  • 4-way intersection    │
        │  • Realistic vehicle flow │
        │  • Ambulance sprites     │
        └────────────┬─────────────┘
                     │
        ┌────────────▼──────────────────┐
        │ Phase 2: Traffic Engine       │
        │ (traffic_system.py)          │
        │ • YOLO detection             │
        │ • ROI zone assignment        │
        │ • Density calculation        │
        │ • Signal timing logic        │
        │ • State logging              │
        └──┬───────────────────────┬───┘
           │                       │
      OUTPUT:             OUTPUT:
  traffic_processed.mp4  traffic_state.jsonl
           │                       │
        ┌──▼───────────────────────▼──┐
        │  Phase 3: Streamlit Dashboard│
        │        (app.py)              │
        │  • Video playback            │
        │  • Traffic light display     │
        │  • Density charts            │
        │  • Emergency controls        │
        │  • Real-time metrics         │
        └──────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.8+** installed on your system
- **pip** or **uv** package manager
- **4 GB RAM** minimum (for YOLO model)
- **Webcam or video file** (optional, system generates synthetic video)

### 5-Minute Setup

```bash
# 1. Install dependencies
cd ai_module
pip install -r requirements.txt

# 2. Generate mock traffic video (takes ~1-2 minutes)
cd ..
python ai_module/generate_traffic_video.py

# 3. Process video with YOLO detection
python ai_module/traffic_system.py --video traffic_4way_simulation.mp4

# 4. Launch dashboard (opens in browser)
streamlit run app.py
```

**Result:** Dashboard opens at `http://localhost:8501`

---

## 📦 Installation

### Step 1: Install Python Dependencies

```bash
# Navigate to AI module
cd c:\Final Year Project\ai_module

# Install all required packages
pip install -r requirements.txt
```

**Required Packages:**
- `ultralytics` — YOLOv8 model
- `opencv-python` — Video processing
- `numpy` — Numerical computing
- `streamlit` — Dashboard framework
- `plotly` — Interactive charts
- `requests` — HTTP requests
- `python-dotenv` — Environment config
- `Pillow` — Image utilities

### Step 2: Verify Installation

```bash
# Test imports
python -c "import cv2, ultralytics, streamlit, plotly; print('✓ All packages installed')"
```

### Step 3: Download YOLO Model (First Run Only)

The YOLO model downloads automatically on first run (~100 MB). Ensure internet connection.

```bash
# Pre-download model
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

---

## ▶️ Running the System

### Phase 1: Generate Mock Traffic Video

Creates a synthetic 5-minute traffic video with 4-way intersection simulation.

```bash
python ai_module/generate_traffic_video.py
```

**Output:**
- `traffic_4way_simulation.mp4` (~500-800 MB)
- 1920×1080 @ 30 FPS
- 4-way intersection with moving vehicles

**Expected time:** 1-2 minutes

---

### Phase 2: Process Video with Traffic Engine

Detects vehicles, calculates densities, and generates state logs.

```bash
python ai_module/traffic_system.py --video traffic_4way_simulation.mp4 --output traffic_processed.mp4
```

**Command-line options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--video` | `traffic_4way_simulation.mp4` | Input video file path |
| `--output` | `traffic_processed.mp4` | Processed video output path |
| `--state-log` | `traffic_state.jsonl` | State logs output path (JSONL format) |
| `--skip-frames` | `1` | Process every Nth frame (1=all frames) |
| `--yolo-model` | `yolov8n.pt` | YOLO model weights path |

**Outputs:**
- `traffic_processed.mp4` — Processed video with ROI overlays + YOLO bboxes + traffic lights
- `traffic_state.jsonl` — State logs (one JSON object per frame)

**Expected time:** 2-5 minutes (depending on skip-frames)

**Example with frame skipping (faster processing):**
```bash
python ai_module/traffic_system.py --skip-frames 3
```

---

### Phase 3: Launch Streamlit Dashboard

Displays real-time visualization, metrics, and emergency controls.

```bash
streamlit run app.py
```

**Dashboard opens at:** `http://localhost:8501`

**Features:**
- 📹 Live video playback with frame slider
- 🚦 Traffic light status for all 4 lanes
- 📊 Real-time density charts
- 🚗 Vehicle count breakdown
- 🚨 Emergency override buttons (one per lane)
- 📋 Lane-wise detailed metrics
- ⚙️ Playback speed control

---

## 📄 Component Details

### 1. Video Generator (`ai_module/generate_traffic_video.py`)

**Purpose:** Creates realistic synthetic traffic video for testing without real-world footage.

**Key Classes:**
- `Vehicle` — Represents individual moving vehicles
- `TrafficVideoGenerator` — Main video generation engine

**Features:**
- 4-way crossroad layout (North/South/East/West)
- Realistic traffic density cycles (sine wave patterns)
- Mixed vehicle types: cars (70%), motorcycles (15%), buses (10%), ambulances (5%)
- ROI zone visualization with semi-transparent overlays
- Lane dividers and intersection markers

**Configuration (in `__main__`):**
```python
generator = TrafficVideoGenerator(
    output_path='traffic_4way_simulation.mp4',
    width=1920,           # Frame width
    height=1080,          # Frame height
    fps=30,               # Frames per second
    duration_sec=300      # Total duration (5 minutes)
)
```

**Output JSON Structure:**
```
traffic_4way_simulation.mp4 (1920x1080, 30 FPS, 300s)
```

---

### 2. Traffic System Engine (`ai_module/traffic_system.py`)

**Purpose:** Detects vehicles, calculates density, manages traffic signals, and logs state.

**Key Classes:**

#### `TrafficROIManager`
Manages 4 ROI (Region of Interest) zones for vehicle assignment.

```python
roi_manager = TrafficROIManager(frame_width, frame_height)
roi_manager.point_in_roi(x, y, 'North')  # Check if point in zone
roi_manager.draw_rois(frame)              # Visualize zones
```

**ROI Zones (normalized 0.0-1.0):**
| Lane | X Range | Y Range | Purpose |
|------|---------|---------|---------|
| North | 0.30–0.70 | 0.00–0.20 | Top approach |
| South | 0.30–0.70 | 0.80–1.00 | Bottom approach |
| East | 0.80–1.00 | 0.30–0.70 | Right approach |
| West | 0.00–0.20 | 0.30–0.70 | Left approach |

#### `TrafficDensityCalculator`
Calculates weighted traffic density scores.

```python
calc = TrafficDensityCalculator(min_green=10, max_green=60, density_cap=30)

# Vehicle weights (importance for signal timing)
weights = {
    'car': 1.0,
    'motorcycle': 0.5,
    'truck': 3.0,
    'bus': 2.5
}

# Calculate density
density = calc.calculate_density_score({'car': 5, 'bus': 1})  # Returns: 5*1.0 + 1*2.5 = 7.5

# Convert to green duration
green_duration = calc.density_to_green_duration(7.5)  # Returns: ~20 seconds
```

**Density Formula:**
```
density_score = Σ(vehicle_count × weight)
green_duration = min_green + (max_green - min_green) × (density / density_cap)
```

#### `AdaptiveTrafficController`
Manages traffic signal state machine and timing.

```python
controller = AdaptiveTrafficController()

# Update each frame
state = controller.update(delta_time=0.033, density_scores={...})

# Trigger emergency
controller.set_emergency('North')  # 60s green for North lane
```

**Signal State Machine:**
```
GREEN (10-60s) → YELLOW (3s) → RED (2s) → next lane GREEN
```

**Emergency Override:**
- Ambulance detected → grant immediate green for that lane
- Duration: 60 seconds
- Overrides normal signal cycling

#### `TrafficSystemEngine`
Main orchestration engine combining all components.

```python
engine = TrafficSystemEngine('traffic_4way_simulation.mp4')
engine.process_video(output_video='traffic_processed.mp4')
engine.save_state_logs('traffic_state.jsonl')
```

**Processing Pipeline:**
1. Load video frame
2. Detect vehicles with YOLO
3. Assign vehicles to ROI zones
4. Calculate density scores
5. Update traffic controller state
6. Draw overlays (ROI, YOLO boxes, traffic lights)
7. Save frame to output video
8. Log state to JSONL

---

### 3. Streamlit Dashboard (`app.py`)

**Purpose:** Real-time visualization and manual control interface.

**Key Features:**

#### Video Playback
- Frame slider to navigate video
- Play/pause controls
- Adjustable playback speed (0.25x to 4.0x)
- Displays current frame with all overlays

#### Traffic Signal Display
- 4 large status indicators (🟢 GREEN / 🟡 YELLOW / 🔴 RED)
- One per lane (North/South/East/West)
- Real-time state updates synchronized to video

#### Density Metrics
- **Gauge Chart:** Current density scores for all lanes
- **Stacked Bar Chart:** Vehicle count breakdown (car/motorcycle/truck/bus)
- **Progress Bars:** Visual representation of lane congestion

#### Emergency Controls
- 4 buttons: one per lane (🔼 North, 🔽 South, ▶️ East, ◀️ West)
- Click to simulate ambulance detection
- 60-second override duration
- "Clear All Emergencies" reset button

#### Lane-Wise Details
- Vehicle counts by type per lane
- Density score display
- Emergency status indicator

#### System Metrics
- Current traffic cycle number
- Green lane identification
- Total vehicles detected
- Average system density

---

## ⚙️ Configuration

### Video Generation Settings

Edit `ai_module/generate_traffic_video.py`:

```python
generator = TrafficVideoGenerator(
    output_path='traffic_4way_simulation.mp4',
    width=1920,              # Resolution width
    height=1080,             # Resolution height
    fps=30,                  # Frames per second
    duration_sec=300         # Total duration in seconds
)
```

### Traffic Engine Settings

Edit `ai_module/traffic_system.py` in `TrafficDensityCalculator.__init__()`:

```python
density_calculator = TrafficDensityCalculator(
    min_green=10,           # Minimum green duration (seconds)
    max_green=60,           # Maximum green duration (seconds)
    density_cap=30          # Vehicle count for max green
)
```

### Vehicle Weights

Edit `TrafficDensityCalculator.VEHICLE_WEIGHTS`:

```python
VEHICLE_WEIGHTS = {
    'car': 1.0,             # Standard weight
    'motorcycle': 0.5,      # Half weight (takes less space)
    'truck': 3.0,           # Heavy vehicle
    'bus': 2.5              # Public transport
}
```

### Signal Timings

Edit `AdaptiveTrafficController` constants:

```python
YELLOW_DURATION = 3        # Yellow light duration (seconds)
ALL_RED_DURATION = 2       # Safety buffer between signals
EMERGENCY_DURATION = 60    # Emergency override duration
```

---

## 🐛 Troubleshooting

### Problem: YOLO Model Not Found / Slow Download

**Solution:** Pre-download the model:
```bash
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

If that fails, manually download from [Ultralytics GitHub](https://github.com/ultralytics/assets/releases) and place in `~/.local/share/ultralytics/` or provide path via `--yolo-model` argument.

---

### Problem: Video File Not Generated

**Solution:** Verify OpenCV is working:
```bash
python -c "import cv2; print(cv2.__version__)"
```

Ensure write permissions in workspace directory.

---

### Problem: Streamlit Dashboard Shows "Video Not Found"

**Solution:** Ensure processing pipeline completed:

1. ✓ Generate video: `python ai_module/generate_traffic_video.py`
2. ✓ Process video: `python ai_module/traffic_system.py`
3. ✓ Then run dashboard: `streamlit run app.py`

Check file existence:
```bash
ls -la traffic_4way_simulation.mp4 traffic_processed.mp4 traffic_state.jsonl
```

---

### Problem: Out of Memory (YOLO Inference)

**Solution:** Skip frames during processing:

```bash
python ai_module/traffic_system.py --skip-frames 3
```

Or use lighter YOLO model:
```bash
python ai_module/traffic_system.py --yolo-model yolov8n.pt
```

---

### Problem: Slow Video Processing

**Solution:** 

1. **Skip frames:**
   ```bash
   python ai_module/traffic_system.py --skip-frames 2  # Process every 2nd frame
   ```

2. **Don't save output video:**
   ```bash
   python ai_module/traffic_system.py --output ""  # Empty string to skip
   ```

3. **Use GPU (if available):**
   YOLO automatically uses GPU if available. Verify with:
   ```bash
   python -c "from ultralytics import YOLO; m = YOLO('yolov8n.pt'); print(m.device)"
   ```

---

## 📊 Output File Formats

### State Logs (JSONL)

`traffic_state.jsonl` — One JSON object per line:

```json
{
  "frame": 0,
  "timestamp": "2026-06-16T10:30:45.123456",
  "lane_vehicles": {
    "North": {"car": 3, "motorcycle": 1, "truck": 0, "bus": 0},
    "South": {"car": 5, "motorcycle": 2, "truck": 1, "bus": 0},
    "East": {"car": 2, "motorcycle": 0, "truck": 0, "bus": 1},
    "West": {"car": 4, "motorcycle": 1, "truck": 0, "bus": 0}
  },
  "lane_densities": {
    "North": 4.5,
    "South": 9.5,
    "East": 2.5,
    "West": 5.5
  },
  "traffic_state": {
    "timestamp": "2026-06-16T10:30:45.123456",
    "current_lane": "South",
    "lane_states": {
      "North": "RED",
      "South": "GREEN",
      "East": "RED",
      "West": "RED"
    },
    "time_in_state": 2.5,
    "emergency_active": false,
    "emergency_lane": null,
    "cycle_count": 1
  }
}
```

---

## 📚 Additional Resources

- **YOLO Documentation:** https://docs.ultralytics.com/
- **OpenCV Documentation:** https://docs.opencv.org/
- **Streamlit Documentation:** https://docs.streamlit.io/

---

## 📝 License & Attribution

This project demonstrates AI-powered adaptive traffic control using open-source libraries. Suitable for educational, research, and commercial applications.

**Built with:**
- OpenCV (vehicle detection input)
- YOLOv8 (vehicle classification)
- Streamlit (dashboard)
- Plotly (visualization)

---

## 🤝 Support

For issues, questions, or improvements:

1. Check [Troubleshooting](#troubleshooting) section
2. Review component documentation above
3. Check component source code comments

---

**Last Updated:** 2026-06-16  
**Python Version:** 3.8+  
**Status:** ✅ Production Ready
