import sys
import time
import argparse
import requests
from dotenv import load_dotenv
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from detector import YOLODetector
from simulator import MockTrafficGenerator

load_dotenv()

DEFAULT_API_URL = os.getenv("API_URL", "http://localhost:5000/api/density")

def parse_arguments():
    parser = argparse.ArgumentParser(description="Intelli Traffic AI & Computer Vision Module")
    parser.add_argument("--mode", type=str, choices=["yolo", "sim"], default="sim",
                        help="Operating mode: 'yolo' for live computer vision, 'sim' for traffic generator")
    parser.add_argument("--video", type=str, default=None,
                        help="Path to pre-recorded traffic footage video file (required for yolo mode)")
    parser.add_argument("--api-url", type=str, default=DEFAULT_API_URL,
                        help="REST URL endpoint of backend engine to post density arrays")
    parser.add_argument("--interval", type=float, default=2.0,
                        help="Delay in seconds between posting traffic telemetry counts")
    return parser.parse_args()

def main():
    args = parse_arguments()
    print("=" * 60)
    print("           INTELLI TRAFFIC - COMPUTER VISION ENGINE           ")
    print("=" * 60)
    print(f"Target Decision Engine API: {args.api_url}")
    print(f"Telemetry Post Interval:    {args.interval}s")
    print(f"Requested Operating Mode:   {args.mode.upper()}")
    
    detector = None
    generator = None
    cap = None

    # Determine mode based on package availability and video files
    active_mode = args.mode

    if active_mode == "yolo":
        detector = YOLODetector()
        if not detector.model_available:
            print("[WARNING] YOLOv8 package or weights unavailable. Falling back to Simulation Mode.")
            active_mode = "sim"
        elif not args.video:
            print("[WARNING] No video file source provided for YOLO mode. Falling back to Simulation Mode.")
            active_mode = "sim"
        else:
            import cv2
            cap = cv2.VideoCapture(args.video)
            if not cap.isOpened():
                print(f"[ERROR] Failed to open video source: {args.video}. Falling back to Simulation Mode.")
                active_mode = "sim"
            else:
                print(f"Successfully loaded traffic footage: {args.video}")

    if active_mode == "sim":
        print("[INFO] Initializing Python Traffic Simulator Module...")
        generator = MockTrafficGenerator()

    print(f"\n[SYSTEM] Commencing operations in: {active_mode.upper()} MODE")
    print("-" * 60)

    try:
        while True:
            start_time = time.time()
            counts = None

            if active_mode == "yolo" and cap:
                import cv2
                ret, frame = cap.read()
                
                # Loop video if it ends
                if not ret:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue

                # Run vehicle detection
                counts, frame = detector.detect_vehicles(frame)
                
                # Show OpenCV window (optional visual diagnostic for students)
                cv2.imshow("Intelli Traffic - YOLOv8 Live Grid", frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
            else:
                # Simulation Mode
                counts = generator.generate_density()

            # Post data to backend
            if counts:
                try:
                    payload = {"laneCounts": counts}
                    res = requests.post(args.api_url, json=payload, timeout=2.0)
                    
                    if res.status_code == 200:
                        total_veh = sum(sum(l.values()) for l in counts.values())
                        print(f"[{time.strftime('%H:%M:%S')}] Density streamed: {total_veh} total vehicles detected across 4 lanes.")
                    else:
                        print(f"[{time.strftime('%H:%M:%S')}] [ERROR] Backend rejected update: HTTP {res.status_code}")
                except requests.RequestException as e:
                    print(f"[{time.strftime('%H:%M:%S')}] [CONNECTION EXCEPTION] Decision Engine offline. Retrying...")

            # Maintain constant polling interval
            elapsed = time.time() - start_time
            sleep_dur = max(0.1, args.interval - elapsed)
            time.sleep(sleep_dur)

    except KeyboardInterrupt:
        print("\n[SYSTEM] Keyboard Interrupt received. Closing streams...")
    finally:
        if cap:
            cap.release()
            import cv2
            cv2.destroyAllWindows()
        print("[SYSTEM] AI computer vision module stopped.")
        print("=" * 60)

if __name__ == "__main__":
    main()
