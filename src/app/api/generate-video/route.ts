import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { exec, execSync } from "child_process";
import { promisify } from "util";
import dns from "dns/promises";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);
const CMD_SHELL = process.platform === "win32" ? { shell: "cmd.exe" } : {};
const runCmd = (cmd: string, timeout = 60000) =>
  execAsync(cmd, { ...CMD_SHELL, timeout });

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const FONT_REGULAR = process.platform === "win32"
  ? "C\\:/Windows/Fonts/arial.ttf"
  : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = process.platform === "win32"
  ? "C\\:/Windows/Fonts/arialbd.ttf"
  : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

const TRENDING_AUDIO_BANK: Record<string, string[]> = {
  hype: [
    "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8a14d26f5.mp3?filename=hip-hop-11254.mp3",
    "https://cdn.pixabay.com/download/audio/2022/10/25/audio_9f8a28de9e.mp3?filename=upbeat-pop-dance-track-125484.mp3",
  ],
  playful: [
    "https://cdn.pixabay.com/download/audio/2022/01/20/audio_d1718ab41f.mp3?filename=funky-upbeat-110397.mp3",
    "https://cdn.pixabay.com/download/audio/2021/08/08/audio_12b0c7443c.mp3?filename=happy-beat-110203.mp3",
  ],
  chill: [
    "https://cdn.pixabay.com/download/audio/2022/03/10/audio_8515f4f4f1.mp3?filename=lifestyle-fashion-show-25195.mp3",
    "https://cdn.pixabay.com/download/audio/2021/09/06/audio_95f7f71f8d.mp3?filename=summer-fashion-show-26858.mp3",
  ],
};

const GIF_FALLBACKS = [
  "happy dance reaction",
  "mind blown reaction",
  "chef kiss meme",
  "surprised wow reaction",
  "this is fine meme",
];

const GIF_BACKUP_URLS = [
  "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcnFhM3pkZDBqOHhrM25jc3QzMzA5eTR5a2I1M3V5M2N6d29mMm5hYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/26ufdipQqU2lhNA4g/giphy.gif",
  "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif",
  "https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif",
];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "about",
  "just",
  "have",
  "into",
  "when",
  "what",
  "will",
  "they",
  "them",
  "their",
  "are",
  "you",
  "our",
  "out",
  "was",
  "not",
  "its",
  "new",
  "best",
  "top",
  "how",
]);

const MAX_JOBS = 2;
const MAX_WAITING_REQUESTS = 8;
let activeGenerations = 0;
const waitingResolvers: Array<() => void> = [];

interface Script {
  productName: string;
  hook: string;
  overlayText: string;
  gifSearchTerm: string;
  cta: string;
  audioMood: "hype" | "playful" | "chill";
}

interface TrendSignals {
  keywords: string[];
  trendHint: string;
}

function isPrivateIpv4(hostname: string): boolean {
  return (
    /^10\./.test(hostname) ||
    /^127\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

async function isSafePublicUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;

    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".home") ||
      isPrivateIpv4(host)
    ) {
      return false;
    }

    const records = await dns.lookup(host, { all: true });
    if (!records.length) return false;

    for (const record of records) {
      if (record.family === 4 && isPrivateIpv4(record.address)) return false;
      if (record.family === 6 && (record.address === "::1" || record.address.startsWith("fc") || record.address.startsWith("fd") || record.address.startsWith("fe80"))) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

async function acquireJobSlot(timeoutMs = 30000): Promise<boolean> {
  if (activeGenerations < MAX_JOBS) {
    activeGenerations += 1;
    return true;
  }

  if (waitingResolvers.length >= MAX_WAITING_REQUESTS) {
    return false;
  }

  return new Promise((resolve) => {
    let done = false;
    const resolver = () => {
      if (done) return;
      done = true;
      activeGenerations += 1;
      resolve(true);
    };

    waitingResolvers.push(resolver);

    setTimeout(() => {
      if (done) return;
      const index = waitingResolvers.indexOf(resolver);
      if (index >= 0) waitingResolvers.splice(index, 1);
      done = true;
      resolve(false);
    }, timeoutMs);
  });
}

function releaseJobSlot(): void {
  activeGenerations = Math.max(0, activeGenerations - 1);
  const next = waitingResolvers.shift();
  if (next) next();
}

const RECENT_HOOKS_LIMIT = 8;
const recentHooksByDomain = new Map<string, string[]>();

const HOOK_LIBRARY = {
  health: [
    "I opened this app for one meal and stayed for the glow up",
    "My plate said comfort food, this app said no panic",
    "Calories used to be guesswork until this showed up",
    "This app made tracking feel weirdly fun",
    "I expected boring stats, got main character progress",
    "Me acting casual while this app fixes my food chaos",
    "The easiest nutrition habit I accidentally kept",
    "This app really said eat well without the stress",
    "I stopped overthinking meals after this",
    "My fitness era started because this felt simple",
  ],
  saas: [
    "I clicked once and looked ten times more productive",
    "This tool made my old workflow feel prehistoric",
    "Not dramatic, but this fixed my entire process",
    "I expected a feature, got a full upgrade",
    "This is the shortcut I wish I had last year",
    "My team asked what changed, it was this",
    "One tool, fewer tabs, cleaner brain",
    "I tried it for five minutes and kept it",
    "This quietly removed my most annoying task",
    "The only dashboard that did not overwhelm me",
  ],
  general: [
    "I found this today and now I am recommending it to everyone",
    "I was not looking for this, but it is now essential",
    "This is one of those products you keep open all day",
    "I tested it once and immediately got the hype",
    "Why did nobody send me this earlier",
    "I thought it was overhyped, I was wrong",
    "This just made my routine easier overnight",
    "Low effort setup, high payoff result",
    "This is the kind of useful that spreads fast",
    "The rare product that is actually worth sharing",
  ],
};

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s]*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return null;
}

