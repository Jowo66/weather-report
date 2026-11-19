import { HashRouter, NavLink, Route, Routes } from 'react-router';
import { Footer } from './components/Footer';
import { UnitToggle } from './components/UnitToggle';
import { HowItWorksRoute } from './routes/HowItWorksRoute';
import { NowRoute } from './routes/NowRoute';
import { WardrobeRoute } from './routes/WardrobeRoute';
import { AvatarQaRoute } from './routes/AvatarQaRoute';
import { AvatarRoute } from './routes/AvatarRoute';
import { TravelRoute } from './routes/TravelRoute';
import { CompareRoute } from './routes/CompareRoute';
import { CalibrationRoute } from './routes/CalibrationRoute';
import { useEffect } from 'react';
import { useSettings } from '../state/settingsStore';

const NAV: { to: string; label: string }[] = [
  { to: '/', label: 'Now' },
  { to: '/wardrobe', label: 'Wardrobe' },
  { to: '/avatar', label: 'Avatar' },
  { to: '/travel', label: 'Travel' },
  { to: '/compare', label: 'Compare' },
  { to: '/how-it-works', label: 'How it works' },
];

export function App() {
  const highContrast = useSettings((s) => s.highContrast);
  useEffect(() => {
    if (highContrast) document.documentElement.dataset.contrast = 'high';
    else delete document.documentElement.dataset.contrast;
  }, [highContrast]);
  return (
    <HashRouter>
      <div className="app">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="header">
          <nav className="garden-nav" aria-label="Portfolio">
            <a className="gn-tree" href="https://jowo66.github.io/" title="Back to jowo66.github.io" aria-label="Back to jowo66.github.io"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M8 1 4.2 6h2L3 10.5h3.6L5 13h6l-1.6-2.5H13L9.8 6h2z" fill="currentColor"/><rect x="7" y="13" width="2" height="2" fill="currentColor"/></svg></a>
            <a className="gn-link" href="https://jowo66.github.io/garden.html">Garden</a>
          </nav>
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
            <Route path="/travel" element={<TravelRoute />} />
            <Route path="/compare" element={<CompareRoute />} />
            <Route path="/avatar" element={<AvatarRoute />} />
            <Route path="/dev/calibration" element={<CalibrationRoute />} />
            <Route path="/dev/avatar-qa" element={<AvatarQaRoute />} />
            <Route path="/how-it-works" element={<HowItWorksRoute />} />
            <Route path="*" element={<NowRoute />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </HashRouter>
  );
}
