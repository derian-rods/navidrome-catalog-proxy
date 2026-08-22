import React, { createContext, useContext, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Outlet, RouterProvider, createRootRoute, createRoute, createRouter, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, Archive, Download, ExternalLink, Library, ListMusic, LogOut, PlayCircle, RefreshCw, Search, Settings, Trash2, Undo2 } from 'lucide-react';
import './styles.css';

type Auth = { user: string; password: string };
type YoutubeItem = { id: string; sourceId: string; title: string; artist: string; album: string; duration: number; url: string; thumbnail: string; channel?: string; entryCount?: number };
type Preview = { title: string; uploader: string; count: number; entries: YoutubeItem[] };
type DownloadedTrack = { sourceId: string; title: string; artist: string; album: string; path: string; url: string; exists: boolean; quarantined: boolean; cleanupStatus: string };
type Candidate = { sourceId: string; reason: string; originalPath: string; quarantinePath: string; exists: boolean };

const queryClient = new QueryClient();
const AuthContext = createContext<{
  auth: Auth | null;
  login: (auth: Auth) => void;
  logout: () => void;
}>({ auth: null, login: () => undefined, logout: () => undefined });

function getStoredAuth(): Auth | null {
  const user = sessionStorage.getItem('catalogUser') || '';
  const password = sessionStorage.getItem('catalogPassword') || '';
  return user && password ? { user, password } : null;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<Auth | null>(() => getStoredAuth());
  const value = useMemo(() => ({
    auth,
    login(next: Auth) {
      sessionStorage.setItem('catalogUser', next.user);
      sessionStorage.setItem('catalogPassword', next.password);
      setAuth(next);
    },
    logout() {
      sessionStorage.removeItem('catalogUser');
      sessionStorage.removeItem('catalogPassword');
      setAuth(null);
      queryClient.clear();
    }
  }), [auth]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  return useContext(AuthContext);
}

async function api<T>(path: string, init: RequestInit = {}, auth?: Auth | null): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
  if (auth) {
    headers.set('x-catalog-user', auth.user);
    headers.set('x-catalog-password', auth.password);
  }
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  return payload as T;
}

function sourceId(item: Pick<YoutubeItem, 'sourceId' | 'id'>) {
  return String(item.sourceId || item.id || '').replace(/^yt[:-]/, '');
}