function findFfmpegBin(tool: "ffmpeg" | "ffprobe"): string {
  if (process.platform !== "win32") return tool;

  try {
    const whereResult = execSync(`where ${tool}`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .split(/\r?\n/)
      .find((line: string) => line.toLowerCase().endsWith(`${tool}.exe`));
    if (whereResult) return whereResult.trim();
  } catch {
  }

  const wingetBase = path.join(
    os.homedir(),
    "AppData",
    "Local",
    "Microsoft",
    "WinGet",
    "Packages"
  );

  try {
    const dirs = fs.readdirSync(wingetBase);
    for (const dir of dirs) {
      if (!dir.toLowerCase().includes("ffmpeg")) continue;
      const bin = path.join(wingetBase, dir, "ffmpeg-8.1.1-full_build", "bin");
      const candidate = path.join(bin, `${tool}.exe`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
  }

  return tool;
}

const FFMPEG = findFfmpegBin("ffmpeg");
const FFPROBE = findFfmpegBin("ffprobe");

async function callClaude(system: string, user: string): Promise<string | null> {
  if (!ANTHROPIC_KEY) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 450,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return "";

    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, noscript, svg, nav, footer, iframe").remove();

    const title = $("title").first().text().trim();
    const meta = $('meta[name="description"]').attr("content") || "";
    const h1 = $("h1").first().text().trim();
    const bodyText = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2800);

    return `Title: ${title}\nMeta: ${meta}\nH1: ${h1}\nBody: ${bodyText}`;
  } catch {
    return "";
  }
}

function productNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0] || "Product";
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return "Product";
  }
}

function domainKeyFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown-domain";
  }
}

