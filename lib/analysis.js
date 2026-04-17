export function analyzeSignal(data) {
  let score = 0;
  let reasons = [];

  // --- TENDENCIA 1H ---
  if (data.ema9_1h > data.ema26_1h) {
    score += 1;
    reasons.push("Tendencia alcista 1h");
  }

  if (data.price > data.ema26_1h) {
    score += 1;
  }

  // --- RSI ---
  if (data.rsi >= 42 && data.rsi <= 55) {
    score += 1;
    reasons.push("RSI zona óptima");
  }

  // --- PRECIO vs EMA ---
  if (data.price > data.ema9_15m) {
    score += 1;
  }

  // --- VOLUMEN ---
  if (data.volume > data.volumeAvg) {
    score += 1;
    reasons.push("Volumen alto");
  }

  if (data.volume > data.volumeAvg * 1.3) {
    score += 1;
  }

  // --- ESTRUCTURA ---
  if (!data.nearResistance) {
    score += 1;
  }

  if (data.marketStructure === "bullish") {
    score += 1;
  }

  // --- R/R ---
  if (data.rr >= 2) {
    score += 1;
  }

  // --- CONTEXTO ---
  if (data.volatility === "high") {
    score += 1;
  }

  // --- DECISIÓN ---
  let status = "DESCARTADA";
  if (score >= 8) status = "OPERABLE";
  else if (score >= 6.5) status = "WATCHLIST";

  return {
    score,
    status,
    reasons
  };
}
