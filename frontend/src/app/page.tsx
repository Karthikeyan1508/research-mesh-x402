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
    <div className="flex items-center gap-2 py-10 justify-center" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="tm-loading-dot block w-3 h-3 rounded-full"
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
    <div className="rounded-md border border-red-500/30 bg-red-500/10 px-6 py-5 text-base text-red-400 tm-fade-up">
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

  const isWorkspaceActive = loading || result;

  return (
    <div className="relative min-h-screen tm-glow-bg flex flex-col">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800">
        <div className="mx-auto w-full max-w-[1440px] px-6 lg:px-12 py-5 flex items-center justify-between">
          {/* Wordmark (Clean text, clear typography) */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={handleReset}>
            <span className="text-lg font-black tracking-widest uppercase text-white">
              TrustMesh
            </span>
          </div>

          {/* Server indicators */}
          <div className="flex items-center gap-2.5 text-xs font-mono text-zinc-400 tracking-wider uppercase font-bold">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span>Facilitator connected</span>
          </div>
        </div>
      </header>

      {/* ── Main Layout Workspace ──────────────────────────────── */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-12 py-12 flex flex-col justify-start">
        {isWorkspaceActive ? (
          /* Active Results Layout (Two Columns) */
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10 items-start">
            
            {/* Left Column: Input and Results */}
            <div className="flex flex-col gap-8 min-w-0">
              
              {/* Active Header (Left-aligned details) */}
              <div className="text-left border-b border-zinc-900 pb-5">
                <p className="text-sm font-bold tracking-widest uppercase text-zinc-500 mb-2">
                  Decentralized Trust Protocol
                </p>
                <h1 className="font-extrabold leading-tight tracking-tight text-white text-4xl" style={{ letterSpacing: "-0.02em" }}>
                  Verify Content Provenance. <span className="text-blue-500">Secure Trust.</span>
                </h1>
                {result && (
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-sm text-zinc-400">Query: <strong className="text-zinc-200">{result.query || query}</strong></span>
                    <button onClick={handleReset} className="text-xs text-blue-500 hover:text-blue-400 font-semibold ml-2 border border-blue-500/20 bg-blue-500/5 px-2.5 py-1 rounded">
                      New Research
                    </button>
                  </div>
                )}
              </div>

              {/* Query Input form */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6 tm-glass animate-fade-in" id="research-form">
                <div className="relative">
                  <Input
                    id="query-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter a claim or image URL to verify..."
                    className="tm-input h-16 text-xl pr-40"
                    disabled={loading}
                    required
                    autoFocus
                  />
                  <Button
                    type="submit"
                    id="research-button"
                    disabled={loading || !query.trim()}
                    className="tm-btn-primary absolute right-2 top-1/2 -translate-y-1/2 h-12 px-6 text-base font-bold"
                  >
                    {loading ? "Researching…" : "Verify Claims"}
                  </Button>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="translate-to-input" className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
                    Target Language Translation (Optional)
                  </label>
                  <Input
                    id="translate-to-input"
                    value={translateTo}
                    onChange={(e) => setTranslateTo(e.target.value)}
                    placeholder="Translate final report to… (e.g. Spanish, French, German)"
                    className="tm-input h-14 text-lg"
                    disabled={loading}
                  />
                </div>
              </form>

              {/* Results Container */}
              <div ref={resultsRef} className="min-w-0">
                {error && <ErrorBanner message={error} />}
                {result && !loading && (
                  <ResultsPanel data={result as Parameters<typeof ResultsPanel>[0]["data"]} />
                )}
                {loading && !result && (
                  <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
                    <LoadingDots />
                    <p className="text-base font-medium text-zinc-400 animate-pulse tracking-wide uppercase">
                      Consulting decentralized Bazaar agents...
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Execution Control Center */}
            <div className="opacity-100 translate-x-0">
              <OrchestrationSidebar
                loading={loading}
                hasTranslation={!!translateTo.trim()}
                completedData={result}
              />
            </div>

          </div>
        ) : (
          /* Initial Home Layout (Single Centered Column, perfectly balanced) */
          <div className="max-w-4xl mx-auto w-full flex flex-col gap-10 pt-16 pb-24 items-center text-center">
            
            {/* Centered Headline */}
            <div>
              <p className="text-sm font-bold tracking-widest uppercase text-zinc-500 mb-3">
                Decentralized Trust Protocol
              </p>
              <h1 className="font-black leading-tight tracking-tight text-white text-5xl sm:text-6xl mb-4" style={{ letterSpacing: "-0.03em" }}>
                Verify Content Provenance. <span className="text-blue-500">Secure Trust.</span>
              </h1>
              <p className="text-zinc-400 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mt-3">
                An automated multi-agent settlement pipeline that performs cryptographic metadata audits, cross-references factual assertions, and issues on-chain trust payouts in real time.
              </p>
            </div>

            {/* Center Input Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-8 tm-glass w-full text-left" id="research-form">
              <div className="relative">
                <Input
                  id="query-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter a claim or image URL to verify..."
                  className="tm-input h-16 text-xl pr-40"
                  required
                  autoFocus
                />
                <Button
                  type="submit"
                  id="research-button"
                  disabled={!query.trim()}
                  className="tm-btn-primary absolute right-2 top-1/2 -translate-y-1/2 h-12 px-6 text-base font-bold"
                >
                  Verify Claims
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="translate-to-input" className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
                  Target Language Translation (Optional)
                </label>
                <Input
                  id="translate-to-input"
                  value={translateTo}
                  onChange={(e) => setTranslateTo(e.target.value)}
                  placeholder="Translate final report to… (e.g. Spanish, French, German)"
                  className="tm-input h-14 text-lg"
                />
              </div>
            </form>

            {/* Interactive Sample Cards */}
            <div className="flex flex-col gap-4 w-full text-left tm-fade-up">
              <h3 className="text-sm font-bold tracking-widest uppercase text-zinc-500">
                Select a query to test the live payment pipeline:
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {SAMPLE_QUERIES.map((sample, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSampleClick(sample)}
                    className="p-6 rounded-lg border border-zinc-850 bg-zinc-950/40 hover:border-blue-500/30 hover:bg-zinc-900/40 cursor-pointer transition-all duration-200 group flex flex-col justify-between min-h-[160px]"
                  >
                    <div>
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded border border-blue-500/25">
                        {sample.tag}
                      </span>
                      <p className="text-base font-bold text-white mt-4 group-hover:text-blue-300 line-clamp-2">
                        {sample.title}
                      </p>
                    </div>
                    <p className="text-sm text-zinc-400 mt-2 line-clamp-3">
                      {sample.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Architecture Pipeline Flow */}
            <div className="p-8 rounded-lg border border-zinc-800 bg-zinc-950/20 w-full text-left flex flex-col gap-5">
              <h3 className="text-sm font-bold tracking-widest uppercase text-zinc-500">
                Bazaar Protocol Architecture Pipeline
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 text-sm">
                <div className="flex flex-col gap-1.5 border-l border-indigo-500/30 pl-4">
                  <span className="font-mono text-xs text-indigo-400 font-bold uppercase">1. Provenance</span>
                  <p className="text-sm text-zinc-400">C2PA Signature validation or web source checks.</p>
                </div>
                <div className="flex flex-col gap-1.5 border-l border-cyan-500/30 pl-4">
                  <span className="font-mono text-xs text-cyan-400 font-bold uppercase">2. Verification</span>
                  <p className="text-sm text-zinc-400">Claims extraction & verified web citations.</p>
                </div>
                <div className="flex flex-col gap-1.5 border-l border-amber-500/30 pl-4">
                  <span className="font-mono text-xs text-amber-400 font-bold uppercase">3. Synthesis</span>
                  <p className="text-sm text-zinc-400">Score aggregation and consensus report build.</p>
                </div>
                <div className="flex flex-col gap-1.5 border-l border-pink-500/30 pl-4">
                  <span className="font-mono text-xs text-pink-400 font-bold uppercase">4. Translation</span>
                  <p className="text-sm text-zinc-400">Gemini-driven multilingual translation.</p>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="text-center py-10 text-xs font-bold tracking-widest uppercase text-zinc-500 border-t border-zinc-900 mt-auto">
        TrustMesh · x402 Protocol · Algorand · ETHGlobal 2026
      </footer>

    </div>
  );
}
