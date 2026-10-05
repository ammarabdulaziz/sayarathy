import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DriveError, DriveStore, parseDocument, type DriveFile } from './drive';
import { authorize, loadGoogle } from './google';
import './styles.css';

const SAMPLE = JSON.stringify({
  schemaVersion: 1,
  vehicle: { name: 'My car', odometerKm: 314983 },
  services: [{ id: 'sample-service', date: '2026-05-13', odometerKm: 314983, items: ['Engine oil change', 'AC filter clean'] }],
  note: 'Example car data. Replace this with your own records.',
}, null, 2);
type Log = { time: string; message: string; ok: boolean };

function savedClientId() {
  try { return localStorage.getItem('sayarathy-client-id') || ''; } catch { return ''; }
}

function App() {
  const [clientId, setClientId] = useState(() => import.meta.env.VITE_GOOGLE_CLIENT_ID || savedClientId());
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<{ token: string; expiresAt: number } | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selected, setSelected] = useState<DriveFile | null>(null);
  const [text, setText] = useState(SAMPLE);
  const [savedText, setSavedText] = useState(SAMPLE);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<Log[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = text !== savedText;
  const valid = (() => { try { parseDocument(text); return true; } catch { return false; } })();
  const log = (message: string, ok = true) => setLogs(prev => [{ time: new Date().toLocaleTimeString(), message, ok }, ...prev].slice(0, 30));

  useEffect(() => { loadGoogle().then(() => setReady(true)).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    if (!auth) return;
    const timer = window.setTimeout(() => { setAuth(null); setError('Google authorization expired. Reconnect to continue; your editor contents are preserved.'); }, Math.max(0, auth.expiresAt - Date.now() - 30000));
    return () => clearTimeout(timer);
  }, [auth]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label); setError('');
    try { await action(); }
    catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error';
      setError(message); log(`${label}: ${message}`, false);
      if (e instanceof DriveError && e.status === 401) setAuth(null);
    } finally { setBusy(''); }
  }
  function store() {
    if (!auth || Date.now() >= auth.expiresAt - 30000) throw new Error('Reconnect Google Drive before continuing.');
    return new DriveStore(auth.token);
  }
  async function refresh() { const next = await store().list(); setFiles(next); log(`Listed ${next.length} data file${next.length === 1 ? '' : 's'} from Google Drive.`); }
  function connect() {
    // Start authorization synchronously in the click handler.
    const request = authorize(clientId.trim());
    void run('Connecting', async () => {
      const next = await request; setAuth(next);
      try { localStorage.setItem('sayarathy-client-id', clientId.trim()); } catch { /* Optional convenience only. */ }
      log('Authorized Google Drive. Access token is kept only in memory.');
      const found = await new DriveStore(next.token).list(); setFiles(found);
      setSelected(previous => previous && found.some(file => file.id === previous.id) ? previous : null);
      setConfirmDelete(false);
      log(`Found ${found.length} data file${found.length === 1 ? '' : 's'}. Open one to read its JSON.`);
    });
  }
  async function open(file: DriveFile) {
    const result = await store().read(file.id);
    const json = JSON.stringify(result.data, null, 2);
    setSelected(result.file); setText(json); setSavedText(json); setConfirmDelete(false);
    log(`Read ${result.file.name} from Google Drive (version ${result.file.version}).`);
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sayarathy-draft.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="app">
    <header><a className="brand" href="./"><span className="brand-icon">S</span>Sayarathy <span className="test-tag">Drive storage</span></a><span className={`connection ${auth ? 'online' : ''}`}><i />{auth ? 'Drive connected' : 'Not connected'}</span></header>
    <main>
      <section className="intro"><h1>Your records.<br />Your Google Drive.</h1><p>Keep your car records in a private JSON file you own. Connect your Google Drive, save your changes, and open them on another device.</p></section>
      <section className="connect-panel" aria-labelledby="connect-title">
        <div><h2 id="connect-title">Connect your storage</h2><p>Only files created or opened with this app are accessible.</p></div>
        <div className="connect-controls"><label htmlFor="client">Google OAuth client ID</label><div className="input-action"><input id="client" value={clientId} disabled={!!busy || !!auth} onChange={e => setClientId(e.target.value)} placeholder="….apps.googleusercontent.com" autoComplete="off" /><button className="primary" disabled={!!busy || !ready || !clientId.trim() || !!auth} onClick={connect}>{auth ? 'Connected' : busy === 'Connecting' ? 'Connecting…' : 'Connect Google Drive'}</button></div><small>The client ID is public configuration, not a password. No client secret is needed.</small></div>
        {auth && <button className="quiet" disabled={!!busy} onClick={() => { setAuth(null); setFiles([]); setSelected(null); setConfirmDelete(false); log('Disconnected locally. Google permission remains granted.'); }}>Disconnect</button>}
      </section>
      {error && <div className="error" role="alert"><strong>Action needed</strong><span>{error}</span>{!ready && <button onClick={() => { setError(''); loadGoogle().then(() => setReady(true)).catch(e => setError(e.message)); }}>Retry loading Google</button>}</div>}
      <div className="workspace">
        <aside className="files-panel"><div className="section-heading"><h2>Drive files</h2><button className="quiet" disabled={!auth || !!busy} onClick={() => void run('Refresh', refresh)}>Refresh</button></div><p className="muted">Private JSON files created by Sayarathy.</p>
          <button className="create-button" disabled={!auth || !!busy || !valid} onClick={() => void run('Create', async () => { const file = await store().create(text); log(`Created ${file.name} in Google Drive.`); await open(file); await refresh(); })}>+ Create data file</button>
          <div className="file-list">{files.length ? files.map(file => <button key={file.id} disabled={!!busy || dirty} className={`file-row ${selected?.id === file.id ? 'selected' : ''}`} onClick={() => void run('Read', () => open(file))}><span className="file-symbol">{'{ }'}</span><span><strong>{file.name}</strong><small>{file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : 'JSON file'}</small></span></button>) : <div className="empty"><span className="empty-symbol">{'{ }'}</span><strong>{auth ? 'No data files yet' : 'Your files will appear here'}</strong><p>{auth ? 'Create a file from the JSON in the editor.' : 'Connect Google Drive to list your saved files.'}</p></div>}</div>
          <p className="storage-note">Stored in your Google account, not on this website. Reconnect on another device to find the same files.</p>
        </aside>
        <section className="editor-panel"><div className="section-heading"><div><h2>{selected ? selected.name : 'JSON draft'}</h2><p className="muted">{selected ? `Loaded version ${selected.version}` : 'Sample car data · not saved to Drive yet'}</p></div><span className={`save-status ${dirty ? 'unsaved' : ''}`}>{busy || (dirty ? 'Unsaved changes' : selected ? 'Loaded from Drive' : 'Sample draft')}</span></div>
          <label className="sr-only" htmlFor="json">JSON contents</label><textarea id="json" spellCheck={false} value={text} disabled={!!busy} onChange={e => setText(e.target.value)} />
          <div className="editor-footer"><span className={valid ? 'valid' : 'invalid'}>{valid ? '✓ Valid JSON object' : 'Invalid JSON object'}</span><span>{new TextEncoder().encode(text).length.toLocaleString()} bytes</span></div>
          <div className="editor-actions"><button className="primary" disabled={!auth || !selected || !!busy || !valid || !dirty} onClick={() => void run('Save', async () => { const file = await store().update(selected!, text); setSelected(file); setSavedText(text); log(`Updated ${file.name} in Google Drive (version ${file.version}).`); await refresh(); })}>Save to Drive</button><button disabled={!auth || !selected || !!busy || dirty} onClick={() => void run('Read', () => open(selected!))}>Read from Drive</button><button disabled={!!busy} onClick={download}>Download draft</button><button className="delete-button" disabled={!auth || !selected || !!busy} onClick={() => setConfirmDelete(true)}>Delete file</button></div>
          {dirty && <p className="draft-hint">Save or download your draft before reading another file. To discard edits, <button className="text-button" disabled={!!busy} onClick={() => setText(savedText)}>restore the loaded JSON</button>.</p>}
          {confirmDelete && <div className="delete-confirm"><p>Permanently delete this file from Google Drive? This cannot be undone.</p><div><button className="danger" disabled={!!busy} onClick={() => void run('Delete', async () => { await store().delete(selected!.id); log(`Permanently deleted ${selected!.name} from Google Drive.`); setSelected(null); setConfirmDelete(false); setSavedText(text); await refresh(); })}>Permanently delete</button><button disabled={!!busy} onClick={() => setConfirmDelete(false)}>Cancel</button></div></div>}
        </section>
      </div>
      <section className="activity"><div className="section-heading"><h2>Activity log</h2><button className="quiet" onClick={() => setLogs([])} disabled={!logs.length}>Clear log</button></div>{logs.length ? <ol aria-live="polite">{logs.map((entry, index) => <li key={`${entry.time}-${index}`} className={entry.ok ? '' : 'failed'}><time>{entry.time}</time><span>{entry.message}</span></li>)}</ol> : <p className="muted">Your Google Drive operations will appear here.</p>}</section>
      <details className="setup"><summary>How storage works</summary><div><ol><li>Connect Google Drive and allow Sayarathy to access only the files you use with this app.</li><li>Create a data file, edit the JSON, and choose <strong>Save to Drive</strong>. Use <strong>Read from Drive</strong> to fetch the saved content.</li><li>On another device, open this website and connect the same Google account. Refresh the list and open your file.</li><li>Clearing browser data will not delete a successfully saved Drive file. You can also download a copy at any time.</li></ol><p>Internet access is required. Unsaved edits are in memory and can be lost if the page closes. A content checksum check catches stale edits, but does not lock simultaneous writes. Edit on one device at a time.</p><p>The Google OAuth client ID is public configuration. To use your own client, register <code>{window.location.origin}</code> as an authorized JavaScript origin.</p></div></details>
    </main><footer><span>Sayarathy · Private Drive storage</span><nav><a href="./privacy.html">Privacy</a><a href="./terms.html">Terms</a><a href="mailto:ammarabz10@gmail.com">Contact</a></nav></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
