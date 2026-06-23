import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { Database } from './database/db.js';
import { TrafficEngine, LANES } from './services/adaptiveEngine.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// REST API Endpoints

// 1. Get current intersection state and lane densities
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: TrafficEngine.getCurrentPayload()
  });
});

// 2. Receive live density counts from AI module
app.post('/api/density', (req, res) => {
  const { laneCounts } = req.body;
  
  if (!laneCounts) {
    return res.status(400).json({
      success: false,
      message: 'Missing laneCounts parameter in request body.'
    });
  }

  TrafficEngine.updateDensities(laneCounts);
  res.json({
    success: true,
    message: 'Density counts updated successfully.',
    currentPayload: TrafficEngine.getCurrentPayload()
  });
});

// 3. Command manual override
app.post('/api/override', async (req, res) => {
  const { action, laneIndex } = req.body;

  if (action === 'start') {
    const idx = parseInt(laneIndex);
    if (isNaN(idx) || idx < 0 || idx >= LANES.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid laneIndex provided.'
      });
    }
    await TrafficEngine.setOverride(idx);
    return res.json({
      success: true,
      message: `Manual override initiated for ${LANES[idx]} lane.`
    });
  } else if (action === 'stop') {
    await TrafficEngine.clearOverride();
    return res.json({
      success: true,
      message: 'Manual override cleared. Restoring automatic adaptive system.'
    });
  }

  res.status(400).json({
    success: false,
    message: "Invalid action. Use 'start' or 'stop'."
  });
});

// 4. Fetch historical analytics for charts
app.get('/api/analytics', async (req, res) => {
  try {
    const data = await Database.getAnalytics();
    res.json({
      success: true,
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics logs.'
    });
  }
});

// 5. Emergency vehicle priority override
app.post('/api/emergency', async (req, res) => {
  const { action, laneIndex } = req.body;

  if (action === 'start') {
    const idx = parseInt(laneIndex);
    if (isNaN(idx) || idx < 0 || idx >= LANES.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid laneIndex provided.'
      });
    }
    await TrafficEngine.setEmergency(idx);
    return res.json({
      success: true,
      message: `Emergency vehicle priority activated for ${LANES[idx]} lane.`
    });
  } else if (action === 'stop') {
    await TrafficEngine.clearEmergency();
    return res.json({
      success: true,
      message: 'Emergency cleared. Resuming normal operations.'
    });
  }

  res.status(400).json({
    success: false,
    message: "Invalid action. Use 'start' or 'stop'."
  });
});

// 6. Update adaptive engine settings at runtime
app.post('/api/settings', (req, res) => {
  const { minGreen, maxGreen, densityCap } = req.body;
  TrafficEngine.updateSettings({ minGreen, maxGreen, densityCap });
  res.json({
    success: true,
    message: 'Engine settings updated.',
    settings: TrafficEngine.settings
  });
});

// 7. Fetch safety/audit logs
app.get('/api/safety-logs', (req, res) => {
  res.json({
    success: true,
    data: TrafficEngine.getSafetyLogs()
  });
});

// Setup Servers
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Bind WebSocket to Engine
TrafficEngine.setWsServer(wss);

wss.on('connection', (ws) => {
  console.log('Dashboard client connected via WebSockets.');
  
  // Immediately send current state on connection
  ws.send(JSON.stringify({
    type: 'STATE_UPDATE',
    data: TrafficEngine.getCurrentPayload()
  }));

  ws.on('close', () => {
    console.log('Dashboard client disconnected.');
  });
});

// Bootstrap logic
async function bootstrap() {
  // Initialize Database
  await Database.init();
  
  // Start traffic decision engine
  TrafficEngine.start();
  
  server.listen(PORT, () => {
    console.log(`Intelli Traffic server is listening on port ${PORT}`);
    console.log(`WebSocket Server active on the same port.`);
  });
}

bootstrap();
