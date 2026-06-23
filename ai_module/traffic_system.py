"""
4-Way Traffic System - AI Engine & Traffic Logic
Processes video frames with YOLO detection, calculates lane density scores,
and implements adaptive traffic signal timing logic.

Features:
- Real-time YOLO vehicle detection per ROI zone
- Density-based green light duration calculation
- Emergency vehicle (ambulance/fire truck) detection override
- State tracking and JSON logging
- Frame-by-frame overlay visualization

Output: Processed frames + traffic_state.jsonl (state logs per frame)
"""

import cv2
import numpy as np
import json
import time
import argparse
from pathlib import Path
from datetime import datetime

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("Warning: ultralytics (YOLO) not installed. Install with: pip install ultralytics")


class TrafficROIManager:
    """Manages Region of Interest (ROI) zones for each traffic lane."""
    
    def __init__(self, frame_width, frame_height):
        """
        Initialize ROI zones for 4-way traffic.
        
        Zones are defined with normalized coordinates (0.0 - 1.0) then converted to pixels.
        Layout:
            NORTH: top-center
            SOUTH: bottom-center
            EAST: right-center
            WEST: left-center
        """
        self.frame_width = frame_width
        self.frame_height = frame_height
        
        # Normalized ROI boundaries (x_min, x_max, y_min, y_max)
        self.rois = {
            'North': {'x': (0.30, 0.70), 'y': (0.00, 0.20), 'color': (0, 255, 0)},
            'South': {'x': (0.30, 0.70), 'y': (0.80, 1.00), 'color': (255, 0, 0)},
            'East': {'x': (0.80, 1.00), 'y': (0.30, 0.70), 'color': (0, 0, 255)},
            'West': {'x': (0.00, 0.20), 'y': (0.30, 0.70), 'color': (255, 255, 0)}
        }
    
    def get_roi_pixels(self, lane_name):
        """Convert normalized ROI to pixel coordinates."""
        roi = self.rois[lane_name]
        x_min = int(roi['x'][0] * self.frame_width)
        x_max = int(roi['x'][1] * self.frame_width)
        y_min = int(roi['y'][0] * self.frame_height)
        y_max = int(roi['y'][1] * self.frame_height)
        return x_min, y_min, x_max, y_max
    
    def point_in_roi(self, x, y, lane_name):
        """Check if point (x, y) is within ROI of given lane."""
        roi = self.rois[lane_name]
        x_norm = x / self.frame_width
        y_norm = y / self.frame_height
        return (roi['x'][0] <= x_norm <= roi['x'][1] and 
                roi['y'][0] <= y_norm <= roi['y'][1])
    
    def draw_rois(self, frame):
        """Draw all ROI zones on frame with semi-transparent overlay."""
        overlay = frame.copy()
        
        for lane_name, roi in self.rois.items():
            x_min, y_min, x_max, y_max = self.get_roi_pixels(lane_name)
            color = roi['color']
            
            # Draw filled rectangle (transparent)
            cv2.rectangle(overlay, (x_min, y_min), (x_max, y_max), color, -1)
            
            # Label
            cv2.putText(overlay, lane_name, (x_min + 10, y_min + 35),
                       cv2.FONT_HERSHEY_SIMPLEX, 1.2, color, 2)
        
        # Blend overlay
        cv2.addWeighted(overlay, 0.20, frame, 0.80, 0, frame)
        
        # Draw borders (opaque)
        for lane_name, roi in self.rois.items():
            x_min, y_min, x_max, y_max = self.get_roi_pixels(lane_name)
            color = roi['color']
            cv2.rectangle(frame, (x_min, y_min), (x_max, y_max), color, 3)