function formatDuration(seconds: number) {
  if (!seconds) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function Button({ children, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return <button className={`btn ${variant}`} {...props}>{children}</button>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <article className={`card ${className}`}>{children}</article>;
}

function Protected() {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" />;
  return <AppShell><Outlet /></AppShell>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { auth, logout } = useAuth();
  return <main className="shell">
    <header className="hero">
      <div>
        <p className="eyebrow">Navidrome Catalog</p>
        <h1>Find, download, manage.</h1>
        <p className="lede">A private catalog manager for YouTube discovery, Navidrome downloads, quarantine and rescans.</p>
      </div>
      <div className="top-actions">
        <span className="session-user">{auth?.user}</span>
        <Button variant="ghost" onClick={logout}><LogOut size={16} /> Logout</Button>
        <a className="btn primary" href="https://music.derian-rods.tech" target="_blank" rel="noreferrer">Open Navidrome</a>
      </div>
    </header>
    <nav className="tabs">
      <Link to="/search" className="tab" activeProps={{ className: 'tab active' }}><Search size={16} /> Search</Link>
      <Link to="/downloaded" className="tab" activeProps={{ className: 'tab active' }}><Library size={16} /> Downloaded</Link>
      <Link to="/quarantine" className="tab" activeProps={{ className: 'tab active' }}><Archive size={16} /> Quarantine</Link>
      <Link to="/settings" className="tab" activeProps={{ className: 'tab active' }}><Settings size={16} /> Settings</Link>
    </nav>
    {children}
  </main>;
}

function LoginPage() {
  const { auth, login } = useAuth();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (input: Auth) => api<{ ok: boolean; user: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (data, input) => {
      login({ user: data.user || input.user, password: input.password });
      navigate({ to: '/search' });
    }
  });
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  if (auth) return <Navigate to="/search" />;
  return <section className="login-gate">
    <form className="login-card" onSubmit={event => { event.preventDefault(); mutation.mutate({ user, password }); }}>
      <p className="eyebrow">Private Catalog</p>
      <h1>Login with Navidrome.</h1>
      <p className="lede">Any valid Navidrome user can enter. Credentials stay in this browser session only.</p>
      <input value={user} onChange={event => setUser(event.target.value)} autoComplete="username" placeholder="Navidrome user" required />
      <input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Navidrome password" required />
      <Button disabled={mutation.isPending}>{mutation.isPending ? 'Checking...' : 'Enter catalog'}</Button>
      {mutation.error && <p className="message error">{mutation.error.message}</p>}
    </form>
  </section>;
}

function SearchPage() {
  const { auth } = useAuth();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('auto');
  const [limit, setLimit] = useState(30);
  const [lookup, setLookup] = useState<{ songs: YoutubeItem[]; collections: YoutubeItem[]; preview: Preview | null } | null>(null);
  const mutation = useMutation({
    mutationFn: () => api<{ songs: YoutubeItem[]; collections: YoutubeItem[]; preview: Preview | null }>('/api/catalog/lookup', { method: 'POST', body: JSON.stringify({ query, mode, limit }) }, auth),
    onSuccess: setLookup
  });
  return <section>
    <form className="smart-search" onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search artist, album, song, or paste YouTube URL..." />
      <select value={mode} onChange={event => setMode(event.target.value)}>
        <option value="auto">Auto</option>
        <option value="songs">Songs</option>
        <option value="collections">Albums/Playlists</option>
      </select>
      <select value={limit} onChange={event => setLimit(Number(event.target.value))}>
        <option value={15}>15</option>
        <option value={30}>30</option>
        <option value={50}>50</option>
      </select>
      <Button disabled={mutation.isPending}>{mutation.isPending ? 'Searching...' : 'Search'}</Button>
    </form>
    {mutation.error && <Status tone="error">{mutation.error.message}</Status>}
    {lookup?.preview && <PreviewBlock preview={lookup.preview} />}
    {!!lookup?.collections.length && <><h2 className="section-title">Albums / Playlists</h2><div className="collection-list">{lookup.collections.map(item => <CollectionCard key={item.id} item={item} />)}</div></>}
    {!!lookup?.songs.length && <><h2 className="section-title">Songs</h2><div className="song-grid">{lookup.songs.map(item => <SongCard key={item.id} item={item} />)}</div></>}
  </section>;
}

function Status({ children, tone = '' }: { children: React.ReactNode; tone?: string }) {
  return <p className={`status ${tone}`}>{children}</p>;
}

function SongCard({ item }: { item: YoutubeItem }) {
  const { auth } = useAuth();
  const mutation = useMutation({
    mutationFn: () => api<{ path: string }>('/api/catalog/download', { method: 'POST', body: JSON.stringify({ sourceId: sourceId(item) }) }, auth)
  });
  return <Card>
    {item.thumbnail && <img className="thumb" src={item.thumbnail} alt="" />}
    <div className="card-body">
      <div className="meta-row"><span className="badge">YouTube</span><span>{formatDuration(item.duration)}</span></div>
      <h3>{item.title}</h3>
      <p>{item.artist || item.channel}</p>
      <div className="actions">
        <Button disabled={mutation.isPending || mutation.isSuccess} onClick={() => mutation.mutate()}><Download size={16} /> {mutation.isSuccess ? 'Downloaded' : mutation.isPending ? 'Downloading...' : 'Download'}</Button>
        <a className="link" href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open</a>
      </div>
      {mutation.error && <p className="message error">{mutation.error.message}</p>}
      {mutation.data && <p className="message success">Saved: {mutation.data.path}</p>}
    </div>
  </Card>;
}

function CollectionCard({ item }: { item: YoutubeItem }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const { auth } = useAuth();
  const previewMutation = useMutation({
    mutationFn: () => api<{ preview: Preview }>('/api/catalog/preview-url', { method: 'POST', body: JSON.stringify({ url: item.url }) }, auth),
    onSuccess: data => setPreview(data.preview)
  });
  return <Card className="collection-card">
    <div>
      <span className="badge">Album / Playlist</span>
      <h3>{item.title}</h3>
      <p>{item.artist || item.channel}{item.entryCount ? ` - ${item.entryCount} tracks` : ''}</p>
      <div className="actions">
        <Button variant="ghost" disabled={previewMutation.isPending} onClick={() => previewMutation.mutate()}><PlayCircle size={16} /> Preview</Button>
        <a className="link" href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open</a>
      </div>
      {previewMutation.error && <p className="message error">{previewMutation.error.message}</p>}
    </div>
    {preview && <PreviewBlock preview={preview} />}
  </Card>;
}

function PreviewBlock({ preview }: { preview: Preview }) {
  const { auth } = useAuth();
  const mutation = useMutation({
    mutationFn: () => api<{ results: { ok: boolean }[]; scanStarted: boolean }>('/api/catalog/download-batch', { method: 'POST', body: JSON.stringify({ sourceIds: preview.entries.map(sourceId) }) }, auth)
  });
  const okCount = mutation.data?.results.filter(result => result.ok).length ?? 0;
  const failedCount = mutation.data ? mutation.data.results.length - okCount : 0;
  return <div className="preview-block">
    <div className="preview-head">
      <div><h3>{preview.title}</h3><p>{preview.count} track{preview.count === 1 ? '' : 's'}{preview.uploader ? ` - ${preview.uploader}` : ''}</p></div>
      <Button disabled={mutation.isPending || mutation.isSuccess} onClick={() => mutation.mutate()}><Download size={16} /> {mutation.isPending ? 'Downloading all...' : 'Download all'}</Button>
    </div>
    {mutation.data && <Status tone={failedCount ? 'warn' : 'success'}>Finished: {okCount} downloaded, {failedCount} failed. Rescan {mutation.data.scanStarted ? 'started' : 'not started'}.</Status>}
    {mutation.error && <Status tone="error">{mutation.error.message}</Status>}
    <ol className="preview-list">{preview.entries.map(entry => <li key={entry.id}>{entry.title} {entry.duration ? `(${formatDuration(entry.duration)})` : ''}</li>)}</ol>
  </div>;
}

function DownloadedPage() {
  const { auth } = useAuth();
  const [filter, setFilter] = useState('');
  const query = useQuery({ queryKey: ['downloaded'], queryFn: () => api<{ tracks: DownloadedTrack[] }>('/api/catalog/downloaded', {}, auth) });
  const qc = useQueryClient();
  const quarantine = useMutation({
    mutationFn: (sourceId: string) => api(`/api/catalog/downloaded/${encodeURIComponent(sourceId)}/quarantine`, { method: 'POST', body: '{}' }, auth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['downloaded'] })
  });
  const tracks = (query.data?.tracks || []).filter(track => `${track.title} ${track.artist} ${track.album} ${track.path}`.toLowerCase().includes(filter.toLowerCase()));
  return <section><PageHead title="Downloaded" action={<Button variant="ghost" onClick={() => query.refetch()}><RefreshCw size={16} /> Refresh</Button>} />
    <input className="filter" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter downloaded music..." />
    <div className="list">{tracks.map(track => <Row key={track.sourceId} title={track.title || track.sourceId} meta={`${track.artist || 'Unknown artist'} - ${track.album || 'Unknown album'} - ${track.quarantined ? 'quarantined' : track.exists ? 'downloaded' : 'missing'}`} path={track.path} actions={<><a className="link" href={track.url} target="_blank" rel="noreferrer">YouTube</a><Button disabled={!track.exists || track.quarantined || quarantine.isPending} onClick={() => quarantine.mutate(track.sourceId)}>Move to quarantine</Button></>} />)}</div>
    {query.error && <Status tone="error">{query.error.message}</Status>}
  </section>;
}