function extractProductName(content: string, url: string): string {
  const titleMatch = content.match(/Title:\s*(.+)/i)?.[1]?.trim();
  if (titleMatch) {
    const clean = titleMatch.split(/[|\-:\u2013\u2014]/)[0].trim();
    if (clean.length >= 2 && clean.length <= 42) return clean;
  }
  return productNameFromUrl(url);
}

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeHookText(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(input: string): string[] {
  return normalizeHookText(input)
    .split(" ")
    .filter((t) => t.length > 2);
}

function hookSimilarity(a: string, b: string): number {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  const union = aTokens.size + bTokens.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function rememberHook(domainKey: string, hook: string): void {
  const current = recentHooksByDomain.get(domainKey) ?? [];
  const next = [hook, ...current.filter((h) => h !== hook)].slice(0, RECENT_HOOKS_LIMIT);
  recentHooksByDomain.set(domainKey, next);
}

function pickDiverseHook(domainKey: string, candidates: string[]): string {
  const cleaned = candidates
    .map((h) => h.trim())
    .filter((h) => h.length > 8)
    .map((h) => h.slice(0, 120));

  if (cleaned.length === 0) return "This is worth trying right now";

  const recent = recentHooksByDomain.get(domainKey) ?? [];
  if (recent.length === 0) {
    const selected = pickOne(cleaned);
    rememberHook(domainKey, selected);
    return selected;
  }

  const scored = cleaned.map((candidate) => {
    const maxSimilarity = recent.reduce((max, oldHook) => {
      return Math.max(max, hookSimilarity(candidate, oldHook));
    }, 0);
    return { candidate, maxSimilarity };
  });

  scored.sort((a, b) => a.maxSimilarity - b.maxSimilarity);
  const best = scored[0]?.candidate ?? cleaned[0];
  rememberHook(domainKey, best);
  return best;
}

function classifyNiche(content: string, url: string): "health" | "saas" | "general" {
  const lower = `${content} ${url}`.toLowerCase();
  const isHealth = /calorie|food|meal|fitness|health|nutrition|track/.test(lower);
  const isSaaS = /saas|ai|tool|automation|dashboard|analytics|productivity/.test(lower);
  if (isHealth) return "health";
  if (isSaaS) return "saas";
  return "general";
}

function extractTopKeywords(text: string, limit: number): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

async function fetchTrendSignals(): Promise<TrendSignals> {
  const feeds = [
    "https://www.reddit.com/r/TikTokCringe/top.json?limit=30&t=week",
    "https://www.reddit.com/r/socialmedia/top.json?limit=30&t=week",
    "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US",
  ];

  const texts = await Promise.all(
    feeds.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(4500),
        });
        if (!res.ok) return "";
        const raw = await res.text();

        if (url.includes("reddit")) {
          try {
            const json = JSON.parse(raw) as {
              data?: { children?: Array<{ data?: { title?: string } }> };
            };
            const titles =
              json.data?.children
                ?.map((c) => c.data?.title ?? "")
                .filter(Boolean)
                .join(" ") ?? "";
            return titles;
          } catch {
            return "";
          }
        }

        const titles = [...raw.matchAll(/<title>([^<]+)<\/title>/gi)]
          .map((m) => m[1] ?? "")
          .slice(1)
          .join(" ");
        return titles;
      } catch {
        return "";
      }
    })
  );

  const merged = texts.filter(Boolean).join(" ");
  const keywords = extractTopKeywords(merged, 10);
  const trendHint = keywords.length
    ? `Current trend keywords: ${keywords.join(", ")}`
    : "Trend signal unavailable. Prefer energetic, meme-friendly social angles.";

  return { keywords, trendHint };
}

function chooseAudioMood(baseMood: Script["audioMood"], trendKeywords: string[]): Script["audioMood"] {
  const joined = trendKeywords.join(" ");
  if (/dance|party|challenge|viral|hype|club|drip/.test(joined)) return "hype";
  if (/cozy|morning|routine|soft|calm|mindful/.test(joined)) return "chill";
  return baseMood;
}

function fallbackScript(content: string, url: string): Script {
  const productName = extractProductName(content, url);
  const domainKey = domainKeyFromUrl(url);
  const niche = classifyNiche(content, url);
  const hookTemplates = HOOK_LIBRARY[niche].map((h) => h.replace(/this app|this tool|this/gi, productName));
  const hook = pickDiverseHook(domainKey, hookTemplates);

  if (niche === "health") {
    return {
      productName,
      hook,
      overlayText: "Bestie this is wild",
      gifSearchTerm: "shocked happy reaction",
      cta: "Try it now",
      audioMood: "playful",
    };
  }

  if (niche === "saas") {
    return {
      productName,
      hook,
      overlayText: "Actually obsessed",
      gifSearchTerm: "mind blown reaction",
      cta: "Link in bio",
      audioMood: "hype",
    };
  }

  return {
    productName,
    hook,
    overlayText: "Main character vibes",
    gifSearchTerm: pickOne(GIF_FALLBACKS),
    cta: "Do not sleep",
    audioMood: "chill",
  };
}

function safeDrawtextText(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\\\'")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,");
}

