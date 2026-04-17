'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SignalCard from '../components/SignalCard';

const DEFAULT_SYMBOLS = 'BTCUSDT, ETHUSDT, SOLUSDT';

export default function HomePage() {
  const [symbolsInput, setSymbolsInput] = useState(DEFAULT_SYMBOLS);
  const [timeframe, setTimeframe] = useState('15m');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState('30');
  const [onlyActionable, setOnlyActionable] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const intervalRef = useRef(null);
  const lastSignalsRef = useRef({});
  const audioEnabledRef = useRef(false);

  const symbols = useMemo(
    () =>
      symbolsInput
        .split(',')
        .map((item) => item.trim().toUpperCase().replace('/', ''))
        .filter(Boolean)
        .slice(0, 10),
    [symbolsInput]
  );

  function playSignalSound() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(700, ctx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(920, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.45);
    } catch (e) {
      console.error('Error sonido', e);
    }
  }

  async function analyzeAll(showSpinner = true) {
    if (!symbols.length) return;
    if (showSpinner) setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, timeframe }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'No se pudo analizar el mercado.');

      const nextResults = data.results || [];
      let hasNewSignal = false;

      for (const item of nextResults) {
        const prevSignal = lastSignalsRef.current[item.symbol];
        const currentSignal = item.signal;

        if (
          audioEnabledRef.current &&
          item.status === 'OPERABLE' &&
          (currentSignal === 'LONG' || currentSignal === 'SHORT') &&
          prevSignal !== currentSignal
        ) {
          hasNewSignal = true;
        }

        lastSignalsRef.current[item.symbol] = currentSignal;
      }

      setResults(nextResults);
      setLastUpdated(new Date().toLocaleTimeString('es-ES'));

      if (hasNewSignal) {
        playSignalSound();
      }
    } catch (err) {
      setError(err.message || 'Error conectando con Julsignals.');
      setResults([]);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    analyzeAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!autoRefresh) return undefined;

    const seconds = Math.max(5, Number(refreshSeconds) || 30);
    intervalRef.current = setInterval(() => analyzeAll(false), seconds * 1000);

    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshSeconds, timeframe, symbolsInput]);

  const visibleResults = useMemo(() => {
  const sorted = [...results].sort(
    (a, b) => (b.intradayScore || 0) - (a.intradayScore || 0)
  );

  return onlyActionable
    ? sorted.filter((item) => item.status === 'OPERABLE')
    : sorted;
}, [results, onlyActionable]);

  const stats = useMemo(
    () => ({
      longs: results.filter((r) => r.signal === 'LONG').length,
      shorts: results.filter((r) => r.signal === 'SHORT').length,
      waits: results.filter((r) => r.signal === 'WAIT').length,
    }),
    [results]
  );

  return (
    <main className="page">
      <div className="container">
        <section className="hero">
          <div>
            <div className="kicker">⚡ Julsignals</div>
            <h1 className="title">Señales intradía crypto</h1>
            <p className="subtitle">
              Analiza tus pares favoritos y recibe entrada, stop, take profit, score intradía y estado operativo del setup.
            </p>
          </div>

          <div className="stats">
            <div className="stat">
              <div className="stat-label">LONG</div>
              <div className="stat-value green">{stats.longs}</div>
            </div>
            <div className="stat">
              <div className="stat-label">SHORT</div>
              <div className="stat-value red">{stats.shorts}</div>
            </div>
            <div className="stat">
              <div className="stat-label">WAIT</div>
              <div className="stat-value amber">{stats.waits}</div>
            </div>
          </div>
        </section>

        <section className="card pad">
          <div className="controls">
            <div className="field">
              <label>Watchlist</label>
              <input
                className="input"
                value={symbolsInput}
                onChange={(e) => setSymbolsInput(e.target.value)}
                placeholder="BTCUSDT, ETHUSDT, SOLUSDT"
              />
            </div>

            <div className="field">
              <label>Timeframe</label>
              <select className="select" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                <option value="1m">1m</option>
                <option value="3m">3m</option>
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
              </select>
            </div>

            <div className="field" style={{ alignSelf: 'end' }}>
              <label style={{ visibility: 'hidden' }}>Analizar</label>
              <button
                className="button"
                onClick={() => {
                  audioEnabledRef.current = true;
                  analyzeAll(true);
                }}
                disabled={loading || symbols.length === 0}
              >
                {loading ? 'Analizando...' : 'Analizar'}
              </button>
            </div>
          </div>

          <div className="toggles">
            <div className="toggle">
              <div>
                <div className="toggle-title">Auto refresh</div>
                <div className="toggle-subtitle">Actualización automática</div>
              </div>
              <input
                className="switch"
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
            </div>

            <div className="toggle">
              <div>
                <div className="toggle-title">Cada</div>
                <div className="toggle-subtitle">segundos</div>
              </div>
              <select
                className="select"
                style={{ maxWidth: 100, height: 42 }}
                value={refreshSeconds}
                onChange={(e) => setRefreshSeconds(e.target.value)}
              >
                <option value="10">10s</option>
                <option value="15">15s</option>
                <option value="30">30s</option>
                <option value="60">60s</option>
              </select>
            </div>

            <div className="toggle">
              <div>
                <div className="toggle-title">Solo operables</div>
                <div className="toggle-subtitle">Ocultar watchlist</div>
              </div>
              <input
                className="switch"
                type="checkbox"
                checked={onlyActionable}
                onChange={(e) => setOnlyActionable(e.target.checked)}
              />
            </div>
          </div>

          <div className="meta">
            <div>
              Última actualización: <strong>{lastUpdated || '—'}</strong>
            </div>
            <div>
              API lista en <strong>/api/analyze</strong>
            </div>
          </div>

          {error ? <div className="error">{error}</div> : null}

          <div className="footer-note">
            Activa el auto refresh a 30s para vigilar setups intradía nuevos y recibir aviso cuando aparezca una señal operable.
          </div>
        </section>

        {visibleResults.length > 0 ? (
          <section className="grid">
            {visibleResults.map((item) => (
              <SignalCard key={item.symbol} item={item} />
            ))}
          </section>
        ) : (
          <section className="card empty">No hay pares para mostrar todavía. Añade símbolos y pulsa analizar.</section>
        )}
      </div>
    </main>
  );
}
