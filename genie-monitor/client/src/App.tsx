import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import { Badge } from '@databricks/appkit-ui/react';
import { Activity, TriangleAlert } from 'lucide-react';
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
      <div
        role="note"
        aria-label="Disclaimer"
        className="flex items-start gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2 text-xs text-foreground md:px-6"
      >
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
        <p>
          <span className="font-semibold">Blueprint only — not for production as-is.</span> Reference implementation for
          learning and evaluation; not an official Databricks product, not covered by Databricks Support, provided &quot;as is&quot;
          without warranty. Shows users&apos; prompts and answers (may include PII/PHI) — review security, privacy, cost and
          dependencies before any production use. See DISCLAIMER.md in the repository.
        </p>
      </div>
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
