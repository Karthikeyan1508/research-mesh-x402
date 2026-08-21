"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface Step {
  id: string;
  name: string;
  price: string;
  wallet: string;
  desc: string;
  logs: string[];
}

const SIDEBAR_STEPS: Step[] = [
  {
    id: "provenance",
    name: "Provenance Agent",
    price: "$0.010 USDC",
    wallet: "PP7JICROIH27MQHZDQUKNH6JZMQRVHQC56E7PICJZR7AL4USZ5HECOXNZM",
    desc: "Validating content credentials & verifying C2PA cryptographic signatures.",
    logs: [
      "Querying Local Bazaar registry for capability 'provenance'...",
      "Discovered candidate agent at http://provenance-agent:4021.",
      "Resolving x402 payment gateway challenge...",
      "USDC Payment settled. Tx ID: JO2BX10K... (Algorand Testnet)",
      "Checking image URL for C2PA manifest store headers...",
      "No cryptographic manifest found. Falling back to Tavily search index...",
      "Completed search aggregation. 4 verified web links resolved."
    ]
  },
  {
    id: "verification",
    name: "Verification Agent",
    price: "$0.005 USDC",
    wallet: "DJ6DHDJCWWUCG5DJTM35HHI3JMJGJZWEEPQZ63L2HBKGZEYUMMDFBR7M4Y",
    desc: "Extracting core claim via LLM and cross-checking facts with Tavily search.",
    logs: [
      "Submitting results payload to LLM model for claim extraction...",
      "Extracted claim: 'Falcon-1024 post-quantum signatures incorporated directly into Algorand protocol.'",
      "Querying Local Bazaar registry for capability 'verification'...",
      "Discovered candidate agent at http://verification-agent:4023.",
      "Resolving x402 payment gateway challenge...",
      "USDC Payment settled. Tx ID: EV39XJ28... (Algorand Testnet)",
      "Performing verification queries on candidate search indices...",
      "Cross-checked references from github.com/algorandfoundation and hacken.io.",
      "Completed claim check. Verdict: TRUE (Confidence: 95%)."
    ]
  },
  {
    id: "synthesis",
    name: "Trust Synthesis Agent",
    price: "$0.005 USDC",
    wallet: "AN62GPJEJC433MRIPGL2I6LGKTCQCKJC7B76YEUPNBPOPBHCDHMCESELS4",
    desc: "Aggregating credibility vectors and compiling the consensus report.",
    logs: [
      "Querying Local Bazaar registry for capability 'synthesis'...",
      "Discovered candidate agent at http://trust-synthesis-agent:4022.",
      "Resolving x402 payment gateway challenge...",
      "USDC Payment settled. Tx ID: CQ98PU21... (Algorand Testnet)",
      "Consolidating credibility parameters (C2PA signature = 0.0, fact check = 1.0)...",
      "Computing final Trust Score: 85/100 (Inferred cap applied).",
      "Drafting final structured consensus report..."
    ]
  },
  {
    id: "translation",
    name: "Translation Agent",
    price: "$0.005 USDC",
    wallet: "35QW4DRG47SW2HOIRAS4QCYT3VBV54UKAQ7G55KECFTNKQ6NEGEGUBIOMU",
    desc: "Detecting target locale and translating report using LLM translation model.",
    logs: [
      "Detecting translation preference... Found target language: translateTo.",
      "Querying Local Bazaar registry for capability 'translation'...",
      "Discovered candidate agent at http://translation-agent:4024.",
      "Resolving x402 payment gateway challenge...",
      "USDC Payment settled. Tx ID: TX102K88... (Algorand Testnet)",
      "Translating consensus report using Gemini translation model...",
      "Translation complete. Rendering translated report."
    ]
  }
];

interface OrchestrationSidebarProps {
  loading: boolean;
  hasTranslation: boolean;
  completedData: any;
}

