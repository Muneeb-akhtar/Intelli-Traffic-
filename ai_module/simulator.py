import random
import time
import math

class MockTrafficGenerator:
    def __init__(self):
        self.lanes = ['Northbound', 'Southbound', 'Eastbound', 'Westbound']
        self.tick_count = 0
        
    def generate_density(self):
        """
        Generates realistic lane densities mimicking YOLO output.
        Simulates traffic cycles: rush hours, random bottlenecks, and category ratios.
        """
        self.tick_count += 1
        counts = {}
        
        # Calculate time factors (e.g. sine wave peak cycles)
        time_factor = 0.5 + 0.4 * math.sin(self.tick_count * 0.05)
        
        for index, lane in enumerate(self.lanes):
            # Asymmetry: lanes peak at slightly different phases
            lane_phase = index * 1.5
            lane_factor = 0.4 + 0.5 * math.sin((self.tick_count * 0.04) + lane_phase)
            
            # Combine factors
            total_factor = max(0.1, (time_factor + lane_factor) / 2)
            
            # Base vehicles
            base_cars = int(12 * total_factor)
            base_motorcycles = int(6 * total_factor)
            
            # 10% chance of heavy truck/bus traffic, else low
            has_heavy = random.random() < 0.15
            trucks = random.randint(1, 4) if has_heavy else random.choice([0, 0, 0, 1])
            buses = random.randint(1, 2) if has_heavy else random.choice([0, 0, 0, 1])
            
            counts[lane] = {
                'car': max(0, base_cars + random.randint(-2, 3)),
                'motorcycle': max(0, base_motorcycles + random.randint(-1, 2)),
                'truck': trucks,
                'bus': buses
            }
            
        return counts