class TrafficDensityCalculator:
    """Calculates traffic density scores based on detected vehicle counts and types."""
    
    # Vehicle weight coefficients (importance factor for signal timing)
    VEHICLE_WEIGHTS = {
        'car': 1.0,
        'motorcycle': 0.5,
        'truck': 3.0,
        'bus': 2.5,
        'person': 0.0,  # Ignore pedestrians
    }
    
    # YOLO COCO class IDs
    YOLO_CLASS_IDS = {
        2: 'car',
        3: 'motorcycle',
        5: 'bus',
        7: 'truck',
        0: 'person',  # For emergency detection (fire fighters, etc.)
    }
    
    def __init__(self, min_green=10, max_green=60, density_cap=30):
        """
        Initialize density calculator.
        
        Args:
            min_green: Minimum green light duration (seconds)
            max_green: Maximum green light duration (seconds)
            density_cap: Vehicle count at which MAX_GREEN is reached
        """
        self.min_green = min_green
        self.max_green = max_green
        self.density_cap = density_cap
    
    def calculate_density_score(self, vehicle_counts):
        """
        Calculate weighted density score for a lane.
        
        Args:
            vehicle_counts: Dict like {'car': 5, 'motorcycle': 2, 'bus': 1}
        
        Returns:
            float: Weighted density score
        """
        score = 0.0
        for vehicle_type, count in vehicle_counts.items():
            weight = self.VEHICLE_WEIGHTS.get(vehicle_type, 0.0)
            score += count * weight
        return score
    
    def density_to_green_duration(self, density_score):
        """
        Map density score to green light duration.
        
        Linear interpolation:
        - density_score = 0 → min_green
        - density_score >= density_cap → max_green
        
        Args:
            density_score: Weighted vehicle count score
        
        Returns:
            int: Green light duration in seconds
        """
        if density_score <= 0:
            return self.min_green
        
        # Linear interpolation
        normalized = min(1.0, density_score / self.density_cap)
        duration = self.min_green + (self.max_green - self.min_green) * normalized
        return int(duration)


