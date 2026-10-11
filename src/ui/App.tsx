import { ENGINE_VERSION } from '../engine';

export function App() {
  return (
    <div className="app">
      <header>
        <h1>Weather Report</h1>
        <p className="tagline">
          How would I actually feel outside right now, in what I&rsquo;m wearing?
        </p>
      </header>
      <main>
        <p>
          Coming soon: live weather, an outfit-aware &ldquo;you&rsquo;ll feel&rdquo; temperature,
          and an avatar that reacts.
        </p>
      </main>
      <footer>
        <p>
          Weather data by{' '}
          <a href="https://open-meteo.com/" rel="noopener noreferrer">
            Open-Meteo.com
          </a>{' '}
          (
          <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer">
            CC BY 4.0
          </a>
          )
        </p>
        <p>Comfort estimates for everyday decisions. Not medical or safety advice.</p>
        <p className="version">Comfort engine v{ENGINE_VERSION}</p>
      </footer>
    </div>
  );
}