async function searchTenorGif(query: string): Promise<string | null> {
  const key = process.env.TENOR_API_KEY || "";
  if (!key) return null;

  try {
    const q = encodeURIComponent(query);
    const res = await fetch(
      `https://tenor.googleapis.com/v2/search?key=${key}&q=${q}&limit=6&media_filter=gif`,
      { signal: AbortSignal.timeout(7000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.results;
    if (!Array.isArray(results) || results.length === 0) return null;
    const picked = pickOne(results.slice(0, 4));
    return picked?.media_formats?.gif?.url ?? null;
  } catch {
    return null;
  }
}

async function buildGeneratedFallbackGif(destination: string): Promise<boolean> {
  try {
    await runCmd(
      `${FFMPEG} -y -f lavfi -i "color=c=0x141414:s=360x360:r=12:d=8" -vf "drawbox=x=20:y=20:w=320:h=320:color=0x00B7FF@0.35:t=fill,drawtext=fontfile='${FONT_BOLD}':text='WOW':fontsize=78:fontcolor=white:x=(w-text_w)/2+14*sin(2*PI*t*1.6):y=(h-text_h)/2+10*cos(2*PI*t*1.4),fps=12,scale=360:360:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" "${destination}"`,
      30000
    );
    return isValidGifFile(destination);
  } catch {
    return false;
  }
}

function isValidGifFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const size = fs.statSync(filePath).size;
    if (size < 300) return false;

    const header = Buffer.alloc(6);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, header, 0, 6, 0);
    fs.closeSync(fd);

    const signature = header.toString("ascii");
    return signature === "GIF89a" || signature === "GIF87a";
  } catch {
    return false;
  }
}

async function getGuaranteedGif(tempDir: string, preferredGifUrl: string | null): Promise<string | null> {
  const gifPath = path.join(tempDir, "reaction.gif");

  if (preferredGifUrl) {
    const ok = await downloadFile(preferredGifUrl, gifPath, 13000, 600);
    if (ok && isValidGifFile(gifPath)) return gifPath;
  }

  const shuffledFallbacks = [...GIF_BACKUP_URLS].sort(() => Math.random() - 0.5);
  for (const gifUrl of shuffledFallbacks) {
    const ok = await downloadFile(gifUrl, gifPath, 10000, 600);
    if (ok && isValidGifFile(gifPath)) return gifPath;
  }

  const generated = await buildGeneratedFallbackGif(gifPath);
  return generated ? gifPath : null;
}

async function downloadFile(
  url: string,
  destination: string,
  timeout = 12000,
  minBytes = 4000
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) return false;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < minBytes) return false;

    fs.writeFileSync(destination, bytes);
    return true;
  } catch {
    return false;
  }
}

async function downloadBackgroundImage(destination: string): Promise<boolean> {
  const seed = Math.floor(Math.random() * 100000);
  const sources = [
    `https://picsum.photos/seed/${seed}/1080/1920`,
    `https://picsum.photos/1080/1920?random=${seed}`,
  ];

  for (const src of sources) {
    const ok = await downloadFile(src, destination, 10000);
    if (ok) return true;
  }
  return false;
}

async function pickAndDownloadAudio(mood: Script["audioMood"], destination: string): Promise<boolean> {
  const list = TRENDING_AUDIO_BANK[mood] ?? TRENDING_AUDIO_BANK.hype;
  const shuffled = [...list].sort(() => Math.random() - 0.5);

  for (const src of shuffled) {
    const ok = await downloadFile(src, destination, 16000);
    if (ok) return true;
  }

  return false;
}

async function getScript(url: string, content: string, trends: TrendSignals): Promise<Script> {
  const domainKey = domainKeyFromUrl(url);
  const niche = classifyNiche(content, url);

  const ai = await callClaude(
    "You are a Gen-Z UGC ad copywriter. Return strict JSON only.",
    `Create one short UGC script for this product.\nURL: ${url}\nContext: ${content}\nNiche: ${niche}\n${trends.trendHint}\n\nOutput JSON with exact keys:\n{\n  "productName": "...",\n  "hookCandidates": ["...", "...", "...", "...", "..."],\n  "hook": "max 14 words",\n  "overlayText": "max 4 words",\n  "gifSearchTerm": "tenor keyword",\n  "cta": "max 3 words",\n  "audioMood": "hype|playful|chill"\n}\n\nRules:\n- hookCandidates must be 5 distinct hooks with different angles\n- at least two hooks should reflect active social trends\n- avoid repeating structure across candidates\n- no hashtags\n- tone: funny, modern, social-native, no cringe.`
  );

  if (!ai) return fallbackScript(content, url);

  try {
    const parsed = JSON.parse(
      ai.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
    ) as Partial<Script> & { hookCandidates?: string[] };

    const aiCandidates = Array.isArray(parsed.hookCandidates)
      ? parsed.hookCandidates.filter((h): h is string => typeof h === "string")
      : [];

    const fallbackCandidates = HOOK_LIBRARY[niche].map((h) =>
      h.replace(/this app|this tool|this/gi, extractProductName(content, url))
    );

    const selectedHook = pickDiverseHook(domainKey, [
      ...aiCandidates,
      typeof parsed.hook === "string" ? parsed.hook : "",
      ...fallbackCandidates,
    ]);

    if (
      parsed.productName &&
      parsed.overlayText &&
      parsed.gifSearchTerm &&
      parsed.cta &&
      parsed.audioMood &&
      ["hype", "playful", "chill"].includes(parsed.audioMood)
    ) {
      return {
        productName: String(parsed.productName).slice(0, 44),
        hook: selectedHook,
        overlayText: String(parsed.overlayText).slice(0, 42),
        gifSearchTerm: String(parsed.gifSearchTerm).slice(0, 80),
        cta: String(parsed.cta).slice(0, 30),
        audioMood: chooseAudioMood(parsed.audioMood, trends.keywords),
      };
    }

    return fallbackScript(content, url);
  } catch {
    return fallbackScript(content, url);
  }
}

