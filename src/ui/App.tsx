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