function QuarantinePage() {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['quarantine'], queryFn: () => api<{ candidates: Candidate[] }>('/api/catalog/quarantine', {}, auth) });
  const restore = useMutation({ mutationFn: (sourceId: string) => api(`/api/catalog/quarantine/${encodeURIComponent(sourceId)}/restore`, { method: 'POST', body: '{}' }, auth), onSuccess: () => qc.invalidateQueries({ queryKey: ['quarantine'] }) });
  const remove = useMutation({ mutationFn: (sourceId: string) => api(`/api/catalog/quarantine/${encodeURIComponent(sourceId)}`, { method: 'DELETE' }, auth), onSuccess: () => qc.invalidateQueries({ queryKey: ['quarantine'] }) });
  return <section><PageHead title="Quarantine" action={<Button variant="ghost" onClick={() => query.refetch()}><RefreshCw size={16} /> Refresh</Button>} />
    <div className="list">{(query.data?.candidates || []).map(candidate => <Row key={candidate.sourceId} title={candidate.sourceId} meta={candidate.reason || 'Manual quarantine'} path={candidate.quarantinePath || candidate.originalPath} actions={<><Button onClick={() => restore.mutate(candidate.sourceId)}><Undo2 size={16} /> Restore</Button><Button variant="danger" onClick={() => confirm(`Delete ${candidate.sourceId} forever?`) && remove.mutate(candidate.sourceId)}><Trash2 size={16} /> Delete forever</Button></>} />)}</div>
    {query.error && <Status tone="error">{query.error.message}</Status>}
  </section>;
}

