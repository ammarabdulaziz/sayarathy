import type { Attachment } from './model';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const MARKER = 'sayarathy-v1';
const FIELDS = 'id,name,modifiedTime,version,md5Checksum,size,webViewLink';

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  version: string;
  md5Checksum: string;
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

  private async response(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
      cache: 'no-store',
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
    return response;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.response(url, init);
    return response.status === 204 ? undefined as T : response.json();
  }

  async list(): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        q: `trashed = false and mimeType = 'application/json' and appProperties has { key='application' and value='${MARKER}' }`,
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
    const metadata = { name: 'sayarathy.json', mimeType: 'application/json', appProperties: { application: MARKER, kind: 'dataset' } };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(data, null, 2)}\r\n--${boundary}--\r\n`;
    return this.request(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
  }

  async read(id: string, signal?: AbortSignal): Promise<{ file: DriveFile; data: Record<string, unknown> }> {
    const file = await this.metadata(id, signal);
    if (Number(file.size || 0) > 3 * 1024 * 1024) throw new Error('This data file is too large to open (maximum 3 MB).');
    const data = await this.request<Record<string, unknown>>(`${API}/files/${encodeURIComponent(id)}?alt=media`, { signal });
    parseDocument(JSON.stringify(data));
    const latest = await this.metadata(id, signal);
    if (!file.md5Checksum || file.md5Checksum !== latest.md5Checksum) {
      throw new Error('The file content changed while it was being read. Retry reading it to get a consistent copy.');
    }
    return { file: latest, data };
  }

  async metadata(id: string, signal?: AbortSignal): Promise<DriveFile> {
    return this.request(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS}`, { signal });
  }

  async update(file: DriveFile, text: string): Promise<DriveFile> {
    const data = parseDocument(text);
    const latest = await this.request<DriveFile>(`${API}/files/${encodeURIComponent(file.id)}?fields=${FIELDS}`);
    if (!file.md5Checksum || !latest.md5Checksum) {
      throw new Error('Could not verify the saved file content. Read the file again before saving.');
    }
    if (latest.md5Checksum !== file.md5Checksum) {
      throw new Error('This file changed since you opened it. Download your draft, then read the latest file before saving.');
    }
    // Drive can advance version for metadata processing; compare content instead.
    // This preflight catches stale edits, but is not an atomic lock.
    return this.request(`${UPLOAD}/files/${encodeURIComponent(file.id)}?uploadType=media&fields=${FIELDS}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(data, null, 2),
    });
  }

  async delete(id: string): Promise<void> {
    await this.request(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  private folders = new Map<string, string>();
  private async attachmentFolder(datasetId: string): Promise<string> {
    if (!/^[\w-]+$/.test(datasetId)) throw new Error('Invalid data file ID.');
    const cached = this.folders.get(datasetId); if (cached) return cached;
    const query = new URLSearchParams({ q: `trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='application' and value='${MARKER}' } and appProperties has { key='dataset' and value='${datasetId}' }`, fields: 'files(id)', pageSize: '10' });
    const found = await this.request<{ files: { id: string }[] }>(`${API}/files?${query}`);
    const folder = found.files[0] || await this.request<{ id: string }>(`${API}/files?fields=id`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Sayarathy attachments', mimeType: 'application/vnd.google-apps.folder', appProperties: { application: MARKER, kind: 'folder', dataset: datasetId } }),
    });
    this.folders.set(datasetId, folder.id); return folder.id;
  }

  async uploadAttachment(datasetId: string, file: File): Promise<Attachment> {
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error('Receipts must be PDF, JPG, PNG, or WebP files.');
    if (file.size > 10 * 1024 * 1024 || file.size === 0) throw new Error('Each attachment must be between 1 byte and 10 MB.');
    const folderId = await this.attachmentFolder(datasetId);
    const boundary = `sayarathy_${crypto.randomUUID()}`;
    const metadata = { name: file.name, mimeType: file.type, parents: [folderId], appProperties: { application: MARKER, kind: 'attachment', dataset: datasetId } };
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`, file, `\r\n--${boundary}--\r\n`]);
    const uploaded = await this.request<{ id: string; name: string; mimeType: string; size: string }>(`${UPLOAD}/files?uploadType=multipart&fields=id,name,mimeType,size`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return { ...uploaded, size: Number(uploaded.size) };
  }

  async downloadAttachment(attachment: Attachment): Promise<Blob> {
    const response = await this.response(`${API}/files/${encodeURIComponent(attachment.id)}?alt=media`);
    return response.blob();
  }
}
