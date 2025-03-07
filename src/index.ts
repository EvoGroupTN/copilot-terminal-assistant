#!/usr/bin/env node
import { getDeviceCode, pollForToken } from './auth.js';
import { getToken, saveToken } from './storage.js';
import { startRepl } from './repl.js';
import { createSession } from './session.js';

async function main() {
  try {
    // Check for existing token
    let token = getToken();

    if (!token) {
      console.log('No existing token found. Starting device authorization flow...\n');
      const deviceCode = await getDeviceCode();
      
      console.log('To authorize this application, visit:');
      console.log(deviceCode.verification_uri);
      console.log('\nAnd enter the code:', deviceCode.user_code);
      console.log('\nWaiting for authorization...');

      token = await pollForToken(deviceCode.device_code, deviceCode.interval);
      saveToken(token);
      console.log('Authorization successful!\n');
    }

    // Create a new session for this run
    const session = createSession();
    console.log(`Session started: ${session.id}`);

    // Start the REPL with the token and session
    startRepl(token, session);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'An unexpected error occurred');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Startup error:', err instanceof Error ? err.message : 'An unexpected error occurred');
  process.exit(1);
});
