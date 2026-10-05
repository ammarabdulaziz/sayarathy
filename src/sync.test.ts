import { describe, expect, it, vi } from 'vitest';
import { DriveError, type DriveFile } from './drive';
import { newDocument, type AppDocument } from './model';
import { mayAutoSync, resolveDriveLog } from './sync';

const file = (id: string, modifiedTime: string): DriveFile => ({ id, name: 'sayarathy.json', modifiedTime, version: '1', md5Checksum: id });
function populated(): AppDocument {
  const doc = newDocument(); doc.services = [{ id: 'visit', date: '2025-01-01', odometerKm: 100000, notes: '', needsReview: false, attachments: [], items: [{ id: 'work', description: 'Oil change', category: 'oil', action: 'replace' }] }]; return doc;
}
const newer = file('newer', '2026-01-02T00:00:00Z'); const older = file('older', '2026-01-01T00:00:00Z');
describe('Automatic Drive log selection', () => {
  it('automatically loads the only existing log', async () => {
    const doc = populated(); const read = vi.fn().mockResolvedValue({ file: older, data: doc });
    expect(await resolveDriveLog([older], read)).toEqual({ file: older, doc });
  });
  it('loads populated history instead of a newer empty duplicate', async () => {
    const doc = populated(); const read = vi.fn(async (id: string) => ({ file: id === 'newer' ? newer : older, data: id === 'newer' ? newDocument() : doc }));
    expect((await resolveDriveLog([newer, older], read))?.file.id).toBe('older');
  });
  it('respects an explicitly remembered log, even when it is empty', async () => {
    const read = vi.fn().mockResolvedValue({ file: older, data: newDocument() });
    expect((await resolveDriveLog([newer, older], read, ['older']))?.file.id).toBe('older');
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('ignores a remembered ID not present in the authorized account', async () => {
    const read = vi.fn().mockResolvedValue({ file: newer, data: populated() });
    expect((await resolveDriveLog([newer], read, ['another-account']))?.file.id).toBe('newer');
    expect(read).toHaveBeenCalledWith('newer');
  });
  it('skips old proof-of-concept files without creating or overwriting anything', async () => {
    const read = vi.fn(async (id: string) => ({ file: id === 'newer' ? newer : older, data: id === 'newer' ? { schemaVersion: 1 } : populated() }));
    expect((await resolveDriveLog([newer, older], read))?.file.id).toBe('older');
  });
  it('does not silently switch away from a corrupt preferred log', async () => {
    const read = vi.fn().mockResolvedValue({ file: newer, data: { schemaVersion: 1 } });
    await expect(resolveDriveLog([newer, older], read, ['newer'])).rejects.toThrow('version 2');
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('propagates authorization errors instead of showing a new empty log', async () => {
    const read = vi.fn().mockRejectedValue(new DriveError('Reconnect Google Drive', 401));
    await expect(resolveDriveLog([newer, older], read)).rejects.toThrow('Reconnect');
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('distinguishes no files from files that could not be validated', async () => {
    const read = vi.fn().mockResolvedValue({ file: newer, data: { schemaVersion: 1 } });
    expect(await resolveDriveLog([], read)).toBeNull();
    await expect(resolveDriveLog([newer], read)).rejects.toThrow('have not been replaced');
  });
});
describe('Safe foreground refresh', () => {
  const ready = { authenticated: true, online: true, visible: true, loaded: true, hasFile: true, busy: false, dirty: false, dialogOpen: false };
  it('refreshes an online, visible, connected log', () => { expect(mayAutoSync(ready)).toBe(true); });
  it.each(['busy', 'dirty', 'dialogOpen'] as const)('pauses while %s', key => { expect(mayAutoSync({ ...ready, [key]: true })).toBe(false); });
  it.each(['authenticated', 'online', 'visible', 'loaded', 'hasFile'] as const)('requires %s', key => { expect(mayAutoSync({ ...ready, [key]: false })).toBe(false); });
});
