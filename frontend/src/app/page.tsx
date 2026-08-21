"use client";

import { useState, useRef, FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResultsPanel } from "@/components/results-panel";
import { OrchestrationSidebar } from "@/components/orchestration-sidebar";

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4020";

interface SampleQuery {
  title: string;
  query: string;
  translateTo?: string;
  tag: string;
  desc: string;
}

const SAMPLE_QUERIES: SampleQuery[] = [
  {
    title: "Cryptographic C2PA Audit",
    query: "https://facilitator.goplausible.xyz/fixtures/adobe-20220124-C.jpg",
    tag: "C2PA Verified",
    desc: "Verify digital signature & creator credentials of an official C2PA JPEG fixture."
  },
  {
    title: "Quantum Signature Claim",
    query: "Falcon-1024 post-quantum signatures incorporated directly into Algorand protocol.",
    tag: "Fact Check",
    desc: "Extract claims and cross-reference factual accuracy against protocol documentation."
  },
  {
    title: "Dynamic Bazaar Discovery",
    query: "Latest news on Algorand x402 protocol and decentralized agents.",
    tag: "Web Search",
    desc: "Scan web sources via Tavily search and aggregate weighted trust scores."
  }
];

/* ── Loading dots ────────────────────────────────────────────────── */
function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 py-8 justify-center" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="tm-loading-dot block w-2.5 h-2.5 rounded-full"
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

  async function executeSearch(searchQuery: string, lang = "") {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const body: Record<string, string> = { query: searchQuery.trim() };
      if (lang.trim()) body.translateTo = lang.trim();

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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    executeSearch(query, translateTo);
  }

  function handleSampleClick(sample: SampleQuery) {
    setQuery(sample.query);
    setTranslateTo(sample.translateTo || "");
    executeSearch(sample.query, sample.translateTo || "");
  }

  function handleReset() {
    setQuery("");
    setTranslateTo("");
    setResult(null);
    setError(null);
  }

  return (
    <div className="relative min-h-screen tm-glow-bg flex flex-col">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full bg-zinc-950/95 backdrop-blur-md border-b border-zinc-850">
        <div className="mx-auto w-full max-w-[1440px] px-6 lg:px-12 py-4 flex items-center justify-between">
          {/* Wordmark */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={handleReset}>
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
            <span className="hidden sm:inline-block text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded border border-zinc-850 text-zinc-400 bg-zinc-900/40">
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

      {/* ── Main Layout Workspace ──────────────────────────────── */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-12 py-10 flex flex-col justify-start">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
          
          {/* Left Column: Input and Results */}
          <div className="flex flex-col gap-6 min-w-0">
            
            {/* Title / Hero (Centered on initial load, clean header when result is active) */}
            <div className={`transition-all duration-500 ${result ? "text-left border-b border-zinc-900 pb-4" : "text-center pt-10 pb-4"}`}>
              {/* Eyebrow */}
              <p className="text-[10px] font-bold tracking-widest uppercase text-zinc-500 mb-2">
                Decentralized Trust Protocol
              </p>

              {/* Display headline */}
              <h1 className={`font-bold leading-tight tracking-tight text-white transition-all duration-500 ${
                result ? "text-2xl" : "text-4xl sm:text-5xl"
              }`} style={{ letterSpacing: "-0.02em" }}>
                Verify Content Provenance.{" "}
                <span className="text-blue-500">Secure Trust.</span>
              </h1>

              {result && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-zinc-400">Query: <strong className="text-zinc-200">{result.query || query}</strong></span>
                  <button onClick={handleReset} className="text-xs text-blue-500 hover:text-blue-400 font-medium ml-2 border border-blue-500/20 bg-blue-500/5 px-2 py-0.5 rounded">
                    New Research
                  </button>
                </div>
              )}

              {!result && (
                <p className="text-zinc-400 text-sm leading-relaxed max-w-xl mx-auto mt-2.5">
                  An automated multi-agent settlement pipeline that performs cryptographic metadata audits, cross-references factual assertions, and issues on-chain trust payouts in real time.
                </p>
              )}
            </div>

            {/* ── Query form ─────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 tm-glass" id="research-form">
              {/* Main query input */}
              <div className="relative">
                <Input
                  id="query-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter a claim or image URL to verify..."
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
                  {loading ? "Researching…" : "Verify Claims"}
                </Button>
              </div>

              {/* Optional translation language */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="translate-to-input" className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase">
                  Target Language Translation (Optional)
                </label>
                <Input
                  id="translate-to-input"
                  value={translateTo}
                  onChange={(e) => setTranslateTo(e.target.value)}
                  placeholder="Translate final report to… (e.g. Spanish, French, German)"
                  className="tm-input h-11 text-sm"
                  disabled={loading}
                />
              </div>
            </form>

            {/* ── Welcome Area: Sample Queries & Pipeline Guideline (Only visible initially) ── */}
            {!result && !loading && (
              <div className="flex flex-col gap-8 tm-fade-up">
                
                {/* Sample Grid */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-xs font-bold tracking-widest uppercase text-zinc-400">
                    Select a query to test the live payment pipeline:
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {SAMPLE_QUERIES.map((sample, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSampleClick(sample)}
                        className="p-5 rounded-lg border border-zinc-850 bg-zinc-950/40 hover:border-blue-500/30 hover:bg-zinc-900/40 cursor-pointer transition-all duration-200 group flex flex-col justify-between min-h-[130px]"
                      >
                        <div>
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/25">
                            {sample.tag}
                          </span>
                          <p className="text-xs font-semibold text-white mt-3 group-hover:text-blue-300 line-clamp-2">
                            {sample.title}
                          </p>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-2 line-clamp-3">
                          {sample.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Architecture Visual Guideline */}
                <div className="p-6 rounded-lg border border-zinc-850 bg-zinc-950/20 flex flex-col gap-4">
                  <h3 className="text-xs font-bold tracking-widest uppercase text-zinc-400">
                    Bazaar Protocol Architecture Pipeline
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                    <div className="flex flex-col gap-1 border-l border-indigo-500/30 pl-3">
                      <span className="font-mono text-[10px] text-indigo-400 font-bold uppercase">1. Provenance</span>
                      <p className="text-[11px] text-zinc-400">C2PA Signature validation or web source checks.</p>
                    </div>
                    <div className="flex flex-col gap-1 border-l border-cyan-500/30 pl-3">
                      <span className="font-mono text-[10px] text-cyan-400 font-bold uppercase">2. Verification</span>
                      <p className="text-[11px] text-zinc-400">Claims extraction & cross-checked web citations.</p>
                    </div>
                    <div className="flex flex-col gap-1 border-l border-amber-500/30 pl-3">
                      <span className="font-mono text-[10px] text-amber-400 font-bold uppercase">3. Synthesis</span>
                      <p className="text-[11px] text-zinc-400">Score aggregation and markdown report build.</p>
                    </div>
                    <div className="flex flex-col gap-1 border-l border-pink-500/30 pl-3">
                      <span className="font-mono text-[10px] text-pink-400 font-bold uppercase">4. Translation</span>
                      <p className="text-[11px] text-zinc-400">Gemini-driven multilingual translation.</p>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ── Results Display Area ──────────────────────────────── */}
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
