import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as sheets from './sheets.js';
import * as db from './database.js';
import * as sync from './sync.js';

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

let tokens: any = null;

async function init() {
  sheets.initOAuth(
    process.env.GOOGLE_CLIENT_ID || '',
    process.env.GOOGLE_CLIENT_SECRET || '',
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/callback'
  );
  
  await db.initDatabase({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3307'),
    user: process.env.MYSQL_USER || 'superjoin',
    password: process.env.MYSQL_PASSWORD || 'superjoinpass',
    database: process.env.MYSQL_DATABASE || 'superjoin',
  });
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/auth/google', (req, res) => {
  try {
    const url = sheets.getAuthUrl();
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.redirect(`${FRONTEND_URL}?error=no_code`);
  }
  
  try {
    tokens = await sheets.handleCallback(code);
    res.redirect(`${FRONTEND_URL}?auth=success`);
  } catch (error: any) {
    res.redirect(`${FRONTEND_URL}?error=${encodeURIComponent(error.message)}`);
  }
});

app.get('/auth/status', (req, res) => {
  res.json({ authenticated: sheets.isAuthenticated() });
});

app.get('/sheets/:id', async (req, res) => {
  try {
    const sheetId = sheets.extractSheetId(req.params.id);
    const names = await sheets.getSheetNames(sheetId);
    res.json({ sheets: names, sheetId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/sync/connect', async (req, res) => {
  try {
    const { sheetUrl, sheetName, tableName } = req.body;
    const sheetId = sheets.extractSheetId(sheetUrl);
    const result = await sync.connect(sheetId, sheetName, tableName);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/sync/data', async (req, res) => {
  try {
    const data = await sync.getData();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/sync/start', (req, res) => {
  try {
    const interval = req.body.interval || 5000;
    sync.startSync(interval);
    res.json({ running: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/sync/stop', (req, res) => {
  sync.stopSync();
  res.json({ running: false });
});

app.post('/sync/trigger', async (req, res) => {
  try {
    const stats = await sync.triggerSync();
    res.json({ stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/sync/status', (req, res) => {
  const state = sync.getSyncState();
  res.json({
    connected: !!state,
    isRunning: state?.isRunning || false,
    lastSync: state?.lastSync,
    stats: state?.stats,
    tableName: state?.tableName,
    sheetName: state?.sheetName,
  });
});

app.post('/sync/test-row', async (req, res) => {
  try {
    const result = await sync.insertTestRow();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

init().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
