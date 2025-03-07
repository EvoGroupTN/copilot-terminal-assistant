import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

// Session storage configuration
const CONFIG_DIR = path.join(os.homedir(), '.copilot-terminal');
const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');

// Interface for session entry
export interface SessionEntry {
  timestamp: number;
  prompt: string;
  command?: string;
  executed?: boolean;
  output?: string;
}

// Interface for session data
export interface SessionData {
  id: string;
  createdAt: number;
  lastUpdatedAt: number;
  entries: SessionEntry[];
}

// Ensure sessions directory exists
function ensureSessionsDirectory(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

// Create a new session
export function createSession(): SessionData {
  ensureSessionsDirectory();
  
  const sessionId = uuidv4();
  const now = Date.now();
  
  const session: SessionData = {
    id: sessionId,
    createdAt: now,
    lastUpdatedAt: now,
    entries: []
  };
  
  // Save session file
  const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
  fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  
  return session;
}

// Load session by ID
export function loadSession(sessionId: string): SessionData | null {
  try {
    const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
    
    if (!fs.existsSync(sessionFile)) {
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8')) as SessionData;
    return data;
  } catch (error) {
    console.error('Error loading session:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

// Save session
export function saveSession(session: SessionData): void {
  ensureSessionsDirectory();
  
  // Update last updated timestamp
  session.lastUpdatedAt = Date.now();
  
  // Save session file
  const sessionFile = path.join(SESSIONS_DIR, `${session.id}.json`);
  fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
}

// Add entry to session
export function addSessionEntry(
  session: SessionData, 
  prompt: string, 
  command?: string, 
  executed: boolean = false
): SessionData {
  const entry: SessionEntry = {
    timestamp: Date.now(),
    prompt,
    command,
    executed
  };
  
  session.entries.push(entry);
  session.lastUpdatedAt = entry.timestamp;
  
  // Save the updated session
  saveSession(session);
  
  return session;
}

// Update last entry in session
export function updateLastSessionEntry(
  session: SessionData,
  command?: string,
  executed: boolean = false,
  output?: string
): SessionData {
  if (session.entries.length > 0) {
    const lastEntry = session.entries[session.entries.length - 1];
    
    if (command !== undefined) {
      lastEntry.command = command;
    }
    
    lastEntry.executed = executed;
    
    if (output !== undefined) {
      lastEntry.output = output;
    }
    
    session.lastUpdatedAt = Date.now();
    
    // Save the updated session
    saveSession(session);
  }
  
  return session;
}

// Get recent session history formatted for context
export function getSessionContext(session: SessionData, limit: number = 5): string {
  // Take the most recent entries up to the limit
  const recentEntries = session.entries.slice(-limit);
  
  // Format entries as context
  let context = "Previous commands:\n\n";
  
  recentEntries.forEach((entry, index) => {
    context += `[${index + 1}] User: ${entry.prompt}\n`;
    if (entry.command) {
      context += `    Command: ${entry.command}\n`;
      context += `    Executed: ${entry.executed ? 'Yes' : 'No'}\n`;
      
      // Include command output if available
      if (entry.output) {
        // Limit output size to prevent context from growing too large
        const maxOutputLength = 500;
        let limitedOutput = entry.output;
        
        if (limitedOutput.length > maxOutputLength) {
          limitedOutput = limitedOutput.substring(0, maxOutputLength) + '... [output truncated]';
        }
        
        context += `    Output: ${limitedOutput.replace(/\n/g, '\n      ')}\n`;
      }
    }
    context += "\n";
  });
  
  return context;
}

// List all sessions
export function listSessions(): SessionData[] {
  ensureSessionsDirectory();
  
  try {
    const files = fs.readdirSync(SESSIONS_DIR);
    const sessions: SessionData[] = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const sessionId = file.replace('.json', '');
        const session = loadSession(sessionId);
        
        if (session) {
          sessions.push(session);
        }
      }
    }
    
    // Sort by last updated (newest first)
    return sessions.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
  } catch (error) {
    console.error('Error listing sessions:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

// Delete a session
export function deleteSession(sessionId: string): boolean {
  try {
    const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
    
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error deleting session:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}