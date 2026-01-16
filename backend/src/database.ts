import mysql from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';

let pool: Pool | null = null;

export async function initDatabase(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
}) {
  const poolConfig: any = {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
  };

  if (config.ssl) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  pool = mysql.createPool(poolConfig);
  
  const conn = await pool.getConnection();
  conn.release();
  console.log('MySQL connected');
}

function getPool(): Pool {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

function sanitizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'col';
}

export async function createTable(tableName: string, headers: string[]) {
  const columns = headers.map(h => {
    const col = sanitizeColumnName(h);
    return `\`${col}\` TEXT`;
  });
  
  const sql = `
    CREATE TABLE IF NOT EXISTS \`${tableName}\` (
      _id INT AUTO_INCREMENT PRIMARY KEY,
      _row_index INT,
      _updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      _deleted BOOLEAN DEFAULT FALSE,
      ${columns.join(',\n      ')}
    )
  `;
  
  await getPool().execute(sql);
  console.log(`Table ${tableName} created`);
}

export async function tableExists(tableName: string): Promise<boolean> {
  const [rows] = await getPool().execute(
    'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [tableName]
  );
  return (rows as any)[0].count > 0;
}

export async function getRows(tableName: string): Promise<Record<string, any>[]> {
  const [rows] = await getPool().execute(
    `SELECT * FROM \`${tableName}\` WHERE _deleted = FALSE ORDER BY _row_index`
  );
  return rows as Record<string, any>[];
}

export async function getRowByIndex(tableName: string, rowIndex: number): Promise<Record<string, any> | null> {
  const [rows] = await getPool().execute(
    `SELECT * FROM \`${tableName}\` WHERE _row_index = ? AND _deleted = FALSE`,
    [rowIndex]
  );
  const result = rows as Record<string, any>[];
  return result[0] || null;
}

export async function insertRow(tableName: string, headers: string[], data: Record<string, any>) {
  const cols = ['_row_index', ...headers.map(sanitizeColumnName)];
  const placeholders = cols.map(() => '?').join(', ');
  const values = [data._row_index, ...headers.map(h => data[h] ?? null)];
  
  await getPool().execute(
    `INSERT INTO \`${tableName}\` (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
    values
  );
}

export async function updateRow(tableName: string, headers: string[], rowIndex: number, data: Record<string, any>) {
  const sets = headers.map(h => `\`${sanitizeColumnName(h)}\` = ?`).join(', ');
  const values = [...headers.map(h => data[h] ?? null), rowIndex];
  
  await getPool().execute(
    `UPDATE \`${tableName}\` SET ${sets} WHERE _row_index = ?`,
    values
  );
}

export async function deleteRowByIndex(tableName: string, rowIndex: number) {
  await getPool().execute(
    `UPDATE \`${tableName}\` SET _deleted = TRUE WHERE _row_index = ?`,
    [rowIndex]
  );
}

export async function getMaxRowIndex(tableName: string): Promise<number> {
  const [rows] = await getPool().execute(
    `SELECT MAX(_row_index) as max_idx FROM \`${tableName}\` WHERE _deleted = FALSE`
  );
  return (rows as any)[0].max_idx || 1;
}

export async function getTableColumns(tableName: string): Promise<string[]> {
  const [rows] = await getPool().execute(
    `SELECT COLUMN_NAME FROM information_schema.columns 
     WHERE table_schema = DATABASE() AND table_name = ? 
     AND COLUMN_NAME NOT IN ('_id', '_row_index', '_updated_at', '_deleted')
     ORDER BY ORDINAL_POSITION`,
    [tableName]
  );
  return (rows as any[]).map(r => r.COLUMN_NAME);
}
