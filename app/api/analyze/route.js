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

function percentMove(from, to) {
  if (!from || !to) return 0;
  return Math.abs((to - from) / from) * 100;
}

function buildSignal(rows) {
  const closes = rows.map(r => r.close);
  const highs = rows.map(r => r.high);
  const lows = rows.map(r => r.low);
  const opens = rows.map(r => r.open);
  const volumes = rows.map(r => r.volume);

  const ema9 = ema(closes, 9);
  const ema26 = ema(closes, 26);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);

  const i = rows.length - 1;
  const last = rows[i];
  const prev = rows[i - 1];

  const avgVol20 =
    volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.max(volumes.slice(-20).length, 1);

  const avgRange10 =
    rows
      .slice(-10)
      .map(r => r.high - r.low)
      .reduce((a, b) => a + b, 0) / Math.max(rows.slice(-10).length, 1);

  const rvol = avgVol20 > 0 ? last.volume / avgVol20 : 0;

  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  const bodyRatio = range > 0 ? body / range : 0;

  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWickRatio = range > 0 ? upperWick / range : 0;
  const lowerWickRatio = range > 0 ? lowerWick / range : 0;

  const closeNearHigh = range > 0 ? (last.high - last.close) / range <= 0.20 : false;
  const closeNearLow = range > 0 ? (last.close - last.low) / range <= 0.20 : false;

  const trendStrengthLong =
    last.close > ema50[i] &&
    ema9[i] > ema26[i] &&
    ema26[i] > ema50[i] * 0.999;

  const trendStrengthShort =
    last.close < ema50[i] &&
    ema9[i] < ema26[i] &&
    ema26[i] < ema50[i] * 1.001;

  const breakoutLong = last.close > prev.high;
  const breakoutShort = last.close < prev.low;

  const momentumLong =
    rsi14[i] !== null &&
    rsi14[i] >= 52 &&
    rsi14[i] <= 62;

  const momentumShort =
    rsi14[i] !== null &&
    rsi14[i] >= 38 &&
    rsi14[i] <= 48;

  const volumeStrong = rvol >= 1.8;
  const candleExpansion = range >= avgRange10 * 1.1;

  const candleStrongLong =
    bodyRatio >= 0.60 &&
    closeNearHigh &&
    upperWickRatio <= 0.18;

  const candleStrongShort =
    bodyRatio >= 0.60 &&
    closeNearLow &&
    lowerWickRatio <= 0.18;

  let signal = 'WAIT';
  let score = 0;
  let reasons = [];
  let confidence = 0;
  let stop = null;
  let takeProfit = null;

  const longScore =
    (trendStrengthLong ? 22 : 0) +
    (momentumLong ? 15 : 0) +
    (breakoutLong ? 20 : 0) +
    (volumeStrong ? 18 : 0) +
    (candleExpansion ? 10 : 0) +
    (candleStrongLong ? 15 : 0);

  const shortScore =
    (trendStrengthShort ? 22 : 0) +
    (momentumShort ? 15 : 0) +
    (breakoutShort ? 20 : 0) +
    (volumeStrong ? 18 : 0) +
    (candleExpansion ? 10 : 0) +
    (candleStrongShort ? 15 : 0);

  if (longScore >= 82) {
    signal = 'LONG';
    score = longScore;

    if (trendStrengthLong) reasons.push('Tendencia alcista clara');
    if (momentumLong) reasons.push(`RSI sano (${rsi14[i].toFixed(1)})`);
    if (breakoutLong) reasons.push('Ruptura confirmada');
    if (volumeStrong) reasons.push(`Volumen fuerte (RVOL ${rvol.toFixed(2)})`);
    if (candleExpansion) reasons.push('Vela con expansión');
    if (candleStrongLong) reasons.push('Cierre fuerte cerca del máximo');

    stop = Math.min(...lows.slice(-5));
    takeProfit = last.close + (last.close - stop) * 2.8;
  } else if (shortScore >= 82) {
    signal = 'SHORT';
    score = shortScore;

    if (trendStrengthShort) reasons.push('Tendencia bajista clara');
    if (momentumShort) reasons.push(`RSI sano (${rsi14[i].toFixed(1)})`);
    if (breakoutShort) reasons.push('Ruptura confirmada');
    if (volumeStrong) reasons.push(`Volumen fuerte (RVOL ${rvol.toFixed(2)})`);
    if (candleExpansion) reasons.push('Vela con expansión');
    if (candleStrongShort) reasons.push('Cierre fuerte cerca del mínimo');

    stop = Math.max(...highs.slice(-5));
    takeProfit = last.close - (stop - last.close) * 2.8;
  } else {
    score = Math.max(longScore, shortScore);
    confidence = Math.min(35 + Math.floor(score / 2), 70);
    reasons = ['No hay confirmación suficiente'];
  }

  let rr = null;
  let riskPercent = null;
  let tpPercent = null;

  if (signal === 'LONG' && stop && takeProfit) {
    const risk = last.close - stop;
    const reward = takeProfit - last.close;
    rr = risk > 0 ? (reward / risk).toFixed(2) : null;
    riskPercent = risk > 0 ? ((risk / last.close) * 100).toFixed(2) : null;
    tpPercent = percentMove(last.close, takeProfit).toFixed(2);
  }

  if (signal === 'SHORT' && stop && takeProfit) {
    const risk = stop - last.close;
    const reward = last.close - takeProfit;
    rr = risk > 0 ? (reward / risk).toFixed(2) : null;
    riskPercent = risk > 0 ? ((risk / last.close) * 100).toFixed(2) : null;
    tpPercent = percentMove(last.close, takeProfit).toFixed(2);
  }

  // Filtro extra realista para fees/slippage:
  // si el TP potencial es demasiado pequeño, mejor WAIT
  if (
    signal !== 'WAIT' &&
    (!tpPercent || Number(tpPercent) < 0.45 || !riskPercent || Number(riskPercent) < 0.12)
  ) {
    signal = 'WAIT';
    confidence = 0;
    score = 0;
    stop = null;
    takeProfit = null;
    rr = null;
    riskPercent = null;
    reasons = ['Setup demasiado pequeño para compensar fees'];
  }

  if (signal !== 'WAIT') {
    confidence = Math.min(58 + Math.floor(score / 2), 95);
  }

  return {
    signal,
    score,
    confidence,
    price: formatNumber(last.close),
    entry: formatNumber(last.close),
    stop: formatNumber(stop),
    takeProfit: formatNumber(takeProfit),
    rr,
    riskPercent,
    reasons,
  };
}