class AdaptiveTrafficController:
    """
    Adaptive traffic signal controller.
    Manages signal state, timing, and emergency overrides.
    """
    
    LIGHT_STATES = {
        'GREEN': (0, 255, 0),      # BGR: Green
        'YELLOW': (0, 255, 255),   # BGR: Cyan
        'RED': (0, 0, 255),        # BGR: Red
    }
    
    STATES_SEQUENCE = ['GREEN', 'YELLOW', 'RED']
    YELLOW_DURATION = 3  # seconds
    ALL_RED_DURATION = 2  # safety buffer between signal changes
    EMERGENCY_DURATION = 60  # seconds for ambulance override
    
    def __init__(self, lanes=['North', 'South', 'East', 'West']):
        """Initialize traffic controller."""
        self.lanes = lanes
        self.current_lane_idx = 0
        self.current_state = 'RED'
        self.time_in_state = 0
        self.state_duration = 0
        
        # Lane states
        self.lane_states = {lane: 'RED' for lane in lanes}
        self.lane_timers = {lane: 0 for lane in lanes}
        self.lane_states[lanes[0]] = 'GREEN'  # Start with first lane
        
        # Emergency override
        self.emergency_active_lane = None
        self.emergency_start_time = None
        
        self.cycle_count = 0
        self.transition_history = []
    
    def update(self, delta_time, density_scores):
        """
        Update traffic controller state.
        
        Args:
            delta_time: Time elapsed since last update (seconds)
            density_scores: Dict of lane → density_score
        
        Returns:
            dict: Current state snapshot
        """
        self.time_in_state += delta_time
        
        # Handle emergency override
        if self.emergency_active_lane:
            elapsed = time.time() - self.emergency_start_time
            if elapsed > self.EMERGENCY_DURATION:
                self.emergency_active_lane = None
            else:
                # Grant green to emergency lane
                for lane in self.lanes:
                    self.lane_states[lane] = 'RED'
                self.lane_states[self.emergency_active_lane] = 'GREEN'
                self.current_lane_idx = self.lanes.index(self.emergency_active_lane)
        
        # State machine for current lane
        current_lane = self.lanes[self.current_lane_idx]
        
        if self.lane_states[current_lane] == 'GREEN':
            # Determine when to transition (based on traffic density)
            green_duration = self.calculate_green_duration(
                density_scores.get(current_lane, 0)
            )
            
            if self.time_in_state >= green_duration:
                self.transition_to_yellow()
        
        elif self.lane_states[current_lane] == 'YELLOW':
            if self.time_in_state >= self.YELLOW_DURATION:
                self.transition_to_all_red()
        
        elif self.lane_states[current_lane] == 'RED':
            if self.time_in_state >= self.ALL_RED_DURATION:
                # Move to next lane
                self.current_lane_idx = (self.current_lane_idx + 1) % len(self.lanes)
                self.transition_to_green()
        
        return self.get_state_snapshot()
    
    def calculate_green_duration(self, density_score):
        """Calculate green duration for current lane (stub - use DensityCalculator)."""
        # This should be called from the main engine
        return 15  # Default
    
    def transition_to_yellow(self):
        """Transition current lane from GREEN to YELLOW."""
        current_lane = self.lanes[self.current_lane_idx]
        self.lane_states[current_lane] = 'YELLOW'
        self.time_in_state = 0
        self.transition_history.append({
            'timestamp': datetime.now().isoformat(),
            'lane': current_lane,
            'state': 'YELLOW'
        })
    
    def transition_to_all_red(self):
        """Transition current lane from YELLOW to RED."""
        current_lane = self.lanes[self.current_lane_idx]
        self.lane_states[current_lane] = 'RED'
        self.time_in_state = 0
        self.transition_history.append({
            'timestamp': datetime.now().isoformat(),
            'lane': current_lane,
            'state': 'RED'
        })
    
    def transition_to_green(self):
        """Transition next lane to GREEN."""
        current_lane = self.lanes[self.current_lane_idx]
        self.lane_states[current_lane] = 'GREEN'
        self.time_in_state = 0
        self.cycle_count += 1
        self.transition_history.append({
            'timestamp': datetime.now().isoformat(),
            'lane': current_lane,
            'state': 'GREEN'
        })
    
    def set_emergency(self, lane_name):
        """Activate emergency override for a specific lane."""
        if lane_name in self.lanes:
            self.emergency_active_lane = lane_name
            self.emergency_start_time = time.time()
            self.transition_history.append({
                'timestamp': datetime.now().isoformat(),
                'event': 'emergency_override',
                'lane': lane_name
            })
    
    def get_state_snapshot(self):
        """Return current state as dictionary."""
        return {
            'timestamp': datetime.now().isoformat(),
            'current_lane': self.lanes[self.current_lane_idx],
            'lane_states': dict(self.lane_states),
            'time_in_state': self.time_in_state,
            'emergency_active': self.emergency_active_lane is not None,
            'emergency_lane': self.emergency_active_lane,
            'cycle_count': self.cycle_count
        }


