import { Link, NavLink, Outlet } from 'react-router-dom';
import { UpdateBanner } from './UpdateBanner';
import { ConnectionStatus } from './ConnectionStatus';

/**
 * The shell: header, scrolling content, bottom navigation.
 *
 * Insets are applied per region rather than by padding one wrapper - the header
 * needs the top inset, the nav bar the bottom one, and the content between them
 * should still scroll edge to edge. A single safe-area wrapper cannot express
 * that.
 *
 * Five tabs is the practical maximum on a phone: at six each target drops below
 * the 48px minimum on a narrow screen. Settings therefore lives in the header
 * rather than the tab bar - it is visited rarely, and the four features are not.
 */
const TABS = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/calendar', icon: '📅', label: 'Calendar' },
  { to: '/shopping', icon: '🛒', label: 'Shopping' },
  { to: '/todos', icon: '✅', label: 'To-do' },
  { to: '/money', icon: '📊', label: 'Money' },
];

export function AppShell({ title }: { title: string }) {
  return (
    <div className="shell">
      <header className="shell__header">
        <h1 className="shell__title">{title}</h1>
        <Link
          to="/settings"
          aria-label="Settings"
          style={{
            minWidth: 'var(--tap)', minHeight: 'var(--tap)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', fontSize: 20,
          }}
        >
          <span aria-hidden="true">⚙️</span>
        </Link>
      </header>

      <main className="shell__content">
        {/* Above the page content on every screen: an unsent change matters
            wherever you happen to be looking. */}
        <UpdateBanner />
        <ConnectionStatus />
        <Outlet />
      </main>

      <nav className="shell__nav" aria-label="Main">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === '/'}>
            <span className="nav__icon" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
