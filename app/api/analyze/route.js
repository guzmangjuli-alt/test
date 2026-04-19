export const runtime = 'nodejs';

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

function getDayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nowText() {
  return new Date().toLocaleTimeString('es-ES');
}

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
        duration: formatDuration(trade.createdAt, nowText()),
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
        duration: formatDuration(trade.createdAt, nowText()),
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
        duration: formatDuration(trade.createdAt, nowText()),
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
        duration: formatDuration(trade.createdAt, nowText()),
      };
    }
  }

  return trade;
}

let paperBrokerState = {
  dayKey: getDayKey(),
  trades: [],
};

function ensurePaperBrokerDay() {
  const currentDay = getDayKey();
  if (paperBrokerState.dayKey !== currentDay) {
    paperBrokerState = {
      dayKey: currentDay,
      trades: [],
    };
  }
}

function resetPaperBrokerDay() {
  paperBrokerState = {
    dayKey: getDayKey(),
    trades: [],
  };
}

function syncPaperBroker(results) {
  ensurePaperBrokerDay();

  paperBrokerState.trades = paperBrokerState.trades.map((trade) => {
    if (trade.result !== 'ACTIVA') return trade;

    const current = results.find((item) => item.symbol === trade.symbol);
    if (!current) return trade;

    return resolveTrade(trade, current.price);
  });

  for (const item of results) {
    const rrValue = toNum(item.rr);
    const passesQualityFilter =
      (item.intradayScore || 0) >= 7 &&
      rrValue !== null &&
      rrValue >= 1.9;

    if (
      (item.signal === 'LONG' || item.signal === 'SHORT') &&
      item.status !== 'DESCARTADA' &&
      passesQualityFilter &&
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

      const exists = paperBrokerState.trades.some((trade) => sameTrade(trade, candidate));

      if (!exists) {
        paperBrokerState.trades.unshift(candidate);
      }
    }
  }

  const activeTrades = paperBrokerState.trades.filter((trade) => trade.result === 'ACTIVA');
  const closedTrades = paperBrokerState.trades.filter((trade) => trade.result !== 'ACTIVA');

  const wins = closedTrades.filter((trade) => trade.result === 'WIN').length;
  const losses = closedTrades.filter((trade) => trade.result === 'LOSE').length;
  const closedCount = wins + losses;
  const winRate = closedCount > 0 ? Number(((wins / closedCount) * 100).toFixed(0)) : 0;

  const pnlTotalPercent = closedTrades.reduce((acc, trade) => {
    const pnl = Number(trade.pnlPercent);
    return Number.isFinite(pnl) ? acc + pnl : acc;
  }, 0);

  return {
    dayKey: paperBrokerState.dayKey,
    trades: paperBrokerState.trades,
    activeTrades,
    closedTrades,
    summary: {
      active: activeTrades.length,
      wins,
      losses,
      winRate,
      pnlTotalPercent: Number(pnlTotalPercent.toFixed(2)),
    },
  };
}

