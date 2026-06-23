import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'traffic_logs.json');

const INITIAL_DB_STRUCTURE = {
  densityRecords: [],
  signalTransitions: [],
  overrideEvents: [],
  hourlyAnalytics: []
};

// Generates 7 days of realistic hourly traffic count logs
function generateMockHistory() {
  const analytics = [];
  const now = new Date();
  const lanes = ['Northbound', 'Southbound', 'Eastbound', 'Westbound'];
  
  // Seed data for the last 7 days (168 hours)
  for (let i = 168; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hour = timestamp.getHours();
    
    // Simulate realistic traffic curves:
    // Peak hours: 8 AM - 10 AM (morning rush) and 5 PM - 7 PM (evening rush)
    let trafficFactor = 0.2; // Base late night
    if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 19)) {
      trafficFactor = 0.85 + Math.random() * 0.15; // Heavy rush
    } else if (hour >= 11 && hour <= 16) {
      trafficFactor = 0.5 + Math.random() * 0.2; // Moderate daytime
    } else if (hour >= 20 && hour <= 23) {
      trafficFactor = 0.3 + Math.random() * 0.15; // Diminishing evening
    }

    const counts = {};
    let totalVehicles = 0;
    
    lanes.forEach(lane => {
      // Add slight asymmetric behavior per lane to simulate real-world layout
      const laneSpecificFactor = lane === 'Northbound' || lane === 'Southbound' ? 1.2 : 0.8;
      const baseCount = Math.round(40 * trafficFactor * laneSpecificFactor);
      const vehicleCount = Math.max(0, baseCount + Math.floor((Math.random() - 0.5) * 8));
      counts[lane] = vehicleCount;
      totalVehicles += vehicleCount;
    });

    analytics.push({
      timestamp: timestamp.toISOString(),
      hour: `${hour}:00`,
      counts,
      totalVehicles,
      averageWaitSeconds: Math.round(35 + (trafficFactor * 25) + (Math.random() - 0.5) * 10),
      congestionIndex: Math.round(trafficFactor * 100)
    });
  }
  return analytics;
}

export const Database = {
  async init() {
    try {
      await fs.mkdir(__dirname, { recursive: true });
      try {
        const fileContent = await fs.readFile(DB_FILE, 'utf-8');
        const db = JSON.parse(fileContent);
        
        // If analytics are empty, seed them
        if (!db.hourlyAnalytics || db.hourlyAnalytics.length === 0) {
          db.hourlyAnalytics = generateMockHistory();
          await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
        }
        console.log('Database initialized successfully.');
      } catch (err) {
        // File does not exist, create it
        const db = { ...INITIAL_DB_STRUCTURE };
        db.hourlyAnalytics = generateMockHistory();
        await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
        console.log('Database file created and seeded with historical traffic data.');
      }
    } catch (err) {
      console.error('Error initializing database:', err);
    }
  },

  async read() {
    try {
      const data = await fs.readFile(DB_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return { ...INITIAL_DB_STRUCTURE };
    }
  },

  async write(data) {
    try {
      await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error writing to database:', err);
    }
  },

  async logDensity(laneCounts) {
    const db = await this.read();
    const newRecord = {
      timestamp: new Date().toISOString(),
      laneCounts
    };
    db.densityRecords.push(newRecord);
    // Cap in-memory logs to keep files clean and fast
    if (db.densityRecords.length > 500) db.densityRecords.shift();
    await this.write(db);
    return newRecord;
  },

  async logSignalTransition(fromState, toState, durationSeconds) {
    const db = await this.read();
    const newTransition = {
      timestamp: new Date().toISOString(),
      fromState,
      toState,
      durationSeconds
    };
    db.signalTransitions.push(newTransition);
    if (db.signalTransitions.length > 300) db.signalTransitions.shift();
    await this.write(db);
    return newTransition;
  },

  async logOverride(isActive, laneOverride = null) {
    const db = await this.read();
    const event = {
      timestamp: new Date().toISOString(),
      isActive,
      laneOverride
    };
    db.overrideEvents.push(event);
    await this.write(db);
    return event;
  },

  async getAnalytics() {
    const db = await this.read();
    return db.hourlyAnalytics;
  }
};
