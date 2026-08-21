"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TrustMeter } from "@/components/trust-meter";
import { PaymentAuditTable } from "@/components/payment-audit-table";
import { AgentPipelineStrip } from "@/components/agent-pipeline-strip";

/* ── Types matching the /research API response ─────────────────── */
interface ProvenanceResult {
  type: "cryptographic" | "inferred";
  creator?: string;
  signatureIssuer?: string;
  aiDisclosure?: boolean;
  source?: string;
  confidence?: number;
}

interface VerificationResult {
  verdict: string;
  evidence: string[];
  confidence: number;
}

interface PaymentRecord {
  agent: string;
  amount: string;
  receiver: string;
  txId: string;
  status: "settled" | "pending" | "failed";
}

interface ResearchResponse {
  query: string;
  report?: string;
  provenance?: ProvenanceResult;
  verification?: VerificationResult;
  trustScore?: number;
  summary?: string;
  translation?: { text: string; targetLanguage: string } | null;
  translationStatus?: "completed" | "skipped" | "failed";
  translationError?: string;
  payments?: any[];
}

interface ResultsPanelProps {
  data: ResearchResponse;
}

export function ResultsPanel({ data }: ResultsPanelProps) {
  const agentStatuses = {
    provenance:   data.provenance   ? "completed" : "skipped",
    verification: data.verification ? "completed" : "skipped",
    synthesis:    data.trustScore != null ? "completed" : "skipped",
    translation:  data.translationStatus ?? "skipped",
  } as Record<string, "completed" | "skipped" | "failed" | "pending">;

  const agentInfo: Record<string, { amount: string; receiver: string }> = {
    "Provenance Agent": {
      amount: "$0.01",
      receiver: "PP7JICROIH27MQHZDQUKNH6JZMQRVHQC56E7PICJZR7AL4USZ5HECOXNZM",
    },
    "Verification Agent": {
      amount: "$0.005",
      receiver: "DJ6DHDJCWWUCG5DJTM35HHI3JMJGJZWEEPQZ63L2HBKGZEYUMMDFBR7M4Y",
    },
    "Trust Synthesis Agent": {
      amount: "$0.005",
      receiver: "AN62GPJEJC433MRIPGL2I6LGKTCQCKJC7B76YEUPNBPOPBHCDHMCESELS4",
    },
    "Translation Agent": {
      amount: "$0.005",
      receiver: "35QW4DRG47SW2HOIRAS4QCYT3VBV54UKAQ7G55KECFTNKQ6NEGEGUBIOMU",
    },
  };

  const formattedPayments = data.payments?.map(p => {
    const agentName = p.agent || p.worker || "Unknown Agent";
    const info = agentInfo[agentName] || { amount: p.amount || "$0.005", receiver: p.receiver || "—" };
    return {
      agent: agentName,
      amount: info.amount,
      receiver: info.receiver,
      txId: p.txId || "—",
      status: (p.txId && p.txId !== "—" ? "settled" : "failed") as "settled" | "pending" | "failed",
    };
  }) || [];

  return (
    <div className="flex flex-col gap-6 tm-fade-up" id="results-panel">

      {/* ── Agent pipeline strip ──────────────────────────────── */}
      <Card className="tm-glass border-white/[0.06] rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 pt-5 px-6">
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)]">
            Agent Pipeline
          </p>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          <AgentPipelineStrip statuses={agentStatuses} />
          {data.translationStatus === "failed" && data.translationError && (
            <p className="mt-3 text-xs text-[#ef4444]">
              Translation failed: {data.translationError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Trust Score Meter ─────────────────────────────────── */}
      {data.trustScore != null && (
        <Card className="tm-glass border-white/[0.06] rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 pt-5 px-6">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)]">
              Trust Score
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <TrustMeter score={data.trustScore} />
          </CardContent>
        </Card>
      )}

      {/* ── Summary / Report ─────────────────────────────────── */}
      {(data.report || data.summary) && (
        <Card className="tm-glass border-white/[0.06] rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 pt-5 px-6">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)]">
              Research Report
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-5 space-y-2">
            {parseMarkdown(data.report || data.summary || "")}
          </CardContent>
        </Card>
      )}

      {/* ── Provenance ───────────────────────────────────────── */}
      {data.provenance && (
        <Card className="tm-glass border-white/[0.06] rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 pt-5 px-6">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)]">
              Provenance
              <span
                className="ml-2 inline-block text-[9px] tracking-wider px-2 py-0.5 rounded-full border"
                style={
                  data.provenance.type === "cryptographic"
                    ? { color: "var(--tm-good)", borderColor: "var(--tm-good)40", background: "var(--tm-good)12" }
                    : { color: "var(--tm-warning)", borderColor: "var(--tm-warning)40", background: "var(--tm-warning)12" }
                }
              >
                {data.provenance.type === "cryptographic" ? "C2PA Verified" : "Inferred"}
              </span>
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-5 grid gap-2">
            {data.provenance.creator && (
              <Row label="Creator" value={data.provenance.creator} />
            )}
            {data.provenance.signatureIssuer && (
              <Row label="Signature Issuer" value={data.provenance.signatureIssuer} />
            )}
            {data.provenance.aiDisclosure != null && (
              <Row
                label="AI Disclosure"
                value={data.provenance.aiDisclosure ? "Yes — AI-generated content declared" : "None declared"}
              />
            )}
            {data.provenance.source && (
              <Row label="Source" value={data.provenance.source} />
            )}
            {data.provenance.confidence != null && (
              <Row label="Confidence" value={`${Math.round(data.provenance.confidence * 100)}%`} />
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Verification Verdict ─────────────────────────────── */}
      {data.verification && (
        <Card className="tm-glass border-white/[0.06] rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 pt-5 px-6">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)]">
              Verification Verdict
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-5">
            <p className="text-sm font-semibold mb-3 text-[var(--tm-on-surface)]">
              {data.verification.verdict}
            </p>
            {data.verification.evidence?.length > 0 && (
              <ul className="list-none space-y-1.5">
                {data.verification.evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--tm-on-surface-var)]">
                    <span className="mt-0.5 text-[var(--tm-good)] text-xs">▸</span>
                    {e}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Translation ──────────────────────────────────────── */}
      {data.translation && (
        <Card className="tm-glass border-white/[0.06] rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 pt-5 px-6">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)]">
              Translation · {data.translation.targetLanguage}
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-5">
            <p className="text-sm leading-relaxed text-[var(--tm-on-surface)]">
              {data.translation.text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Payment Audit Trail ──────────────────────────────── */}
      {data.payments && data.payments.length > 0 && (
        <Card className="tm-glass border-white/[0.06] rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 pt-5 px-6">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)]">
              Payment Audit Trail
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-5">
            <PaymentAuditTable payments={formattedPayments} />
          </CardContent>
        </Card>
      )}

    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────── */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-xs font-semibold tracking-wider uppercase text-[var(--tm-on-surface-var)] shrink-0">
        {label}
      </span>
      <span className="text-sm text-right text-[var(--tm-on-surface)] font-medium">{value}</span>
    </div>
  );
}

