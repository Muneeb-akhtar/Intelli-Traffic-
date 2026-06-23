#!/usr/bin/env python3
"""
Fast Traffic Video Generator - Optimized for quick testing
Generates a shorter, lower-resolution traffic video for rapid prototyping
Duration: 30 seconds instead of 300 seconds
Resolution: 1280×720 instead of 1920×1080
Frames: 900 instead of 9000 (30 FPS × 30 seconds)
"""

import cv2
import numpy as np
import random
from pathlib import Path
import sys

class FastVehicle:
    """Simple vehicle representation for fast generation"""
    def __init__(self, x, y, vtype, width=40, height=30):
        self.x = x
        self.y = y
        self.vtype = vtype  # 0=car, 1=motorcycle, 2=bus, 3=truck, 4=ambulance
        self.width = width
        self.height = height
        self.vx = random.uniform(2, 5)
        self.vy = random.uniform(-0.5, 0.5)
        self.rotation = random.uniform(-5, 5)

    def draw(self, frame):
        """Draw vehicle on frame"""
        colors = {
            0: (100, 200, 255),     # Car - orange
            1: (255, 100, 100),     # Motorcycle - red
            2: (100, 100, 255),     # Bus - red-orange
            3: (100, 255, 100),     # Truck - green
            4: (0, 0, 255)          # Ambulance - bright red
        }
        
        color = colors.get(self.vtype, (255, 255, 255))
        
        # Draw rectangle
        pt1 = (int(self.x), int(self.y))
        pt2 = (int(self.x + self.width), int(self.y + self.height))
        cv2.rectangle(frame, pt1, pt2, color, -1)
        
        # Add border
        cv2.rectangle(frame, pt1, pt2, (0, 0, 0), 2)

    def update(self, width, height):
        """Update vehicle position"""
        self.x += self.vx
        self.y += self.vy
        
        # Keep in bounds or wrap around
        if self.x > width or self.x < -50:
            return False
        if self.y > height or self.y < -50:
            return False
        return True


class FastTrafficVideoGenerator:
    """Fast video generator for testing"""
    
    def __init__(self, output_path="traffic_4way_simulation.mp4", duration_seconds=30):
        self.output_path = output_path
        self.width = 1280
        self.height = 720
        self.fps = 30
        self.duration = duration_seconds
        self.total_frames = self.fps * self.duration
        
        # Create video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        self.writer = cv2.VideoWriter(
            output_path,
            fourcc,
            self.fps,
            (self.width, self.height)
        )
        
        self.vehicles = []
        self.frame_count = 0

    def spawn_vehicle(self):
        """Spawn new vehicle randomly"""
        if random.random() > 0.7:  # 30% chance per frame
            lane = random.randint(0, 3)
            vtype = random.choices(
                [0, 1, 2, 3, 4],
                weights=[0.7, 0.15, 0.1, 0.05, 0.0]  # No ambulances in fast demo
            )[0]
            
            if lane == 0:  # Top
                self.vehicles.append(FastVehicle(random.randint(0, self.width), -50, vtype))
            elif lane == 1:  # Right
                self.vehicles.append(FastVehicle(self.width + 50, random.randint(0, self.height), vtype))
            elif lane == 2:  # Bottom
                self.vehicles.append(FastVehicle(random.randint(0, self.width), self.height + 50, vtype))
            else:  # Left
                self.vehicles.append(FastVehicle(-50, random.randint(0, self.height), vtype))

    def draw_background(self, frame):
        """Draw road background"""
        # Dark gray asphalt
        frame[:, :] = (40, 40, 40)
        
        # Draw lane lines
        cv2.line(frame, (0, self.height//2), (self.width, self.height//2), (200, 200, 200), 2)
        cv2.line(frame, (self.width//2, 0), (self.width//2, self.height), (200, 200, 200), 2)
        
        # Dashed center lines
        for i in range(0, self.width, 40):
            cv2.line(frame, (i, self.height//2), (i+20, self.height//2), (255, 255, 100), 1)
            cv2.line(frame, (self.width//2, i), (self.width//2, i+20), (255, 255, 100), 1)

    def draw_roi_zones(self, frame):
        """Draw ROI zone overlays"""
        overlay = frame.copy()
        
        # North zone (top-left quadrant)
        cv2.rectangle(overlay, (0, 0), (self.width//2, self.height//2), (0, 255, 0), -1)
        cv2.putText(overlay, "N", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
        
        # South zone (bottom-right quadrant)
        cv2.rectangle(overlay, (self.width//2, self.height//2), (self.width, self.height), (255, 0, 0), -1)
        cv2.putText(overlay, "S", (self.width-50, self.height-20), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        # East zone (right)
        cv2.rectangle(overlay, (self.width//2, 0), (self.width, self.height//2), (0, 255, 255), -1)
        cv2.putText(overlay, "E", (self.width-50, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
        
        # West zone (left)
        cv2.rectangle(overlay, (0, self.height//2), (self.width//2, self.height), (255, 255, 0), -1)
        cv2.putText(overlay, "W", (20, self.height-20), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
        
        cv2.addWeighted(overlay, 0.1, frame, 0.9, 0, frame)

    def generate(self):
        """Generate video"""
        print(f"Generating {self.duration}s traffic video ({self.total_frames} frames)...")
        print(f"Output: {self.output_path}")
        
        for frame_idx in range(self.total_frames):
            frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
            
            # Draw background
            self.draw_background(frame)
            self.draw_roi_zones(frame)
            
            # Spawn vehicles
            self.spawn_vehicle()
            
            # Update and draw vehicles
            self.vehicles = [v for v in self.vehicles if v.update(self.width, self.height)]
            for vehicle in self.vehicles:
                vehicle.draw(frame)
            
            # Draw info
            cv2.putText(frame, f"Frame: {frame_idx}/{self.total_frames}", 
                       (10, self.height-10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            cv2.putText(frame, f"Vehicles: {len(self.vehicles)}", 
                       (self.width-200, self.height-10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            
            self.writer.write(frame)
            
            # Progress indicator
            if (frame_idx + 1) % 90 == 0:
                progress = (frame_idx + 1) / self.total_frames * 100
                print(f"  Progress: {progress:.1f}% ({frame_idx + 1}/{self.total_frames} frames)")
        
        self.writer.release()
        print(f"✓ Video saved: {self.output_path}")


def main():
    output = Path(__file__).parent.parent / "traffic_4way_simulation.mp4"
    generator = FastTrafficVideoGenerator(str(output), duration_seconds=30)
    generator.generate()


if __name__ == "__main__":
    main()
