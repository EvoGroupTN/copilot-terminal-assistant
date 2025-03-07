import fetch from 'node-fetch';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export async function getDeviceCode(): Promise<DeviceCodeResponse> {
      const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'GithubCopilot/1.155.0'
      },
      body: JSON.stringify({
        client_id: 'Iv1.b507a08c87ecfe98',
        scope: 'read:user,copilot'
      })
  });

  if (!response.ok) {
    throw new Error(`Failed to get device code: ${response.statusText}`);
  }

  return response.json() as Promise<DeviceCodeResponse>;
}

export async function pollForToken(deviceCode: string, interval: number): Promise<string> {
  const pollInterval = interval * 1000; // Convert to milliseconds

  while (true) {
    try {
            const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'GithubCopilot/1.155.0'
        },
        body: JSON.stringify({
          client_id: 'Iv1.b507a08c87ecfe98',
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to get token: ${response.statusText}`);
      }

      const data = await response.json() as TokenResponse;

      if (data.access_token) {
        return data.access_token;
      }

      // Wait for the specified interval before trying again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      // Log a user-friendly error message
      console.error('Error polling for token:', error instanceof Error ? error.message : 'Unknown error');
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
}
