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
  if (!n) return null;
  return Number(n.toFixed(6));
}

function buildSignal(rows) {
  const closes = rows.map(r => r.close);
  const highs = rows.map(r => r.high);
  const lows = rows.map(r => r.low);
  const volumes = rows.map(r => r.volume);
  const opens = rows.map(r => r.open);

  const ema9 = ema(closes, 9);
  const ema26 = ema(closes, 26);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);

  const i = rows.length - 1;
  const last = rows[i];
  const prev = rows[i - 1];

  const avgVol =
    volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

  const rvol = last.volume / avgVol;

  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  const bodyRatio = range > 0 ? body / range : 0;

  const closeHigh = (last.high - last.close) / range < 0.3;
  const closeLow = (last.close - last.low) / range < 0.3;

  let score = 0;
  let signal = 'WAIT';
  let reasons = [];
  let stop = null;
  let takeProfit = null;

  const longScore =
    (last.close > ema50[i] ? 20 : 0) +
    (ema9[i] > ema26[i] ? 20 : 0) +
    (rsi14[i] > 50 && rsi14[i] < 65 ? 15 : 0) +
    (last.close > prev.high ? 20 : 0) +
    (rvol > 1.5 ? 15 : 0) +
    (bodyRatio > 0.6 && closeHigh ? 10 : 0);

  const shortScore =
    (last.close < ema50[i] ? 20 : 0) +
    (ema9[i] < ema26[i] ? 20 : 0) +
    (rsi14[i] < 50 && rsi14[i] > 35 ? 15 : 0) +
    (last.close < prev.low ? 20 : 0) +
    (rvol > 1.5 ? 15 : 0) +
    (bodyRatio > 0.6 && closeLow ? 10 : 0);

  if (longScore >= 75) {
    signal = 'LONG';
    score = longScore;

    stop = Math.min(...lows.slice(-5));
    takeProfit = last.close + (last.close - stop) * 2.5;

    reasons.push('Volumen fuerte');
    reasons.push('Ruptura confirmada');
  } else if (shortScore >= 75) {
    signal = 'SHORT';
    score = shortScore;

    stop = Math.max(...highs.slice(-5));
    takeProfit = last.close - (stop - last.close) * 2.5;

    reasons.push('Volumen fuerte');
    reasons.push('Ruptura confirmada');
  }

  return {
    signal,
    score,
    confidence: Math.min(60 + score / 2, 95),
    price: formatNumber(last.close),
    entry: formatNumber(last.close),
    stop: formatNumber(stop),
    takeProfit: formatNumber(takeProfit),
    rr: null,
    riskPercent: null,
    reasons,
  };
}

function toOkx(symbol) {
  return symbol.replace('USDT', '-USDT');
}

async function fetchKlines(symbol, interval) {
  const tfMap = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1H'
  };

  const bar = tfMap[interval] || '1m';

  const url = `https://www.okx.com/api/v5/market/candles?instId=${toOkx(symbol)}&bar=${bar}&limit=100`;

  const res = await fetch(url);

  const data = await res.json();

  if (!data?.data) throw new Error('OKX error');

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
  const body = await req.json();
  const symbols = body.symbols || ['BTCUSDT'];
  const timeframe = body.timeframe || '1m';

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
        reasons: [err.message],
      });
    }
  }

  return Response.json({ results });
}
