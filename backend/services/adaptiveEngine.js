import { Database } from '../database/db.js';

// Default Configuration
const DEFAULT_MIN_GREEN = 10; // seconds
const DEFAULT_MAX_GREEN = 60; // seconds
const DEFAULT_DENSITY_CAP = 30; // Count at which MAX_GREEN is triggered
const YELLOW_DURATION = 3; // seconds
const INTER_RED_DURATION = 2; // seconds (all red for safety)
const EMERGENCY_DURATION = 60; // seconds for emergency hold

// Vehicle Weight System
const VEHICLE_WEIGHTS = {
  car: 1.0,
  motorcycle: 0.5,
  truck: 2.5,
  bus: 2.5
};

const LANES = ['Northbound', 'Southbound', 'Eastbound', 'Westbound'];

class AdaptiveTrafficEngine {
  constructor() {
    this.laneData = {
      Northbound: { car: 4, motorcycle: 2, truck: 1, bus: 0 },
      Southbound: { car: 3, motorcycle: 5, truck: 0, bus: 0 },
      Eastbound: { car: 8, motorcycle: 1, truck: 2, bus: 1 },
      Westbound: { car: 2, motorcycle: 3, truck: 0, bus: 0 }
    };

    // Mutable engine settings
    this.settings = {
      minGreen: DEFAULT_MIN_GREEN,
      maxGreen: DEFAULT_MAX_GREEN,
      densityCap: DEFAULT_DENSITY_CAP
    };
    
    // Initial state
    this.state = {
      currentLaneIndex: 0, // Northbound starts green
      lightState: 'GREEN', // GREEN, YELLOW, RED
      timeRemaining: 15,
      greenDuration: 15,
      yellowDuration: YELLOW_DURATION,
      isOverrideActive: false,
      overrideLaneIndex: null,
      emergencyActive: false,
      emergencyLaneIndex: null,
      cycleCount: 0
    };

    // Safety log ring buffer (last 100 events)
    this.safetyLogs = [];
    
    this.wsServer = null;
    this.timer = null;
  }

  setWsServer(wsServer) {
    this.wsServer = wsServer;
  }

