const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const MARKER = 'sayarathy-v1';
const FIELDS = 'id,name,modifiedTime,version,size,webViewLink';

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  version: string;
  size?: string;
  webViewLink?: string;
}

export class DriveError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function parseDocument(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The JSON must be an object, not an array or a primitive value.');
  }
  return value as Record<string, unknown>;
}

export class DriveStore {
  constructor(private token: string) {}

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = body?.error?.message || response.statusText;
      throw new DriveError(
        response.status === 401 ? 'Google authorization expired. Reconnect Google Drive, then retry.' :
        response.status === 404 ? 'This file is missing or no longer accessible. Refresh the file list.' :
        `Google Drive: ${detail}`, response.status,
      );
    }
    return response.status === 204 ? undefined as T : response.json();
  }

  async list(): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        q: `trashed = false and appProperties has { key='application' and value='${MARKER}' }`,
        fields: `nextPageToken,files(${FIELDS})`, pageSize: '100', orderBy: 'modifiedTime desc',
      });
      if (pageToken) query.set('pageToken', pageToken);
      const page: { files: DriveFile[]; nextPageToken?: string } = await this.request(`${API}/files?${query}`);
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  async create(text: string): Promise<DriveFile> {
    const data = parseDocument(text);
    const boundary = `sayarathy_${crypto.randomUUID()}`;
    const metadata = { name: 'sayarathy.json', mimeType: 'application/json', appProperties: { application: MARKER } };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(data, null, 2)}\r\n--${boundary}--\r\n`;
    return this.request(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
  }

  async read(id: string): Promise<{ file: DriveFile; data: Record<string, unknown> }> {
    const file = await this.request<DriveFile>(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS}`);
    const data = await this.request<Record<string, unknown>>(`${API}/files/${encodeURIComponent(id)}?alt=media`);
    parseDocument(JSON.stringify(data));
    return { file, data };
  }

  async update(file: DriveFile, text: string): Promise<DriveFile> {
    const data = parseDocument(text);
    const latest = await this.request<DriveFile>(`${API}/files/${encodeURIComponent(file.id)}?fields=${FIELDS}`);
    if (latest.version !== file.version) {
      throw new Error('This file changed since you opened it. Download your draft, then read the latest file before saving.');
    }
    // A preflight version check catches stale edits, but is not an atomic lock.
    return this.request(`${UPLOAD}/files/${encodeURIComponent(file.id)}?uploadType=media&fields=${FIELDS}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(data, null, 2),
    });
  }

  async delete(id: string): Promise<void> {
    await this.request(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}
