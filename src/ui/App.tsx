import { HashRouter, NavLink, Route, Routes } from 'react-router';
import { Footer } from './components/Footer';
import { UnitToggle } from './components/UnitToggle';
import { HowItWorksRoute } from './routes/HowItWorksRoute';
import { NowRoute } from './routes/NowRoute';
import { WardrobeRoute } from './routes/WardrobeRoute';

const NAV: { to: string; label: string }[] = [
  { to: '/', label: 'Now' },
  { to: '/wardrobe', label: 'Wardrobe' },
  { to: '/how-it-works', label: 'How it works' },
];

export function App() {
  return (
    <HashRouter>
      <div className="app">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="header">
          <h1 className="brand">Weather Report</h1>
          <nav aria-label="Main">
            <ul>
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} end>
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <UnitToggle />
        </header>
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<NowRoute />} />
            <Route path="/wardrobe" element={<WardrobeRoute />} />
            <Route path="/how-it-works" element={<HowItWorksRoute />} />
            <Route path="*" element={<NowRoute />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </HashRouter>
  );
}
