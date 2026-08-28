import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'debug-logs.json');

export interface DebugLog {
  timestamp: string;
  type: string;
  data: any;
}

export function logDebug(type: string, data: any) {
  try {
    let logs: DebugLog[] = [];
    if (fs.existsSync(LOG_FILE)) {
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      if (content) {
        logs = JSON.parse(content);
      }
    }

    logs.unshift({
      timestamp: new Date().toISOString(),
      type,
      data,
    });

    // Keep last 50 logs
    if (logs.length > 50) {
      logs = logs.slice(0, 50);
    }

    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error("Failed to write debug log", error);
  }
}

export function getDebugLogs(): DebugLog[] {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      if (content) {
        return JSON.parse(content);
      }
    }
  } catch (error) {
    console.error("Failed to read debug logs", error);
  }
  return [];
}
