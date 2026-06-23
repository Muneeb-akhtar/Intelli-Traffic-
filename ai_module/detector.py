import cv2
import numpy as np
try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

class YOLODetector:
    def __init__(self, model_path='yolov8n.pt'):
        self.model_available = YOLO is not None
        if self.model_available:
            try:
                # Loads YOLOv8 nano model (downloads automatically if not present locally)
                self.model = YOLO(model_path)
                print(f"YOLOv8 detector loaded successfully using weights: {model_path}")
            except Exception as e:
                print(f"Failed to load YOLO model: {e}")
                self.model_available = False
        else:
            print("Ultralytics package is not installed. Running in mock/compatibility mode.")

        # Class IDs for YOLOv8 COCO dataset:
        # 2: car, 3: motorcycle, 5: bus, 7: truck
        self.target_classes = {2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'}

    def detect_vehicles(self, frame, lane_rois=None):
        """
        Processes a video frame, detects vehicles, and assigns them to lanes based on ROIs.
        
        lane_rois: Dict of lane names and their boundary polygons (normalized coordinates 0.0 - 1.0)
                  e.g., {'Northbound': [(x1,y1), (x2,y2), ...]}
        """
        # Initialize counts structure
        counts = {
            'Northbound': {'car': 0, 'motorcycle': 0, 'truck': 0, 'bus': 0},
            'Southbound': {'car': 0, 'motorcycle': 0, 'truck': 0, 'bus': 0},
            'Eastbound': {'car': 0, 'motorcycle': 0, 'truck': 0, 'bus': 0},
            'Westbound': {'car': 0, 'motorcycle': 0, 'truck': 0, 'bus': 0}
        }

        if not self.model_available:
            return counts, frame

        h, w, _ = frame.shape

        # Run inference
        results = self.model(frame, verbose=False)[0]
        
        # Parse detections
        for box in results.boxes:
            cls_id = int(box.cls[0].item())
            if cls_id in self.target_classes:
                vehicle_type = self.target_classes[cls_id]
                
                # Get bounding box center
                xyxy = box.xyxy[0].tolist()
                cx = int((xyxy[0] + xyxy[2]) / 2)
                cy = int((xyxy[1] + xyxy[3]) / 2)

                # Find which lane contains the vehicle center point
                assigned_lane = self._assign_to_lane(cx, cy, w, h, lane_rois)
                if assigned_lane:
                    counts[assigned_lane][vehicle_type] += 1

                # Draw bounding box for visualization (optional debugging)
                cv2.rectangle(frame, (int(xyxy[0]), int(xyxy[1])), (int(xyxy[2]), int(xyxy[3])), (0, 255, 0), 2)
                cv2.putText(frame, f"{vehicle_type}", (int(xyxy[0]), int(xyxy[1]) - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

        return counts, frame

    def _assign_to_lane(self, cx, cy, w, h, lane_rois):
        """
        Determines which lane region contains the bounding box center.
        If lane_rois is not provided, divides the frame mathematically into 4 quadrants.
        """
        if lane_rois:
            # Check point-in-polygon using OpenCV
            point = (cx, cy)
            for lane_name, polygon in lane_rois.items():
                # Convert normalized points to absolute pixels
                pts = np.array([(p[0] * w, p[1] * h) for p in polygon], dtype=np.int32)
                if cv2.pointPolygonTest(pts, point, False) >= 0:
                    return lane_name
        else:
            # Quadrant-based fallback:
            # Northbound: Bottom quadrant
            # Southbound: Top quadrant
            # Eastbound: Right quadrant
            # Westbound: Left quadrant
            if cx < w/2 and cy < h/2:
                return 'Westbound'
            elif cx >= w/2 and cy < h/2:
                return 'Southbound'
            elif cx < w/2 and cy >= h/2:
                return 'Northbound'
            else:
                return 'Eastbound'

        return None
