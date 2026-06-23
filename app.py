"""
Streamlit Dashboard - 4-Way Traffic System Operations Center
Real-time visualization of traffic signals, density metrics, and emergency overrides.

Features:
- Live video playback with ROI and YOLO overlay visualization
- Traffic light status indicators (North/South/East/West)
- Real-time density score charts and progress bars
- Vehicle count breakdowns per lane
- Emergency override buttons for testing
- Traffic cycle information and state logs

Run with: streamlit run app.py
"""

import streamlit as st
import cv2
import numpy as np
import json
import time
from pathlib import Path
from collections import defaultdict
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime


# ============================================================================
# CONFIGURATION
# ============================================================================

VIDEO_FILE = 'traffic_4way_simulation.mp4'
STATE_LOG_FILE = 'traffic_state.jsonl'
PROCESSED_VIDEO_FILE = 'traffic_processed.mp4'

LANE_COLORS = {
    'North': '#00FF00',
    'South': '#FF0000',
    'East': '#0000FF',
    'West': '#FFFF00'
}

LANE_DISPLAY_NAMES = {
    'North': '🔼 NORTH',
    'South': '🔽 SOUTH',
    'East': '▶️ EAST',
    'West': '◀️ WEST'
}

VEHICLE_ICONS = {
    'car': '🚗',
    'motorcycle': '🏍️',
    'truck': '🚚',
    'bus': '🚌'
}


# ============================================================================
# STREAMLIT PAGE CONFIG
# ============================================================================

