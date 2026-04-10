import { buildSignal } from '../../../lib/analysis';

export const dynamic = 'force-dynamic';

function normalizeSymbol(symbol) {
  return String(symbol || '')
    .toUpperCase()
    .replace(/\//g, '')
    .replace(/\s+/g, '');
}

async function fetchKlines(symbol, timeframe) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=120`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Binance no devolvió datos para ${symbol}`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length < 60) {
    throw new Error(`Datos insuficientes para ${symbol}`);
  }
  return data.map((k) => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

export async function POST(request) {
  try {
    const body = await request.json();
    const symbols = Array.isArray(body?.symbols)
      ? body.symbols.slice(0, 10).map(normalizeSymbol).filter(Boolean)
      : [];
    const timeframe = ['1m', '3m', '5m', '15m'].includes(body?.timeframe) ? body.timeframe : '1m';

    if (!symbols.length) {
      return Response.json({ error: 'Añade al menos un símbolo.' }, { status: 400 });
    }

    const results = [];
    for (const symbol of symbols) {
      try {
        const rows = await fetchKlines(symbol, timeframe);
        const signal = buildSignal(rows);
        results.push({ symbol, ...signal });
      } catch (err) {
        results.push({
          symbol,
          signal: 'WAIT',
          confidence: 0,
          score: 0,
          price: null,
          entry: null,
          stop: null,
          takeProfit: null,
          rr: null,
          riskPercent: null,
          reasons: [err.message || 'No se pudo analizar este par.'],
        });
      }
    }

    return Response.json({ results });
  } catch (err) {
    return Response.json({ error: err.message || 'Error interno analizando señales.' }, { status: 500 });
  }
}
