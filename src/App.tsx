import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import { Separator } from "@/components/ui/separator";
import {
  Globe,
  Shield,
  Zap,
  FileSearch,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Flame,
  Wifi,
  Smartphone,
  Monitor,
  Eye,
  Accessibility,
  Gauge,
  Timer,
  LayoutDashboard,
  Move,
  AlertTriangle,
} from "lucide-react";
import "./index.css";

// ─── Types ───

interface Vital {
  value: number;
  score: number;
  display: string;
}

interface AuditItem {
  title: string;
  score: number | null;
  displayValue?: string;
}

interface AnalysisResult {
  url: string;
  requestedUrl: string;
  timestamp: string;
  strategy: string;
  engine: string;
  scores: {
    performance: number;
    seo: number;
    bestPractices: number;
    accessibility: number;
    overall: number;
  };
  vitals: {
    fcp: Vital;
    lcp: Vital;
    tbt: Vital;
    cls: Vital;
    si: Vital;
    tti: Vital;
    ttfb: Vital;
  };
  audits: {
    performance: AuditItem[];
    seo: AuditItem[];
    bestPractices: AuditItem[];
    accessibility: AuditItem[];
  };
  pageInfo: {
    title: string;
    screenshot: string | null;
  };
}

// ─── Helpers ───

function getScoreHeat(score: number) {
  if (score >= 90) return { label: "COOL", color: "#6ee7b7", glow: "glow-green" };
  if (score >= 50) return { label: "WARM", color: "#f0944a", glow: "glow-amber" };
  return { label: "HOT", color: "#ef4444", glow: "glow-red" };
}

// Lighthouse uses green 90+, orange 50-89, red 0-49
function getScoreColorHex(score: number): string {
  if (score >= 90) return "#6ee7b7";
  if (score >= 50) return "#f0944a";
  return "#ef4444";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "GOOD";
  if (score >= 50) return "NEEDS WORK";
  return "POOR";
}

// ─── Animated score counter ───

function AnimatedScore({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value]);

  return <span className={className} style={style}>{display}</span>;
}

// ─── Heat grid with animated cells ───

function HeatGrid({ score, size = 5, delay = 0 }: { score: number; size?: number; delay?: number }) {
  const filledCount = Math.round((score / 100) * (size * size));
  const color = getScoreColorHex(score);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const cells = [];
  for (let i = 0; i < size * size; i++) {
    const isFilled = i < filledCount;
    cells.push(
      <div
        key={i}
        className="heat-cell"
        style={{
          backgroundColor: visible && isFilled ? color : "#1c1c1f",
          opacity: visible && isFilled ? 0.5 + 0.5 * (i / (size * size)) : 0.2,
          transitionDelay: visible ? `${i * 25}ms` : "0ms",
        }}
      />
    );
  }
  return (
    <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${size}, 10px)` }}>
      {cells}
    </div>
  );
}

// ─── Floating dots ───

function DotScatter({ count = 40 }: { count?: number }) {
  const dots = useMemo(() => {
    const result = [];
    const colors = ["#6ee7b7", "#e0c65c", "#f0944a", "#f06050", "#ef4444", "#f59e3f"];
    for (let i = 0; i < count; i++) {
      result.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        opacity: 0.2 + Math.random() * 0.55,
        color: colors[Math.floor(Math.random() * colors.length)]!,
        dur: 6 + Math.random() * 8,
        delay: Math.random() * -10,
        size: 2 + Math.random() * 2,
      });
    }
    return result;
  }, [count]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((dot, i) => (
        <div
          key={i}
          className="absolute rounded-full anim-float"
          style={{
            left: `${dot.x}%`, top: `${dot.y}%`,
            width: dot.size, height: dot.size,
            backgroundColor: dot.color,
            "--dot-opacity": dot.opacity,
            "--float-dur": `${dot.dur}s`,
            "--float-delay": `${dot.delay}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ─── Section header ───

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const spaced = title.split("").join("\u2009");
  return (
    <div className="relative mb-6">
      <h2 className="text-2xl font-bold tracking-[0.3em] uppercase text-foreground relative">
        {spaced}<span className="text-[#f59e3f]">.</span>
      </h2>
      <p className="text-xs tracking-[0.25em] uppercase text-[#f59e3f] mt-1 relative">{subtitle}</p>
    </div>
  );
}

