import * as sheets from './sheets.js';
import * as db from './database.js';

interface SyncState {
  spreadsheetId: string;
  sheetName: string;
  tableName: string;
  headers: string[];
  isRunning: boolean;
  intervalId: NodeJS.Timeout | null;
  lastSync: Date | null;
  stats: { sheetToDb: number; dbToSheet: number };
}

let syncState: SyncState | null = null;

export function getSyncState() {
  return syncState;
}

export async function connect(spreadsheetId: string, sheetName: string, tableName: string) {
  if (syncState?.intervalId) {
    clearInterval(syncState.intervalId);
  }
  
  const sheetData = await sheets.readSheet(spreadsheetId, sheetName);
  if (sheetData.headers.length === 0) {
    throw new Error('Sheet is empty or has no headers');
  }
  
  await db.createTable(tableName, sheetData.headers);
  
  const exists = await db.tableExists(tableName);
  const dbRows = exists ? await db.getRows(tableName) : [];
  
  if (dbRows.length === 0) {
    for (const row of sheetData.rows) {
      await db.insertRow(tableName, sheetData.headers, row);
    }
    console.log(`Initial sync: ${sheetData.rows.length} rows to MySQL`);
  }
  
  syncState = {
    spreadsheetId,
    sheetName,
    tableName,
    headers: sheetData.headers,
    isRunning: false,
    intervalId: null,
    lastSync: new Date(),
    stats: { sheetToDb: sheetData.rows.length, dbToSheet: 0 },
  };
  
  return { 
    headers: sheetData.headers, 
    sheetRows: sheetData.rows.length,
    message: 'Connected and synced'
  };
}

export function startSync(intervalMs: number = 5000) {
  if (!syncState) throw new Error('Not connected');
  if (syncState.isRunning) return;
  
  syncState.isRunning = true;
  syncState.intervalId = setInterval(() => performSync(), intervalMs);
  console.log(`Auto-sync started (${intervalMs}ms interval)`);
}

export function stopSync() {
  if (!syncState) return;
  if (syncState.intervalId) {
    clearInterval(syncState.intervalId);
    syncState.intervalId = null;
  }
  syncState.isRunning = false;
  console.log('Auto-sync stopped');
}

async function performSync() {
  if (!syncState) return;
  
  try {
    const { spreadsheetId, sheetName, tableName, headers } = syncState;
    
    const sheetData = await sheets.readSheet(spreadsheetId, sheetName);
    const dbRows = await db.getRows(tableName);
    
    const sheetByIndex = new Map(sheetData.rows.map(r => [r._row_index, r]));
    const dbByIndex = new Map(dbRows.map(r => [r._row_index, r]));
    
    let sheetToDb = 0;
    let dbToSheet = 0;
    
    for (const [rowIndex, sheetRow] of sheetByIndex) {
      const dbRow = dbByIndex.get(rowIndex);
      
      if (!dbRow) {
        await db.insertRow(tableName, headers, sheetRow);
        sheetToDb++;
      } else {
        const isDifferent = headers.some(h => {
          const sheetVal = String(sheetRow[h] ?? '');
          const dbVal = String(dbRow[sanitize(h)] ?? '');
          return sheetVal !== dbVal;
        });
        
        if (isDifferent) {
          await db.updateRow(tableName, headers, rowIndex, sheetRow);
          sheetToDb++;
        }
      }
    }
    
    for (const [rowIndex, dbRow] of dbByIndex) {
      if (!sheetByIndex.has(rowIndex)) {
        const data: Record<string, any> = {};
        headers.forEach(h => {
          data[h] = dbRow[sanitize(h)];
        });
        await sheets.appendRow(spreadsheetId, sheetName, headers, data);
        dbToSheet++;
      }
    }
    
    syncState.lastSync = new Date();
    syncState.stats = { sheetToDb, dbToSheet };
    
    if (sheetToDb > 0 || dbToSheet > 0) {
      console.log(`Synced: ${sheetToDb} sheet->db, ${dbToSheet} db->sheet`);
    }
  } catch (error) {
    console.error('Sync error:', error);
  }
}

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'col';
}

export async function getData() {
  if (!syncState) return { sheet: null, mysql: null };
  
  const { spreadsheetId, sheetName, tableName, headers } = syncState;
  
  const sheetData = await sheets.readSheet(spreadsheetId, sheetName);
  const dbRows = await db.getRows(tableName);
  
  const cleanDbRows = dbRows.map(row => {
    const clean: Record<string, any> = { _row_index: row._row_index };
    headers.forEach(h => {
      clean[h] = row[sanitize(h)];
    });
    return clean;
  });
  
  return {
    sheet: { headers: sheetData.headers, rows: sheetData.rows },
    mysql: { headers, rows: cleanDbRows },
    lastSync: syncState.lastSync,
    isRunning: syncState.isRunning,
    stats: syncState.stats,
  };
}

export async function triggerSync() {
  await performSync();
  return syncState?.stats;
}

export async function insertTestRow() {
  if (!syncState) throw new Error('Not connected');
  
  const { tableName, headers } = syncState;
  const maxRowIndex = await db.getMaxRowIndex(tableName);
  const newRowIndex = maxRowIndex + 1;
  
  const testData: Record<string, any> = { _row_index: newRowIndex };
  headers.forEach((header, idx) => {
    const headerLower = header.toLowerCase();
    if (headerLower.includes('name') || headerLower.includes('title')) {
      testData[header] = `Test Row ${newRowIndex}`;
    } else if (headerLower.includes('date')) {
      testData[header] = new Date().toISOString().split('T')[0];
    } else if (headerLower.includes('priority')) {
      testData[header] = 'High';
    } else if (headerLower.includes('status')) {
      testData[header] = 'Test';
    } else if (headerLower.includes('assignee') || headerLower.includes('user')) {
      testData[header] = 'Test User';
    } else if (headerLower.includes('budget') || headerLower.includes('price') || headerLower.includes('amount')) {
      testData[header] = Math.floor(Math.random() * 10000);
    } else if (headerLower.includes('check') || headerLower.includes('done') || headerLower.includes('complete')) {
      testData[header] = 0;
    } else {
      testData[header] = `Test ${idx + 1}`;
    }
  });
  
  await db.insertRow(tableName, headers, testData);
  return { rowIndex: newRowIndex, data: testData };
}
