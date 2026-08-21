"use client";

interface Agent {
  id: string;
  label: string;
  sublabel: string;
  color: string;   // CSS color value
  status: "completed" | "skipped" | "failed" | "pending";
}

const AGENTS: Agent[] = [
  { id: "provenance",   label: "Provenance",   sublabel: "C2PA + Tavily",      color: "var(--tm-agent-1)" },
  { id: "verification", label: "Verification",  sublabel: "Claim checking",     color: "var(--tm-agent-2)" },
  { id: "synthesis",    label: "Trust Synth",   sublabel: "Score aggregation",  color: "var(--tm-agent-3)" },
  { id: "translation",  label: "Translation",   sublabel: "Multilingual",       color: "var(--tm-agent-4)" },
];

interface AgentPipelineStripProps {
  statuses?: Record<string, "completed" | "skipped" | "failed" | "pending">;
}

const STATUS_ICON: Record<string, string> = {
  completed: "✓",
  skipped:   "–",
  failed:    "✕",
  pending:   "·",
};

export function AgentPipelineStrip({ statuses = {} }: AgentPipelineStripProps) {
  return (
    /* 4 chips — direct labels mandatory at this count per FRONTEND_DATAVIZ_SPEC */
    <div
      className="flex flex-wrap items-center gap-3"
      id="agent-pipeline-strip"
      aria-label="Agent pipeline status"
    >
      {AGENTS.map((agent, idx) => {
        const status = statuses[agent.id] ?? "pending";
        const icon = STATUS_ICON[status];
        const isActive = status === "completed";
        const isFailed = status === "failed";
        const isSkipped = status === "skipped";

        return (
          <div key={agent.id} className="flex items-center gap-2">
            {/* Chip — mandatory direct label */}
            <div
              className="tm-chip"
              style={{
                color: isSkipped || status === "pending" ? "var(--tm-on-surface-var)" : agent.color,
                borderColor: isSkipped || status === "pending" ? "rgba(245,242,237,0.12)" : `${agent.color}60`,
                background: isActive ? `color-mix(in srgb, ${agent.color} 10%, transparent)` :
                            isFailed ? "rgba(239,68,68,0.08)" : "transparent",
              }}
              title={`${agent.label}: ${status}`}
            >
              <span className="font-mono text-[10px]">{icon}</span>
              {/* Direct label — always visible */}
              <span>{agent.label}</span>
            </div>

            {/* Connector arrow (not after last chip) */}
            {idx < AGENTS.length - 1 && (
              <span className="text-[var(--tm-on-surface-var)] opacity-30 text-sm select-none">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
