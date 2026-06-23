# Implementation Plan: Intelli Traffic (Adaptive Traffic Control System)

Intelli Traffic is a real-time, AI-driven traffic control system designed to replace static traffic timers with dynamic, density-based signal adjustments. Using computer vision (YOLOv8) to analyze lane-wise traffic density, the system optimizes signal transitions, reduces wait times, and provides a premium administrative dashboard with real-time controls and overrides.

This plan details the full-stack architecture, including the Python YOLOv8 module, Node.js/Express.js backend, React/Next.js frontend dashboard, and centralized database layer, tailored specifically for a high-fidelity simulation.

---

## User Review Required

> [!IMPORTANT]
> **Tailwind CSS & Framework Confirmation**
> The system spec mentions Tailwind CSS, React, and Next.js. We will set up the frontend using Vite + React + TypeScript + Tailwind CSS (v4 or v3) for a lightning-fast, high-performance local simulation. Please confirm if this is acceptable or if you specifically require a Next.js pages/app router structure.

> [!NOTE]
> **Database Recommendation**
> To keep the simulation highly portable, reliable, and runable with zero external account dependencies, we propose using **SQLite** (via Prisma or direct drivers) for local storage, while structuring the database code so it can easily swap to MongoDB or Supabase (PostgreSQL) by changing environment variables. 

---

## Proposed System Architecture

We will structure the project under a modular monorepo:
```
/intelli-traffic/
├── ai_module/          # Python AI & Computer Vision (YOLOv8 & Density Simulator)
├── backend/            # Node.js + Express.js API & Decision Engine
└── frontend/           # React + Tailwind CSS Operations Dashboard
```

```mermaid
graph TD
    subgraph AI Module (Python)
        YOLO[YOLOv8 Vehicle Detector] --> |Vehicle Counts| Client[API client]
        Sim[Traffic Simulator Fallback] --> Client
    end
    
    subgraph Backend Engine (Node.js/Express)
        Server[Express Server] --> |REST APIs| DB[(SQLite/Supabase DB)]
        Server --> |WebSocket / Server-Sent Events| Sync[Real-time Sync]
        Alg[Adaptive Signal Algorithm] --> |Calculates Durations| Server
    end
    
    subgraph Frontend Dashboard (React/Tailwind)
        Dash[Operations Dashboard] --> |Manual Override| Server
        Sync --> |Real-time Updates| Dash
        Dash --> |Historical Analytics| DB
    end
```

---

## Proposed Changes

### 1. Root & Orchestration
Initialize the workspace structure and setup convenient scripts to run the entire simulation with a single command.

#### [NEW] [package.json](file:///c:/Final%20Year%20Project/package.json)
* Setup workspace configurations and root scripts (`npm run dev:all`, `npm run setup`) to install dependencies in backend, frontend, and configure the Python virtual environment.

---

### 2. AI & Computer Vision Module (`ai_module/`)
Implements vehicle detection and count streaming. It will feature a dual-mode engine:
1. **YOLO Mode**: Uses OpenCV and Ultralytics YOLOv8 to run detection on pre-recorded traffic video clips or webcam feeds.
2. **Simulation Mode (Fallback)**: Generates highly realistic lane-wise traffic trends (rush hours, emergency vehicle triggers, random blockages) when python YOLO dependencies or heavy GPUs are unavailable.

#### [NEW] [requirements.txt](file:///c:/Final%20Year%20Project/ai_module/requirements.txt)
* Core Python dependencies: `ultralytics`, `opencv-python`, `requests`, `numpy`, `python-dotenv`.

#### [NEW] [detector.py](file:///c:/Final%20Year%20Project/ai_module/detector.py)
* Loads YOLOv8 weights (YOLOv8n).
* Reads from a video file or webcam, performs lane-wise bounding box detection, and classifies objects (`car`, `bus`, `truck`, `motorcycle`).
* Groups vehicles by predefined lane zones and calculates lane density.

#### [NEW] [simulator.py](file:///c:/Final%20Year%20Project/ai_module/simulator.py)
* A high-fidelity generator that produces realistic, dynamic traffic density streams (e.g., simulating traffic jams on Lane A, clear paths on Lane B, and sudden emergency vehicles).

