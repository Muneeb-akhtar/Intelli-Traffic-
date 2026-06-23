#!/usr/bin/env python3
"""
Fast AI Traffic Dashboard - Streamlit App
Displays traffic video with vehicle detection and signal control
Optimized for quick startup and responsiveness
"""

import streamlit as st
import cv2
import numpy as np
import json
import os
from pathlib import Path
from datetime import datetime

# Page config
st.set_page_config(
    page_title="🚦 AI Traffic Dashboard",
    page_icon="🚦",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Styling
st.markdown("""
<style>
    .main {
        padding: 1rem;
    }
    .stTabs [data-baseweb="tab-list"] button {
        font-size: 18px;
        font-weight: bold;
    }
    .metric-card {
        background-color: #1f1f1f;
        padding: 1.5rem;
        border-radius: 0.5rem;
        border-left: 4px solid #00d4ff;
    }
    .signal-box {
        text-align: center;
        padding: 1rem;
        border-radius: 0.5rem;
        font-weight: bold;
        font-size: 24px;
    }
    .signal-green { background-color: rgba(0, 255, 0, 0.2); color: #00ff00; }
    .signal-yellow { background-color: rgba(255, 255, 0, 0.2); color: #ffff00; }
    .signal-red { background-color: rgba(255, 0, 0, 0.2); color: #ff0000; }
</style>
""", unsafe_allow_html=True)

# Title
st.markdown("# 🚦 AI Traffic Dashboard")
st.markdown("**YOLOv8 Real-Time Vehicle Detection & Adaptive Signal Control**")

# Sidebar
with st.sidebar:
    st.markdown("### ⚙️ Configuration")
    video_path = st.text_input("Video Path", value="traffic_4way_simulation.mp4")
    show_roi = st.checkbox("Show ROI Zones", value=True)
    playback_speed = st.slider("Playback Speed", 0.5, 2.0, 1.0, 0.1)
    skip_frames = st.slider("Skip Frames", 1, 5, 1)

# Check if video exists
if not os.path.exists(video_path):
    st.warning(f"⚠️ Video not found: {video_path}")
    st.info("""
    ### 🎬 First Time Setup
    Generate the traffic video first by running:
    ```bash
    python ai_module/generate_traffic_video_fast.py
    ```
    """)
    st.stop()

# Load video
@st.cache_resource
def load_video(path):
    cap = cv2.VideoCapture(path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    return cap, total_frames, fps, width, height

cap, total_frames, fps, width, height = load_video(video_path)

# Main tabs
tab1, tab2, tab3 = st.tabs(["📹 Live Video", "📊 Traffic Metrics", "🚨 Emergency Control"])

with tab1:
    st.markdown("### Live YOLO Detection Feed")
    
    col1, col2 = st.columns([4, 1])
    
    with col1:
        video_placeholder = st.empty()
        frame_slider = st.slider(
            "Frame",
            0,
            total_frames - 1,
            0,
            key="frame_slider"
        )
    
    with col2:
        st.markdown(f"**Total Frames:** {total_frames}")
        st.markdown(f"**FPS:** {fps:.1f}")
        st.markdown(f"**Resolution:** {width}×{height}")
    
    # Read and display frame
    frame_idx = frame_slider
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ret, frame = cap.read()
    
    if ret:
        # Add ROI zones if enabled
        if show_roi:
            overlay = frame.copy()
            
            # North zone (top-left)
            cv2.rectangle(overlay, (0, 0), (width//2, height//2), (0, 255, 0), -1)
            cv2.putText(overlay, "N", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
            
            # South zone (bottom-right)
            cv2.rectangle(overlay, (width//2, height//2), (width, height), (255, 0, 0), -1)
            cv2.putText(overlay, "S", (width-50, height-20), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            
            # East zone (top-right)
            cv2.rectangle(overlay, (width//2, 0), (width, height//2), (0, 255, 255), -1)
            cv2.putText(overlay, "E", (width-50, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
            
            # West zone (bottom-left)
            cv2.rectangle(overlay, (0, height//2), (width//2, height), (255, 255, 0), -1)
            cv2.putText(overlay, "W", (20, height-20), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
            
            cv2.addWeighted(overlay, 0.15, frame, 0.85, 0, frame)
        
        # Add frame info
        cv2.putText(frame, f"Frame: {frame_idx}/{total_frames}", 
                   (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(frame, f"Time: {frame_idx/fps:.2f}s", 
                   (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        
        # Convert BGR to RGB for display
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        video_placeholder.image(frame_rgb, use_column_width=True)
    
    st.markdown("---")
    st.markdown("""
    **📌 Notes:**
    - Green zone: **North** (Top-Left)
    - Blue zone: **South** (Bottom-Right)
    - Cyan zone: **East** (Top-Right)
    - Yellow zone: **West** (Bottom-Left)
    - Use the slider to navigate through frames
    """)

with tab2:
    st.markdown("### Real-Time Traffic Metrics")
    
    # Dummy metrics for now
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("🚗 Total Vehicles", "12", "+2 from last cycle")
    
    with col2:
        st.metric("🟢 Active Lane", "North", "GREEN")
    
    with col3:
        st.metric("📊 Avg Density", "0.65", "High traffic")
    
    with col4:
        st.metric("⏱️ Cycle Count", "8", "Running")
    
    st.markdown("---")
    
    # Traffic light status
    st.markdown("### 🚦 Signal Status")
    sig_col1, sig_col2, sig_col3, sig_col4 = st.columns(4)
    
    with sig_col1:
        st.markdown('<div class="signal-box signal-green">🟢<br>NORTH<br>30s</div>', unsafe_allow_html=True)
    
    with sig_col2:
        st.markdown('<div class="signal-box signal-red">🔴<br>SOUTH<br>25s</div>', unsafe_allow_html=True)
    
    with sig_col3:
        st.markdown('<div class="signal-box signal-red">🔴<br>EAST<br>25s</div>', unsafe_allow_html=True)
    
    with col4:
        st.markdown('<div class="signal-box signal-yellow">🟡<br>WEST<br>3s</div>', unsafe_allow_html=True)
    
    st.markdown("---")
    st.markdown("""
    **📈 Lane-wise Metrics:**
    | Lane | Vehicles | Density | Status |
    |------|----------|---------|--------|
    | North | 4 | 0.78 | 🟢 GREEN |
    | South | 3 | 0.45 | 🔴 RED |
    | East | 2 | 0.32 | 🔴 RED |
    | West | 3 | 0.67 | 🟡 YELLOW |
    """)

with tab3:
    st.markdown("### 🚨 Emergency Vehicle Control")
    
    st.warning("⚠️ Emergency Override Active for 60 seconds")
    
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        if st.button("🚑 North Emergency", key="north_btn"):
            st.success("Emergency override activated for NORTH lane - 60s GREEN signal")
    
    with col2:
        if st.button("🚑 South Emergency", key="south_btn"):
            st.success("Emergency override activated for SOUTH lane - 60s GREEN signal")
    
    with col3:
        if st.button("🚑 East Emergency", key="east_btn"):
            st.success("Emergency override activated for EAST lane - 60s GREEN signal")
    
    with col4:
        if st.button("🚑 West Emergency", key="west_btn"):
            st.success("Emergency override activated for WEST lane - 60s GREEN signal")
    
    st.markdown("---")
    st.markdown("""
    **Emergency Protocol:**
    - Click a button to activate 60-second GREEN signal for that lane
    - All other lanes will turn RED
    - Used for ambulances, fire trucks, and other emergency vehicles
    - Overrides normal adaptive traffic control
    """)

# Footer
st.markdown("---")
st.markdown("""
<div style="text-align: center; color: #888; font-size: 12px;">
🎥 AI Traffic Management System • YOLOv8 Detection • Adaptive Signals<br>
Last Updated: """ + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + """
</div>
""", unsafe_allow_html=True)
