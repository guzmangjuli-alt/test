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

  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const avgRange = rows.slice(-10).map(r => r.high - r.low).reduce((a, b) => a + b, 0) / 10;

  const rvol = last.volume / avgVol;
  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);

  const tpMinPercent = 0.6; // mínimo para cubrir fees
  const riskMinPercent = 0.2;

  let signal = 'WAIT';
  let stop = null;
  let takeProfit = null;
  let reasons = [];
  let score = 0;

  const strongTrendLong =
    last.close > ema50[i] &&
    ema9[i] > ema26[i];

  const strongTrendShort =
    last.close < ema50[i] &&
    ema9[i] < ema26[i];

  const breakoutLong = last.close > prev.high;
  const breakoutShort = last.close < prev.low;

  const rsiLong = rsi14[i] > 52 && rsi14[i] < 60;
  const rsiShort = rsi14[i] < 48 && rsi14[i] > 40;

  const volumeStrong = rvol > 1.8;
  const expansion = range > avgRange * 1.2;

  if (strongTrendLong && breakoutLong && rsiLong && volumeStrong && expansion) {
    stop = Math.min(...lows.slice(-5));
    const risk = last.close - stop;

    const tp = last.close + risk * 3; // más amplio
    const tpPercent = ((tp - last.close) / last.close) * 100;
    const riskPercent = (risk / last.close) * 100;

    if (tpPercent >= tpMinPercent && riskPercent >= riskMinPercent) {
      signal = 'LONG';
      takeProfit = tp;
      score = 90;
      reasons = ['Setup con margen para fees', 'Volumen fuerte', 'Ruptura válida'];
    }
  }

  if (strongTrendShort && breakoutShort && rsiShort && volumeStrong && expansion) {
    stop = Math.max(...highs.slice(-5));
    const risk = stop - last.close;

    const tp = last.close - risk * 3;
    const tpPercent = ((last.close - tp) / last.close) * 100;
    const riskPercent = (risk / last.close) * 100;

    if (tpPercent >= tpMinPercent && riskPercent >= riskMinPercent) {
      signal = 'SHORT';
      takeProfit = tp;
      score = 90;
      reasons = ['Setup con margen para fees', 'Volumen fuerte', 'Ruptura válida'];
    }
  }

  return {
    signal,
    score,
    confidence: signal === 'WAIT' ? 0 : 85,
    price: formatNumber(last.close),
    entry: formatNumber(last.close),
    stop: formatNumber(stop),
    takeProfit: formatNumber(takeProfit),
    rr: null,
    riskPercent: null,
    reasons: signal === 'WAIT' ? ['No compensa fees'] : reasons,
  };
}
