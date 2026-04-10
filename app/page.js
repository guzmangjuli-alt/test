'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SignalCard from '@/components/SignalCard';

const DEFAULT_SYMBOLS = 'BTCUSDT, ETHUSDT, SOLUSDT';

export default function Home() {
  const [symbolsInput, setSymbolsInput] = useState(DEFAULT_SYMBOLS);
  const [timeframe, setTimeframe] = useState('1m');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState(30);
  const [onlySignals, setOnlySignals] = useState(false);

  const intervalRef = useRef(null);
  const lastSignalsRef = useRef({});
  const audioEnabledRef = useRef(false);

  const symbols = useMemo(() => {
    return symbolsInput
      .split(',')
      .map((s) => s.trim().toUpperCase().replace('/', ''))
      .filter(Boolean)
      .slice(0, 10);
  }, [symbolsInput]);

  function playSignalSound() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);

      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.35);
    } catch (e) {
      console.error('No se pudo reproducir el sonido', e);
    }
  }

  async function analyzeAll(showLoader = true) {
    try {
      if (showLoader) setLoading(true);
      setError('');

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbols,
          timeframe,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Error analizando mercado');
      }

      const nextResults = data.results || [];
      let hasNewSignal = false;

      for (const item of nextResults) {
        const prevSignal = lastSignalsRef.current[item.symbol];
        const currentSignal = item.signal;

        if (
          audioEnabledRef.current &&
          (currentSignal === 'LONG' || currentSignal === 'SHORT') &&
          prevSignal !== currentSignal
        ) {
          hasNewSignal = true;
        }

        lastSignalsRef.current[item.symbol] = currentSignal;
      }

      setResults(nextResults);

      if (hasNewSignal) {
        playSignalSound();
      }
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  useEffect(() => {
    analyzeAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        analyzeAll(false);
      }, Number(refreshSeconds) * 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshSeconds, timeframe, symbolsInput]);

  const filteredResults = useMemo(() => {
    if (!onlySignals) return results;
    return results.filter((item) => item.signal === 'LONG' || item.signal === 'SHORT');
  }, [results, onlySignals]);

  const stats = useMemo(() => {
    const longs = results.filter((r) => r.signal === 'LONG').length;
    const shorts = results.filter((r) => r.signal === 'SHORT').length;
    const waits = results.filter((r) => r.signal === 'WAIT').length;
    return { longs, shorts, waits };
  }, [results]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-sm text-blue-300">
            Julsignals
          </div>
          <h1 className="text-3xl font-bold md:text-5xl">Señales de scalping crypto</h1>
          <p className="mt-2 max-w-3xl text-slate-300">
            Analiza tus pares favoritos con filtro de tendencia, RSI, volumen y ruptura.
          </p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-sm text-slate-400">LONG</div>
            <div className="mt-1 text-2xl font-bold text-emerald-300">{stats.longs}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-sm text-slate-400">SHORT</div>
            <div className="mt-1 text-2xl font-bold text-red-300">{stats.shorts}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-sm text-slate-400">WAIT</div>
            <div className="mt-1 text-2xl font-bold text-amber-300">{stats.waits}</div>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-slate-800 bg-slate-900 p-5">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_180px_180px]">
            <div>
              <label className="mb-2 block text-sm text-slate-300">Watchlist</label>
              <input
                type="text"
                value={symbolsInput}
                onChange={(e) => setSymbolsInput(e.target.value)}
                placeholder="BTCUSDT, ETHUSDT, SOLUSDT"
                className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-white outline-none"
              />
              <p className="mt-2 text-xs text-slate-500">Separadas por coma. Máximo 10 pares.</p>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Timeframe</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-white outline-none"
              >
                <option value="1m">1m</option>
                <option value="3m">3m</option>
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  audioEnabledRef.current = true;
                  analyzeAll(true);
                }}
                disabled={loading || symbols.length === 0}
                className="h-12 w-full rounded-2xl bg-blue-600 px-4 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Analizando...' : 'Analizar'}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
              <div>
                <div className="text-sm text-slate-200">Auto refresh</div>
                <div className="text-xs text-slate-500">Actualización automática</div>
              </div>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-5 w-5"
              />
            </label>

            <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
              <div>
                <div className="text-sm text-slate-200">Cada</div>
                <div className="text-xs text-slate-500">segundos</div>
              </div>
              <select
                value={refreshSeconds}
                onChange={(e) => setRefreshSeconds(Number(e.target.value))}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              >
                <option value={10}>10s</option>
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
              </select>
            </label>

            <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
              <div>
                <div className="text-sm text-slate-200">Solo señales</div>
                <div className="text-xs text-slate-500">Ocultar WAIT</div>
              </div>
              <input
                type="checkbox"
                checked={onlySignals}
                onChange={(e) => setOnlySignals(e.target.checked)}
                className="h-5 w-5"
              />
            </label>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-900 bg-red-950/40 p-4 text-red-200">
            {error}
          </div>
        ) : null}

        {filteredResults.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
            No hay pares para mostrar.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredResults.map((item) => (
              <SignalCard key={item.symbol} item={item} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
