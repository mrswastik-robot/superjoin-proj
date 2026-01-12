# Superjoin - Google Sheets ↔ MySQL 2-Way Sync

A simple, production-grade 2-way data synchronization system between Google Sheets and MySQL.

## Quick Start

### 1. Start MySQL
```bash
docker-compose up -d
```

### 2. Set up Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the **Google Sheets API**
4. Create **OAuth 2.0 credentials** (Web application)
5. Add `http://localhost:3001/auth/callback` as authorized redirect URI
6. Copy Client ID and Secret to `backend/.env`

### 3. Configure Backend
```bash
cd backend
cp env.example .env
# Edit .env with your Google credentials
npm install
npm run dev
```

### 4. Start Frontend
```bash
cd frontend
npm install
npm run dev
```

### 5. Open http://localhost:3000

## How It Works

1. **Connect Google** - Authenticate with your Google account
2. **Paste Sheet URL** - Enter any Google Sheets URL
3. **Start Sync** - Data syncs every 5 seconds

Changes in either Google Sheets or MySQL are automatically detected and synchronized.

## Tech Stack

- **Backend**: Express.js + TypeScript
- **Database**: MySQL 8.0
- **Frontend**: Next.js 14 + Tailwind CSS
- **APIs**: Google Sheets API v4

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/google` | GET | Get OAuth URL |
| `/auth/callback` | GET | OAuth callback |
| `/auth/status` | GET | Check auth status |
| `/sheets/:id` | GET | Get sheet names |
| `/sync/connect` | POST | Connect sheet + create table |
| `/sync/data` | GET | Get data from both sources |
| `/sync/start` | POST | Start auto-sync |
| `/sync/stop` | POST | Stop auto-sync |
| `/sync/trigger` | POST | Manual sync trigger |

## Sync Algorithm

Every 5 seconds:
1. Read all rows from Google Sheet
2. Read all rows from MySQL table
3. Compare rows by index
4. Sync differences (sheet changes → MySQL, MySQL changes → sheet)