// ─── Score card ───

function ScoreCard({ score, label, icon: Icon, delay = 0 }: { score: number; label: string; icon: any; delay?: number }) {
  const color = getScoreColorHex(score);
  return (
    <div
      className="anim-card-enter p-4 sm:p-5 border border-[#2a2a2e] bg-[#111113] relative overflow-hidden hover-glow transition-all duration-300 group"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] sm:text-[11px] tracking-[0.15em] uppercase text-[#999]">{label}</span>
        <Icon className="size-3.5 text-[#555] group-hover:text-[#f59e3f] transition-colors duration-300" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <AnimatedScore
            value={score}
            className="text-2xl sm:text-3xl font-bold tracking-tight anim-score-pop"
            style={{ color, textShadow: `0 0 24px ${color}50`, animationDelay: `${delay + 200}ms` }}
          />
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color }}>
              {getScoreLabel(score)}
            </span>
          </div>
        </div>
        <HeatGrid score={score} size={4} delay={delay + 400} />
      </div>
    </div>
  );
}

// ─── Vital metric card ───

function VitalCard({ label, display, score, icon: Icon, delay = 0 }: {
  label: string; display: string; score: number; icon: any; delay?: number;
}) {
  const color = getScoreColorHex(score);
  return (
    <div
      className="anim-card-enter p-4 border border-[#2a2a2e] bg-[#111113] hover-glow transition-all duration-300 group"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-3 text-[#666] group-hover:text-[#f59e3f] transition-colors" />
        <span className="text-[10px] tracking-[0.12em] uppercase text-[#999]">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums" style={{ color }}>{display}</p>
      <div className="h-1.5 bg-[#1c1c1f] overflow-hidden mt-2">
        <div
          className="h-full anim-bar-fill"
          style={{
            width: `${score}%`,
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}40`,
            animationDelay: `${delay + 300}ms`,
          }}
        />
      </div>
    </div>
  );
}

// ─── Audit check item ───

function AuditItem({ audit, index = 0 }: { audit: AuditItem; index?: number }) {
  const passed = audit.score !== null && audit.score >= 0.9;
  const warn = audit.score !== null && audit.score >= 0.5 && audit.score < 0.9;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#1c1c1f] last:border-0 animate-in fade-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${index * 40}ms`, animationFillMode: "backwards" }}>
      {passed ? (
        <CheckCircle2 className="size-3.5 text-[#6ee7b7] shrink-0" />
      ) : warn ? (
        <AlertTriangle className="size-3.5 text-[#f0944a] shrink-0" />
      ) : (
        <XCircle className="size-3.5 text-[#ef4444] shrink-0" />
      )}
      <span className={`text-xs font-mono flex-1 ${passed ? "text-[#ccc]" : warn ? "text-[#bbb]" : "text-[#999]"}`}>
        {audit.title}
      </span>
      {audit.displayValue && (
        <span className="text-[10px] text-[#888] tabular-nums shrink-0">{audit.displayValue}</span>
      )}
      <span
        className={`text-[10px] tracking-wider uppercase font-bold shrink-0 ${
          passed ? "text-[#6ee7b7]" : warn ? "text-[#f0944a]" : "text-[#ef4444]"
        }`}
      >
        {passed ? "PASS" : warn ? "WARN" : "FAIL"}
      </span>
    </div>
  );
}

// ─── Loading skeleton ───