function toOkx(symbol) {
  const clean = symbol.toUpperCase().replace('/', '').trim();
  return clean.replace('USDT', '-USDT');
}

async function fetchKlines(symbol, interval) {
  const tfMap = {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1H',
  };

  const bar = tfMap[interval] || '1m';
  const url = `https://www.okx.com/api/v5/market/candles?instId=${toOkx(symbol)}&bar=${bar}&limit=100`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'user-agent': 'Julsignals/1.0',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`OKX HTTP ${res.status}`);
  }

  const data = await res.json();

  if (!data?.data || !Array.isArray(data.data) || data.data.length < 60) {
    throw new Error('OKX respuesta inválida');
  }

  return data.data
    .map(k => ({
      time: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }))
    .reverse();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const symbols = Array.isArray(body?.symbols) ? body.symbols.slice(0, 10) : ['BTCUSDT'];
    const timeframe = body?.timeframe || '1m';

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
          score: 0,
          confidence: 0,
          price: null,
          entry: null,
          stop: null,
          takeProfit: null,
          rr: null,
          riskPercent: null,
          reasons: [`Error de mercado: ${err.message}`],
        });
      }
    }

    return Response.json({ results }, { status: 200 });
  } catch (err) {
    return Response.json(
      { error: err.message || 'Error interno en /api/analyze' },
      { status: 500 }
    );
  }
}
