function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  const num = Number(value);
  if (num >= 1000) return num.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  if (num >= 1) return num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return num.toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function badgeClass(signal) {
  if (signal === 'LONG') return 'badge long';
  if (signal === 'SHORT') return 'badge short';
  return 'badge wait';
}

function statusColor(status) {
  if (status === 'OPERABLE') return '#22c55e';
  if (status === 'WATCHLIST') return '#f59e0b';
  return '#ef4444';
}

export default function SignalCard({ item }) {
  return (
    <article className="signal-card">
      <div className="signal-head">
        <div>
          <h3 className="signal-title">{item.symbol}</h3>
          <div className="signal-sub">Score del setup: {item.score}/100</div>
          <div className="signal-sub">Score intradía: {item.intradayScore ?? '-'}/10</div>
        </div>
        <span className={badgeClass(item.signal)}>{item.signal}</span>
      </div>

      <div
        className="mini"
        style={{
          marginTop: 12,
          border: `1px solid ${statusColor(item.status)}`,
        }}
      >
        <div className="mini-label">Estado operativo</div>
        <div
          className="mini-value"
          style={{
            color: statusColor(item.status),
            fontWeight: 700,
          }}
        >
          {item.status ?? '-'}
        </div>
      </div>

      <div className="mini-grid">
        <div className="mini">
          <div className="mini-label">Precio</div>
          <div className="mini-value">{formatPrice(item.price)}</div>
        </div>
        <div className="mini">
          <div className="mini-label">Confianza</div>
          <div className="mini-value">{item.confidence}%</div>
        </div>
        <div className="mini">
          <div className="mini-label">Entrada</div>
          <div className="mini-value small">{formatPrice(item.entry)}</div>
        </div>
        <div className="mini">
          <div className="mini-label">Stop</div>
          <div className="mini-value small">{formatPrice(item.stop)}</div>
        </div>
        <div className="mini" style={{ gridColumn: '1 / -1' }}>
          <div className="mini-label">Take Profit</div>
          <div className="mini-value small">{formatPrice(item.takeProfit)}</div>
        </div>
      </div>

      <div className="mini-grid" style={{ marginTop: 12 }}>
        <div className="mini">
          <div className="mini-label">R/R</div>
          <div className="mini-value small">{item.rr || '-'}</div>
        </div>
        <div className="mini">
          <div className="mini-label">Riesgo</div>
          <div className="mini-value small">{item.riskPercent ? `${item.riskPercent}%` : '-'}</div>
        </div>
      </div>

      <div className="reasons">
        <div className="reason-title">Motivo</div>
        {(item.reasons || []).map((reason, index) => (
          <div key={index} className="reason">• {reason}</div>
        ))}
      </div>
    </article>
  );
}
