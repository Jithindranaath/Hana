function Box({
  x,
  y,
  w,
  h,
  title,
  subtitle,
  accent = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle?: string;
  accent?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        fill={accent ? "#312e81" : "#0f172a"}
        stroke={accent ? "#818cf8" : "#334155"}
        strokeWidth={1.5}
      />
      <text x={x + w / 2} y={y + (subtitle ? h / 2 - 4 : h / 2 + 5)} textAnchor="middle" fontSize={13} fill="#e2e8f0" fontWeight={600}>
        {title}
      </text>
      {subtitle && (
        <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fontSize={10.5} fill="#94a3b8">
          {subtitle}
        </text>
      )}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label?: string }) {
  return (
    <g>
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
      {label && (
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fontSize={10} fill="#94a3b8">
          {label}
        </text>
      )}
    </g>
  );
}

export function FlowDiagram() {
  return (
    <div className="overflow-x-auto not-prose">
      <svg viewBox="0 0 980 420" className="w-full min-w-[820px]">
        <text x={10} y={20} fontSize={11} fill="#64748b" fontWeight={600} letterSpacing={1}>
          ETHEREUM SEPOLIA
        </text>
        <Box x={10} y={30} w={190} h={60} title="HanaCreditAttestor" subtitle="snapshot() -> CreditSnapshot event" />

        <text x={230} y={20} fontSize={11} fill="#64748b" fontWeight={600} letterSpacing={1}>
          WORKER (OFF-CHAIN)
        </text>
        <Box x={230} y={30} w={150} h={60} title="Listener" subtitle="backfill + poll" />
        <Box x={410} y={30} w={190} h={60} title="Attest + Proof" subtitle="~9 min wait, then fetch" />

        <text x={630} y={20} fontSize={11} fill="#64748b" fontWeight={600} letterSpacing={1}>
          CREDITCOIN CC3
        </text>
        <Box x={630} y={30} w={200} h={60} title="CreditImporterASC" subtitle="verify + decode + 4 checks" accent />
        <Box x={630} y={130} w={200} h={60} title="CreditRegistry" subtitle="score, getCreditLimit" accent />

        <Arrow x1={200} y1={60} x2={228} y2={60} />
        <Arrow x1={380} y1={60} x2={408} y2={60} />
        <Arrow x1={600} y1={60} x2={628} y2={60} label="submit" />
        <Arrow x1={730} y1={90} x2={730} y2={128} label="importAttestedHistory" />

        <text x={10} y={210} fontSize={11} fill="#64748b" fontWeight={600} letterSpacing={1}>
          BORROW + SPEND (ALL ON CC3)
        </text>
        <Box x={10} y={220} w={190} h={60} title="LendingPool" subtitle="ERC4626, iUSDC liquidity" />
        <Box x={250} y={220} w={190} h={60} title="LoanManager" subtitle="originate, repay" accent />
        <Box x={490} y={220} w={190} h={60} title="SettlementVault" subtitle="holds merchant funds" />
        <Box x={730} y={220} w={200} h={60} title="Merchant" subtitle="claim()" />

        <Arrow x1={730} y1={190} x2={400} y2={218} label="getCreditLimit" />
        <Arrow x1={200} y1={250} x2={248} y2={250} label="borrow / repay" />
        <Arrow x1={440} y1={250} x2={488} y2={250} label="registerSettlement" />
        <Arrow x1={680} y1={250} x2={728} y2={250} label="claim" />

        <text x={10} y={330} fontSize={11} fill="#64748b" fontWeight={600} letterSpacing={1}>
          REFERENCE APPS
        </text>
        <Box x={10} y={340} w={160} h={50} title="Demo Store" />
        <Box x={190} y={340} w={160} h={50} title="Checkout Hub" accent />
        <Box x={370} y={340} w={160} h={50} title="Merchant API" />
        <Arrow x1={170} y1={365} x2={188} y2={365} label="bills/create" />
        <Arrow x1={350} y1={365} x2={368} y2={365} label="status" />
      </svg>
    </div>
  );
}
