import { getCommandSuggestion, TokenExpiredError, clearCopilotTokenCache } from './copilot.js';
import * as readline from 'readline';
import { execSync } from 'child_process';
import { getDeviceCode, pollForToken } from './auth.js';
import { saveToken, clearCopilotToken } from './storage.js';
import { SessionData, addSessionEntry, updateLastSessionEntry, getSessionContext, saveSession } from './session.js';

export function startRepl(initialToken: string, session: SessionData): void {
  // Store token in a variable that can be updated
  let token = initialToken;
  
  // Display welcome message
  console.log('Welcome to Copilot Terminal Assistant');
  console.log('Type commands directly to execute them');
  console.log('Use "? <query>" to get command suggestions from Copilot');
  console.log('Use UP/DOWN arrows to navigate command history');
  console.log('Type "help" for more options or "exit" to quit');
  console.log('----------------------------------------');
  
  // Function to regenerate token
  async function regenerateToken(): Promise<string> {
    console.log('\nToken expired. Starting device authorization flow to generate a new token...\n');
    
    try {
      const deviceCode = await getDeviceCode();
      
      console.log('To authorize this application, visit:');
      console.log(deviceCode.verification_uri);
      console.log('\nAnd enter the code:', deviceCode.user_code);
      console.log('\nWaiting for authorization...');

      const newToken = await pollForToken(deviceCode.device_code, deviceCode.interval);
      saveToken(newToken);
      console.log('Authorization successful!\n');
      
      return newToken;
    } catch (error) {
      console.error('Failed to regenerate token:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
  
  // Create the main REPL function
  async function promptForCommand() {
    // Track command history cursor position
    let historyPosition = session.entries.length;
    // Create an array of just the prompt texts for the history navigation
    const promptHistory = session.entries.map(entry => entry.prompt);
    
    // Instead of using readline interface, we'll use raw mode for more control
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    // Display prompt
    process.stdout.write('> ');
    
    // Current command being typed
    let currentInput = '';
    // Store the current input when navigating history
    let savedInput = '';
    // Cursor position within the current input
    let cursorPos = 0;
    
    // Get user input
    const line = await new Promise<string>((resolve) => {
      const keypressHandler = (key: Buffer) => {
        const str = key.toString();
        
        // Handle special keys
        if (str === '\r') {
          // Enter key - submit the command
          process.stdout.write('\n');
          
          // Clean up
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', keypressHandler);
          
          resolve(currentInput);
        } else if (str === '\u0003') {
          // Ctrl+C - exit the program
          process.stdout.write('\n');
          console.log('Operation cancelled');
          process.exit(0);
        } else if (str === '\u001b[A') {
          // Up arrow - navigate to previous history item
          if (historyPosition > 0) {
            // Save current input if we're at the initial position
            if (historyPosition === promptHistory.length) {
              savedInput = currentInput;
            }
            
            historyPosition--;
            // Replace current input with history item
            const historyItem = promptHistory[historyPosition];
            
            // Clear current line and display history item
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write('> ' + historyItem);
            
            currentInput = historyItem;
            cursorPos = currentInput.length;
          }
        } else if (str === '\u001b[B') {
          // Down arrow - navigate to next history item
          if (historyPosition < promptHistory.length) {
            historyPosition++;
            
            let newInput;
            if (historyPosition === promptHistory.length) {
              // We're back at the bottom - use the saved input
              newInput = savedInput;
            } else {
              newInput = promptHistory[historyPosition];
            }
            
            // Clear current line and display the new input
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write('> ' + newInput);
            
            currentInput = newInput;
            cursorPos = currentInput.length;
          }
        } else if (str === '\u007f') {
          // Backspace key
          if (cursorPos > 0) {
            // Remove character before cursor
            currentInput = currentInput.substring(0, cursorPos - 1) + currentInput.substring(cursorPos);
            cursorPos--;
            
            // Redraw the line
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write('> ' + currentInput);
            process.stdout.cursorTo(cursorPos + 2); // +2 for the '> ' prompt
          }
        } else if (str === '\u001b[D') {
          // Left arrow - move cursor left
          if (cursorPos > 0) {
            cursorPos--;
            process.stdout.cursorTo(cursorPos + 2); // +2 for the '> ' prompt
          }
        } else if (str === '\u001b[C') {
          // Right arrow - move cursor right
          if (cursorPos < currentInput.length) {
            cursorPos++;
            process.stdout.cursorTo(cursorPos + 2); // +2 for the '> ' prompt
          }
        } else if (str === '\u001b[H') {
          // Home key - move cursor to start
          cursorPos = 0;
          process.stdout.cursorTo(2); // +2 for the '> ' prompt
        } else if (str === '\u001b[F') {
          // End key - move cursor to end
          cursorPos = currentInput.length;
          process.stdout.cursorTo(cursorPos + 2); // +2 for the '> ' prompt
        } else if (!str.startsWith('\u001b')) {
          // Regular character input (exclude other escape sequences)
          // Insert at cursor position
          currentInput = currentInput.substring(0, cursorPos) + str + currentInput.substring(cursorPos);
          cursorPos += str.length;
          
          // Redraw the line
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write('> ' + currentInput);
          process.stdout.cursorTo(cursorPos + 2); // +2 for the '> ' prompt
        }
      };
      
      // Set up the keypress handler
      process.stdin.on('data', keypressHandler);
    });
    
    // Process the input
    const input = line.trim();
    
    // Handle commands
    if (input.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      process.exit(0);
    }
    
    // Handle help command
    if (input.toLowerCase() === 'help') {
      console.log('\nCopilot Terminal Help');
      console.log('--------------------');
      console.log('exit - Exit the application');
      console.log('help - Show this help message');
      console.log('session - Show current session information');
      console.log('clear - Clear session history');
      console.log('? <query> - Ask Copilot to suggest a command for your query');
      console.log('Any other input - Will be executed directly as a command');
      console.log('\nNavigation:');
      console.log('UP/DOWN arrows - Navigate through command history');
      console.log('LEFT/RIGHT arrows - Move cursor within current input');
      console.log('HOME/END - Jump to start/end of current input');
      return promptForCommand();
    }
    
    // Handle session command
    if (input.toLowerCase() === 'session') {
      console.log('\nCurrent Session Information');
      console.log('-------------------------');
      console.log(`Session ID: ${session.id}`);
      console.log(`Created: ${new Date(session.createdAt).toLocaleString()}`);
      console.log(`Last updated: ${new Date(session.lastUpdatedAt).toLocaleString()}`);
      console.log(`Number of commands: ${session.entries.length}`);
      
      // Display recent entries
      if (session.entries.length > 0) {
        console.log('\nRecent History:');
        const recentEntries = session.entries.slice(-5);
        recentEntries.forEach((entry, i) => {
          const entryNum = session.entries.length - recentEntries.length + i + 1;
          console.log(`[${entryNum}] "${entry.prompt}" => "${entry.command || 'No command generated'}" ${entry.executed ? '(Executed)' : ''}`);
          
          // Show short preview of output if available
          if (entry.output) {
            // Truncate long outputs for display
            let outputPreview = entry.output.replace(/\n/g, ' ').trim();
            if (outputPreview.length > 60) {
              outputPreview = outputPreview.substring(0, 60) + '...';
            }
            console.log(`    Output: ${outputPreview}`);
          }
        });
        
        console.log('\nTip: Command outputs are used to improve future suggestions.');
      }
      
      return promptForCommand();
    }
    
    // Handle clear command
    if (input.toLowerCase() === 'clear') {
      // Clear session entries but keep the session
      session.entries = [];
      saveSession(session);
      console.log('\nSession history cleared');
      return promptForCommand();
    }
    
    // Skip empty input and start a new prompt
    if (!input) {
      return promptForCommand();
    }
    
    // Check if input starts with '?' for Copilot suggestion or should be executed directly
    if (!input.startsWith('?')) {
      // Execute the command directly
      console.log(`Executing: ${input}`);
      
      try {
        // Add command to session
        addSessionEntry(session, input, input);
        
        // Execute the command
        const output = execSync(input, { encoding: 'utf8' });
        console.log(output);
        
        // Update session with execution result
        updateLastSessionEntry(session, input, true, output);
      } catch (execError) {
        const errorMessage = execError instanceof Error ? execError.message : 'Unknown error';
        console.error('\nCommand execution failed:', errorMessage);
        
        // Update session with error
        updateLastSessionEntry(session, input, false, `Error: ${errorMessage}`);
      }
      
      // Continue with next prompt
      console.log('\n----------------------------------------');
      return promptForCommand();
    }
    
    // Input starts with '?' - use Copilot for suggestion
    // Extract the actual query by removing the '?' prefix
    const query = input.substring(1).trim();
    
    // Add original input (with '?') to session
    addSessionEntry(session, input);
    
    try {
      // Get command suggestion
      console.log('Thinking...');
      let command;
      
      try {
        // Get session context
        const context = getSessionContext(session);
        command = await getCommandSuggestion(query, token, context);
      } catch (error) {
        // Check if token expired error
        if (error instanceof TokenExpiredError) {
          // Authentication error detected
          // Clear Copilot token cache first
          clearCopilotTokenCache();
          
          // Check what type of token expired
          if (error instanceof TokenExpiredError && error.tokenType === 'github') {
            // GitHub token has expired, start the full authorization flow immediately
            console.log('\nGitHub token has expired. Starting device authorization flow...');
            token = await regenerateToken();
            // Retry with new GitHub token
            try {
              const context = getSessionContext(session);
              command = await getCommandSuggestion(query, token, context);
            } catch (retryError) {
              throw new Error('Failed to get command after token refresh. Please try again.');
            }
          } else {
            // If it's a Copilot token error or other TokenExpiredError, try with the existing GitHub token
            console.log('\nRefreshing Copilot access...');
            try {
              // Retry with the same GitHub token (will get a new Copilot token)
              const context = getSessionContext(session);
              command = await getCommandSuggestion(query, token, context);
            } catch (retryError) {
              // If retry fails, then regenerate GitHub token through authorization flow
              if (retryError instanceof TokenExpiredError) {
                console.log('\nGitHub token has expired. Starting device authorization flow...');
                token = await regenerateToken();
                // Retry with new GitHub token
                try {
                  const context = getSessionContext(session);
                  command = await getCommandSuggestion(query, token, context);
                } catch (finalError) {
                  throw new Error('Failed to get command after token refresh. Please try again.');
                }
              } else {
                // Create a user-friendly message
                throw new Error('Failed to get a response from GitHub Copilot. Please try again.');
              }
            }
          }
        } else {
          // Create a user-friendly message
          if (error instanceof Error) {
            throw new Error(error.message);
          } else {
            throw new Error('Failed to get command suggestion');
          }
        }
      }
      
      console.log('\nSuggested command:');
      console.log(`$ ${command}`);
      
      // Update session with suggested command
      updateLastSessionEntry(session, command);
      
      // Now ask if user wants to run the command
      const action = await promptYesNo('Run this command?');
      
      if (action === true) {
        console.log('\nExecuting command...');
        try {
          const output = execSync(command, { encoding: 'utf8' });
          console.log(output);
          // Update session - command was executed with output
          updateLastSessionEntry(session, command, true, output);
        } catch (execError) {
          const errorMessage = execError instanceof Error ? execError.message : 'Unknown error';
          console.error('\nCommand execution failed:', errorMessage);
          // Update session - command failed with error message
          updateLastSessionEntry(session, command, false, `Error: ${errorMessage}`);
        }
      } else if (action === 'edit') {
        // Create a readline interface for editing
        const editRl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        // Prompt user to edit the command
        const editedCommand = await new Promise<string>((resolve) => {
          editRl.question('\nEdit command: ', (input) => {
            resolve(input.trim() || command); // Use original if empty
            editRl.close();
          });
          
          // Pre-fill with original command for easier editing
          editRl.write(command);
        });
        
        // Execute the edited command if not empty
        if (editedCommand) {
          console.log('\nExecuting edited command...');
          try {
            const output = execSync(editedCommand, { encoding: 'utf8' });
            console.log(output);
            // Update session with edited command, execution status and output
            updateLastSessionEntry(session, editedCommand, true, output);
          } catch (execError) {
            const errorMessage = execError instanceof Error ? execError.message : 'Unknown error';
            console.error('\nCommand execution failed:', errorMessage);
            // Update session with edited command, failed status and error message
            updateLastSessionEntry(session, editedCommand, false, `Error: ${errorMessage}`);
          }
        }
      }
    } catch (error) {
      // Show a clean error message without stack trace
      if (error instanceof Error) {
        console.error('\nError:', error.message);
      } else {
        console.error('\nError: Failed to get suggestion');
      }
    }
    
    // Show separator and continue with next prompt
    console.log('\n----------------------------------------');
    return promptForCommand();
  }
  
  // Function to prompt for action with arrow key selection
  async function promptYesNo(message: string): Promise<boolean | 'edit'> {
    return new Promise<boolean | 'edit'>((resolve) => {
      let selectedOption = 0; // 0 = Yes, 1 = No, 2 = Edit
      
      // Enable raw mode for keypress detection
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      // Render the selection UI
      function renderSelection() {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        
        const yesStyle = selectedOption === 0 ? '\x1b[7m Yes \x1b[0m' : ' Yes ';
        const noStyle = selectedOption === 1 ? '\x1b[7m No \x1b[0m' : ' No ';
        const editStyle = selectedOption === 2 ? '\x1b[7m Edit \x1b[0m' : ' Edit ';
        
        process.stdout.write(`${message} [${yesStyle}] [${noStyle}] [${editStyle}] (Use arrow keys, press Enter to confirm)`);
      }
      
      // Initial render
      renderSelection();
      
      // Listen for keypresses
      const keypressHandler = (key: Buffer) => {
        const str = key.toString();
        
        if (str === '\u001b[C') {
          // Right arrow key - move to next option
          selectedOption = (selectedOption + 1) % 3;
          renderSelection();
        } else if (str === '\u001b[D') {
          // Left arrow key - move to previous option
          selectedOption = (selectedOption + 2) % 3;
          renderSelection();
        } else if (str === '\r') {
          // Enter key - confirm selection
          process.stdout.write('\n');
          
          // Clean up
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', keypressHandler);
          
          // Return the selected option
          if (selectedOption === 0) resolve(true);
          else if (selectedOption === 1) resolve(false);
          else resolve('edit');
        } else if (str === '\u0003') {
          // Ctrl+C
          process.stdout.write('\n');
          console.log('Operation cancelled');
          
          // Clean up
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', keypressHandler);
          
          // Default to "No"
          resolve(false);
        }
      };
      
      // Set up the keypress handler
      process.stdin.on('data', keypressHandler);
    });
  }
  
  // Start the REPL
  promptForCommand().catch(err => {
    console.error('Unexpected error:', err instanceof Error ? err.message : 'Unknown error occurred');
    process.exit(1);
  });
}