async function composeVideo(
  bgImagePath: string,
  gifPath: string | null,
  audioPath: string | null,
  script: Script,
  outputPath: string,
  tempDir: string
): Promise<void> {
  const bgVideoPath = path.join(tempDir, "bg-video.mp4");

  await runCmd(
    `${FFMPEG} -y -loop 1 -i "${bgImagePath}" -vf "scale=1200:2134:flags=lanczos,zoompan=z='min(zoom+0.0013,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=240:s=1080x1920:fps=30,eq=brightness=-0.1:contrast=1.08:saturation=1.08" -t 8 -c:v libx264 -pix_fmt yuv420p -an "${bgVideoPath}"`,
    60000
  );

  const hook = safeDrawtextText(script.hook);
  const overlay = safeDrawtextText(script.overlayText);
  const cta = safeDrawtextText(script.cta);

  let hasGif = !!gifPath && fs.existsSync(gifPath);
  const hasAudio = !!audioPath && fs.existsSync(audioPath);

  let gifVideoPath = "";
  if (hasGif && gifPath) {
    gifVideoPath = path.join(tempDir, "gif-video.mp4");
    try {
      await runCmd(
        `${FFMPEG} -y -ignore_loop 0 -i "${gifPath}" -vf "fps=20,scale=390:-1:flags=lanczos" -t 8 -c:v libx264 -pix_fmt yuv420p -an "${gifVideoPath}"`,
        35000
      );
      if (!fs.existsSync(gifVideoPath) || fs.statSync(gifVideoPath).size < 1000) {
        hasGif = false;
      }
    } catch {
      hasGif = false;
    }
  }

  const baseFilter = [
    hasGif
      ? "[0:v][1:v]overlay=x='(W-w)/2':y='H*0.47+16*sin(2*PI*t*1.4)':shortest=1:format=auto"
      : "[0:v]null",
    `drawtext=fontfile='${FONT_BOLD}':text='${hook}':fontsize=42:fontcolor=white:borderw=4:bordercolor=black@0.88:x=(w-text_w)/2:y=h*0.06:enable='between(t,0.2,4.1)'`,
    `drawtext=fontfile='${FONT_BOLD}':text='${overlay}':fontsize=56:fontcolor=0xFFE066:borderw=4:bordercolor=black@0.95:x=(w-text_w)/2:y=h*0.27:enable='between(t,2.0,6.2)'`,
    `drawtext=fontfile='${FONT_REGULAR}':text='${cta}':fontsize=36:fontcolor=0xFFFFFF:borderw=3:bordercolor=black@0.85:x=(w-text_w)/2:y=h*0.86:enable='between(t,5.3,8)'`,
  ].join(",");

  if (hasAudio && audioPath) {
    const cmd = hasGif
      ? `${FFMPEG} -y -i "${bgVideoPath}" -i "${gifVideoPath}" -stream_loop -1 -i "${audioPath}" -filter_complex "${baseFilter}[v];[2:a]atrim=0:8,afade=t=in:st=0:d=0.35,afade=t=out:st=7.5:d=0.5,volume=0.2[a]" -map "[v]" -map "[a]" -t 8 -c:v libx264 -c:a aac -shortest -pix_fmt yuv420p "${outputPath}"`
      : `${FFMPEG} -y -i "${bgVideoPath}" -stream_loop -1 -i "${audioPath}" -filter_complex "${baseFilter}[v];[1:a]atrim=0:8,afade=t=in:st=0:d=0.35,afade=t=out:st=7.5:d=0.5,volume=0.2[a]" -map "[v]" -map "[a]" -t 8 -c:v libx264 -c:a aac -shortest -pix_fmt yuv420p "${outputPath}"`;

    await runCmd(cmd, 90000);
    return;
  }

  const cmdNoAudio = hasGif
    ? `${FFMPEG} -y -i "${bgVideoPath}" -i "${gifVideoPath}" -f lavfi -i "sine=frequency=130:sample_rate=44100:duration=8" -filter_complex "${baseFilter}[v];[2:a]afade=t=in:st=0:d=0.25,afade=t=out:st=7.5:d=0.5,volume=0.07[a]" -map "[v]" -map "[a]" -t 8 -c:v libx264 -c:a aac -shortest -pix_fmt yuv420p "${outputPath}"`
    : `${FFMPEG} -y -i "${bgVideoPath}" -f lavfi -i "sine=frequency=130:sample_rate=44100:duration=8" -filter_complex "${baseFilter}[v];[1:a]afade=t=in:st=0:d=0.25,afade=t=out:st=7.5:d=0.5,volume=0.07[a]" -map "[v]" -map "[a]" -t 8 -c:v libx264 -c:a aac -shortest -pix_fmt yuv420p "${outputPath}"`;

  await runCmd(cmdNoAudio, 90000);
}

