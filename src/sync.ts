import { DriveError, type DriveFile } from './drive';
import { validateDocument, type AppDocument } from './model';

export interface LoadedLog { file: DriveFile; doc: AppDocument }
type ReadFile = (id: string) => Promise<{ file: DriveFile; data: unknown }>;

// No tokens or vehicle records are persisted: this is only an opaque preference.
export function preferredFileId(clientId: string): string | null {
  try { return localStorage.getItem(`sayarathy.preferred-file.${clientId}`); } catch { return null; }
}
export function rememberFileId(clientId: string, id: string) {
  try { localStorage.setItem(`sayarathy.preferred-file.${clientId}`, id); } catch { /* Drive discovery still works without browser storage. */ }
}

export async function resolveDriveLog(files: DriveFile[], read: ReadFile, preferredIds: (string | null | undefined)[] = []): Promise<LoadedLog | null> {
  if (!files.length) return null;
  const load = async (file: DriveFile): Promise<LoadedLog> => {
    const result = await read(file.id); return { file: result.file, doc: validateDocument(result.data) };
  };
  const tried = new Set<string>();
  for (const id of preferredIds) {
    const file = files.find(f => f.id === id);
    if (!file || tried.has(file.id)) continue;
    tried.add(file.id);
    // A corrupt preferred log must not silently become an empty or different log.
    try { return await load(file); }
    catch(e) { if (!(e instanceof DriveError && e.status === 404)) throw e; }
  }
  let empty: LoadedLog | null = null;
  const sorted = [...files].sort((a,b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''));
  for (const file of sorted) {
    if (tried.has(file.id)) continue;
    let result: { file: DriveFile; data: unknown };
    try { result = await read(file.id); }
    catch(e) {
      if (e instanceof SyntaxError || (e instanceof DriveError && e.status === 404)) continue;
      throw e; // Authorization and connectivity failures are never treated as an empty Drive.
    }
    let doc: AppDocument;
    try { doc = validateDocument(result.data); } catch { continue; }
    const candidate = { file: result.file, doc };
    if (doc.services.length || doc.mileage.length || doc.followUps.length) return candidate;
    empty ??= candidate;
  }
  if (empty) return empty;
  throw new Error('Google Drive is connected, but no readable Sayarathy maintenance log was found. Open Settings to download or choose the existing files. They have not been replaced.');
}

export function mayAutoSync(state: { authenticated: boolean; online: boolean; visible: boolean; loaded: boolean; hasFile: boolean; busy: boolean; dirty: boolean; dialogOpen: boolean }): boolean {
  return state.authenticated && state.online && state.visible && state.loaded && state.hasFile && !state.busy && !state.dirty && !state.dialogOpen;
}