st.set_page_config(
    page_title="Traffic Control Dashboard",
    page_icon="🚦",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.title("🚦 4-Way Vision-Based Traffic Control System")
st.markdown("**Real-time AI-driven adaptive traffic signal management**")


# ============================================================================
# SESSION STATE INITIALIZATION
# ============================================================================

if 'video_frame_idx' not in st.session_state:
    st.session_state.video_frame_idx = 0

if 'emergency_lanes' not in st.session_state:
    st.session_state.emergency_lanes = set()

if 'playback_speed' not in st.session_state:
    st.session_state.playback_speed = 1.0

if 'is_playing' not in st.session_state:
    st.session_state.is_playing = False


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

@st.cache_resource
def load_video():
    """Load video file and return VideoCapture object."""
    if not Path(VIDEO_FILE).exists():
        return None
    
    cap = cv2.VideoCapture(VIDEO_FILE)
    if not cap.isOpened():
        return None
    
    return cap


@st.cache_data
def load_state_logs():
    """Load state logs from JSONL file."""
    if not Path(STATE_LOG_FILE).exists():
        return []
    
    logs = []
    try:
        with open(STATE_LOG_FILE, 'r') as f:
            for line in f:
                if line.strip():
                    logs.append(json.loads(line))
    except Exception as e:
        st.error(f"Failed to load state logs: {e}")
    
    return logs


def get_video_frame(cap, frame_idx):
    """Get specific frame from video."""
    if cap is None:
        return None
    
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ret, frame = cap.read()
    return frame if ret else None


def render_traffic_light(lane_name, state, time_remaining=None):
    """Render a traffic light indicator for a lane."""
    state_colors = {
        'GREEN': '🟢',
        'YELLOW': '🟡',
        'RED': '🔴'
    }
    
    emoji = state_colors.get(state, '⚪')
    time_text = f" ({time_remaining}s)" if time_remaining else ""
    
    return f"{emoji} {lane_name}: {state}{time_text}"


def create_density_gauge_chart(lane_densities, max_density=30):
    """Create a gauge chart for current density levels."""
    fig = go.Figure()
    
    lanes = list(lane_densities.keys())
    densities = [lane_densities[lane] for lane in lanes]
    
    colors_list = [LANE_COLORS[lane] for lane in lanes]
    
    fig.add_trace(go.Bar(
        x=lanes,
        y=densities,
        marker=dict(color=colors_list),
        text=[f"{d:.1f}" for d in densities],
        textposition='auto',
        name='Density Score'
    ))
    
    fig.update_yaxes(range=[0, max_density])
    fig.update_layout(
        title="Real-Time Lane Density Scores",
        xaxis_title="Lane",
        yaxis_title="Density Score",
        height=300,
        showlegend=False,
        hovermode='x unified'
    )
    
    return fig


def create_vehicle_count_chart(lane_vehicles):
    """Create stacked bar chart for vehicle counts per lane."""
    data = defaultdict(lambda: {'car': 0, 'motorcycle': 0, 'truck': 0, 'bus': 0})
    
    for lane, vehicles in lane_vehicles.items():
        data[lane] = vehicles
    
    lanes = list(data.keys())
    vehicle_types = ['car', 'motorcycle', 'truck', 'bus']
    
    fig = go.Figure()
    
    for vehicle_type in vehicle_types:
        counts = [data[lane].get(vehicle_type, 0) for lane in lanes]
        fig.add_trace(go.Bar(
            x=lanes,
            y=counts,
            name=f"{VEHICLE_ICONS.get(vehicle_type, '')} {vehicle_type.title()}",
            marker=dict()
        ))
    
    fig.update_layout(
        title="Vehicle Count by Lane and Type",
        xaxis_title="Lane",
        yaxis_title="Count",
        barmode='stack',
        height=350,
        hovermode='x unified'
    )
    
    return fig


def create_traffic_light_status(traffic_state):
    """Create visual traffic light status display."""
    lanes = ['North', 'South', 'East', 'West']
    states = traffic_state.get('lane_states', {lane: 'RED' for lane in lanes})
    
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        state = states.get('North', 'RED')
        st.markdown(f"### 🔼 NORTH")
        if state == 'GREEN':
            st.success(f"🟢 {state}")
        elif state == 'YELLOW':
            st.warning(f"🟡 {state}")
        else:
            st.error(f"🔴 {state}")
    
    with col2:
        state = states.get('South', 'RED')
        st.markdown(f"### 🔽 SOUTH")
        if state == 'GREEN':
            st.success(f"🟢 {state}")
        elif state == 'YELLOW':
            st.warning(f"🟡 {state}")
        else:
            st.error(f"🔴 {state}")
    
    with col3:
        state = states.get('East', 'RED')
        st.markdown(f"### ▶️ EAST")
        if state == 'GREEN':
            st.success(f"🟢 {state}")
        elif state == 'YELLOW':
            st.warning(f"🟡 {state}")
        else:
            st.error(f"🔴 {state}")
    
    with col4:
        state = states.get('West', 'RED')
        st.markdown(f"### ◀️ WEST")
        if state == 'GREEN':
            st.success(f"🟢 {state}")
        elif state == 'YELLOW':
            st.warning(f"🟡 {state}")
        else:
            st.error(f"🔴 {state}")


# ============================================================================
# MAIN LAYOUT
# ============================================================================

# Sidebar Controls
with st.sidebar:
    st.header("⚙️ Controls")
    
    # Video playback controls
    st.subheader("Video Playback")
    
    # Load video
    video_file = load_video()
    if video_file is None:
        st.error(f"❌ Video not found: {VIDEO_FILE}")
        st.info("Please run: `python ai_module/generate_traffic_video.py`")
    else:
        total_frames = int(video_file.get(cv2.CAP_PROP_FRAME_COUNT))
        st.session_state.video_frame_idx = st.slider(
            "Frame Number",
            0, total_frames - 1,
            st.session_state.video_frame_idx
        )
        
        col_speed1, col_speed2 = st.columns(2)
        with col_speed1:
            if st.button("▶️ Play"):
                st.session_state.is_playing = True
        with col_speed2:
            if st.button("⏸ Pause"):
                st.session_state.is_playing = False
        
        st.session_state.playback_speed = st.slider(
            "Playback Speed",
            0.25, 4.0,
            1.0,
            step=0.25
        )
    
    st.divider()
    
    # Emergency Controls
    st.subheader("🚨 Emergency Override")
    st.info("Trigger emergency mode for specific lanes")
    
    col_em1, col_em2 = st.columns(2)
    with col_em1:
        if st.button("🔼 North Emergency"):
            st.session_state.emergency_lanes.add('North')
            st.success("North emergency activated!")
        if st.button("🔽 South Emergency"):
            st.session_state.emergency_lanes.add('South')
            st.success("South emergency activated!")
    
    with col_em2:
        if st.button("▶️ East Emergency"):
            st.session_state.emergency_lanes.add('East')
            st.success("East emergency activated!")
        if st.button("◀️ West Emergency"):
            st.session_state.emergency_lanes.add('West')
            st.success("West emergency activated!")
    
    if st.button("🔄 Clear All Emergencies"):
        st.session_state.emergency_lanes.clear()
        st.info("All emergencies cleared")
    
    st.divider()
    
    # Status Info
    st.subheader("📊 Status")
    if video_file:
        fps = video_file.get(cv2.CAP_PROP_FPS)
        elapsed_sec = st.session_state.video_frame_idx / fps if fps > 0 else 0
        st.metric("Current Time", f"{elapsed_sec:.1f}s")
        st.metric("Frame Rate", f"{fps:.0f} FPS")
        st.metric("Total Frames", total_frames)


# Main Content Area
if video_file is not None:
    # Display video frame
    st.subheader("📹 Live Video Feed (with ROI & YOLO Overlays)")
    
    frame = get_video_frame(video_file, st.session_state.video_frame_idx)
    if frame is not None:
        # Convert BGR to RGB for display
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        st.image(frame_rgb, use_column_width=True)
    else:
        st.error("Failed to load frame")
    
    st.divider()
    
    # Load and display state information
    state_logs = load_state_logs()
    
    if state_logs and st.session_state.video_frame_idx < len(state_logs):
        current_log = state_logs[st.session_state.video_frame_idx]
        
        # Extract data
        lane_vehicles = current_log.get('lane_vehicles', {})
        lane_densities = current_log.get('lane_densities', {})
        traffic_state = current_log.get('traffic_state', {})
        
        # Traffic Light Status
        st.subheader("🚦 Traffic Signal Status")
        create_traffic_light_status(traffic_state)
        
        # Emergency Status
        if st.session_state.emergency_lanes:
            st.warning(f"🚨 **Emergency Active**: {', '.join(st.session_state.emergency_lanes)}")
        
        st.divider()
        
        # Metrics
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            current_lane = traffic_state.get('current_lane', 'N/A')
            st.metric("Current Green Lane", current_lane)
        
        with col2:
            cycle_count = traffic_state.get('cycle_count', 0)
            st.metric("Traffic Cycles", cycle_count)
        
        with col3:
            total_vehicles = sum(
                sum(lane.values()) for lane in lane_vehicles.values()
            )
            st.metric("Vehicles Detected", total_vehicles)
        
        with col4:
            avg_density = np.mean(list(lane_densities.values())) if lane_densities else 0
            st.metric("Avg Density Score", f"{avg_density:.1f}")
        
        st.divider()
        
        # Charts
        col_chart1, col_chart2 = st.columns(2)
        
        with col_chart1:
            fig_density = create_density_gauge_chart(lane_densities)
            st.plotly_chart(fig_density, use_container_width=True)
        
        with col_chart2:
            fig_vehicles = create_vehicle_count_chart(lane_vehicles)
            st.plotly_chart(fig_vehicles, use_container_width=True)
        
        st.divider()
        
        # Detailed Lane Information
        st.subheader("📋 Detailed Lane Information")
        
        col1, col2, col3, col4 = st.columns(4)
        
        lanes_to_display = [
            ('North', col1),
            ('South', col2),
            ('East', col3),
            ('West', col4)
        ]
        
        for lane, col in lanes_to_display:
            with col:
                st.markdown(f"### {LANE_DISPLAY_NAMES.get(lane, lane)}")
                
                # Vehicle counts
                vehicles = lane_vehicles.get(lane, {})
                total = sum(vehicles.values())
                
                st.write(f"**Total Vehicles:** {total}")
                
                for vehicle_type, count in vehicles.items():
                    icon = VEHICLE_ICONS.get(vehicle_type, '•')
                    st.write(f"{icon} {vehicle_type.title()}: {count}")
                
                # Density
                density = lane_densities.get(lane, 0)
                st.metric("Density Score", f"{density:.1f}")
                
                # Emergency status
                if lane in st.session_state.emergency_lanes:
                    st.error("🚨 EMERGENCY ACTIVE")
                else:
                    st.success("✓ Normal")
        
        st.divider()
        
        # State Logs Viewer
        st.subheader("📊 State Logs")
        
        log_viewer_col1, log_viewer_col2 = st.columns(2)
        
        with log_viewer_col1:
            st.write("**Frame Information:**")
            st.json({
                'frame': current_log.get('frame', 'N/A'),
                'timestamp': current_log.get('timestamp', 'N/A')
            })
        
        with log_viewer_col2:
            st.write("**Traffic State:**")
            st.json(traffic_state)

else:
    st.error("❌ Unable to load video file")
    st.info("**Setup Instructions:**")
    st.markdown("""
    1. Run the video generator:
       ```
       python ai_module/generate_traffic_video.py
       ```
    
    2. Run the traffic system engine:
       ```
       python ai_module/traffic_system.py --video traffic_4way_simulation.mp4
       ```
    
    3. Then refresh this dashboard
    """)

# Footer
st.divider()
st.markdown("""
---
**4-Way Vision-Based Smart Traffic System** | Adaptive Traffic Signal Control with YOLO Detection
""")
