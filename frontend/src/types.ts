export interface VehicleCounts {
  car: number;
  motorcycle: number;
  truck: number;
  bus: number;
}

export interface LaneData {
  [laneName: string]: VehicleCounts;
}

export interface IntersectionState {
  currentLane: string;
  currentLaneIndex: number;
  lightState: 'GREEN' | 'YELLOW' | 'RED';
  timeRemaining: number;
  greenDuration: number;
  isOverrideActive: boolean;
  emergencyActive: boolean;
  emergencyLaneIndex: number | null;
  cycleCount: number;
}

export interface EngineSettings {
  minGreen: number;
  maxGreen: number;
  densityCap: number;
}

export interface TrafficUpdatePayload {
  state: IntersectionState;
  laneData: LaneData;
  settings: EngineSettings;
}

export interface AnalyticsRecord {
  timestamp: string;
  hour: string;
  counts: {
    Northbound: number;
    Southbound: number;
    Eastbound: number;
    Westbound: number;
  };
  totalVehicles: number;
  averageWaitSeconds: number;
  congestionIndex: number;
}

export interface SafetyLogEntry {
  timestamp: string;
  type: string;
  message: string;
}
