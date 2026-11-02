import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import 'leaflet/dist/leaflet.css';
import './app/styles.css';
const AdminApp = lazy(() => import('./features/admin/AdminApp'));
const adminRoute = location.pathname === '/admin' || location.pathname === '/admin/';
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<p role="status">Загрузка…</p>}>{adminRoute ? <AdminApp /> : <App />}</Suspense></StrictMode>);
