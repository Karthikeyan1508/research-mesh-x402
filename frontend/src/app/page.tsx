"use client";

import { useState, useRef, FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResultsPanel } from "@/components/results-panel";
import { OrchestrationSidebar } from "@/components/orchestration-sidebar";

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4020";

/* ── Loading dots ────────────────────────────────────────────────── */
function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 py-8 justify-center" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="tm-loading-dot block w-2 h-2 rounded-full"
          style={{
            background: "var(--color-accent)",
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
    <div className="rounded-md border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-400 tm-fade-up">
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
      <header className="sticky top-0 z-50 w-full bg-zinc-950/95 backdrop-blur-md border-b border-zinc-850">
        <div className="mx-auto w-full max-w-[1440px] px-6 lg:px-12 py-4 flex items-center justify-between">
          {/* Wordmark */}
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
              style={{ background: "#3b82f6", color: "#ffffff" }}
              aria-hidden="true"
            >
              T
            </div>
            <span className="text-sm font-bold tracking-wider uppercase text-white">
              TrustMesh
            </span>
            <span className="hidden sm:inline-block text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 bg-zinc-900/50">
              x402
            </span>
          </div>

          {/* Server indicators */}
          <div className="flex items-center gap-2.5 text-[9px] font-mono text-zinc-400 tracking-wider uppercase font-bold">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span>Facilitator connected</span>
          </div>
        </div>
      </header>

      {/* ── Main Two-Column Layout ─────────────────────────────── */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-12 py-8 flex flex-col justify-start">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
          
          {/* Left Column: Input and Results */}
          <div className="flex flex-col gap-6 min-w-0">
            {/* Title / Hero */}
            <div className={`transition-all duration-500 ${result ? "text-left" : "text-center pt-8 pb-4"}`}>
              {/* Eyebrow */}
              <p className="text-[10px] font-bold tracking-widest uppercase text-zinc-500 mb-2">
                AI Content Provenance & Trust Verification
              </p>

              {/* Display headline */}
              <h1 className={`font-bold leading-tight tracking-tight text-white transition-all duration-500 ${
                result ? "text-2xl mb-1" : "text-4xl sm:text-5xl mb-2"
              }`} style={{ letterSpacing: "-0.02em" }}>
                Verify. Trust.{" "}
                <span className="text-blue-500">Confirm.</span>
              </h1>

              {!result && (
                <p className="text-zinc-400 text-sm leading-relaxed max-w-xl mx-auto mt-2">
                  Submit any research query and TrustMesh's multi-agent pipeline will cryptographically verify provenance, check claims, and return a scored trust report — paying each agent in real time via x402.
                </p>
              )}
            </div>

            {/* ── Query form ─────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5 tm-glass" id="research-form">
              {/* Main query input */}
              <div className="relative">
                <Input
                  id="query-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Verify Adobe Firefly image provenance…"
                  className="tm-input h-14 text-base pr-36"
                  disabled={loading}
                  required
                  autoFocus
                />
                <Button
                  type="submit"
                  id="research-button"
                  disabled={loading || !query.trim()}
                  className="tm-btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 h-11 px-6 text-sm"
                >
                  {loading ? "Researching…" : "Research →"}
                </Button>
              </div>

              {/* Optional translation language */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="translate-to-input" className="text-[9px] font-bold tracking-widest text-zinc-400 uppercase">
                  Target Language (Optional)
                </label>
                <Input
                  id="translate-to-input"
                  value={translateTo}
                  onChange={(e) => setTranslateTo(e.target.value)}
                  placeholder="Translate results to… (e.g. Spanish, French, German)"
                  className="tm-input h-11 text-sm"
                  disabled={loading}
                />
              </div>
            </form>

            {/* ── Results area ───────────────────────────────────── */}
            <div ref={resultsRef} className="min-w-0">
              {error && <ErrorBanner message={error} />}
              {result && !loading && (
                <ResultsPanel data={result as Parameters<typeof ResultsPanel>[0]["data"]} />
              )}
              {loading && !result && (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                  <LoadingDots />
                  <p className="text-sm font-medium text-zinc-400 animate-pulse tracking-wide uppercase text-[9px]">
                    Consulting decentralized Bazaar agents...
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Active Orchestration Control Center */}
          <div className={`transition-all duration-500 ${(loading || result) ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 pointer-events-none hidden lg:block"}`}>
            <OrchestrationSidebar
              loading={loading}
              hasTranslation={!!translateTo.trim()}
              completedData={result}
            />
          </div>

        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="text-center py-8 text-[10px] font-bold tracking-widest uppercase text-zinc-500 border-t border-zinc-900 mt-auto">
        TrustMesh · x402 Protocol · Algorand · ETHGlobal 2026
      </footer>

    </div>
  );
}