async function getDurationSeconds(videoPath: string): Promise<number> {
  try {
    const result = await runCmd(
      `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      12000
    );
    const n = Number.parseFloat(result.stdout.trim());
    if (!Number.isFinite(n)) return 8;
    return Math.max(5, Math.min(10, Math.round(n)));
  } catch {
    return 8;
  }
}

export const maxDuration = 60;

export async function POST(req: Request) {
  let tempDir = "";
  let hasSlot = false;

  try {
    hasSlot = await acquireJobSlot();
    if (!hasSlot) {
      return NextResponse.json(
        { message: "Too many video jobs are running. Please retry in a few seconds." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const inputUrl = normalizeUrl(String(body?.url ?? ""));

    if (!inputUrl) {
      return NextResponse.json(
        { message: "Please send a valid product URL so I can build the video." },
        { status: 400 }
      );
    }

    const safeUrl = await isSafePublicUrl(inputUrl);
    if (!safeUrl) {
      return NextResponse.json(
        { message: "Please send a public product URL (private or local URLs are blocked)." },
        { status: 400 }
      );
    }

    tempDir = path.join(os.tmpdir(), `ugc-${Date.now()}-${Math.round(Math.random() * 1000)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const trends = await fetchTrendSignals();
    const websiteContent = await fetchWebsiteContent(inputUrl);
    const script = await getScript(inputUrl, websiteContent, trends);

    const bgPath = path.join(tempDir, "bg.jpg");
    const audioPath = path.join(tempDir, "audio.mp3");
    const outPath = path.join(tempDir, "out.mp4");

    const [bgOk, tenorUrl, audioOk] = await Promise.all([
      downloadBackgroundImage(bgPath),
      searchTenorGif(script.gifSearchTerm),
      pickAndDownloadAudio(script.audioMood, audioPath),
    ]);

    if (!bgOk) {
      throw new Error("Background asset fetch failed");
    }

    const finalGifPath = await getGuaranteedGif(tempDir, tenorUrl);
    if (!finalGifPath) {
      throw new Error("GIF layer generation failed");
    }

    await composeVideo(bgPath, finalGifPath, audioOk ? audioPath : null, script, outPath, tempDir);

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 6000) {
      throw new Error("Video composition failed");
    }

    const videosDir = path.join(process.cwd(), "public", "videos");
    fs.mkdirSync(videosDir, { recursive: true });

    const fileName = `ugc-${Date.now()}.mp4`;
    fs.copyFileSync(outPath, path.join(videosDir, fileName));

    const duration = await getDurationSeconds(outPath);

    const responseMessage = [
      `Done. Your UGC video for ${script.productName} is ready.`,
      `Hook: \"${script.hook}\"`,
      `Includes background + text + reaction GIF + audio (${duration}s).`,
    ].join("\n");

    return NextResponse.json({
      message: responseMessage,
      videoUrl: `/videos/${fileName}`,
      videoTitle: `${script.productName} UGC`,
      script,
    });
  } catch (error) {
    console.error("[generate-video]", error);
    return NextResponse.json(
      { message: "I could not generate that video right now. Please try another URL." },
      { status: 500 }
    );
  } finally {
    if (hasSlot) {
      releaseJobSlot();
    }

    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // no-op
      }
    }
  }
}
