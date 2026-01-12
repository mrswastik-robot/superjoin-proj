import { google, sheets_v4 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let oauth2Client: OAuth2Client | null = null;
let sheetsApi: sheets_v4.Sheets | null = null;

export function initOAuth(clientId: string, clientSecret: string, redirectUri: string) {
  oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string {
  if (!oauth2Client) throw new Error('OAuth not initialized');
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent select_account',
  });
}

export async function handleCallback(code: string) {
  if (!oauth2Client) throw new Error('OAuth not initialized');
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  sheetsApi = google.sheets({ version: 'v4', auth: oauth2Client });
  return tokens;
}

export function setCredentials(tokens: any) {
  if (!oauth2Client) throw new Error('OAuth not initialized');
  oauth2Client.setCredentials(tokens);
  sheetsApi = google.sheets({ version: 'v4', auth: oauth2Client });
}

export function isAuthenticated(): boolean {
  return sheetsApi !== null;
}

export function extractSheetId(urlOrId: string): string {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : urlOrId;
}

export async function readSheet(spreadsheetId: string, sheetName: string): Promise<{
  headers: string[];
  rows: Record<string, any>[];
}> {
  if (!sheetsApi) throw new Error('Not authenticated');
  
  const response = await sheetsApi.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  
  const values = response.data.values || [];
  if (values.length === 0) return { headers: [], rows: [] };
  
  const headers = values[0].map((h: any) => String(h || '').trim());
  const rows = values.slice(1).map((row, idx) => {
    const obj: Record<string, any> = { _row_index: idx + 2 };
    headers.forEach((header, i) => {
      obj[header] = row[i] ?? null;
    });
    return obj;
  });
  
  return { headers, rows };
}

export async function getSheetNames(spreadsheetId: string): Promise<string[]> {
  if (!sheetsApi) throw new Error('Not authenticated');
  
  const response = await sheetsApi.spreadsheets.get({ spreadsheetId });
  return response.data.sheets?.map(s => s.properties?.title || '').filter(Boolean) || [];
}

export async function updateRow(
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,
  headers: string[],
  data: Record<string, any>
) {
  if (!sheetsApi) throw new Error('Not authenticated');
  
  const values = [headers.map(h => data[h] ?? '')];
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

export async function appendRow(
  spreadsheetId: string,
  sheetName: string,
  headers: string[],
  data: Record<string, any>
) {
  if (!sheetsApi) throw new Error('Not authenticated');
  
  const values = [headers.map(h => data[h] ?? '')];
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetName}'!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

export async function deleteRow(
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,
  columnCount: number
) {
  if (!sheetsApi) throw new Error('Not authenticated');
  
  const endCol = String.fromCharCode(64 + columnCount);
  await sheetsApi.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${sheetName}'!A${rowIndex}:${endCol}${rowIndex}`,
  });
}
