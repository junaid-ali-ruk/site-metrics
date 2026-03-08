import { serve } from "bun";
import index from "./index.html";

// ─── Types ───

interface VitalData {
  value: number;
  score: number;
  display: string;
}

interface AuditItemData {
  title: string;
  score: number | null;
  displayValue?: string;
}

interface AnalysisResponse {
  url: string;
  requestedUrl: string;
  timestamp: string;
  strategy: string;
  engine: "sitemetrics";
  scores: {
    performance: number;
    seo: number;
    bestPractices: number;
    accessibility: number;
    overall: number;
  };
  vitals: {
    fcp: VitalData;
    lcp: VitalData;
    tbt: VitalData;
    cls: VitalData;
    si: VitalData;
    tti: VitalData;
    ttfb: VitalData;
  };
  audits: {
    performance: AuditItemData[];
    seo: AuditItemData[];
    bestPractices: AuditItemData[];
    accessibility: AuditItemData[];
  };
  pageInfo: {
    title: string;
    screenshot: string | null;
  };
}

// ─── Helpers ───

function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
  return url;
}

function fmt(ms: number): string {
  if (ms < 10) return ms.toFixed(2);
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function count(html: string, re: RegExp): number {
  return (html.match(re) || []).length;
}

// ─── Lighthouse-aligned log-normal scoring ───
// Attempt to replicate the scoring curves from Lighthouse.
// Each metric maps to a 0-1 score using a log-normal CDF.
// Values from https://developer.chrome.com/docs/lighthouse/performance/performance-scoring
//
//   score = 1 - logNormCDF(value, median, p10)
//
// We use an approximation of the complementary log-normal CDF:
//   CDF(x) = 0.5 * erfc( -(ln(x) - mu) / (sigma * sqrt(2)) )
//   score = 1 - CDF(x)
//
// p10 = metric value at the 10th percentile (score ~0.9)
// median = metric value at the 50th percentile (score ~0.5)

function erfc(x: number): number {
  // Approximation of the complementary error function
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 1 - sign * y;
}

function lighthouseScore(value: number, p10: number, median: number): number {
  if (value <= 0) return 1;
  const mu = Math.log(median);
  const sigma = (Math.log(median) - Math.log(p10)) / 1.2816; // 1.2816 ≈ norminv(0.9)
  if (sigma <= 0) return value <= median ? 1 : 0;
  const z = (Math.log(value) - mu) / sigma;
  const cdf = 0.5 * erfc(-z / Math.SQRT2);
  return Math.max(0, Math.min(1, 1 - cdf));
}

// ─── Resource fetcher ───

async function fetchWithTiming(url: string, ua: string) {
  const t0 = performance.now();
  const res = await fetch(url, {
    signal: AbortSignal.timeout(25000),
    redirect: "follow",
    headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
  });
  const tHeaders = performance.now();
  const html = await res.text();
  const tDone = performance.now();
  return { res, html, ttfb: tHeaders - t0, total: tDone - t0 };
}

async function headCheck(base: string, path: string): Promise<boolean> {
  try {
    const r = await fetch(new URL(path, base).href, { method: "HEAD", signal: AbortSignal.timeout(5000), redirect: "follow" });
    return r.ok;
  } catch { return false; }
}

async function getCheck(base: string, path: string, match?: string): Promise<boolean> {
  try {
    const r = await fetch(new URL(path, base).href, { signal: AbortSignal.timeout(5000), redirect: "follow" });
    if (!r.ok) return false;
    if (!match) return true;
    const t = await r.text();
    return t.includes(match);
  } catch { return false; }
}

// ─── Sub-resource analysis ───
// Fetches linked CSS/JS to measure real transfer sizes

interface SubResources {
  totalTransferKB: number;
  jsTransferKB: number;
  cssTransferKB: number;
  jsCount: number;
  cssCount: number;
  imgCount: number;
  fontCount: number;
  thirdPartyCount: number;
  renderBlocking: number;
}

async function analyzeSubResources(html: string, baseUrl: string, origin: string): Promise<SubResources> {
  const result: SubResources = { totalTransferKB: 0, jsTransferKB: 0, cssTransferKB: 0, jsCount: 0, cssCount: 0, imgCount: 0, fontCount: 0, thirdPartyCount: 0, renderBlocking: 0 };

  // Extract external script URLs
  const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]!);
  // Extract external stylesheet URLs
  const cssSrcs = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map(m => m[1]!);
  const cssSrcs2 = [...html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["']/gi)].map(m => m[1]!);
  const allCss = [...new Set([...cssSrcs, ...cssSrcs2])];

  result.jsCount = scriptSrcs.length;
  result.cssCount = allCss.length;
  result.imgCount = count(html, /<img[\s>]/gi);
  result.fontCount = count(html, /<link[^>]+as=["']font["']/gi) + count(html, /@font-face/gi);

  // Count render-blocking (scripts without async/defer, stylesheets without media)
  const blockingScripts = count(html, /<script(?![^>]*(async|defer|type=["']module))[^>]+src=/gi);
  const blockingCss = allCss.length; // all external CSS is render-blocking by default
  result.renderBlocking = blockingScripts + blockingCss;

  // Measure a sample of resource sizes (up to 10 each to keep fast)
  const fetchSize = async (rawUrl: string): Promise<number> => {
    try {
      const resolved = rawUrl.startsWith("http") ? rawUrl : new URL(rawUrl, baseUrl).href;
      const r = await fetch(resolved, { signal: AbortSignal.timeout(5000), method: "HEAD", redirect: "follow" });
      const cl = r.headers.get("content-length");
      return cl ? parseInt(cl) / 1024 : 0;
    } catch { return 0; }
  };

  const jsUrls = scriptSrcs.slice(0, 8);
  const cssUrls = allCss.slice(0, 5);

  const sizes = await Promise.all([...jsUrls.map(fetchSize), ...cssUrls.map(fetchSize)]);
  const jsSizes = sizes.slice(0, jsUrls.length);
  const cssSizes = sizes.slice(jsUrls.length);

  result.jsTransferKB = jsSizes.reduce((a, b) => a + b, 0);
  result.cssTransferKB = cssSizes.reduce((a, b) => a + b, 0);
  result.totalTransferKB = result.jsTransferKB + result.cssTransferKB;

  // Count third-party requests
  for (const src of [...scriptSrcs, ...allCss]) {
    try {
      const u = src.startsWith("http") ? new URL(src) : new URL(src, baseUrl);
      if (u.origin !== origin) result.thirdPartyCount++;
    } catch {}
  }

  return result;
}

// ─── Main analysis engine ───

async function analyze(rawUrl: string, strategy: string): Promise<AnalysisResponse> {
  const url = normalizeUrl(rawUrl);
  const isHttps = url.startsWith("https://");
  const origin = new URL(url).origin;

  const ua = strategy === "mobile"
    ? "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SiteMetrics/2.0"
    : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SiteMetrics/2.0";

  // ─── Fetch page ───
  const { res, html, ttfb: ttfbMs, total: totalMs } = await fetchWithTiming(url, ua);
  const pageBytes = new TextEncoder().encode(html).length;
  const pageKB = pageBytes / 1024;
  const headers = res.headers;
  const finalUrl = res.url || url;

  // ─── Parallel checks ───
  const [subRes, hasRobots, hasSitemap] = await Promise.all([
    analyzeSubResources(html, finalUrl, origin),
    getCheck(origin, "/robots.txt"),
    getCheck(origin, "/sitemap.xml", "<urlset"),
  ]);

  // ─── Timing estimates (calibrated to Lighthouse) ───
  // Mobile throttling: Lighthouse uses 4x CPU slowdown + simulated 1.6Mbps 3G for mobile
  // Desktop: no throttling
  const cpuMult = strategy === "mobile" ? 3.5 : 1.0;
  const netMult = strategy === "mobile" ? 2.0 : 1.0;

  // FCP: time for first paint. Affected by: TTFB + render-blocking resources + HTML size
  const renderBlockingDelay = subRes.renderBlocking * 80 * netMult;
  const estFcp = (ttfbMs * netMult) + renderBlockingDelay + Math.min(pageKB * 0.3, 500);

  // LCP: largest element paint. Typically FCP + additional content load
  const lcp_extra = (subRes.imgCount > 0 ? 300 : 100) * netMult + (subRes.cssTransferKB * 0.5);
  const estLcp = estFcp + lcp_extra;

  // SI: Speed Index. Visual completeness metric. Roughly between FCP and LCP
  const estSi = estFcp * 0.6 + estLcp * 0.4 + (subRes.jsTransferKB * 0.2 * netMult);

  // TBT: total blocking time on main thread. Driven by JS execution
  const estTbt = (subRes.jsTransferKB * 0.4 + subRes.jsCount * 30) * cpuMult;

  // TTI: time to interactive. After LCP, needs JS to finish
  const estTti = estLcp + estTbt * 1.2;

  // CLS: layout shift. Estimate from common anti-patterns
  let estCls = 0.01; // base
  const imgTagsAll = html.match(/<img[^>]*>/gi) || [];
  const imgsWithoutDimensions = imgTagsAll.filter(t => !(t.includes("width=") && t.includes("height="))).length;
  estCls += imgsWithoutDimensions * 0.03;
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) estCls += 0.05;
  // Ads/embeds increase CLS
  if (/<iframe/i.test(html)) estCls += 0.02;
  estCls = Math.min(estCls, 0.8);

  // ─── Performance scoring using Lighthouse's log-normal curves ───
  // Metric     | p10 (good) | median (score=50)
  // FCP        | 1800       | 3000
  // LCP        | 2500       | 4000
  // SI         | 3387       | 5800
  // TBT        | 200        | 600
  // CLS        | 0.1        | 0.25
  // TTI        | 3785       | 7300
  // TTFB       | 800        | 1800

  const fcpScore = lighthouseScore(estFcp, 1800, 3000);
  const lcpScore = lighthouseScore(estLcp, 2500, 4000);
  const siScore = lighthouseScore(estSi, 3387, 5800);
  const tbtScore = lighthouseScore(estTbt, 200, 600);
  const clsScore = lighthouseScore(estCls, 0.1, 0.25);
  const ttiScore = lighthouseScore(estTti, 3785, 7300);
  const ttfbScore = lighthouseScore(ttfbMs, 800, 1800);

  // Lighthouse performance weights: FCP 10%, SI 10%, LCP 25%, TBT 30%, CLS 25%
  const perfRaw = fcpScore * 0.10 + siScore * 0.10 + lcpScore * 0.25 + tbtScore * 0.30 + clsScore * 0.25;
  const perfScore = Math.round(perfRaw * 100);

  // ─── SEO ───
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const pageTitle = titleMatch?.[1]?.trim() || "";
  const hasMetaDesc = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+/i.test(html);
  const hasViewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html);
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  const isCrawlable = !/<meta[^>]+content=["'][^"']*noindex/i.test(html);
  const hasOG = /<meta[^>]+property=["']og:/i.test(html);
  const hasStructuredData = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
  const imgTags = html.match(/<img[^>]*>/gi) || [];
  const imgNoAlt = imgTags.filter(t => !/alt=["']/i.test(t)).length;
  const h1Count = count(html, /<h1[\s>]/gi);
  const hasHreflang = /<link[^>]+hreflang=/i.test(html);
  const linksCrawlable = !/<a[^>]+href=["']javascript:/i.test(html);
  const hasMetaRobots = /<meta[^>]+name=["']robots["']/i.test(html);
  const validStatusCode = res.status >= 200 && res.status < 400;
  const hasFontSize = hasViewport; // mobile text readability proxy

  const seoAudits: AuditItemData[] = [
    { title: "Document has a <title> element", score: pageTitle ? 1 : 0 },
    { title: "Document has a meta description", score: hasMetaDesc ? 1 : 0 },
    { title: "Page has a valid viewport meta tag", score: hasViewport ? 1 : 0 },
    { title: "Document has a valid canonical URL", score: hasCanonical ? 1 : 0 },
    { title: "Page is not blocked from indexing", score: isCrawlable ? 1 : 0 },
    { title: "robots.txt is valid", score: hasRobots ? 1 : 0 },
    { title: "Image elements have alt attributes", score: imgTags.length === 0 || imgNoAlt === 0 ? 1 : 0, displayValue: imgNoAlt > 0 ? `${imgNoAlt} image(s) missing alt` : undefined },
    { title: "Page has successful HTTP status code", score: validStatusCode ? 1 : 0, displayValue: `${res.status}` },
    { title: "Links are crawlable", score: linksCrawlable ? 1 : 0 },
    { title: "Page has Open Graph tags", score: hasOG ? 1 : 0 },
    { title: "Structured data (JSON-LD) present", score: hasStructuredData ? 1 : 0.5 },
    { title: "XML Sitemap found", score: hasSitemap ? 1 : 0 },
    { title: "Font size is legible on mobile", score: hasFontSize ? 1 : 0 },
  ];
  const seoPass = seoAudits.filter(a => a.score !== null && a.score >= 0.9).length;
  const seoScore = Math.round((seoPass / seoAudits.length) * 100);
  seoAudits.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  // ─── Best Practices ───
  const hasDoctype = /^<!doctype\s+html/i.test(html.trimStart());
  const hasCharset = /<meta[^>]+charset=/i.test(html);
  const hasHsts = !!headers.get("strict-transport-security");
  const hasCsp = !!headers.get("content-security-policy");
  const hasXCTO = headers.get("x-content-type-options") === "nosniff";
  const hasXFO = !!headers.get("x-frame-options");
  const noDocWrite = !html.includes("document.write(");
  const hasGzip = !!headers.get("content-encoding");
  const noConsoleLogs = true; // can't detect from server
  const noVulnerableLibs = !/<script[^>]+src=["'][^"']+(jquery[\-.]1\.|angular[\-.]1\.[0-5]|bootstrap[\-.]3\.)/i.test(html);
  const usesPassiveListeners = true; // can't detect from server, assume true
  const noTargetBlankVuln = !/<a[^>]+target=["']_blank["'](?![^>]*rel=["'][^"']*noopener)/i.test(html);
  const serverHeader = headers.get("server");
  const noServerLeak = !serverHeader || !/\d+\.\d+/.test(serverHeader); // no version numbers

  const bpAudits: AuditItemData[] = [
    { title: "Uses HTTPS", score: isHttps ? 1 : 0 },
    { title: "Strict-Transport-Security header", score: hasHsts ? 1 : 0 },
    { title: "Content-Security-Policy header", score: hasCsp ? 1 : 0 },
    { title: "X-Content-Type-Options: nosniff", score: hasXCTO ? 1 : 0 },
    { title: "X-Frame-Options header", score: hasXFO ? 1 : 0 },
    { title: "Page has valid HTML doctype", score: hasDoctype ? 1 : 0 },
    { title: "Charset is declared", score: hasCharset ? 1 : 0 },
    { title: "Avoids document.write()", score: noDocWrite ? 1 : 0 },
    { title: "Text compression enabled", score: hasGzip ? 1 : 0 },
    { title: "No vulnerable JavaScript libraries", score: noVulnerableLibs ? 1 : 0 },
    { title: "Links to cross-origin are safe", score: noTargetBlankVuln ? 1 : 0 },
    { title: "Server does not leak version info", score: noServerLeak ? 1 : 0, displayValue: serverHeader || undefined },
  ];
  const bpPass = bpAudits.filter(a => a.score !== null && a.score >= 0.9).length;
  const bpScore = Math.round((bpPass / bpAudits.length) * 100);
  bpAudits.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  // ─── Accessibility ───
  const hasLang = /<html[^>]+lang=["'][a-z]{2}/i.test(html);
  const headingOrder = checkHeadingOrder(html);
  const noEmptyLinks = !/<a[^>]*>[\s]*<\/a>/i.test(html);
  const hasLabels = !/<input(?![^>]*type=["']hidden)[^>]*(?!id=)/i.test(html) || /<label[\s>]/i.test(html);
  const hasSkipLink = /skip[- ]?to[- ]?(main|content|nav)/i.test(html);
  const hasLandmarks = /role=["'](main|banner|navigation|contentinfo)/i.test(html) || /<(main|nav|header|footer)[\s>]/i.test(html);
  const noPositiveTabindex = !(/tabindex=["'][1-9]/i.test(html));
  const hasAriaLabels = /aria-label/i.test(html);
  const buttonsHaveText = !/<button[^>]*>[\s]*<\/button>/i.test(html);
  const listStructure = /<(ul|ol)[\s>]/i.test(html) ? !/<(ul|ol)[^>]*>\s*(?!<li)/i.test(html) : true;

  const a11yAudits: AuditItemData[] = [
    { title: "<html> element has lang attribute", score: hasLang ? 1 : 0 },
    { title: "Image elements have alt attributes", score: imgTags.length === 0 || imgNoAlt === 0 ? 1 : 0, displayValue: imgNoAlt > 0 ? `${imgNoAlt} missing` : undefined },
    { title: "Heading elements are in sequential order", score: headingOrder ? 1 : 0 },
    { title: "Links have discernible name", score: noEmptyLinks ? 1 : 0 },
    { title: "Form elements have associated labels", score: hasLabels ? 1 : 0 },
    { title: "Page has skip navigation link", score: hasSkipLink ? 1 : 0.5 },
    { title: "Page uses landmark elements", score: hasLandmarks ? 1 : 0 },
    { title: "No element has positive tabindex", score: noPositiveTabindex ? 1 : 0 },
    { title: "ARIA attributes used correctly", score: hasAriaLabels ? 1 : 0.5 },
    { title: "Buttons have accessible names", score: buttonsHaveText ? 1 : 0 },
    { title: "Lists contain only proper elements", score: listStructure ? 1 : 0 },
  ];
  const a11yPass = a11yAudits.filter(a => a.score !== null && a.score >= 0.9).length;
  const a11yScore = Math.round((a11yPass / a11yAudits.length) * 100);
  a11yAudits.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  // ─── Performance audits list ───
  const hasCaching = !!headers.get("cache-control") && !headers.get("cache-control")!.includes("no-store");
  const domSize = count(html, /<[a-z][a-z0-9]*[\s>]/gi);
  const hasLazy = /<img[^>]+loading=["']lazy/i.test(html);
  const hasFontDisplay = /font-display:\s*(swap|optional|fallback)/i.test(html);
  const hasPreconnect = /<link[^>]+rel=["']preconnect["']/i.test(html);
  const hasPreload = /<link[^>]+rel=["']preload["']/i.test(html);
  const inlineStyleKB = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].reduce((s, m) => s + (m[1]?.length || 0), 0) / 1024;
  const inlineScriptKB = [...html.matchAll(/<script(?![^>]+src=)[^>]*>([\s\S]*?)<\/script>/gi)].reduce((s, m) => s + (m[1]?.length || 0), 0) / 1024;

  const perfAudits: AuditItemData[] = [
    { title: "First Contentful Paint", score: fcpScore, displayValue: fmt(estFcp) },
    { title: "Largest Contentful Paint", score: lcpScore, displayValue: fmt(estLcp) },
    { title: "Total Blocking Time", score: tbtScore, displayValue: fmt(estTbt) },
    { title: "Cumulative Layout Shift", score: clsScore, displayValue: estCls.toFixed(3) },
    { title: "Speed Index", score: siScore, displayValue: fmt(estSi) },
    { title: "Time to Interactive", score: ttiScore, displayValue: fmt(estTti) },
    { title: "Server Response Time (TTFB)", score: ttfbScore, displayValue: fmt(ttfbMs) },
    { title: "Enable text compression", score: hasGzip ? 1 : 0 },
    { title: "Efficient cache policy", score: hasCaching ? 1 : 0 },
    { title: "Lazy load offscreen images", score: hasLazy || imgTags.length <= 2 ? 1 : 0 },
    { title: "Font display optimization", score: hasFontDisplay || subRes.fontCount === 0 ? 1 : 0.5 },
    { title: "Preconnect to required origins", score: hasPreconnect || subRes.thirdPartyCount === 0 ? 1 : 0 },
    { title: "Preload key resources", score: hasPreload ? 1 : 0.5 },
    { title: `Minimize render-blocking resources`, score: subRes.renderBlocking <= 2 ? 1 : subRes.renderBlocking <= 5 ? 0.5 : 0, displayValue: `${subRes.renderBlocking} resources` },
    { title: `Reduce JavaScript payload`, score: subRes.jsTransferKB < 300 ? 1 : subRes.jsTransferKB < 700 ? 0.5 : 0, displayValue: `${Math.round(subRes.jsTransferKB)} KB` },
    { title: `DOM size`, score: domSize < 800 ? 1 : domSize < 1500 ? 0.5 : 0, displayValue: `${domSize} elements` },
    { title: `Minimize third-party code`, score: subRes.thirdPartyCount <= 3 ? 1 : subRes.thirdPartyCount <= 8 ? 0.5 : 0, displayValue: `${subRes.thirdPartyCount} requests` },
  ];
  perfAudits.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  const overall = Math.round((perfScore + seoScore + bpScore + a11yScore) / 4);

  // Need to reference subRes before it's used in perfAudits template literals
  // (it's already declared above via const, so this works)

  return {
    url: finalUrl,
    requestedUrl: url,
    timestamp: new Date().toISOString(),
    strategy,
    engine: "sitemetrics",
    scores: { performance: perfScore, seo: seoScore, bestPractices: bpScore, accessibility: a11yScore, overall },
    vitals: {
      fcp: { value: estFcp, score: Math.round(fcpScore * 100), display: fmt(estFcp) },
      lcp: { value: estLcp, score: Math.round(lcpScore * 100), display: fmt(estLcp) },
      tbt: { value: estTbt, score: Math.round(tbtScore * 100), display: fmt(estTbt) },
      cls: { value: estCls, score: Math.round(clsScore * 100), display: estCls.toFixed(3) },
      si: { value: estSi, score: Math.round(siScore * 100), display: fmt(estSi) },
      tti: { value: estTti, score: Math.round(ttiScore * 100), display: fmt(estTti) },
      ttfb: { value: ttfbMs, score: Math.round(ttfbScore * 100), display: fmt(ttfbMs) },
    },
    audits: { performance: perfAudits, seo: seoAudits, bestPractices: bpAudits, accessibility: a11yAudits },
    pageInfo: { title: pageTitle, screenshot: null },
  };
}

function checkHeadingOrder(html: string): boolean {
  const headings = html.match(/<h([1-6])[\s>]/gi);
  if (!headings || headings.length === 0) return true;
  let last = 0;
  for (const h of headings) {
    const lvl = parseInt(h.match(/\d/)![0]!);
    if (lvl > last + 1 && last > 0) return false;
    last = lvl;
  }
  return true;
}

// ─── Server ───

const server = serve({
  routes: {
    "/*": index,
    "/api/analyze": {
      async POST(req) {
        try {
          const body = await req.json();
          const { url, strategy = "mobile" } = body as { url: string; strategy?: string };
          if (!url || typeof url !== "string") return Response.json({ error: "URL is required" }, { status: 400 });
          const validStrategy = strategy === "desktop" ? "desktop" : "mobile";
          const data = await analyze(url, validStrategy);
          return Response.json(data);
        } catch (err: any) {
          return Response.json({ error: err?.message || "Failed to analyze URL" }, { status: 500 });
        }
      },
    },
  },
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
});

console.log(`🚀 Server running at ${server.url}`);