export function OrchestrationSidebar({
  loading,
  hasTranslation,
  completedData
}: OrchestrationSidebarProps) {
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Filter steps to include translation only if selected
  const activeSteps = hasTranslation
    ? SIDEBAR_STEPS
    : SIDEBAR_STEPS.filter((s) => s.id !== "translation");

  useEffect(() => {
    if (!loading) {
      if (completedData) {
        // Immediately complete all steps and load all logs
        setCompletedSteps(activeSteps.map((s) => s.id));
        setActiveStepIdx(activeSteps.length);
        const allLogs: string[] = [];
        activeSteps.forEach((s) => {
          allLogs.push(`[${s.name.toUpperCase()}] -- INITIALIZED`);
          s.logs.forEach(log => {
            if (completedData.translateTo && s.id === "translation") {
              allLogs.push(log.replace("translateTo", completedData.translateTo));
            } else {
              allLogs.push(log);
            }
          });
          allLogs.push(`[${s.name.toUpperCase()}] -- COMPLETED`);
        });
        setVisibleLogs(allLogs);
      } else {
        // Reset state when not loading and no data
        setActiveStepIdx(0);
        setVisibleLogs([]);
        setCompletedSteps([]);
      }
      return;
    }

    // Reset for loading
    setActiveStepIdx(0);
    setVisibleLogs(["[SYSTEM] Pipeline execution started. Resolving agents..."]);
    setCompletedSteps([]);

    let stepTimer: NodeJS.Timeout;
    let logTimer: NodeJS.Timeout;
    let currentStep = 0;
    let logIndex = 0;

    const runTimers = () => {
      if (currentStep >= activeSteps.length) return;

      const step = activeSteps[currentStep];
      setActiveStepIdx(currentStep);
      setVisibleLogs((prev) => [...prev, `[${step.name.toUpperCase()}] -- INITIALIZED`]);

      const postLogs = () => {
        if (logIndex < step.logs.length) {
          const logMsg = step.logs[logIndex];
          setVisibleLogs((prev) => [...prev, logMsg]);
          logIndex++;
          logTimer = setTimeout(postLogs, 800 + Math.random() * 500);
        } else {
          setVisibleLogs((prev) => [...prev, `[${step.name.toUpperCase()}] -- COMPLETED`]);
          setCompletedSteps((prev) => [...prev, step.id]);
          currentStep++;
          logIndex = 0;
          if (currentStep < activeSteps.length) {
            stepTimer = setTimeout(runTimers, 1000);
          }
        }
      };

      logTimer = setTimeout(postLogs, 500);
    };

    runTimers();

    return () => {
      clearTimeout(stepTimer);
      clearTimeout(logTimer);
    };
  }, [loading, completedData, hasTranslation]);

  // Scroll to bottom of logs when new logs are added
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [visibleLogs]);

  return (
    <Card className="tm-glass flex flex-col h-[calc(100vh-140px)] sticky top-[96px] w-full">
      <CardHeader className="pb-3 pt-5 px-6 shrink-0 border-b border-zinc-800 bg-zinc-950/20">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold tracking-widest uppercase text-zinc-400">
            Orchestration Control Center
          </p>
          <span className="text-[9px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800 px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
            Active Trace
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-6 py-4 flex-1 flex flex-col min-h-0 overflow-y-auto gap-5">
        {/* Pipeline Visual Flow */}
        <div className="flex flex-col gap-4">
          {activeSteps.map((step, idx) => {
            const isActive = idx === activeStepIdx && loading;
            const isCompleted = completedSteps.includes(step.id);
            const isPending = idx > activeStepIdx && loading;

            return (
              <div key={step.id} className="relative flex gap-4 items-start">
                {/* Vertical Line Connector */}
                {idx < activeSteps.length - 1 && (
                  <div
                    className={`absolute left-3 top-7 bottom-0 w-0.5 -translate-x-1/2 transition-colors duration-500 ${
                      isCompleted ? "bg-emerald-500" : "bg-zinc-800"
                    }`}
                  />
                )}

                {/* Status Dot / Spinner */}
                <div
                  className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 text-[10px] font-mono font-bold z-10 transition-all duration-300 ${
                    isCompleted
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : isActive
                      ? "border-blue-500 bg-blue-500/10 text-blue-400 animate-pulse"
                      : "border-zinc-800 bg-zinc-900/50 text-zinc-600"
                  }`}
                >
                  {isCompleted ? "✓" : isActive ? "▶" : idx + 1}
                </div>

                {/* Step Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4
                      className={`text-xs font-semibold uppercase tracking-wider transition-colors duration-300 ${
                        isActive
                          ? "text-white"
                          : isCompleted
                          ? "text-zinc-200"
                          : "text-zinc-500"
                      }`}
                    >
                      {step.name}
                    </h4>
                    <span className="text-[10px] font-mono text-zinc-400 font-medium">
                      {step.price}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">
                    {step.desc}
                  </p>
                  {isCompleted && (
                    <div className="text-[9px] font-mono text-zinc-400 mt-1 truncate">
                      Wallet: <span className="opacity-60">{step.wallet}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Separator className="bg-zinc-800 shrink-0" />

        {/* Live Logs Ticker */}
        <div className="flex-1 min-h-0 flex flex-col bg-zinc-950/60 rounded-md border border-zinc-800 p-4 font-mono text-xs leading-relaxed text-zinc-400">
          <div className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider mb-2 border-b border-zinc-800 pb-1.5 shrink-0 flex items-center justify-between">
            <span>Terminal Output</span>
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
          </div>
          <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-2">
            {visibleLogs.map((log, idx) => {
              let color = "text-zinc-400";
              if (log.startsWith("[SYSTEM]")) color = "text-blue-400 font-bold";
              else if (log.endsWith("-- INITIALIZED")) color = "text-indigo-400 font-semibold";
              else if (log.endsWith("-- COMPLETED")) color = "text-emerald-400 font-semibold";
              else if (log.includes("Payment settled")) color = "text-sky-300 font-semibold";

              return (
                <div key={idx} className={`${color} break-all`}>
                  {log}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
