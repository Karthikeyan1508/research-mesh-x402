"use client";

import { useState, useRef, FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ResultsPanel } from "@/components/results-panel";

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4020";

/* ── Loading dots ────────────────────────────────────────────────── */
function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 py-16 justify-center" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="tm-loading-dot block w-2 h-2 rounded-full"
          style={{
            background: "var(--tm-secondary)",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Error banner ────────────────────────────────────────────────── */
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/8 px-5 py-4 text-sm text-[#ef4444] tm-fade-up">
      <span className="font-bold mr-2">Error:</span>{message}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */
export default function Home() {
  const [query, setQuery] = useState("");
  const [translateTo, setTranslateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<object | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const body: Record<string, string> = { query: query.trim() };
      if (translateTo.trim()) body.translateTo = translateTo.trim();

      const res = await fetch(`${ORCHESTRATOR_URL}/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as { detail?: string }).detail ??
          `Server returned ${res.status}`
        );
      }

      const data = await res.json();
      setResult(data);

      // Smooth scroll to results
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen tm-glow-bg flex flex-col">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 tm-glass border-b border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          {/* Wordmark */}
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: "var(--tm-rust)", color: "var(--tm-cream)" }}
              aria-hidden="true"
            >
              T
            </div>
            <span className="text-sm font-bold tracking-wider uppercase text-[var(--tm-on-surface)]">
              TrustMesh
            </span>
            <span className="hidden sm:inline-block text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded-full border"
              style={{
                color: "var(--tm-blush)",
                borderColor: "var(--tm-blush)40",
                background: "var(--tm-blush)12",
              }}
            >
              x402
            </span>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <main className="flex-1 mx-auto w-full max-w-3xl px-6 pt-20 pb-32 flex flex-col">

        {/* Eyebrow */}
        <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)] mb-4 text-center">
          AI Content Provenance & Trust Verification
        </p>

        {/* Display headline */}
        <h1 className="text-4xl sm:text-5xl font-bold text-center leading-tight tracking-tight text-[var(--tm-cream)] mb-3"
          style={{ letterSpacing: "-0.02em" }}>
          Verify. Trust.{" "}
          <span style={{ color: "var(--tm-secondary)" }}>Confirm.</span>
        </h1>

        <p className="text-center text-[var(--tm-on-surface-var)] text-base leading-relaxed mb-12 max-w-xl mx-auto">
          Submit any research query and TrustMesh's multi-agent pipeline will cryptographically verify provenance, check claims, and return a scored trust report — paying each agent in real time via x402.
        </p>

        {/* ── Query form ─────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" id="research-form">

          {/* Main query input */}
          <div className="relative">
            <Input
              id="query-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Verify Adobe Firefly image provenance…"
              className="tm-input h-14 text-base pr-32"
              disabled={loading}
              required
              autoFocus
            />
            <Button
              type="submit"
              id="research-button"
              disabled={loading || !query.trim()}
              className="tm-btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 h-10 px-5 text-sm"
            >
              {loading ? "Researching…" : "Research →"}
            </Button>
          </div>

          {/* Optional translation language */}
          <div className="flex items-center gap-3">
            <Input
              id="translate-to-input"
              value={translateTo}
              onChange={(e) => setTranslateTo(e.target.value)}
              placeholder="Translate results to… (e.g. Spanish, French — optional)"
              className="tm-input h-10 text-sm"
              disabled={loading}
            />
          </div>
        </form>

        {/* ── Results area ───────────────────────────────────── */}
        <div ref={resultsRef} className="mt-12">
          {loading && <LoadingDots />}
          {error && <ErrorBanner message={error} />}
          {result && !loading && (
            <ResultsPanel data={result as Parameters<typeof ResultsPanel>[0]["data"]} />
          )}
        </div>

      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="text-center py-8 text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)] border-t border-white/[0.04]">
        TrustMesh · x402 Protocol · Algorand · ETHGlobal 2026
      </footer>

    </div>
  );
}