  start() {
    this.state.timeRemaining = this.calculateGreenDuration(LANES[this.state.currentLaneIndex]);
    this.state.greenDuration = this.state.timeRemaining;
    
    // Run the engine clock at 1Hz (every second)
    this.timer = setInterval(() => this.tick(), 1000);
    console.log('Adaptive Decision Engine started.');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  // Update engine settings at runtime
  updateSettings(newSettings) {
    if (newSettings.minGreen !== undefined) {
      this.settings.minGreen = Math.max(5, Math.min(30, Number(newSettings.minGreen)));
    }
    if (newSettings.maxGreen !== undefined) {
      this.settings.maxGreen = Math.max(20, Math.min(120, Number(newSettings.maxGreen)));
    }
    if (newSettings.densityCap !== undefined) {
      this.settings.densityCap = Math.max(5, Math.min(100, Number(newSettings.densityCap)));
    }

    // Ensure minGreen < maxGreen
    if (this.settings.minGreen >= this.settings.maxGreen) {
      this.settings.minGreen = this.settings.maxGreen - 5;
    }

    this.addSafetyLog('SETTINGS_CHANGE', `Settings updated: minGreen=${this.settings.minGreen}s, maxGreen=${this.settings.maxGreen}s, densityCap=${this.settings.densityCap}`);
    this.broadcastState();
  }

  // Update densities from external source (Python YOLO / generator)
  updateDensities(laneCounts) {
    for (const lane of LANES) {
      if (laneCounts[lane]) {
        this.laneData[lane] = {
          car: laneCounts[lane].car || 0,
          motorcycle: laneCounts[lane].motorcycle || 0,
          truck: laneCounts[lane].truck || 0,
          bus: laneCounts[lane].bus || 0
        };
      }
    }
    
    // Log the new densities
    Database.logDensity(this.laneData);
    
    // Broadcast the update immediately
    this.broadcastState();
  }

  // Calculate weighted density score for a lane
  calculateLaneWeight(laneName) {
    const data = this.laneData[laneName];
    if (!data) return 0;
    return (
      (data.car * VEHICLE_WEIGHTS.car) +
      (data.motorcycle * VEHICLE_WEIGHTS.motorcycle) +
      (data.truck * VEHICLE_WEIGHTS.truck) +
      (data.bus * VEHICLE_WEIGHTS.bus)
    );
  }

  // Calculate custom green signal duration in seconds
  calculateGreenDuration(laneName) {
    if (this.state.emergencyActive) return EMERGENCY_DURATION;
    
    const weight = this.calculateLaneWeight(laneName);
    const densityFactor = Math.min(1.0, weight / this.settings.densityCap);
    const duration = Math.round(this.settings.minGreen + (densityFactor * (this.settings.maxGreen - this.settings.minGreen)));
    return duration;
  }

  // Core system clock tick (runs every second)
  tick() {
    // Emergency mode: hold green on emergency lane, countdown
    if (this.state.emergencyActive) {
      if (this.state.timeRemaining > 0) {
        this.state.timeRemaining--;
      } else {
        // Emergency timer expired, auto-clear
        this.clearEmergencyInternal();
      }
      this.simulateTrafficFlow();
      this.broadcastState();
      return;
    }

    // If manual override is active, handle manual countdown and freeze engine state switches
    if (this.state.isOverrideActive) {
      if (this.state.timeRemaining > 0) {
        this.state.timeRemaining--;
      }
      this.simulateTrafficFlow(); // still clear vehicles
      this.broadcastState();
      return;
    }

    if (this.state.timeRemaining > 0) {
      this.state.timeRemaining--;
    } else {
      this.transitionState();
    }

    this.simulateTrafficFlow();
    this.broadcastState();
  }

  // Transition signal lights logically
  async transitionState() {
    const prevLane = LANES[this.state.currentLaneIndex];
    
    if (this.state.lightState === 'GREEN') {
      // Transition to Yellow
      this.state.lightState = 'YELLOW';
      this.state.timeRemaining = YELLOW_DURATION;
      await Database.logSignalTransition(prevLane, 'YELLOW', YELLOW_DURATION);
    } 
    else if (this.state.lightState === 'YELLOW') {
      // Transition to Red transition buffer (All lanes Red)
      this.state.lightState = 'RED';
      this.state.timeRemaining = INTER_RED_DURATION;
      await Database.logSignalTransition(prevLane, 'RED', INTER_RED_DURATION);
    } 
    else if (this.state.lightState === 'RED') {
      // Transition to NEXT lane green
      this.state.lightState = 'GREEN';
      this.state.currentLaneIndex = (this.state.currentLaneIndex + 1) % LANES.length;
      const nextLane = LANES[this.state.currentLaneIndex];
      
      const newGreenDuration = this.calculateGreenDuration(nextLane);
      this.state.greenDuration = newGreenDuration;
      this.state.timeRemaining = newGreenDuration;
      
      this.state.cycleCount++;
      await Database.logSignalTransition('RED', nextLane, newGreenDuration);
    }
  }

  // Activates an administrative override on a specific lane
  async setOverride(laneIndex) {
    this.state.isOverrideActive = true;
    this.state.lightState = 'GREEN';
    this.state.currentLaneIndex = laneIndex;
    this.state.timeRemaining = 30; // Set 30 seconds override timer
    this.state.greenDuration = 30;
    
    this.addSafetyLog('OVERRIDE_START', `Manual override started for ${LANES[laneIndex]} lane.`);
    await Database.logOverride(true, LANES[laneIndex]);
    this.broadcastState();
  }

  // Disables the override and resumes auto mode safely
  async clearOverride() {
    this.state.isOverrideActive = false;
    this.state.lightState = 'YELLOW'; // safe transition
    this.state.timeRemaining = YELLOW_DURATION;
    
    this.addSafetyLog('OVERRIDE_STOP', 'Manual override cleared. Resuming automatic control via yellow safety buffer.');
    await Database.logOverride(false);
    this.broadcastState();
  }

  // Activates emergency vehicle priority on a specific lane
  async setEmergency(laneIndex) {
    const laneName = LANES[laneIndex];
    this.state.emergencyActive = true;
    this.state.emergencyLaneIndex = laneIndex;
    this.state.lightState = 'GREEN';
    this.state.currentLaneIndex = laneIndex;
    this.state.timeRemaining = EMERGENCY_DURATION;
    this.state.greenDuration = EMERGENCY_DURATION;

    // If override was active, deactivate it
    if (this.state.isOverrideActive) {
      this.state.isOverrideActive = false;
    }
    
    this.addSafetyLog('EMERGENCY_START', `🚨 Emergency vehicle priority activated for ${laneName} lane. All other lanes RED.`);
    await Database.logOverride(true, `EMERGENCY:${laneName}`);
    this.broadcastState();
  }

  // Clear emergency and resume normal operations via safe transition
  async clearEmergency() {
    await this.clearEmergencyInternal();
  }

  async clearEmergencyInternal() {
    const prevLane = this.state.emergencyLaneIndex !== null ? LANES[this.state.emergencyLaneIndex] : 'Unknown';
    this.state.emergencyActive = false;
    this.state.emergencyLaneIndex = null;
    this.state.lightState = 'YELLOW';
    this.state.timeRemaining = YELLOW_DURATION;
    
    this.addSafetyLog('EMERGENCY_STOP', `Emergency cleared for ${prevLane}. Resuming normal operations via yellow safety buffer.`);
    await Database.logOverride(false, 'EMERGENCY_CLEARED');
    this.broadcastState();
  }

  // Safety log management
  addSafetyLog(type, message) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      message
    };
    this.safetyLogs.push(entry);
    // Keep only the last 100 events
    if (this.safetyLogs.length > 100) {
      this.safetyLogs = this.safetyLogs.slice(-100);
    }
  }

  getSafetyLogs() {
    return [...this.safetyLogs].reverse(); // newest first
  }

  // Simulates realistic vehicle arrivals and green-lane queue clearances
  simulateTrafficFlow() {
    // 1. Vehicle Clearance in the active Green lane
    if (this.state.lightState === 'GREEN') {
      const activeLaneName = LANES[this.state.currentLaneIndex];
      const activeLane = this.laneData[activeLaneName];
      
      // Clear 1-2 vehicles per tick in a green light (emergency clears faster)
      const clearCount = this.state.emergencyActive 
        ? 3 
        : (Math.random() > 0.4 ? 2 : 1);
      
      // Clear trucks/buses first (heavier traffic clears or moves out)
      for (let i = 0; i < clearCount; i++) {
        if (activeLane.truck > 0) { activeLane.truck--; }
        else if (activeLane.bus > 0) { activeLane.bus--; }
        else if (activeLane.car > 0) { activeLane.car--; }
        else if (activeLane.motorcycle > 0) { activeLane.motorcycle--; }
      }
    }

    // 2. Realistic Vehicle Arrivals in all Red/Yellow lanes
    LANES.forEach((laneName, index) => {
      // Active Green lane gets fewer arrivals, RED lanes pile up
      const isGreen = this.state.lightState === 'GREEN' && index === this.state.currentLaneIndex;
      const arrivalRate = isGreen ? 0.05 : 0.25; // 25% chance of vehicle arrival per second for red lanes
      
      if (Math.random() < arrivalRate) {
        const lane = this.laneData[laneName];
        
        // Categorize vehicle randomly: 70% car, 15% motorcycle, 7% truck, 8% bus
        const roll = Math.random();
        if (roll < 0.70) lane.car = Math.min(25, lane.car + 1);
        else if (roll < 0.85) lane.motorcycle = Math.min(15, lane.motorcycle + 1);
        else if (roll < 0.92) lane.truck = Math.min(8, lane.truck + 1);
        else lane.bus = Math.min(8, lane.bus + 1);
      }
    });
  }

  // Broadcasts state via WebSocket to all clients
  broadcastState() {
    if (!this.wsServer) return;
    
    const payload = JSON.stringify({
      type: 'STATE_UPDATE',
      data: this.getCurrentPayload()
    });

    this.wsServer.clients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(payload);
      }
    });
  }

  // Helper to package the current REST payload
  getCurrentPayload() {
    return {
      state: {
        currentLane: LANES[this.state.currentLaneIndex],
        currentLaneIndex: this.state.currentLaneIndex,
        lightState: this.state.lightState,
        timeRemaining: this.state.timeRemaining,
        greenDuration: this.state.greenDuration,
        isOverrideActive: this.state.isOverrideActive,
        emergencyActive: this.state.emergencyActive,
        emergencyLaneIndex: this.state.emergencyLaneIndex,
        cycleCount: this.state.cycleCount
      },
      laneData: this.laneData,
      settings: { ...this.settings }
    };
  }
}

export const TrafficEngine = new AdaptiveTrafficEngine();
export { LANES };
