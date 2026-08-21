"use client";

interface TrustMeterProps {
  score: number; // 0–100
}

function getBand(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "GOOD",     color: "var(--tm-good)"     };
  if (score >= 60) return { label: "WARNING",  color: "var(--tm-warning)"  };
  if (score >= 40) return { label: "SERIOUS",  color: "var(--tm-serious)"  };
  return              { label: "CRITICAL", color: "var(--tm-critical)" };
}

export function TrustMeter({ score }: TrustMeterProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const { label, color } = getBand(clampedScore);

  return (
    <div className="flex flex-col gap-3" id="trust-score-meter">
      {/* Score headline */}
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-2">
          <span
            className="text-5xl font-bold tabular-nums leading-none"
            style={{ color }}
          >
            {clampedScore}
          </span>
          <span className="text-sm text-[var(--tm-on-surface-var)] font-medium">/100</span>
        </div>
        <span
          className="text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full"
          style={{
            color,
            background: `${color}18`,
            border: `1px solid ${color}40`,
          }}
        >
          {label}
        </span>
      </div>

      {/* The Meter — a single ratio-against-limit bar, not a gauge */}
      <div className="tm-meter-track">
        <div
          className="tm-meter-fill"
          style={{ width: `${clampedScore}%`, background: color }}
          role="meter"
          aria-label={`Trust score: ${clampedScore} out of 100`}
          aria-valuenow={clampedScore}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Band legend */}
      <div className="flex justify-between text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)]">
        <span style={{ color: "var(--tm-critical)" }}>Critical 0</span>
        <span style={{ color: "var(--tm-serious)"  }}>Serious 40</span>
        <span style={{ color: "var(--tm-warning)"  }}>Warning 60</span>
        <span style={{ color: "var(--tm-good)"     }}>Good 80</span>
      </div>
    </div>
  );
}
