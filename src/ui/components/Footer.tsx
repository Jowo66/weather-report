import { ENGINE_VERSION } from '../../engine';

export function Footer() {
  return (
    <footer className="footer">
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
  );
}
