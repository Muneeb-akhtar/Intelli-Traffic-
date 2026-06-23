"""
4-Way Traffic Video Generator
Generates a synthetic traffic video with 4-way crossroad intersection.
Creates mock vehicle movements for testing the traffic control system.

Output: traffic_4way_simulation.mp4 (1920x1080, 30 FPS, 5 minutes)
"""

import cv2
import numpy as np
import random
import math
import os


class Vehicle:
    """Represents a simulated vehicle moving through a traffic lane."""
    
    def __init__(self, lane, start_pos, color, vehicle_type, speed=2):
        """
        Args:
            lane: 'N', 'S', 'E', 'W' (North, South, East, West)
            start_pos: (x, y) starting position
            color: (B, G, R) color tuple
            vehicle_type: 'car', 'motorcycle', 'bus', 'ambulance'
            speed: pixels per frame
        """
        self.lane = lane
        self.x, self.y = start_pos
        self.color = color
        self.vehicle_type = vehicle_type
        self.speed = speed
        self.width = 40 if vehicle_type in ['car', 'ambulance'] else (25 if vehicle_type == 'motorcycle' else 50)
        self.height = 20 if vehicle_type in ['car', 'ambulance'] else (15 if vehicle_type == 'motorcycle' else 25)
        self.active = True
    
    def update(self, frame_width, frame_height):
        """Update vehicle position; mark inactive if out of bounds."""
        if self.lane == 'N':
            self.y += self.speed
            if self.y > frame_height:
                self.active = False
        elif self.lane == 'S':
            self.y -= self.speed
            if self.y < 0:
                self.active = False
        elif self.lane == 'E':
            self.x -= self.speed
            if self.x < 0:
                self.active = False
        elif self.lane == 'W':
            self.x += self.speed
            if self.x > frame_width:
                self.active = False
    
    def draw(self, frame):
        """Draw vehicle on frame."""
        x1 = int(self.x - self.width // 2)
        y1 = int(self.y - self.height // 2)
        x2 = int(self.x + self.width // 2)
        y2 = int(self.y + self.height // 2)
        
        cv2.rectangle(frame, (x1, y1), (x2, y2), self.color, -1)
        
        # Add label
        label = self.vehicle_type[0].upper()  # 'C', 'M', 'B', 'A'
        cv2.putText(frame, label, (x1 + 5, y1 + 15), cv2.FONT_HERSHEY_SIMPLEX, 
                   0.4, (255, 255, 255), 1)
        
        # Add emergency stripe for ambulances
        if self.vehicle_type == 'ambulance':
            cv2.line(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
            cv2.line(frame, (x2, y1), (x1, y2), (0, 255, 255), 2)


class TrafficVideoGenerator:
    """Generates a synthetic 4-way traffic simulation video."""
    
    def __init__(self, output_path='traffic_4way_simulation.mp4', 
                 width=1920, height=1080, fps=30, duration_sec=300):
        """
        Args:
            output_path: Path to save the MP4 file
            width: Frame width (pixels)
            height: Frame height (pixels)
            fps: Frames per second
            duration_sec: Video duration in seconds
        """
        self.output_path = output_path
        self.width = width
        self.height = height
        self.fps = fps
        self.duration_sec = duration_sec
        self.total_frames = int(fps * duration_sec)
        
        # ROI zones (normalized 0.0 - 1.0)
        self.roi_zones = {
            'N': {'x_range': (0.3, 0.7), 'y_range': (0.0, 0.2), 'color': (0, 255, 0)},     # Green - North
            'S': {'x_range': (0.3, 0.7), 'y_range': (0.8, 1.0), 'color': (255, 0, 0)},     # Blue - South
            'E': {'x_range': (0.8, 1.0), 'y_range': (0.3, 0.7), 'color': (0, 0, 255)},     # Red - East
            'W': {'x_range': (0.0, 0.2), 'y_range': (0.3, 0.7), 'color': (255, 255, 0)}   # Cyan - West
        }
        
        # Video writer setup
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        self.writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        if not self.writer.isOpened():
            raise RuntimeError(f"Failed to open video writer for {output_path}")
        
        self.vehicles = []
        self.frame_count = 0
    
    def generate_density_factor(self, frame_idx):
        """
        Generate realistic traffic density variation over time.
        Uses sine waves to simulate rush hours and quiet periods.
        
        Returns: factor between 0.0 and 1.0
        """
        # Global traffic cycle (peaks every ~60 seconds)
        global_cycle = 0.5 + 0.5 * math.sin(frame_idx * 2 * math.pi / (60 * self.fps))
        
        # Random variation
        random_variation = 0.8 + 0.2 * (np.sin(frame_idx * 0.01) ** 2)
        
        return max(0.1, global_cycle * random_variation)
    
    def spawn_vehicle(self, lane, frame_idx):
        """
        Determine if a vehicle should spawn and create it.
        Uses density factor to vary spawn rates.
        """
        density_factor = self.generate_density_factor(frame_idx)
        
        # Spawn probabilities based on density factor and lane
        spawn_prob = density_factor * 0.15  # 10-15% per frame
        
        if random.random() > spawn_prob:
            return
        
        # Determine vehicle type (weighted)
        rand = random.random()
        if rand < 0.70:  # 70% cars
            vehicle_type = 'car'
            color = (200, 200, 200)  # Gray
        elif rand < 0.85:  # 15% motorcycles
            vehicle_type = 'motorcycle'
            color = (50, 50, 150)  # Dark red
        elif rand < 0.95:  # 10% buses
            vehicle_type = 'bus'
            color = (100, 100, 200)  # Orange
        else:  # 5% ambulances
            vehicle_type = 'ambulance'
            color = (0, 255, 255)  # Bright cyan
        
        # Determine spawn position based on lane
        speed = 1.5 + random.uniform(-0.3, 0.3)  # Slight speed variation
        
        if lane == 'N':
            # North: spawn at top-center, move down
            x = self.width * random.uniform(0.35, 0.65)
            y = -20
        elif lane == 'S':
            # South: spawn at bottom-center, move up
            x = self.width * random.uniform(0.35, 0.65)
            y = self.height + 20
        elif lane == 'E':
            # East: spawn at right-center, move left
            x = self.width + 20
            y = self.height * random.uniform(0.35, 0.65)
        elif lane == 'W':
            # West: spawn at left-center, move right
            x = -20
            y = self.height * random.uniform(0.35, 0.65)
        
        vehicle = Vehicle(lane, (x, y), color, vehicle_type, speed)
        self.vehicles.append(vehicle)
    
    def draw_roi_zones(self, frame):
        """Draw ROI overlays on the frame."""
        for lane, roi in self.roi_zones.items():
            x1 = int(roi['x_range'][0] * self.width)
            y1 = int(roi['y_range'][0] * self.height)
            x2 = int(roi['x_range'][1] * self.width)
            y2 = int(roi['y_range'][1] * self.height)
            
            # Semi-transparent overlay
            overlay = frame.copy()
            cv2.rectangle(overlay, (x1, y1), (x2, y2), roi['color'], -1)
            cv2.addWeighted(overlay, 0.15, frame, 0.85, 0, frame)
            
            # Border
            cv2.rectangle(frame, (x1, y1), (x2, y2), roi['color'], 2)
            
            # Label
            label_map = {'N': 'NORTH', 'S': 'SOUTH', 'E': 'EAST', 'W': 'WEST'}
            cv2.putText(frame, label_map[lane], (x1 + 10, y1 + 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, roi['color'], 2)
    
    def draw_intersection_markers(self, frame):
        """Draw intersection center markers and lane dividers."""
        center_x = self.width // 2
        center_y = self.height // 2
        
        # Draw center crosshair
        cv2.circle(frame, (center_x, center_y), 5, (200, 200, 200), -1)
        cv2.line(frame, (center_x - 30, center_y), (center_x + 30, center_y), (200, 200, 200), 1)
        cv2.line(frame, (center_x, center_y - 30), (center_x, center_y + 30), (200, 200, 200), 1)
        
        # Draw lane dividers (dashed lines)
        dash_length = 20
        gap_length = 10
        
        # Horizontal divider (N-S)
        for y in range(0, self.height, dash_length + gap_length):
            cv2.line(frame, (center_x - 50, y), (center_x - 50, y + dash_length), 
                    (255, 255, 255), 1)
            cv2.line(frame, (center_x + 50, y), (center_x + 50, y + dash_length), 
                    (255, 255, 255), 1)
        
        # Vertical divider (E-W)
        for x in range(0, self.width, dash_length + gap_length):
            cv2.line(frame, (x, center_y - 50), (x + dash_length, center_y - 50), 
                    (255, 255, 255), 1)
            cv2.line(frame, (x, center_y + 50), (x + dash_length, center_y + 50), 
                    (255, 255, 255), 1)
    
    def draw_status_info(self, frame):
        """Draw status information on frame."""
        status_text = [
            f"Frame: {self.frame_count}/{self.total_frames}",
            f"Time: {self.frame_count / self.fps:.1f}s / {self.duration_sec}s",
            f"Active vehicles: {len([v for v in self.vehicles if v.active])}"
        ]
        
        y_offset = 30
        for text in status_text:
            cv2.putText(frame, text, (20, y_offset), cv2.FONT_HERSHEY_SIMPLEX,
                       0.7, (0, 255, 0), 2)
            y_offset += 30
    
    def generate(self):
        """Generate the complete traffic video."""
        print(f"Generating {self.duration_sec}s traffic video ({self.total_frames} frames)...")
        print(f"Output: {self.output_path}")
        
        for frame_idx in range(self.total_frames):
            # Create blank frame
            frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
            frame[:] = (40, 40, 40)  # Dark gray background
            
            # Spawn new vehicles
            for lane in ['N', 'S', 'E', 'W']:
                self.spawn_vehicle(lane, frame_idx)
            
            # Update and draw vehicles
            for vehicle in self.vehicles:
                if vehicle.active:
                    vehicle.update(self.width, self.height)
                    vehicle.draw(frame)
            
            # Remove inactive vehicles
            self.vehicles = [v for v in self.vehicles if v.active]
            
            # Draw ROI zones
            self.draw_roi_zones(frame)
            
            # Draw intersection markers
            self.draw_intersection_markers(frame)
            
            # Draw status info
            self.draw_status_info(frame)
            
            # Write frame
            self.writer.write(frame)
            self.frame_count += 1
            
            # Progress indicator
            if (frame_idx + 1) % 300 == 0:  # Every 10 seconds at 30 FPS
                progress = (frame_idx + 1) / self.total_frames * 100
                print(f"  Progress: {progress:.1f}% ({frame_idx + 1}/{self.total_frames} frames)")
        
        self.writer.release()
        print(f"\n✓ Video generation complete: {self.output_path}")
        print(f"  Resolution: {self.width}x{self.height}")
        print(f"  Duration: {self.duration_sec}s at {self.fps} FPS")
        print(f"  Total frames: {self.total_frames}")


def main():
    """Main entry point."""
    # Generate video in workspace root
    output_file = 'traffic_4way_simulation.mp4'
    
    # Check if file already exists
    if os.path.exists(output_file):
        print(f"Warning: {output_file} already exists. Overwriting...")
    
    try:
        generator = TrafficVideoGenerator(
            output_path=output_file,
            width=1920,
            height=1080,
            fps=30,
            duration_sec=300  # 5 minutes
        )
        generator.generate()
        print(f"\nFile size: {os.path.getsize(output_file) / (1024*1024):.1f} MB")
    except Exception as e:
        print(f"Error generating video: {e}")
        raise


if __name__ == '__main__':
    main()
