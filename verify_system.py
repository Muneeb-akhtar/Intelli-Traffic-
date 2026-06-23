#!/usr/bin/env python3
"""
System Verification & Quick Start Script
Tests all components and guides through setup.

Run with: python verify_system.py
"""

import sys
import subprocess
import os
from pathlib import Path


class Colors:
    """ANSI color codes for terminal output."""
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_header(text):
    """Print a formatted header."""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text.center(60)}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")


def print_status(status, message):
    """Print status message with color."""
    if status == 'ok':
        print(f"  {Colors.GREEN}✓{Colors.RESET} {message}")
    elif status == 'warning':
        print(f"  {Colors.YELLOW}⚠{Colors.RESET} {message}")
    elif status == 'error':
        print(f"  {Colors.RED}✗{Colors.RESET} {message}")
    elif status == 'info':
        print(f"  {Colors.BLUE}ℹ{Colors.RESET} {message}")


def check_python_version():
    """Check Python version."""
    print_header("Python Environment Check")
    
    version = sys.version_info
    required_version = (3, 8)
    
    current = f"{version.major}.{version.minor}.{version.micro}"
    print_status('info', f"Python Version: {current}")
    
    if version >= required_version:
        print_status('ok', f"Python version meets requirement (3.8+)")
        return True
    else:
        print_status('error', f"Python {required_version[0]}.{required_version[1]}+ required")
        return False


def check_packages():
    """Check required packages."""
    print_header("Package Installation Check")
    
    required_packages = {
        'cv2': 'opencv-python',
        'ultralytics': 'ultralytics',
        'numpy': 'numpy',
        'streamlit': 'streamlit',
        'plotly': 'plotly',
        'requests': 'requests',
        'PIL': 'Pillow',
        'dotenv': 'python-dotenv'
    }
    
    missing_packages = []
    installed_packages = []
    
    for import_name, package_name in required_packages.items():
        try:
            __import__(import_name)
            print_status('ok', f"{package_name}")
            installed_packages.append(package_name)
        except ImportError:
            print_status('error', f"{package_name} (not installed)")
            missing_packages.append(package_name)
    
    if missing_packages:
        print(f"\n{Colors.YELLOW}Missing packages detected.{Colors.RESET}")
        print(f"Install with: pip install {' '.join(missing_packages)}")
        return False
    else:
        print_status('ok', "All packages installed!")
        return True


def check_yolo_model():
    """Check YOLO model availability."""
    print_header("YOLO Model Check")
    
    try:
        from ultralytics import YOLO
        print_status('info', "Loading YOLOv8n model (may download if missing)...")
        model = YOLO('yolov8n.pt')
        print_status('ok', "YOLOv8n model loaded successfully")
        return True
    except Exception as e:
        print_status('warning', f"YOLO model loading failed: {e}")
        print_status('info', "Model will be downloaded on first use")
        return False


def check_files():
    """Check generated files."""
    print_header("Generated Files Check")
    
    files = {
        'traffic_4way_simulation.mp4': 'Mock traffic video',
        'traffic_processed.mp4': 'Processed video with overlays',
        'traffic_state.jsonl': 'Traffic state logs'
    }
    
    all_exist = True
    for filename, description in files.items():
        if Path(filename).exists():
            size_mb = Path(filename).stat().st_size / (1024 * 1024)
            print_status('ok', f"{filename} ({size_mb:.1f} MB) - {description}")
        else:
            print_status('warning', f"{filename} (not generated yet) - {description}")
            all_exist = False
    
    if not all_exist:
        print_status('info', "Run video generator to create files:")
        print_status('info', "  python ai_module/generate_traffic_video.py")
    
    return all_exist


def check_script_files():
    """Check Python scripts exist."""
    print_header("Script Files Check")
    
    scripts = {
        'ai_module/generate_traffic_video.py': 'Video generator',
        'ai_module/traffic_system.py': 'Traffic engine',
        'app.py': 'Streamlit dashboard',
    }
    
    all_exist = True
    for filepath, description in scripts.items():
        if Path(filepath).exists():
            size_kb = Path(filepath).stat().st_size / 1024
            print_status('ok', f"{filepath} ({size_kb:.1f} KB) - {description}")
        else:
            print_status('error', f"{filepath} (missing!) - {description}")
            all_exist = False
    
    return all_exist


def print_quick_start():
    """Print quick start guide."""
    print_header("Quick Start Guide")
    
    print(f"{Colors.BOLD}Follow these steps to run the system:{Colors.RESET}\n")
    
    print(f"{Colors.BOLD}Step 1: Generate Mock Traffic Video{Colors.RESET}")
    print("  $ python ai_module/generate_traffic_video.py")
    print("  ⏱️  Takes 1-2 minutes to generate 5-minute video\n")
    
    print(f"{Colors.BOLD}Step 2: Process Video with YOLO Detection{Colors.RESET}")
    print("  $ python ai_module/traffic_system.py --video traffic_4way_simulation.mp4")
    print("  ⏱️  Takes 2-5 minutes for full video processing\n")
    
    print(f"{Colors.BOLD}Step 3: Launch Streamlit Dashboard{Colors.RESET}")
    print("  $ streamlit run app.py")
    print("  🌐 Opens http://localhost:8501 in your browser\n")
    
    print(f"{Colors.BOLD}Dashboard Features:{Colors.RESET}")
    print("  • 📹 Live video playback with frame slider")
    print("  • 🚦 Traffic light status (North/South/East/West)")
    print("  • 📊 Real-time density charts")
    print("  • 🚗 Vehicle count breakdown")
    print("  • 🚨 Emergency override buttons (one per lane)")
    print("  • 📋 Lane-wise detailed metrics\n")


def print_troubleshooting():
    """Print common troubleshooting tips."""
    print_header("Troubleshooting Tips")
    
    tips = [
        ("YOLO slow to start", "Model downloads on first use (~100 MB). Be patient."),
        ("Out of memory", "Use --skip-frames 2 to process every 2nd frame only"),
        ("Video not found", "Ensure generate_traffic_video.py completed successfully"),
        ("Dashboard empty", "Complete all 3 steps above before launching dashboard"),
    ]
    
    for issue, solution in tips:
        print(f"{Colors.BOLD}{issue}:{Colors.RESET}")
        print(f"  → {solution}\n")


def print_summary():
    """Print verification summary."""
    print_header("System Verification Summary")
    
    print(f"{Colors.GREEN}{Colors.BOLD}✓ System is ready to use!{Colors.RESET}\n")
    
    print(f"See {Colors.BOLD}PYTHON_SETUP.md{Colors.RESET} for detailed documentation.\n")


def main():
    """Run verification checks."""
    print_header("4-Way Traffic System - Verification Tool")
    
    all_ok = True
    
    # Run checks
    checks = [
        ("Python Version", check_python_version),
        ("Installed Packages", check_packages),
        ("YOLO Model", check_yolo_model),
        ("Python Scripts", check_script_files),
        ("Generated Files", check_files),
    ]
    
    for check_name, check_func in checks:
        try:
            result = check_func()
            if not result and check_name not in ["YOLO Model", "Generated Files"]:
                all_ok = False
        except Exception as e:
            print_status('error', f"Check failed: {e}")
            all_ok = False
    
    # Print guides
    print_quick_start()
    print_troubleshooting()
    
    if all_ok:
        print_summary()
    else:
        print_header("Action Required")
        print_status('error', "Some checks failed. Please resolve issues above.")
        print_status('info', "Run: pip install -r ai_module/requirements.txt")


if __name__ == '__main__':
    main()
