export function ema(values, period) {
  const k = 2 / (period + 1);
  let prev = values[0];
  const out = [prev];
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values, period = 14) {
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

export function buildSignal(rows) {
  const closes = rows.map((r) => r.close);
  const highs = rows.map((r) => r.high);
  const lows = rows.map((r) => r.low);
  const volumes = rows.map((r) => r.volume);

  const ema9 = ema(closes, 9);
  const ema26 = ema(closes, 26);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);

  const lastIndex = rows.length - 1;
  const last = rows[lastIndex];
  const prev = rows[lastIndex - 1];
  const avgVol20 = volumes.slice(-20).reduce((acc, n) => acc + n, 0) / Math.min(20, volumes.length);

  const reasons = [];
  let signal = 'WAIT';
  let confidence = 50;

  const longCond = [
    last.close > ema50[lastIndex],
    ema9[lastIndex] > ema26[lastIndex],
    rsi14[lastIndex] !== null && rsi14[lastIndex] >= 48 && rsi14[lastIndex] <= 68,
    last.volume >= avgVol20,
    last.close > prev.high,
  ];

  const shortCond = [
    last.close < ema50[lastIndex],
    ema9[lastIndex] < ema26[lastIndex],
    rsi14[lastIndex] !== null && rsi14[lastIndex] >= 32 && rsi14[lastIndex] <= 52,
    last.volume >= avgVol20,
    last.close < prev.low,
  ];

  if (longCond.filter(Boolean).length >= 4) {
    signal = 'LONG';
    if (last.close > ema50[lastIndex]) reasons.push('Precio por encima de EMA 50');
    if (ema9[lastIndex] > ema26[lastIndex]) reasons.push('EMA 9 por encima de EMA 26');
    if (rsi14[lastIndex] !== null) reasons.push(`RSI en ${rsi14[lastIndex].toFixed(1)}`);
    if (last.volume >= avgVol20) reasons.push('Volumen por encima de la media');
    if (last.close > prev.high) reasons.push('Ruptura del máximo previo');
    confidence = 55 + longCond.filter(Boolean).length * 8;
  } else if (shortCond.filter(Boolean).length >= 4) {
    signal = 'SHORT';
    if (last.close < ema50[lastIndex]) reasons.push('Precio por debajo de EMA 50');
    if (ema9[lastIndex] < ema26[lastIndex]) reasons.push('EMA 9 por debajo de EMA 26');
    if (rsi14[lastIndex] !== null) reasons.push(`RSI en ${rsi14[lastIndex].toFixed(1)}`);
    if (last.volume >= avgVol20) reasons.push('Volumen por encima de la media');
    if (last.close < prev.low) reasons.push('Ruptura del mínimo previo');
    confidence = 55 + shortCond.filter(Boolean).length * 8;
  } else {
    reasons.push('No hay confirmación suficiente del setup');
  }

  const entry = last.close;
  const recentLow = Math.min(...lows.slice(-5));
  const recentHigh = Math.max(...highs.slice(-5));

  let stop = null;
  let takeProfit = null;

  if (signal === 'LONG') {
    stop = recentLow;
    takeProfit = entry + (entry - stop) * 2;
  } else if (signal === 'SHORT') {
    stop = recentHigh;
    takeProfit = entry - (stop - entry) * 2;
  }

  const risk = stop !== null ? Math.abs(entry - stop) : 0;
  const reward = takeProfit !== null ? Math.abs(takeProfit - entry) : 0;
  const rr = risk > 0 ? (reward / risk).toFixed(2) : null;
  const riskPercent = risk > 0 ? ((risk / entry) * 100).toFixed(2) : null;
  const score = Math.min(95, Math.round(confidence + (signal === 'WAIT' ? -10 : 0)));

  return {
    signal,
    confidence: Math.min(confidence, 95),
    score,
    price: entry,
    entry,
    stop,
    takeProfit,
    rr,
    riskPercent,
    reasons,
  };
}