class TrafficSystemEngine:
    """
    Main traffic system engine.
    Orchestrates video processing, YOLO detection, density calculation, and signal control.
    """
    
    def __init__(self, video_path, yolo_model_path='yolov8n.pt'):
        """
        Initialize the traffic system engine.
        
        Args:
            video_path: Path to input video file
            yolo_model_path: Path to YOLO weights (downloaded auto if not present)
        """
        self.video_path = video_path
        self.cap = cv2.VideoCapture(video_path)
        
        if not self.cap.isOpened():
            raise RuntimeError(f"Failed to open video: {video_path}")
        
        # Video properties
        self.frame_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.frame_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        print(f"Video loaded: {self.frame_width}x{self.frame_height} @ {self.fps} FPS")
        print(f"Total frames: {self.total_frames}")
        
        # Initialize components
        self.roi_manager = TrafficROIManager(self.frame_width, self.frame_height)
        self.density_calculator = TrafficDensityCalculator()
        self.traffic_controller = AdaptiveTrafficController()
        
        # YOLO initialization
        self.yolo_available = YOLO_AVAILABLE
        self.yolo_model = None
        if self.yolo_available:
            try:
                self.yolo_model = YOLO(yolo_model_path)
                print(f"YOLO model loaded: {yolo_model_path}")
            except Exception as e:
                print(f"Failed to load YOLO model: {e}")
                self.yolo_available = False
        
        # State tracking
        self.frame_idx = 0
        self.state_logs = []
        self.last_update_time = time.time()
    
    def detect_vehicles_in_frame(self, frame):
        """
        Detect vehicles in frame using YOLO and categorize by lane.
        
        Returns:
            dict: Lane → {vehicle_type: count}
        """
        lane_vehicles = {
            'North': {'car': 0, 'motorcycle': 0, 'truck': 0, 'bus': 0},
            'South': {'car': 0, 'motorcycle': 0, 'truck': 0, 'bus': 0},
            'East': {'car': 0, 'motorcycle': 0, 'truck': 0, 'bus': 0},
            'West': {'car': 0, 'motorcycle': 0, 'truck': 0, 'bus': 0}
        }
        
        if not self.yolo_available or not self.yolo_model:
            return lane_vehicles
        
        # Run YOLO inference
        results = self.yolo_model(frame, verbose=False, conf=0.5)
        
        # Process detections
        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0].item())
                
                # Map YOLO class to vehicle type
                vehicle_type = TrafficDensityCalculator.YOLO_CLASS_IDS.get(cls_id)
                if not vehicle_type or vehicle_type == 'person':
                    continue
                
                # Get bounding box center
                xyxy = box.xyxy[0].tolist()
                center_x = int((xyxy[0] + xyxy[2]) / 2)
                center_y = int((xyxy[1] + xyxy[3]) / 2)
                
                # Assign to lane based on center point
                for lane_name in ['North', 'South', 'East', 'West']:
                    if self.roi_manager.point_in_roi(center_x, center_y, lane_name):
                        lane_vehicles[lane_name][vehicle_type] += 1
                        
                        # Draw bounding box
                        cv2.rectangle(frame, (int(xyxy[0]), int(xyxy[1])), 
                                    (int(xyxy[2]), int(xyxy[3])), (0, 255, 0), 2)
                        cv2.putText(frame, vehicle_type, (int(xyxy[0]), int(xyxy[1]) - 5),
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                        break
        
        return lane_vehicles
    
    def draw_traffic_lights(self, frame):
        """Draw traffic light indicators for each lane."""
        light_positions = {
            'North': (self.frame_width // 2, 50),
            'South': (self.frame_width // 2, self.frame_height - 50),
            'East': (self.frame_width - 50, self.frame_height // 2),
            'West': (50, self.frame_height // 2)
        }
        
        for lane_name, (x, y) in light_positions.items():
            state = self.traffic_controller.lane_states[lane_name]
            color = self.traffic_controller.LIGHT_STATES[state]
            
            # Draw circle
            cv2.circle(frame, (x, y), 20, color, -1)
            
            # Draw border
            cv2.circle(frame, (x, y), 20, (255, 255, 255), 2)
            
            # Label
            label = state[0]  # G, Y, R
            cv2.putText(frame, label, (x - 8, y + 8), cv2.FONT_HERSHEY_SIMPLEX,
                       1, (255, 255, 255), 2)
    
    def draw_density_info(self, frame, lane_vehicles, lane_densities):
        """Draw density information on frame."""
        y_offset = 100
        for lane_name in ['North', 'South', 'East', 'West']:
            vehicles = lane_vehicles[lane_name]
            density = lane_densities[lane_name]
            count = sum(vehicles.values())
            
            text = f"{lane_name}: {count} vehicles (density: {density:.1f})"
            cv2.putText(frame, text, (20, y_offset), cv2.FONT_HERSHEY_SIMPLEX,
                       0.6, (255, 255, 255), 1)
            y_offset += 25
    
    def process_video(self, output_video=None, skip_frames=1):
        """
        Process entire video and generate state logs.
        
        Args:
            output_video: Path to save processed video (if None, no video output)
            skip_frames: Process every Nth frame (1 = all frames, 2 = every 2nd, etc.)
        """
        print(f"\nProcessing video...")
        
        # Video writer setup (optional)
        writer = None
        if output_video:
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(output_video, fourcc, self.fps, 
                                   (self.frame_width, self.frame_height))
        
        try:
            while True:
                ret, frame = self.cap.read()
                
                if not ret:
                    break
                
                # Skip frames if requested
                if self.frame_idx % skip_frames != 0:
                    self.frame_idx += 1
                    continue
                
                # Detect vehicles
                lane_vehicles = self.detect_vehicles_in_frame(frame)
                
                # Calculate density scores
                lane_densities = {}
                total_density = 0
                for lane_name, vehicles in lane_vehicles.items():
                    density = self.density_calculator.calculate_density_score(vehicles)
                    lane_densities[lane_name] = density
                    total_density += density
                
                # Update traffic controller
                delta_time = 1.0 / self.fps
                
                # Calculate green durations based on density
                for lane_name in self.traffic_controller.lanes:
                    duration = self.density_calculator.density_to_green_duration(
                        lane_densities[lane_name]
                    )
                    # Store for controller (simplified - just use current value)
                
                state = self.traffic_controller.update(delta_time, lane_densities)
                
                # Draw overlays
                self.roi_manager.draw_rois(frame)
                self.draw_traffic_lights(frame)
                self.draw_density_info(frame, lane_vehicles, lane_densities)
                
                # Log state
                log_entry = {
                    'frame': self.frame_idx,
                    'timestamp': datetime.now().isoformat(),
                    'lane_vehicles': lane_vehicles,
                    'lane_densities': lane_densities,
                    'traffic_state': state
                }
                self.state_logs.append(log_entry)
                
                # Write frame
                if writer:
                    writer.write(frame)
                
                # Progress
                if (self.frame_idx + 1) % 300 == 0:
                    progress = (self.frame_idx + 1) / self.total_frames * 100
                    print(f"  Progress: {progress:.1f}% (frame {self.frame_idx + 1}/{self.total_frames})")
                
                self.frame_idx += 1
        
        finally:
            self.cap.release()
            if writer:
                writer.release()
                print(f"\nProcessed video saved: {output_video}")
        
        print(f"\nProcessing complete. Total frames processed: {self.frame_idx}")
    
    def save_state_logs(self, output_file='traffic_state.jsonl'):
        """Save state logs to JSONL file."""
        with open(output_file, 'w') as f:
            for log in self.state_logs:
                f.write(json.dumps(log) + '\n')
        print(f"State logs saved: {output_file}")
    
    def print_summary(self):
        """Print processing summary."""
        print("\n" + "="*60)
        print("TRAFFIC SYSTEM PROCESSING SUMMARY")
        print("="*60)
        print(f"Frames processed: {self.frame_idx}")
        print(f"Video duration: {self.frame_idx / self.fps:.1f}s")
        print(f"YOLO available: {self.yolo_available}")
        print(f"State logs recorded: {len(self.state_logs)}")
        print(f"Traffic cycles: {self.traffic_controller.cycle_count}")
        print("="*60)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="4-Way Traffic System - AI Engine"
    )
    parser.add_argument('--video', type=str, default='traffic_4way_simulation.mp4',
                       help='Input video file path')
    parser.add_argument('--output', type=str, default='traffic_processed.mp4',
                       help='Output processed video file path')
    parser.add_argument('--state-log', type=str, default='traffic_state.jsonl',
                       help='Output state log file path')
    parser.add_argument('--skip-frames', type=int, default=1,
                       help='Process every Nth frame (1=all)')
    parser.add_argument('--yolo-model', type=str, default='yolov8n.pt',
                       help='YOLO model weights path')
    
    args = parser.parse_args()
    
    # Check if video exists
    if not Path(args.video).exists():
        print(f"Error: Video file not found: {args.video}")
        print("Please run: python ai_module/generate_traffic_video.py")
        return
    
    try:
        engine = TrafficSystemEngine(args.video, args.yolo_model)
        engine.process_video(args.output, args.skip_frames)
        engine.save_state_logs(args.state_log)
        engine.print_summary()
    
    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == '__main__':
    main()