function LoadingSkeleton({ elapsed }: { elapsed: number }) {
  return (
    <div className="space-y-6 py-8">
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="relative">
          <div className="size-20 border border-[#2a2a2e] relative overflow-hidden scan-line">
            <div className="absolute inset-0 bg-[#111113]" />
            <Flame className="absolute inset-0 m-auto size-8 text-[#f59e3f] animate-pulse" />
          </div>
          <div className="absolute -inset-3 border border-[#f59e3f]/20 anim-pulse-ring" />
          <div className="absolute -inset-6 border border-[#f59e3f]/10 anim-pulse-ring" style={{ animationDelay: "0.5s" }} />
        </div>
        <div className="text-center space-y-2">
          <p className="text-xs tracking-[0.25em] uppercase text-[#ccc] animate-pulse">
            Running Lighthouse audit
          </p>
          <p className="text-xs text-[#888] font-mono cursor-blink max-w-xs truncate">
            &gt; {elapsed < 5 ? "connecting" : elapsed < 15 ? "rendering page" : elapsed < 25 ? "running audits" : "almost done"}...
          </p>
          <p className="text-[10px] text-[#666] tabular-nums mt-1">{elapsed}s</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 anim-shimmer" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 anim-shimmer" style={{ animationDelay: `${(i + 4) * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Heat legend (Lighthouse thresholds) ───

function HeatLegend() {
  const levels = [
    { label: "GOOD", color: "#6ee7b7", range: "90-100" },
    { label: "NEEDS WORK", color: "#f0944a", range: "50-89" },
    { label: "POOR", color: "#ef4444", range: "0-49" },
  ];
  return (
    <div className="flex items-center justify-center gap-6 py-3 flex-wrap">
      {levels.map((item) => (
        <div key={item.label} className="flex items-center gap-2 group cursor-default">
          <div className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-[10px] tracking-wider uppercase font-bold" style={{ color: item.color }}>
            {item.label}
          </span>
          <span className="text-[10px] text-[#666]">{item.range}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Audit section for a category ───

function AuditSection({ audits, icon: Icon, label }: { audits: AuditItem[]; icon: any; label: string }) {
  const failed = audits.filter((a) => a.score !== null && a.score < 0.9);
  const passed = audits.filter((a) => a.score !== null && a.score >= 0.9);

  return (
    <div className="space-y-4">
      {failed.length > 0 && (
        <div className="p-5 border border-[#2a2a2e] bg-[#111113]">
          <div className="flex items-center gap-2 mb-4">
            <Icon className="size-3.5 text-[#f59e3f]" />
            <span className="text-[11px] tracking-[0.2em] uppercase text-[#bbb]">
              Opportunities &amp; Diagnostics
            </span>
            <Badge variant="outline" className="text-[9px] tracking-wider uppercase border-[#ef4444]/30 text-[#ef4444] bg-transparent font-mono px-1.5 ml-auto">
              {failed.length}
            </Badge>
          </div>
          {failed.map((audit, i) => (
            <AuditItem key={audit.title} audit={audit} index={i} />
          ))}
        </div>
      )}

      {passed.length > 0 && (
        <div className="p-5 border border-[#2a2a2e] bg-[#111113]">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="size-3.5 text-[#6ee7b7]" />
            <span className="text-[11px] tracking-[0.2em] uppercase text-[#bbb]">
              Passed Audits
            </span>
            <Badge variant="outline" className="text-[9px] tracking-wider uppercase border-[#6ee7b7]/30 text-[#6ee7b7] bg-transparent font-mono px-1.5 ml-auto">
              {passed.length}
            </Badge>
          </div>
          {passed.map((audit, i) => (
            <AuditItem key={audit.title} audit={audit} index={i} />
          ))}
        </div>
      )}

      {audits.length === 0 && (
        <div className="p-5 border border-[#2a2a2e] bg-[#111113] text-center">
          <p className="text-xs text-[#666]">No audits available for this category.</p>
        </div>
      )}
    </div>
  );
}

// ─── Audit Tabs (with re-render on switch) ───

function AuditTabs({ data }: { data: AnalysisResult }) {
  const [activeTab, setActiveTab] = useState("performance");
  const tabs = [
    { value: "performance", icon: Zap, label: "PERF", audits: data.audits.performance },
    { value: "accessibility", icon: Accessibility, label: "A11Y", audits: data.audits.accessibility },
    { value: "bestPractices", icon: Shield, label: "BEST", audits: data.audits.bestPractices },
    { value: "seo", icon: FileSearch, label: "SEO", audits: data.audits.seo },
  ];
  const active = tabs.find((t) => t.value === activeTab) || tabs[0]!;

  return (
    <div className="w-full space-y-4">
      <div className="w-full grid grid-cols-4 bg-[#111113] border border-[#2a2a2e] overflow-hidden">
        {tabs.map((tab, i) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex items-center justify-center gap-1 text-[10px] sm:text-[11px] tracking-[0.12em] uppercase py-2.5 sm:py-3 transition-colors duration-300 ${
              i < 3 ? "border-r border-[#2a2a2e]" : ""
            } ${
              activeTab === tab.value
                ? "bg-[#1c1c1f] text-[#f59e3f]"
                : "text-[#999] hover:text-[#ccc] hover:bg-[#151517]"
            }`}
          >
            <tab.icon className="size-3" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>
      {/* Key forces remount so animations replay */}
      <div key={activeTab}>
        <AuditSection audits={active.audits} icon={active.icon} label={active.label} />
      </div>
    </div>
  );
}

// ─── Results View ───

function ResultsView({ data }: { data: AnalysisResult }) {
  const overallHeat = getScoreHeat(data.scores.overall);

  return (
    <div className="space-y-8 anim-stagger">
      {/* Target info */}
      <div className="p-5 border border-[#2a2a2e] bg-[#0d0d0f] relative overflow-hidden scan-line">
        <div className="flex items-center gap-2 text-[11px] text-[#999] mb-3">
          <Terminal className="size-3 text-[#f59e3f]" />
          <span className="tracking-[0.2em] uppercase">Target</span>
          <Badge variant="outline" className="text-[9px] tracking-wider uppercase border-[#3a3a3a] text-[#ccc] bg-[#1c1c1f] font-mono px-2 ml-2">
            {data.strategy}
          </Badge>
          <Wifi className="size-3 text-[#6ee7b7] ml-auto animate-pulse" />
        </div>
        <p className="text-sm font-bold text-foreground truncate">
          {data.pageInfo.title || data.url}
        </p>
        <p className="text-xs text-[#888] mt-1.5 truncate font-mono">{data.url}</p>
      </div>

      {/* Score cards */}
      <div>
        <SectionHeader title="SCORES" subtitle="lighthouse" />
        <DotScatter count={35} />

        {/* Overall card */}
        <div
          className="anim-card-enter p-5 border border-[#f59e3f]/30 bg-[#111113] relative overflow-hidden hover-glow mb-3"
          style={{ animationDelay: "0ms" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] tracking-[0.15em] uppercase text-[#f59e3f]/80 block mb-2">Overall</span>
              <AnimatedScore
                value={data.scores.overall}
                className={`text-5xl font-bold tracking-tight block ${overallHeat.glow}`}
                style={{ color: overallHeat.color }}
              />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase mt-2 block" style={{ color: overallHeat.color }}>
                {getScoreLabel(data.scores.overall)}
              </span>
            </div>
            <HeatGrid score={data.scores.overall} size={6} delay={600} />
          </div>
        </div>

        {/* Category cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative">
          <ScoreCard score={data.scores.performance} label="Performance" icon={Zap} delay={100} />
          <ScoreCard score={data.scores.accessibility} label="Accessibility" icon={Accessibility} delay={200} />
          <ScoreCard score={data.scores.bestPractices} label="Best Practices" icon={Shield} delay={300} />
          <ScoreCard score={data.scores.seo} label="SEO" icon={FileSearch} delay={400} />
        </div>
      </div>

      {/* Score summary bar */}
      <div className="flex items-center justify-center gap-5 py-3 flex-wrap">
        {[
          { label: "Performance", score: data.scores.performance },
          { label: "Accessibility", score: data.scores.accessibility },
          { label: "Best Practices", score: data.scores.bestPractices },
          { label: "SEO", score: data.scores.seo },
        ].map((item) => {
          const color = getScoreColorHex(item.score);
          return (
            <div key={item.label} className="flex items-center gap-2 cursor-default">
              <div className="size-2.5" style={{ backgroundColor: color }} />
              <span className="text-[10px] tracking-wider uppercase" style={{ color }}>{item.label}</span>
              <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{item.score}</span>
            </div>
          );
        })}
      </div>

      {/* Core Web Vitals */}
      <div>
        <SectionHeader title="VITALS" subtitle="core web vitals" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <VitalCard label="FCP" display={data.vitals.fcp.display} score={data.vitals.fcp.score} icon={Timer} delay={0} />
          <VitalCard label="LCP" display={data.vitals.lcp.display} score={data.vitals.lcp.score} icon={LayoutDashboard} delay={80} />
          <VitalCard label="TBT" display={data.vitals.tbt.display} score={data.vitals.tbt.score} icon={Clock} delay={160} />
          <VitalCard label="CLS" display={data.vitals.cls.display} score={data.vitals.cls.score} icon={Move} delay={240} />
          <VitalCard label="Speed Index" display={data.vitals.si.display} score={data.vitals.si.score} icon={Gauge} delay={320} />
          <VitalCard label="TTI" display={data.vitals.tti.display} score={data.vitals.tti.score} icon={Eye} delay={400} />
          <VitalCard label="TTFB" display={data.vitals.ttfb.display} score={data.vitals.ttfb.score} icon={Globe} delay={480} />
        </div>
      </div>

      {/* Detailed audit tabs */}
      <AuditTabs data={data} />

      {/* Timestamp */}
      <div className="text-center py-3">
        <span className="text-[10px] text-[#666] tracking-wider uppercase font-mono">
          {data.engine === "lighthouse" ? "powered by google lighthouse" : "powered by site-metrics engine"} &middot; {new Date(data.timestamp).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ─── Strategy Toggle ───

function StrategyToggle({ value, onChange }: { value: "mobile" | "desktop"; onChange: (v: "mobile" | "desktop") => void }) {
  return (
    <div className="inline-flex border border-[#3a3a3a] overflow-hidden" role="radiogroup" aria-label="Analysis strategy">
      <button
        type="button"
        role="radio"
        aria-checked={value === "mobile"}
        onClick={() => onChange("mobile")}
        className={`flex items-center gap-1.5 px-3 py-2 text-[10px] tracking-wider uppercase transition-all duration-200 ${
          value === "mobile"
            ? "bg-[#f59e3f] text-[#09090b] font-bold"
            : "bg-[#111113] text-[#888] hover:text-[#ccc]"
        }`}
      >
        <Smartphone className="size-3" aria-hidden="true" />
        Mobile
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "desktop"}
        onClick={() => onChange("desktop")}
        className={`flex items-center gap-1.5 px-3 py-2 text-[10px] tracking-wider uppercase transition-all duration-200 ${
          value === "desktop"
            ? "bg-[#f59e3f] text-[#09090b] font-bold"
            : "bg-[#111113] text-[#888] hover:text-[#ccc]"
        }`}
      >
        <Monitor className="size-3" aria-hidden="true" />
        Desktop
      </button>
    </div>
  );
}

// ─── Main App ───

export function App() {
  const [url, setUrl] = useState("");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("desktop");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), strategy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze URL");
      setResults(data as AnalysisResult);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col">
      {/* Skip navigation */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-[#f59e3f] focus:text-[#09090b] focus:px-4 focus:py-2 focus:text-xs focus:font-bold focus:tracking-wider focus:uppercase">
        Skip to main content
      </a>

      {/* Hero */}
      <header role="banner" aria-label="Site header" className="relative border-b border-[#1c1c1f] overflow-hidden">
        <DotScatter count={60} />
        <nav aria-label="URL analyzer" className="relative max-w-3xl mx-auto px-4 pt-20 pb-14 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight anim-hero-title">
            <span className="text-foreground">SITE-</span>
            <span className="text-[#f59e3f]">METRICS</span>
            <Flame className="inline-block size-8 text-[#f59e3f] ml-1 -mt-1 animate-pulse" aria-hidden="true" />
          </h1>
          <p className="mt-4 text-sm text-[#999] tracking-wide anim-hero-sub">
            Lighthouse-calibrated scoring, instantly.
          </p>

          <div className="mt-10 max-w-xl mx-auto space-y-3 anim-hero-input">
            <form
              onSubmit={(e) => { e.preventDefault(); handleAnalyze(); }}
              className="flex gap-0"
              role="search"
              aria-label="Analyze a website URL"
            >
              <div className="relative flex-1">
                <label htmlFor="url-input" className="sr-only">Website URL</label>
                <Input
                  id="url-input"
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-12 bg-[#0d0d0f] border border-[#3a3a3a] text-sm text-foreground placeholder:text-[#666] font-mono px-4 focus-visible:ring-0 focus-visible:border-[#f59e3f] transition-all duration-300"
                  disabled={loading}
                  aria-describedby="url-hint"
                />
                <span id="url-hint" className="sr-only">Enter a full website URL to analyze its performance</span>
              </div>
              <Button
                type="submit"
                disabled={loading || !url.trim()}
                aria-label={loading ? "Analyzing website" : "Analyze website"}
                className="h-12 px-7 bg-[#f59e3f] hover:bg-[#e08a2a] text-[#09090b] font-bold text-xs tracking-[0.2em] uppercase border-0 transition-all duration-300 hover:shadow-[0_0_20px_rgba(245,158,63,0.3)] disabled:opacity-30"
              >
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "ANALYZE"}
              </Button>
            </form>
            <div className="flex justify-center">
              <StrategyToggle value={strategy} onChange={setStrategy} />
            </div>
          </div>
        </nav>
      </header>

      {/* Content */}
      <main id="main-content" role="main" aria-label="Analysis results" className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">
        {loading && <LoadingSkeleton elapsed={elapsed} />}

        {error && (
          <div className="p-5 border border-[#ef4444]/30 bg-[#111113] anim-card-enter relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-[#ef4444]/5 to-transparent pointer-events-none" />
            <div className="flex items-start gap-3 relative">
              <XCircle className="size-4 text-[#ef4444] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold tracking-[0.15em] uppercase text-[#ef4444]">Analysis Failed</p>
                <p className="text-xs text-[#ccc] mt-2 font-mono break-all">{error}</p>
                <p className="text-[10px] text-[#888] mt-2">Make sure the URL is correct and accessible.</p>
              </div>
            </div>
          </div>
        )}

        {results && <ResultsView data={results} />}

        {!loading && !error && !results && (
          <div className="py-16 anim-stagger">
            <div className="p-6 border border-[#2a2a2e] bg-[#111113] mb-8 relative overflow-hidden scan-line">
              <SectionHeader title="METRICS" subtitle="explained" />
              <div className="flex items-center gap-2 text-xs text-[#888] mb-4">
                <Flame className="size-3 text-[#f59e3f]" />
                <span className="tracking-wider uppercase text-[#bbb]">:://engine</span>
                <span className="text-[#777] italic ml-2">"Lighthouse-calibrated scoring."</span>
              </div>
              <Separator className="bg-[#2a2a2e] mb-4" />
              <p className="text-xs text-[#bbb] leading-relaxed">
                Site-Metrics analyzes real page loads using Lighthouse-calibrated log-normal scoring
                curves. Get Performance, Accessibility, Best Practices, and SEO scores with Core Web
                Vitals and detailed audit results — no external API, instant results.
              </p>
              <div className="mt-6">
                <HeatLegend />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Zap, title: "Performance", desc: "FCP, LCP, TBT, CLS" },
                { icon: Accessibility, title: "Accessibility", desc: "A11y audits" },
                { icon: Shield, title: "Best Practices", desc: "Security & modern web" },
                { icon: FileSearch, title: "SEO", desc: "Meta tags & crawlability" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-5 border border-[#2a2a2e] bg-[#111113] text-center group hover-glow transition-all duration-300 cursor-default"
                >
                  <item.icon className="size-5 mx-auto text-[#666] group-hover:text-[#f59e3f] transition-colors duration-500" />
                  <p className="text-[10px] font-bold tracking-[0.12em] uppercase mt-3 text-foreground">{item.title}</p>
                  <p className="text-[10px] text-[#888] mt-1.5 tracking-wide">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer role="contentinfo" aria-label="Site footer" className="border-t border-[#1c1c1f] mt-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 flex items-center justify-between">
          <p className="text-[10px] text-[#666] tracking-wider uppercase">
            &copy; 2026 SITE-METRICS
          </p>
          <p className="text-[10px] tracking-wider" aria-label="Site-Metrics logo">
            <span className="text-[#f59e3f] font-bold">SITE</span>
            <span className="text-[#999]">METRICS</span>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
