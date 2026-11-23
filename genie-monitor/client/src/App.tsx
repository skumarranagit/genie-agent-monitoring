import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import { Badge } from '@databricks/appkit-ui/react';
import { Activity } from 'lucide-react';
import { MonitorPage } from './pages/monitor/MonitorPage';
import { ArchitecturePage } from './pages/architecture/ArchitecturePage';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3 md:px-6">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Genie Monitor</h1>
        <nav className="flex gap-1" aria-label="Main">
          <NavLink to="/" end className={navLinkClass}>
            Monitor
          </NavLink>
          <NavLink to="/architecture" className={navLinkClass}>
            Architecture
          </NavLink>
        </nav>
        <Badge variant="secondary" className="ml-auto text-xs">
          Reads as app service principal
        </Badge>
      </header>
      <main className="flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <MonitorPage /> },
      { path: '/architecture', element: <ArchitecturePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
