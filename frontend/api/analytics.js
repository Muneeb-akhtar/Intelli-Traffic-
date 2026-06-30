import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('analytics')
      .select('*')
      .order('timestamp', { ascending: true })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const record = req.body;
    if (!record || !record.timestamp) return res.status(400).json({ error: 'Missing timestamp' });
    const { error } = await supabase.from('analytics').insert([{
      timestamp:            record.timestamp,
      hour:                 record.hour,
      counts:               record.counts,
      total_vehicles:       record.totalVehicles,
      average_wait_seconds: record.averageWaitSeconds,
      congestion_index:     record.congestionIndex,
    }]);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