function buildSignal(rows) {
  const closes = rows.map((r) => r.close);
  const highs = rows.map((r) => r.high);
  const lows = rows.map((r) => r.low);
  const volumes = rows.map((r) => r.volume);

  const ema9 = ema(closes, 9);
  const ema26 = ema(closes, 26);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);

  const i = rows.length - 1;
  const last = rows[i];
  const prev = rows[i - 1];

  const avgVol20 =
    volumes.slice(-20).reduce((a, b) => a + b, 0) /
    Math.max(volumes.slice(-20).length, 1);

  const avgRange10 =
    rows
      .slice(-10)
      .map((r) => r.high - r.low)
      .reduce((a, b) => a + b, 0) /
    Math.max(rows.slice(-10).length, 1);

  const rvol = avgVol20 > 0 ? last.volume / avgVol20 : 0;

  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  const bodyRatio = range > 0 ? body / range : 0;

  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWickRatio = range > 0 ? upperWick / range : 0;
  const lowerWickRatio = range > 0 ? lowerWick / range : 0;

  const closeNearHigh = range > 0 ? (last.high - last.close) / range <= 0.2 : false;
  const closeNearLow = range > 0 ? (last.close - last.low) / range <= 0.2 : false;

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
    rsi14[i] >= 49 &&
    rsi14[i] <= 60;

  const momentumShort =
    rsi14[i] !== null &&
    rsi14[i] >= 40 &&
    rsi14[i] <= 51;

  // Volumen con más peso
  const volumeSupport = rvol >= 1.15;
  const volumeStrong = rvol >= 1.4;
  const volumeVeryStrong = rvol >= 1.8;

  const candleExpansion = range >= avgRange10 * 1.08;

  const candleStrongLong =
    bodyRatio >= 0.58 &&
    closeNearHigh &&
    upperWickRatio <= 0.2;

  const candleStrongShort =
    bodyRatio >= 0.58 &&
    closeNearLow &&
    lowerWickRatio <= 0.2;

  let signal = 'WAIT';
  let score = 0;
  let reasons = [];
  let confidence = 0;
  let stop = null;
  let takeProfit = null;

  const longScore =
    (trendStrengthLong ? 24 : 0) +
    (momentumLong ? 14 : 0) +
    (breakoutLong ? 16 : 0) +
    (volumeSupport ? 10 : 0) +
    (volumeStrong ? 10 : 0) +
    (volumeVeryStrong ? 6 : 0) +
    (candleExpansion ? 10 : 0) +
    (candleStrongLong ? 10 : 0);

  const shortScore =
    (trendStrengthShort ? 24 : 0) +
    (momentumShort ? 14 : 0) +
    (breakoutShort ? 16 : 0) +
    (volumeSupport ? 10 : 0) +
    (volumeStrong ? 10 : 0) +
    (volumeVeryStrong ? 6 : 0) +
    (candleExpansion ? 10 : 0) +
    (candleStrongShort ? 10 : 0);

  const longSetupReady =
    trendStrengthLong &&
    momentumLong &&
    volumeSupport &&
    (breakoutLong || candleStrongLong);

  const shortSetupReady =
    trendStrengthShort &&
    momentumShort &&
    volumeSupport &&
    (breakoutShort || candleStrongShort);

  if (longSetupReady && longScore >= 62) {
    signal = 'LONG';
    score = longScore;

    if (trendStrengthLong) reasons.push('Tendencia alcista clara');
    if (momentumLong) reasons.push(`RSI sano (${rsi14[i].toFixed(1)})`);
    if (breakoutLong) reasons.push('Ruptura confirmada');
    if (volumeSupport) reasons.push(`Volumen acompaña (RVOL ${rvol.toFixed(2)})`);
    if (volumeStrong) reasons.push('Volumen fuerte');
    if (candleExpansion) reasons.push('Vela con expansión');
    if (candleStrongLong) reasons.push('Cierre fuerte cerca del máximo');

    stop = Math.min(...lows.slice(-5));
    takeProfit = last.close + (last.close - stop) * 1.9;
  } else if (shortSetupReady && shortScore >= 62) {
    signal = 'SHORT';
    score = shortScore;

    if (trendStrengthShort) reasons.push('Tendencia bajista clara');
    if (momentumShort) reasons.push(`RSI sano (${rsi14[i].toFixed(1)})`);
    if (breakoutShort) reasons.push('Ruptura confirmada');
    if (volumeSupport) reasons.push(`Volumen acompaña (RVOL ${rvol.toFixed(2)})`);
    if (volumeStrong) reasons.push('Volumen fuerte');
    if (candleExpansion) reasons.push('Vela con expansión');
    if (candleStrongShort) reasons.push('Cierre fuerte cerca del mínimo');

    stop = Math.max(...highs.slice(-5));
    takeProfit = last.close - (stop - last.close) * 1.9;
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
    rr = risk > 0 ? reward / risk : null;
    riskPercent = risk > 0 ? ((risk / last.close) * 100).toFixed(2) : null;
    tpPercent = percentMove(last.close, takeProfit).toFixed(2);
  }

  if (signal === 'SHORT' && stop && takeProfit) {
    const risk = stop - last.close;
    const reward = last.close - takeProfit;
    rr = risk > 0 ? reward / risk : null;
    riskPercent = risk > 0 ? ((risk / last.close) * 100).toFixed(2) : null;
    tpPercent = percentMove(last.close, takeProfit).toFixed(2);
  }

  if (
    signal !== 'WAIT' &&
    (!tpPercent || Number(tpPercent) < 0.22 || !riskPercent || Number(riskPercent) < 0.08)
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
    confidence = Math.min(60 + Math.floor(score / 2), 95);
  }

  let intradayScore = 0;

  if (trendStrengthLong || trendStrengthShort) intradayScore += 2;
  if (momentumLong || momentumShort) intradayScore += 2;
  if (volumeSupport) intradayScore += 2;
  if (volumeStrong) intradayScore += 1;
  if (candleStrongLong || candleStrongShort) intradayScore += 1;
  if (breakoutLong || breakoutShort) intradayScore += 1;
  if (rr && Number(rr) >= 1.6) intradayScore += 1;

  if (intradayScore > 10) intradayScore = 10;

  let status = 'DESCARTADA';

  if (signal === 'LONG' || signal === 'SHORT') {
    status = intradayScore >= 7 ? 'OPERABLE' : 'WATCHLIST';
  } else {
    status = intradayScore >= 6 ? 'WATCHLIST' : 'DESCARTADA';
  }

  return {
    signal,
    score,
    intradayScore,
    status,
    confidence,
    price: formatNumber(last.close),
    entry: formatNumber(last.close),
    stop: formatNumber(stop),
    takeProfit: formatNumber(takeProfit),
    rr: rr !== null ? Number(rr.toFixed(2)) : null,
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

  const bar = tfMap[interval] || '15m';
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
    .map((k) => ({
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
    const timeframe = body?.timeframe || '15m';
    const resetPaperBroker = Boolean(body?.resetPaperBroker);

    ensurePaperBrokerDay();
    if (resetPaperBroker) {
      resetPaperBrokerDay();
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
          score: 0,
          intradayScore: 0,
          status: 'DESCARTADA',
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

    const paperBroker = syncPaperBroker(results);

    return Response.json({ results, paperBroker }, { status: 200 });
  } catch (err) {
    return Response.json(
      { error: err.message || 'Error interno en /api/analyze' },
      { status: 500 }
    );
  }
}