function parseMarkdown(text: string) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("### ")) {
      return (
        <h3 key={idx} className="text-sm font-bold mt-4 mb-1 text-[var(--tm-cream)] uppercase tracking-wider">
          {trimmed.slice(4)}
        </h3>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h2 key={idx} className="text-base font-bold mt-5 mb-2 text-[var(--tm-cream)]">
          {trimmed.slice(3)}
        </h2>
      );
    }
    if (trimmed.startsWith("# ")) {
      return (
        <h1 key={idx} className="text-lg font-bold mt-6 mb-3 text-[var(--tm-cream)]">
          {trimmed.slice(2)}
        </h1>
      );
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const content = trimmed.slice(2);
      return (
        <li key={idx} className="ml-4 list-disc text-sm text-[var(--tm-on-surface-var)] my-0.5">
          {renderInlineBold(content)}
        </li>
      );
    }
    if (trimmed === "") {
      return <div key={idx} className="h-1" />;
    }
    return (
      <p key={idx} className="text-sm leading-relaxed text-[var(--tm-on-surface)] my-1">
        {renderInlineBold(line)}
      </p>
    );
  });
}

function renderInlineBold(text: string) {
  const parts = [];
  const boldRegex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;
  let keyIdx = 0;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(
      <strong key={keyIdx++} className="font-semibold text-[var(--tm-cream)]">
        {match[1]}
      </strong>
    );
    lastIndex = boldRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