#### [NEW] [main.py](file:///c:/Final%20Year%20Project/ai_module/main.py)
* Entry point for the AI module. Sets up configuration, checks for video files, runs either `detector.py` or falls back to `simulator.py`, and posts counts to the backend API at a configured interval (e.g., every 2 seconds).

---

### 3. Backend Decision Engine (`backend/`)
Processes density data, executes the adaptive signal timing algorithm, manages the current state of the intersection, and broadcasts states.

#### [NEW] [package.json](file:///c:/Final%20Year%20Project/backend/package.json)
* Dependencies: `express`, `cors`, `dotenv`, `sqlite3`, `ws` (WebSockets for real-time dashboard pushing), `nodemon`.

#### [NEW] [server.js](file:///c:/Final%20Year%20Project/backend/server.js)
* Configures the Express application, sets up standard middleware, database connections, and registers API endpoints.

#### [NEW] [controllers/trafficController.js](file:///c:/Final%20Year%20Project/backend/controllers/trafficController.js)
* **`postDensity`**: Receives lane density counts from the AI module.
* **`getIntersectionState`**: Returns the current signal light statuses (Green/Yellow/Red) and countdown timers.
* **`manualOverride`**: Allows the dashboard to temporarily take control and force specific lights or freeze timers.

#### [NEW] [services/adaptiveEngine.js](file:///c:/Final%20Year%20Project/backend/services/adaptiveEngine.js)
* Implements the **Adaptive Timing Logic**:
  * Receives density counts for 4 lanes.
  * Calculates weight for each lane based on vehicle type counts (e.g., truck = 2.0, motorcycle = 0.5, car = 1.0).
  * Calculates green light duration dynamically between `MIN_GREEN` (e.g., 10s) and `MAX_GREEN` (e.g., 60s).
  * Transitions lanes sequentially (or prioritizes the most congested lane) using safe transitions (Green -> Yellow -> Red).

---

### 4. Frontend Operations Dashboard (`frontend/`)
A premium dashboard built for modern web aesthetics. It will feature a state-of-the-art dark-mode command center layout with:
- **Interactive Visual Intersection**: A gorgeous animated canvas or CSS-styled SVG map showing the 4-way intersection, moving traffic representations based on real-time density, and active traffic signals (Red, Yellow, Green) blinking/pulsing.
- **Dynamic Density Graphs**: Live lane-by-lane density charts, vehicle category breakdowns, and timer countdowns.
- **Manual Control Room**: A secure override switch panel allowing operators to select individual lanes to go Green instantly, or freeze the cycle.
- **Historical Analysis Section**: Charts showing average queue clearance time, hourly congestion peaks, and system performance metrics.

#### [NEW] [src/components/IntersectionVisualizer.tsx](file:///c:/Final%20Year%20Project/frontend/src/components/IntersectionVisualizer.tsx)
* Responsive, high-fidelity visual rendering of a 4-way intersection.
* Visualizes real-time vehicle flow and active lights dynamically using smooth CSS transitions and glow effects.

#### [NEW] [src/components/ControlPanel.tsx](file:///c:/Final%20Year%20Project/frontend/src/components/ControlPanel.tsx)
* Command center controls: Auto/Manual toggle, emergency bypass, manual green select, and system sensitivity adjustment slider.

#### [NEW] [src/components/AnalyticsCharts.tsx](file:///c:/Final%20Year%20Project/frontend/src/components/AnalyticsCharts.tsx)
* Modern line/bar charts utilizing Chart.js or Recharts to visualize historical traffic patterns, peak hourly flow, and delay reduction statistics.

---

## Verification Plan

### Automated Verification
* **Backend API Tests**: Verify REST endpoints (`POST /api/density`, `GET /api/status`, `POST /api/override`) and WebSocket connections using a custom local testing script.
* **Algorithm Validation**: Run the adaptive logic with multiple mock density profiles (balanced, highly asymmetric, heavy vehicles) and assert that signal durations scale accordingly.

### Manual Verification
* **Real-time Synchronization test**: Open the Operations Dashboard and verify that when the Python module (or simulator) posts new counts, the dashboard immediately animates the density changes and countdowns.
* **Manual Override test**: Trigger an override from the dashboard and confirm that the automated algorithm freezes, signal switches respond instantly, and releasing override resumes normal operation safely.
