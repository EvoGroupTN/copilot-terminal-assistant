import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.copilot-terminal');
const TOKEN_FILE = path.join(CONFIG_DIR, 'token.json');
const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');

interface TokenStorage {
  githubToken: string;
  copilotToken?: string;
  copilotTokenExpiresAt?: string;
}

// Save both GitHub and Copilot tokens to the same file
export function saveTokens(githubToken: string, copilotToken?: string, expiresAt?: string): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    // Try to read existing file in case we're only updating one token
    let tokenData: TokenStorage = { githubToken };
    
    if (fs.existsSync(TOKEN_FILE)) {
      try {
        const existingData = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) as TokenStorage;
        tokenData = { ...existingData };
      } catch (e) {
        // File exists but isn't valid JSON, we'll overwrite it
      }
    }
    
    // Update with the new values
    tokenData.githubToken = githubToken;
    
    if (copilotToken) {
      tokenData.copilotToken = copilotToken;
      tokenData.copilotTokenExpiresAt = expiresAt;
    }
    
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
  } catch (error) {
    console.error('Error saving tokens:', error instanceof Error ? error.message : 'Unknown error');
    throw new Error('Could not save authentication tokens. Check file permissions in your home directory.');
  }
}

// Save only GitHub token for backward compatibility
export function saveToken(token: string): void {
  saveTokens(token);
}

// Save Copilot token with expiration
export function saveCopilotToken(token: string, expiresAt: string): void {
  // Get existing GitHub token
  const githubToken = getToken();
  if (githubToken) {
    saveTokens(githubToken, token, expiresAt);
  }
}

// Get GitHub access token
export function getToken(): string | null {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      return null;
    }
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) as TokenStorage;
    return data.githubToken || null;
  } catch (error) {
    console.error('Error reading token:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

// Get Copilot token with expiration
export function getCopilotToken(): { token: string; expiresAt: Date } | null {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) as TokenStorage;
    
    if (data.copilotToken && data.copilotTokenExpiresAt) {
      // Handle both string and number formats for expiration
      const expiresAt = typeof data.copilotTokenExpiresAt === 'string' 
        ? new Date(data.copilotTokenExpiresAt) 
        : new Date(Number(data.copilotTokenExpiresAt) * 1000); // Convert seconds to milliseconds
      
      return {
        token: data.copilotToken,
        expiresAt
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error reading Copilot token:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

// Clear both tokens
export function clearToken(): void {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  } catch (error) {
    console.error('Error clearing tokens:', error instanceof Error ? error.message : 'Unknown error');
    throw new Error('Could not clear authentication tokens. Check file permissions.');
  }
}

// Clear only Copilot token
export function clearCopilotToken(): void {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) as TokenStorage;
        
        // Remove Copilot token and expiration
        delete data.copilotToken;
        delete data.copilotTokenExpiresAt;
        
        // Save back the file with only GitHub token
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
      } catch (e) {
        // Couldn't parse the file, just leave it as is
      }
    }
  } catch (error) {
    console.error('Error clearing Copilot token:', error instanceof Error ? error.message : 'Unknown error');
    throw new Error('Could not clear Copilot token. Check file permissions.');
  }
}
