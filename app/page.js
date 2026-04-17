'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SignalCard from '../components/SignalCard';

const DEFAULT_SYMBOLS = 'BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT, ADAUSDT';

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseClockToMs(clockText) {
  if (!clockText || typeof clockText !== 'string') return null;
  const parts = clockText.split(':').map(Number);
  if (parts.length < 2 || parts.some((p) => Number.isNaN(p))) return null;

  const [hh, mm, ss = 0] = parts;
  return ((hh * 60 + mm) * 60 + ss) * 1000;
}

function formatDuration(createdAt, closedAt) {
  if (!createdAt || !closedAt) return '-';

  const startMs = parseClockToMs(createdAt);
  const endMs = parseClockToMs(closedAt);

  if (startMs === null || endMs === null) return '-';

  let diff = endMs - startMs;
  if (diff < 0) diff += 24 * 60 * 60 * 1000;

  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes} min`;
}

function durationMinutesBetween(createdAt, closedAt) {
  if (!createdAt || !closedAt) return null;

  const startMs = parseClockToMs(createdAt);
  const endMs = parseClockToMs(closedAt);

  if (startMs === null || endMs === null) return null;

  let diff = endMs - startMs;
  if (diff < 0) diff += 24 * 60 * 60 * 1000;

  return Math.floor(diff / 60000);
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
  const [positionSize, setPositionSize] = useState('100');
  const [paperBroker, setPaperBroker] = useState({
    dayKey: '',
    trades: [],
    activeTrades: [],
    closedTrades: [],
    summary: {
      active: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      pnlTotalPercent: 0,
    },
  });
  const [liveClock, setLiveClock] = useState(new Date().toLocaleTimeString('es-ES'));

  const intervalRef = useRef(null);
  const liveClockRef = useRef(null);
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

  function nowText() {
    return new Date().toLocaleTimeString('es-ES');
  }

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

  async function analyzeAll(showSpinner = true, resetPaperBroker = false) {
    if (!symbols.length) return;
    if (showSpinner) setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, timeframe, resetPaperBroker }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'No se pudo analizar el mercado.');

      const nextResults = data.results || [];
      let hasNewOperableSignal = false;

      for (const item of nextResults) {
        const prevSignal = lastSignalsRef.current[item.symbol];
        const currentSignal = item.signal;

        if (
          audioEnabledRef.current &&
          item.status === 'OPERABLE' &&
          (currentSignal === 'LONG' || currentSignal === 'SHORT') &&
          prevSignal !== currentSignal
        ) {
          hasNewOperableSignal = true;
        }

        lastSignalsRef.current[item.symbol] = currentSignal;
      }

      setResults(nextResults);
      setPaperBroker(
        data.paperBroker || {
          dayKey: '',
          trades: [],
          activeTrades: [],
          closedTrades: [],
          summary: {
            active: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            pnlTotalPercent: 0,
          },
        }
      );
      setLastUpdated(nowText());

      if (hasNewOperableSignal) {
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
    analyzeAll(true, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!autoRefresh) return undefined;

    const seconds = Math.max(5, Number(refreshSeconds) || 30);
    intervalRef.current = setInterval(() => analyzeAll(false, false), seconds * 1000);

    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshSeconds, timeframe, symbolsInput]);

  useEffect(() => {
    if (liveClockRef.current) clearInterval(liveClockRef.current);

    liveClockRef.current = setInterval(() => {
      setLiveClock(new Date().toLocaleTimeString('es-ES'));
    }, 1000);

    return () => {
      if (liveClockRef.current) clearInterval(liveClockRef.current);
    };
  }, []);

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

  const pnlTotalEur = useMemo(() => {
    const position = Number(positionSize) || 0;
    return paperBroker.closedTrades.reduce((acc, trade) => {
      const pnl = Number(trade.pnlPercent);
      if (!Number.isFinite(pnl)) return acc;
      return acc + position * (pnl / 100);
    }, 0);
  }, [paperBroker.closedTrades, positionSize]);

  const analytics = useMemo(() => {
    const closedTrades = paperBroker.closedTrades || [];
    const winningTrades = closedTrades.filter((trade) => Number(trade.pnlPercent) > 0);
    const losingTrades = closedTrades.filter((trade) => Number(trade.pnlPercent) < 0);

    const grossProfit = winningTrades.reduce((acc, trade) => acc + Number(trade.pnlPercent || 0), 0);
    const grossLossAbs = Math.abs(
      losingTrades.reduce((acc, trade) => acc + Number(trade.pnlPercent || 0), 0)
    );

    const profitFactor =
      grossLossAbs > 0 ? (grossProfit / grossLossAbs).toFixed(2) : grossProfit > 0 ? '∞' : '-';

    const bestTrade = closedTrades.reduce((best, trade) => {
      const pnl = Number(trade.pnlPercent);
      if (!Number.isFinite(pnl)) return best;
      if (!best) return trade;
      return pnl > Number(best.pnlPercent) ? trade : best;
    }, null);

    const worstTrade = closedTrades.reduce((worst, trade) => {
      const pnl = Number(trade.pnlPercent);
      if (!Number.isFinite(pnl)) return worst;
      if (!worst) return trade;
      return pnl < Number(worst.pnlPercent) ? trade : worst;
    }, null);

    const durationValues = closedTrades
      .map((trade) => durationMinutesBetween(trade.createdAt, trade.closedAt))
      .filter((value) => Number.isFinite(value));

    const avgDurationMinutes =
      durationValues.length > 0
        ? Math.round(durationValues.reduce((a, b) => a + b, 0) / durationValues.length)
        : null;

    return {
      profitFactor,
      bestTrade,
      worstTrade,
      avgDurationMinutes,
      tooManyActive: (paperBroker.summary?.active || 0) >= 5,
    };
  }, [paperBroker]);

  function resultColor(result) {
    if (result === 'WIN') return '#22c55e';
    if (result === 'LOSE') return '#ef4444';
    return '#f59e0b';
  }

  function tradeEur(trade) {
    const position = Number(positionSize) || 0;
    const pnl = Number(trade.pnlPercent);
    if (!Number.isFinite(pnl) || !position) return null;
    return (position * (pnl / 100)).toFixed(2);
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
                  analyzeAll(true, false);
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

          <div
            className="toggles"
            style={{
              marginTop: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <div className="toggle">
              <div>
                <div className="toggle-title">Tamaño por trade</div>
                <div className="toggle-subtitle">Estimación PnL en €</div>
              </div>
              <input
                className="input"
                style={{ maxWidth: 120, textAlign: 'right' }}
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                inputMode="decimal"
                placeholder="100"
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
                <div>ACTIVAS: <strong>{paperBroker.summary.active}</strong></div>
                <div>WIN: <strong>{paperBroker.summary.wins}</strong></div>
                <div>LOSE: <strong>{paperBroker.summary.losses}</strong></div>
                <div>WIN RATE: <strong>{paperBroker.summary.winRate}%</strong></div>
                <div>
                  PnL %:{' '}
                  <strong
                    style={{
                      color:
                        Number(paperBroker.summary.pnlTotalPercent) >= 0 ? '#22c55e' : '#ef4444',
                    }}
                  >
                    {Number(paperBroker.summary.pnlTotalPercent) > 0 ? '+' : ''}
                    {paperBroker.summary.pnlTotalPercent}%
                  </strong>
                </div>
                <div>
                  PnL €:{' '}
                  <strong
                    style={{
                      color: Number(pnlTotalEur) >= 0 ? '#22c55e' : '#ef4444',
                    }}
                  >
                    {Number(pnlTotalEur) > 0 ? '+' : ''}
                    {pnlTotalEur.toFixed(2)}€
                  </strong>
                </div>
              </div>
            </div>

            {analytics.tooManyActive ? (
              <div
                style={{
                  marginTop: 14,
                  padding: 10,
                  borderRadius: 12,
                  border: '1px solid #f59e0b',
                  background: 'rgba(245, 158, 11, 0.08)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                ⚠️ Demasiadas operaciones abiertas. Vigila si el sistema está acumulando activas sin cerrar.
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="button" onClick={() => analyzeAll(true, true)}>
                Reset día
              </button>
            </div>

            <div
              style={{
                marginTop: 16,
                display: 'grid',
                gap: 10,
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              }}
            >
              <div className="mini">
                <div className="mini-label">Profit factor</div>
                <div className="mini-value">{analytics.profitFactor}</div>
              </div>

              <div className="mini">
                <div className="mini-label">Duración media</div>
                <div className="mini-value">
                  {analytics.avgDurationMinutes !== null ? `${analytics.avgDurationMinutes} min` : '-'}
                </div>
              </div>

              <div className="mini" style={{ gridColumn: '1 / -1' }}>
                <div className="mini-label">Best trade</div>
                <div className="mini-value small">
                  {analytics.bestTrade
                    ? `${analytics.bestTrade.symbol} ${
                        Number(analytics.bestTrade.pnlPercent) > 0 ? '+' : ''
                      }${analytics.bestTrade.pnlPercent}%`
                    : '-'}
                </div>
              </div>

              <div className="mini" style={{ gridColumn: '1 / -1' }}>
                <div className="mini-label">Worst trade</div>
                <div className="mini-value small">
                  {analytics.worstTrade
                    ? `${analytics.worstTrade.symbol} ${analytics.worstTrade.pnlPercent}%`
                    : '-'}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
              <div>
                <h4 style={{ margin: '0 0 10px 0' }}>Activas</h4>
                {paperBroker.activeTrades.length === 0 ? (
                  <div className="empty" style={{ minHeight: 90 }}>
                    No hay operaciones activas ahora mismo.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {paperBroker.activeTrades.map((trade) => {
                      const eur = tradeEur(trade);
                      const liveDuration = formatDuration(trade.createdAt, liveClock);

                      return (
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
                            RR {trade.rr ?? '-'}
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
                            {eur ? (
                              <>
                                {' · '}
                                <span
                                  style={{
                                    color: Number(eur) >= 0 ? '#22c55e' : '#ef4444',
                                    fontWeight: 700,
                                  }}
                                >
                                  {Number(eur) > 0 ? '+' : ''}
                                  {eur}€
                                </span>
                              </>
                            ) : null}
                          </div>

                          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                            Creada: {trade.createdAt} · Duración: {liveDuration}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h4 style={{ margin: '0 0 10px 0' }}>Cerradas</h4>
                {paperBroker.closedTrades.length === 0 ? (
                  <div className="empty" style={{ minHeight: 90 }}>
                    Todavía no hay operaciones cerradas hoy.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {paperBroker.closedTrades.map((trade) => {
                      const eur = tradeEur(trade);

                      return (
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
                            RR {trade.rr ?? '-'}
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
                            {eur ? (
                              <>
                                {' · '}
                                <span
                                  style={{
                                    color: Number(eur) >= 0 ? '#22c55e' : '#ef4444',
                                    fontWeight: 700,
                                  }}
                                >
                                  {Number(eur) > 0 ? '+' : ''}
                                  {eur}€
                                </span>
                              </>
                            ) : null}
                          </div>

                          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                            Creada: {trade.createdAt}
                            {trade.closedAt ? ` · Cerrada: ${trade.closedAt}` : ''}
                            {trade.duration ? ` · Duración: ${trade.duration}` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
