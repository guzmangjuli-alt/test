'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SignalCard from '../components/SignalCard';

const DEFAULT_SYMBOLS = 'BTCUSDT, ETHUSDT, SOLUSDT';

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `julsignals-daily-${y}-${m}-${d}`;
}

function nowText() {
  return new Date().toLocaleTimeString('es-ES');
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sameTrade(a, b) {
  if (!a || !b) return false;
  if (a.symbol !== b.symbol) return false;
  if (a.signal !== b.signal) return false;

  const entryA = toNum(a.entry);
  const entryB = toNum(b.entry);
  const stopA = toNum(a.stop);
  const stopB = toNum(b.stop);
  const tpA = toNum(a.takeProfit);
  const tpB = toNum(b.takeProfit);

  if (
    entryA === null || entryB === null ||
    stopA === null || stopB === null ||
    tpA === null || tpB === null
  ) {
    return false;
  }

  const entryDiff = Math.abs(entryA - entryB) / entryA;
  const stopDiff = Math.abs(stopA - stopB) / stopA;
  const tpDiff = Math.abs(tpA - tpB) / tpA;

  return entryDiff <= 0.002 && stopDiff <= 0.003 && tpDiff <= 0.003;
}

function resolveTrade(trade, currentPrice) {
  const price = toNum(currentPrice);
  const tp = toNum(trade.takeProfit);
  const sl = toNum(trade.stop);
  const entry = toNum(trade.entry);

  if (price === null || tp === null || sl === null || entry === null) return trade;
  if (trade.result !== 'ACTIVA') return trade;

  if (trade.signal === 'LONG') {
    if (price >= tp) {
      const pnlPercent = ((tp - entry) / entry) * 100;
      return {
        ...trade,
        result: 'WIN',
        closedAt: nowText(),
        closePrice: tp,
        pnlPercent: pnlPercent.toFixed(2),
      };
    }
    if (price <= sl) {
      const pnlPercent = ((sl - entry) / entry) * 100;
      return {
        ...trade,
        result: 'LOSE',
        closedAt: nowText(),
        closePrice: sl,
        pnlPercent: pnlPercent.toFixed(2),
      };
    }
  }

  if (trade.signal === 'SHORT') {
    if (price <= tp) {
      const pnlPercent = ((entry - tp) / entry) * 100;
      return {
        ...trade,
        result: 'WIN',
        closedAt: nowText(),
        closePrice: tp,
        pnlPercent: pnlPercent.toFixed(2),
      };
    }
    if (price >= sl) {
      const pnlPercent = ((entry - sl) / entry) * 100;
      return {
        ...trade,
        result: 'LOSE',
        closedAt: nowText(),
        closePrice: sl,
        pnlPercent: pnlPercent.toFixed(2),
      };
    }
  }

  return trade;
}

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
  const [dailyTrades, setDailyTrades] = useState([]);

  const intervalRef = useRef(null);
  const lastSignalsRef = useRef({});
  const audioEnabledRef = useRef(false);

  const storageKey = todayKey();

  const symbols = useMemo(
    () =>
      symbolsInput
        .split(',')
        .map((item) => item.trim().toUpperCase().replace('/', ''))
        .filter(Boolean)
        .slice(0, 10),
    [symbolsInput]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        setDailyTrades(JSON.parse(raw));
      } else {
        setDailyTrades([]);
      }
    } catch {
      setDailyTrades([]);
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(dailyTrades));
    } catch {}
  }, [dailyTrades, storageKey]);

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

  function addTestTrade(type = 'WIN') {
    const entry = 100;
    const stop = 99.5;
    const takeProfit = 101.4;

    const trade = {
      id: `test-${type}-${Date.now()}`,
      symbol: type === 'LOSE' ? 'ETHUSDT' : 'BTCUSDT',
      signal: 'LONG',
      entry,
      stop,
      takeProfit,
      score: 75,
      intradayScore: 8,
      confidence: 95,
      rr: '2.80',
      createdAt: nowText(),
      result: type === 'ACTIVE' ? 'ACTIVA' : type,
      closedAt: type === 'ACTIVE' ? null : nowText(),
      closePrice:
        type === 'WIN' ? takeProfit :
        type === 'LOSE' ? stop :
        null,
      pnlPercent:
        type === 'WIN' ? (((takeProfit - entry) / entry) * 100).toFixed(2) :
        type === 'LOSE' ? (((stop - entry) / entry) * 100).toFixed(2) :
        null,
    };

    setDailyTrades((prev) => [trade, ...prev]);
  }

  function clearTodayTrades() {
    setDailyTrades([]);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
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
      setLastUpdated(nowText());

      setDailyTrades((prev) => {
        let updated = [...prev];

        for (const item of nextResults) {
          if (
            item.status === 'OPERABLE' &&
            (item.signal === 'LONG' || item.signal === 'SHORT') &&
            item.entry &&
            item.stop &&
            item.takeProfit
          ) {
            const candidate = {
              id: `${item.symbol}-${item.signal}-${item.entry}-${Date.now()}`,
              symbol: item.symbol,
              signal: item.signal,
              entry: item.entry,
              stop: item.stop,
              takeProfit: item.takeProfit,
              score: item.score,
              intradayScore: item.intradayScore,
              confidence: item.confidence,
              rr: item.rr,
              createdAt: nowText(),
              result: 'ACTIVA',
            };

            const exists = updated.some((trade) => sameTrade(trade, candidate));

            if (!exists) {
              updated.unshift(candidate);
            }
          }
        }

        updated = updated.map((trade) => {
          if (trade.result !== 'ACTIVA') return trade;

          const current = nextResults.find((item) => item.symbol === trade.symbol);
          if (!current) return trade;

          return resolveTrade(trade, current.price);
        });

        return updated;
      });

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

  const dailyStats = useMemo(() => {
    const wins = dailyTrades.filter((t) => t.result === 'WIN').length;
    const losses = dailyTrades.filter((t) => t.result === 'LOSE').length;
    const active = dailyTrades.filter((t) => t.result === 'ACTIVA').length;
    const closed = wins + losses;
    const winRate = closed > 0 ? ((wins / closed) * 100).toFixed(0) : '0';

    return { wins, losses, active, winRate };
  }, [dailyTrades]);

  function resultColor(result) {
    if (result === 'WIN') return '#22c55e';
    if (result === 'LOSE') return '#ef4444';
    return '#f59e0b';
  }

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
            Activa el auto refresh a 30s para vigilar setups intradía nuevos y registrar automáticamente win o lose del día.
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 400px',
            gap: 20,
            alignItems: 'start',
          }}
        >
          <div>
            {visibleResults.length > 0 ? (
              <section className="grid">
                {visibleResults.map((item) => (
                  <SignalCard key={item.symbol} item={item} />
                ))}
              </section>
            ) : (
              <section className="card empty">
                No hay pares para mostrar todavía. Añade símbolos y pulsa analizar.
              </section>
            )}
          </div>

          <aside className="card pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <div className="kicker">📅 Diario</div>
                <h3 style={{ margin: '8px 0 0 0' }}>Resultados de hoy</h3>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, opacity: 0.85 }}>
                <div>ACTIVAS: <strong>{dailyStats.active}</strong></div>
                <div>WIN: <strong>{dailyStats.wins}</strong></div>
                <div>LOSE: <strong>{dailyStats.losses}</strong></div>
                <div>WIN RATE: <strong>{dailyStats.winRate}%</strong></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="button" onClick={() => addTestTrade('ACTIVE')}>
                Test activa
              </button>
              <button className="button" onClick={() => addTestTrade('WIN')}>
                Test win
              </button>
              <button className="button" onClick={() => addTestTrade('LOSE')}>
                Test lose
              </button>
              <button className="button" onClick={clearTodayTrades}>
                Reset día
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              {dailyTrades.length === 0 ? (
                <div className="empty" style={{ minHeight: 120 }}>
                  Todavía no ha entrado ninguna señal OPERABLE hoy.
                </div>
              ) : (
                dailyTrades.map((trade) => (
                  <div
                    key={trade.id}
                    style={{
                      border: `1px solid ${resultColor(trade.result)}`,
                      borderRadius: 16,
                      padding: 12,
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontWeight: 700 }}>{trade.symbol}</div>
                      <div style={{ color: resultColor(trade.result), fontWeight: 700 }}>
                        {trade.result}
                      </div>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
                      {trade.signal} · Entrada {trade.entry}
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
                      SL {trade.stop} · TP {trade.takeProfit}
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
                      RR {trade.rr || '-'}
                      {trade.pnlPercent ? (
                        <>
                          {' · Resultado '}
                          <span
                            style={{
                              color: Number(trade.pnlPercent) >= 0 ? '#22c55e' : '#ef4444',
                              fontWeight: 700,
                            }}
                          >
                            {Number(trade.pnlPercent) > 0 ? '+' : ''}
                            {trade.pnlPercent}%
                          </span>
                        </>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                      Creada: {trade.createdAt}
                      {trade.closedAt ? ` · Cerrada: ${trade.closedAt}` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
