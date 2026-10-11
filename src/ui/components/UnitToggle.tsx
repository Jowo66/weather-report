import { useSettings } from '../../state/settingsStore';

export function UnitToggle() {
  const { tempUnit, setTempUnit, setWindUnit } = useSettings();
  const next = tempUnit === 'C' ? 'F' : 'C';
  return (
    <button
      type="button"
      className="btn btn-ghost btn-small"
      aria-label={`Switch to degrees ${next === 'F' ? 'Fahrenheit' : 'Celsius'}`}
      onClick={() => {
        setTempUnit(next);
        setWindUnit(next === 'F' ? 'mph' : 'kmh');
      }}
    >
      °{tempUnit} → °{next}
    </button>
  );
}
