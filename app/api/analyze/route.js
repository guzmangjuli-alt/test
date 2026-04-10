function ema(values, period) {
  const k = 2 / (period + 1);
  let prev = values[0];
  const out = [prev];
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsi(values, period = 14) {
  const out = Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Number(n.toFixed(6));
}

function buildSignal(rows) {
  const closes = rows.map(r => r.close);
  const highs = rows.map(r => r.high);
  const lows = rows.map(r => r.low);
  const volumes = rows.map(r => r.volume);

  const ema9 = ema(closes, 9);
  const ema26 = ema(closes, 26);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);

  const i = rows.length - 1;
  const last = rows[i];
  const prev = rows[i - 1];

  const recentVolumes = volumes.slice(-20);
  const avgVol20 =
    recentVolumes.reduce((a, b) => a + b, 0) / Math.max(recentVolumes.length, 1);

  const longChecks = [
    last.close > ema50[i],
    ema9[i] > ema26[i],
    rsi14[i] !== null && rsi14[i] >= 48 && rsi14[i] <= 68,
    last.volume >= avgVol20,
    last.close > prev.high,
  ];

  const shortChecks = [
    last.close < ema50[i],
    ema9[i] < ema26[i],
    rsi14[i] !== null && rsi14[i] >= 32 && rsi14[i] <= 52,
    last.volume >= avgVol20,
    last.close < prev.low,
  ];

  let signal = 'WAIT';
  let reasons = [];
  let confidence = 50;
  let score = 0;
  let stop = null;
  let takeProfit = null;

  if (longChecks.filter(Boolean).length >= 4) {
    signal = 'LONG';
    score = longChecks.filter(Boolean).length * 20;
    confidence = 55 + longChecks.filter(Boolean).length * 8;

    stop = Math.min(...lows.slice(-5));
    takeProfit = last.close + (last.close - stop) * 2;

  } else if (shortChecks.filter(Boolean).length >= 4) {
    signal = 'SHORT';
    score = shortChecks.filter(Boolean).length * 20;
    confidence = 55 + shortChecks.filter(Boolean).length * 8;

    stop = Math.max(...highs.slice(-5));
    takeProfit = last.close - (stop - last.close) * 2;
  } else {
    reasons = ['No hay confirmación suficiente'];
  }

  return {
    signal,
    score,
    confidence: Math.min(confidence, 95),
    price: formatNumber(last.close),
    entry: formatNumber(last.close),
    stop: formatNumber(stop),
    takeProfit: formatNumber(takeProfit),
    rr: null,
    riskPercent: null,
    reasons,
  };
}

async function fetchKlines(symbol, interval) {
  const cleanSymbol = symbol.toUpperCase().replace('/', '').trim();

  const tfMap = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '1h': '1H'
  };

  const bitgetInterval = tfMap[interval] || '1min';

  const url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${cleanSymbol}&granularity=${bitgetInterval}&limit=120`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Bitget HTTP ${res.status}`);
  }

  const data = await res.json();

  if (!data?.data) {
    throw new Error('Bitget respuesta inválida');
  }

  return data.data.map(k => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  })).reverse();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const symbols = body?.symbols || ['BTCUSDT_UMCBL'];
    const timeframe = body?.timeframe || '1m';

    const results = [];

    for (const symbol of symbols) {
      try {
        const rows = await fetchKlines(symbol, timeframe);
        const signal = buildSignal(rows);

        results.push({
          symbol,
          ...signal,
        });

      } catch (err) {
        results.push({
          symbol,
          signal: 'WAIT',
          confidence: 0,
          reasons: [err.message],
        });
      }
    }

    return Response.json({ results });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
