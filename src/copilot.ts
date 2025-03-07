import fetch from 'node-fetch';
import { getCopilotToken as getStoredCopilotToken, saveCopilotToken, clearCopilotToken } from './storage.js';

interface Message {
  role: 'system' | 'user';
  content: string;
}

interface TokenResponse {
  token: string;
  expires_at: string;
}

interface CopilotRequest {
  intent: boolean;
  model: string;
  temperature: number;
  top_p: number;
  n: number;
  stream: boolean;
  messages: Message[];
}

interface CopilotResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Get Copilot token, using file storage cache if available and not expired
async function getCopilotToken(accessToken: string): Promise<string> {
  // Check if we have a stored token that's still valid
  const storedToken = getStoredCopilotToken();
  if (storedToken && storedToken.expiresAt > new Date()) {
    return storedToken.token;
  }
  
  // No valid token in storage, fetch a new one
  const response = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      'Authorization': `token ${accessToken}`,
      'User-Agent': 'GithubCopilot/1.155.0',
      'Editor-Version': 'vscode/1.80.1',
      'Editor-Plugin-Version': 'copilot.vim/1.16.0'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Log detailed error for debugging only when DEBUG env is set
    if (process.env.DEBUG) {
      console.error('Debug - Token refresh error:', errorText);
    }
    
    // Check for auth-related errors (401, 403)
    if (response.status === 401 || response.status === 403) {
      // Clear token from storage on auth failure
      clearCopilotToken();
      throw new TokenExpiredError('GitHub access token expired or invalid', 'github');
    } else if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else if (response.status >= 500) {
      throw new Error('GitHub service is currently unavailable. Please try again later.');
    } else {
      throw new Error('Unable to authenticate with GitHub Copilot.');
    }
  }

  const data = await response.json() as TokenResponse;
  
  // Store the token with expiration
  saveCopilotToken(data.token, data.expires_at);
  
  return data.token;
}

export class TokenExpiredError extends Error {
  // Token type: 'github' for GitHub access token, 'copilot' for Copilot token
  tokenType: 'github' | 'copilot';
  
  constructor(message: string = 'Token has expired', tokenType: 'github' | 'copilot' = 'copilot') {
    super(message);
    this.name = 'TokenExpiredError';
    this.tokenType = tokenType;
  }
}

// Function to explicitly clear the token cache
export function clearCopilotTokenCache(): void {
  clearCopilotToken();
}

export async function getCommandSuggestion(prompt: string, accessToken: string, sessionContext?: string): Promise<string> {
  try {
    // Get the Copilot token (cached if valid, refreshed if expired)
    const copilotToken = await getCopilotToken(accessToken);

    // Prepare messages array
    const messages: Message[] = [];
    
    // Add system context message if provided
    if (sessionContext) {
      messages.push({
        role: 'system',
        content: `${sessionContext}\n\nYou are a command-line assistant. Generate accurate terminal commands based on user requests. Consider the context of previous commands when applicable.`
      });
    }
    
    // Add user prompt
    messages.push({
      role: 'user',
      content: `Generate a terminal command for: ${prompt}\nProvide only the command, no explanation.`
    });

    const request: CopilotRequest = {
      intent: false,
      model: 'claude-3.5-sonnet',
      temperature: 0,
      top_p: 1,
      n: 1,
      stream: false,
      messages: messages
    };

    const response = await fetch('https://api.githubcopilot.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${copilotToken}`,
        'Editor-Version': 'vscode/1.80.1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Log detailed error for debugging privately (not showing to user)
      // This will be in terminal logs but not shown to user in the output
      if (process.env.DEBUG) {
        console.error('Full error response:', errorText);
      }
      
      // Check for auth-related errors (401, 403)
      if (response.status === 401 || response.status === 403) {
        // Clear token cache on auth failure
        clearCopilotToken();
        throw new TokenExpiredError('Copilot token expired or invalid', 'copilot');
      } else if (response.status === 429) {
        throw new Error('You have reached your Copilot usage limit. Please try again later.');
      } else if (response.status >= 500) {
        throw new Error('GitHub Copilot service is currently unavailable. Please try again later.');
      } else if (response.status === 400) {
        throw new Error('Invalid request to Copilot. Please try a different prompt.');
      } else {
        throw new Error('Unable to get a response from GitHub Copilot.');
      }
    }

    const data = await response.json() as CopilotResponse;
    const suggestion = data.choices[0]?.message.content.trim();

    if (!suggestion) {
      throw new Error('No command suggestion received');
    }

    return suggestion;
  } catch (error) {
    // Log detailed error for debugging only when DEBUG env is set
    if (process.env.DEBUG) {
      console.error('Debug - Error details:', error);
    }
    
    // Transform error to user-friendly message
    if (error instanceof TokenExpiredError) {
      // Just re-throw token errors as they are handled by REPL
      throw error;
    } else if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to GitHub Copilot. Please check your internet connection.');
      } else if (error.message.includes('Copilot API error')) {
        throw new Error('GitHub Copilot service error. Please try again in a few moments.');
      } else if (error.message.includes('No command suggestion')) {
        throw new Error('Copilot was unable to generate a command for your request. Please try rephrasing.');
      } else {
        // Generic friendly message for other errors
        throw new Error('Unable to get command suggestion from GitHub Copilot. Please try again.');
      }
    } else {
      throw new Error('An unexpected error occurred. Please try again.');
    }
  }
}