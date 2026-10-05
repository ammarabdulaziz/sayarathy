import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriveStore, parseDocument } from './drive';

const file = { id: 'test-file', name: 'sayarathy.json', version: '1', md5Checksum: 'original-content' };
const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('Drive JSON storage', () => {
  it('creates private tagged JSON with a bearer token and multipart upload', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(file)); vi.stubGlobal('fetch', fetch);
    await new DriveStore('access-token').create('{"note":"first"}');
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain('uploadType=multipart');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer access-token');
    expect(options.body).toContain('sayarathy-v1');
    expect(options.body).toContain('"note": "first"');
  });
  it('lists all pages, scoped to this app’s test files', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ files: [file], nextPageToken: 'next' })).mockResolvedValueOnce(jsonResponse({ files: [{ ...file, id: 'second' }] })); vi.stubGlobal('fetch', fetch);
    expect(await new DriveStore('token').list()).toHaveLength(2);
    expect(decodeURIComponent(fetch.mock.calls[0][0])).toContain('appProperties');
    expect(fetch.mock.calls[1][0]).toContain('pageToken=next');
  });
  it('reads both metadata and file content', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse(file)).mockResolvedValueOnce(jsonResponse({ note: 'cloud value' })).mockResolvedValueOnce(jsonResponse(file)); vi.stubGlobal('fetch', fetch);
    expect(await new DriveStore('token').read(file.id)).toEqual({ file, data: { note: 'cloud value' } });
    expect(fetch.mock.calls[1][0]).toContain('alt=media');
  });
  it('updates the existing file after checking its content checksum', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse(file)).mockResolvedValueOnce(jsonResponse({ ...file, version: '2' })); vi.stubGlobal('fetch', fetch);
    expect((await new DriveStore('token').update(file, '{"note":"updated"}')).version).toBe('2');
    expect(fetch.mock.calls[1][1].method).toBe('PATCH');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ note: 'updated' });
  });
  it('does not overwrite a file with changed content', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ ...file, version: '3', md5Checksum: 'other-content' })); vi.stubGlobal('fetch', fetch);
    await expect(new DriveStore('token').update(file, '{}')).rejects.toThrow('changed since you opened');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('allows metadata-only version changes without falsely rejecting the save', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ ...file, version: '2' })).mockResolvedValueOnce(jsonResponse({ ...file, version: '3', md5Checksum: 'updated-content' })); vi.stubGlobal('fetch', fetch);
    await expect(new DriveStore('token').update(file, '{"note":"updated"}')).resolves.toMatchObject({ version: '3' });
    expect(fetch.mock.calls[1][1].method).toBe('PATCH');
  });
  it('rejects an inconsistent read if content changes between metadata requests', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse(file)).mockResolvedValueOnce(jsonResponse({ note: 'other content' })).mockResolvedValueOnce(jsonResponse({ ...file, md5Checksum: 'other-content' })); vi.stubGlobal('fetch', fetch);
    await expect(new DriveStore('token').read(file.id)).rejects.toThrow('changed while it was being read');
  });
  it('handles a successful delete with an empty 204 response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch);
    await expect(new DriveStore('token').delete(file.id)).resolves.toBeUndefined();
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
  });
  it('returns actionable authorization errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'Invalid credentials' } }, 401)));
    await expect(new DriveStore('expired').list()).rejects.toThrow('Reconnect Google Drive');
  });
  it('rejects invalid or non-object JSON before making a network request', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(new DriveStore('token').create('[]')).rejects.toThrow('must be an object');
    await expect(new DriveStore('token').update(file, '{')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(() => parseDocument('null')).toThrow();
  });
});
