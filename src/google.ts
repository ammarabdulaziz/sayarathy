export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

interface TokenResponse { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (options?: { prompt: string }) => void }
interface GoogleIdentity {
  accounts: { oauth2: {
    initTokenClient: (options: {
      client_id: string; scope: string; callback: (response: TokenResponse) => void;
      error_callback: (error: { type: string }) => void;
    }) => TokenClient;
    revoke: (token: string, callback: () => void) => void;
  } };
}
declare global { interface Window { google?: GoogleIdentity } }

let loading: Promise<void> | undefined;
export function loadGoogle(): Promise<void> {
  if (window.google) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); loading = undefined; reject(new Error('Could not load Google authorization. Check your connection and retry.')); };
    document.head.appendChild(script);
  });
  return loading;
}

// Must be called directly from a click after the library has loaded to avoid popup blocking.
export function authorize(clientId: string): Promise<{ token: string; expiresAt: number }> {
  return new Promise((resolve, reject) => {
    if (!window.google) return reject(new Error('Google authorization is still loading. Please retry.'));
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: DRIVE_SCOPE,
      callback: response => {
        if (response.error || !response.access_token) return reject(new Error(response.error_description || response.error || 'Google did not return an access token.'));
        if (!response.scope?.split(' ').includes(DRIVE_SCOPE)) return reject(new Error('Drive file access was not granted. Reconnect and allow access to app files.'));
        resolve({ token: response.access_token, expiresAt: Date.now() + (response.expires_in || 3600) * 1000 });
      },
      error_callback: error => reject(new Error(error.type === 'popup_closed' ? 'Google sign-in was closed. Click Connect to try again.' : `Google sign-in failed (${error.type}). Allow popups and retry.`)),
    });
    client.requestAccessToken({ prompt: '' });
  });
}
