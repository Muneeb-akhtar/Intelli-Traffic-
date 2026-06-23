# Intelli Traffic — AI Adaptive Traffic Signal Command Center

Intelli Traffic is a real-time, AI-driven traffic control system developed as a Final Year Project. It replaces traditional, pre-programmed traffic signal timers with dynamic, density-based signal adjustments. Using computer vision (YOLOv8) to analyze lane-wise traffic density, the system optimizes signal transitions, minimizes overall delay, and provides an operations dashboard for manual bypass and analytics monitoring.

---

## 🏗️ System Architecture

The project consists of three main components:
1. **AI & Computer Vision Module (`/ai_module`)**: A Python application that performs vehicle detection, classification, and density calculation using OpenCV and Ultralytics YOLOv8. It streams lane-wise vehicle counts to the backend API.
2. **Decision Engine & API Server (`/backend`)**: A Node.js + Express.js server that runs the adaptive signal timing algorithm, maintains traffic signal state machines (Green, Yellow, Red transition safety buffers), manages WebSockets broadcasting, and logs operations database analytics in a local JSON storage layer.
3. **Operations Dashboard (`/frontend`)**: A React + TypeScript + Tailwind CSS web application that renders a live 4-way intersection mapping visualizer, real-time counters, active timers, administrative overrides, and historical charts.

---

## ⚡ Quick Start (Node.js & Web Simulation)

To run the entire system simulation locally with **zero external account setups** and **no Python requirements**, use the self-contained Node.js environment.

### 1. Prerequisites
* [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
* npm (comes bundled with Node.js)

### 2. Bootstrapping and Installation
Open your terminal in the root directory (`c:\Final Year Project`) and run the setup script:
```bash
# Installs packages in the root, backend, and frontend
npm install
npm run setup
```

### 3. Running the Simulation
Launch both the Decision Engine backend and React dashboard simultaneously with a single command:
```bash
npm run dev
```

* **Frontend Dashboard**: Open [http://localhost:3000](http://localhost:3000) in your web browser.
* **Backend REST Server**: Running at [http://localhost:5000](http://localhost:5000).
* **WebSocket Broadcaster**: Operating at `ws://localhost:5000`.

*The dashboard will immediately start showing real-time traffic signal cycles, live vehicle queue clearances, and fluctuating lane densities using our built-in high-fidelity background simulator!*

---

## 🧠 Running the Computer Vision YOLOv8 Module (`/ai_module`)

Once you install Python, you can plug in the real YOLOv8 webcam/video detector.

### 1. Requirements
* [Python 3.8 - 3.11](https://www.python.org/)
* Pip (Python package installer)

### 2. Setup Virtual Environment & Dependencies
```bash
cd ai_module
python -m venv venv
venv\Scripts\activate

# Install YOLOv8, OpenCV, and HTTP client dependencies
pip install -r requirements.txt
```

### 3. Run AI Vehicle Tracking
Run in **Simulation Mode** (sends simulated densities using Python logic):
```bash
python main.py --mode sim --interval 2.0
```

Run in **YOLO Mode** (runs real vehicle detection on pre-recorded traffic footage):
```bash
python main.py --mode yolo --video "/path/to/traffic_footage.mp4"
```
*Press `q` inside the OpenCV window to close the video capture.*

---

## 🛠️ Tech Stack Specs

* **Frontend**: Vite, React.js, TypeScript, Tailwind CSS v4, Recharts, Lucide React.
* **Backend**: Node.js, Express.js, WebSockets (`ws`), dotenv.
* **Database**: Local JSON File Database (automatic hourly data seeder on startup).
* **AI Module**: Python, OpenCV, Ultralytics YOLOv8 (yolov8n Nano model weights).
