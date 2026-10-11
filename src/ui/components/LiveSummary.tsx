import { useEffect, useState } from 'react';

/** Visually hidden polite live region, debounced so rapid changes announce once (TDD §11). */
export function LiveSummary({ text, delayMs = 1000 }: { text: string; delayMs?: number }) {
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSpoken(text), delayMs);
    return () => clearTimeout(t);
  }, [text, delayMs]);
  return (
    <div className="visually-hidden" aria-live="polite" data-testid="live-summary">
      {spoken}
    </div>
  );
}