function SettingsPage() {
  const { auth, logout } = useAuth();
  const mutation = useMutation({ mutationFn: () => api('/api/catalog/rescan', { method: 'POST', body: '{}' }, auth) });
  return <section><PageHead title="Settings" />
    <Card className="settings-card"><div><h3>Navidrome rescan</h3><p>Use this when new or restored files do not appear yet.</p></div><Button disabled={mutation.isPending} onClick={() => mutation.mutate()}><RefreshCw size={16} /> Rescan now</Button></Card>
    <Card className="settings-card"><div><h3>Session</h3><p>Credentials are stored only in sessionStorage.</p></div><Button variant="ghost" onClick={logout}><LogOut size={16} /> Logout</Button></Card>
    {mutation.error && <Status tone="error">{mutation.error.message}</Status>}
    {mutation.isSuccess && <Status tone="success">Rescan requested.</Status>}
  </section>;
}

function PageHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return <div className="section-head"><h2>{title}</h2>{action}</div>;
}

function Row({ title, meta, path, actions }: { title: string; meta: string; path: string; actions: React.ReactNode }) {
  return <article className="row-card"><div><h3>{title}</h3><p>{meta}</p><p className="row-path">{path}</p></div><div className="row-actions">{actions}</div></article>;
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const privateRoute = createRoute({ getParentRoute: () => rootRoute, id: 'private', component: Protected });
const indexRoute = createRoute({ getParentRoute: () => privateRoute, path: '/', component: () => <Navigate to="/search" /> });
const searchRoute = createRoute({ getParentRoute: () => privateRoute, path: '/search', component: SearchPage });
const downloadedRoute = createRoute({ getParentRoute: () => privateRoute, path: '/downloaded', component: DownloadedPage });
const quarantineRoute = createRoute({ getParentRoute: () => privateRoute, path: '/quarantine', component: QuarantinePage });
const settingsRoute = createRoute({ getParentRoute: () => privateRoute, path: '/settings', component: SettingsPage });
const routeTree = rootRoute.addChildren([loginRoute, privateRoute.addChildren([indexRoute, searchRoute, downloadedRoute, quarantineRoute, settingsRoute])]);
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><AuthProvider><RouterProvider router={router} /></AuthProvider></QueryClientProvider></React.StrictMode>);
