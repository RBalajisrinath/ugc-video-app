"use client";

import { useRef, useEffect, useState, useCallback } from "react";

export interface VideoScript {
  productName: string;
  tagline: string;
  hook: string;
  overlayText: string;
  gifSearchTerm: string;
  bgSearchTerm: string;
  audioMood: string;
  cta: string;
}

interface Props {
  script: VideoScript;
  gifUrl?: string | null;
}

const COLORS = [
  ["#6366f1", "#8b5cf6"],
  ["#ec4899", "#f43f5e"],
  ["#f59e0b", "#ef4444"],
  ["#10b981", "#06b6d4"],
  ["#8b5cf6", "#ec4899"],
  ["#06b6d4", "#3b82f6"],
];

const TOTAL_DURATION = 8000;
const FPS = 30;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBounce(t: number) {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export default function UGCVideoPlayer({ script, gifUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const gifImageRef = useRef<HTMLImageElement | null>(null);
  const gifLoadedRef = useRef(false);
  const colorPairRef = useRef<string[]>(COLORS[0]);

  useEffect(() => {
    colorPairRef.current = COLORS[Math.floor(Math.random() * COLORS.length)];
  }, []);

  useEffect(() => {
    if (!gifUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = gifUrl;
    img.onload = () => {
      gifImageRef.current = img;
      gifLoadedRef.current = true;
    };
  }, [gifUrl]);

  const drawFrame = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number) => {
      const t = elapsed / TOTAL_DURATION;

      // Background gradient animation
      const colors = colorPairRef.current;
      const grad = ctx.createLinearGradient(
        0,
        0,
        w * (0.5 + 0.5 * Math.sin(t * Math.PI * 2)),
        h
      );
      const shift = Math.sin(t * Math.PI) * 0.3;
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(0.5 + shift, colors[1]);
      grad.addColorStop(1, colors[0]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Animated particles
      ctx.save();
      for (let i = 0; i < 15; i++) {
        const px =
          ((Math.sin(t * (1 + i * 0.3) + i) + 1) / 2) * w;
        const py =
          ((Math.cos(t * (0.8 + i * 0.2) + i * 2) + 1) / 2) * h;
        const size = 4 + Math.sin(t * 3 + i) * 3;
        const alpha = 0.15 + Math.sin(t * 2 + i) * 0.1;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Subtle grid pattern
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      const gridSize = 60;
      const offsetX = (t * 200) % gridSize;
      const offsetY = (t * 100) % gridSize;
      for (let x = -gridSize + offsetX; x < w + gridSize; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = -gridSize + offsetY; y < h + gridSize; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.restore();

      // Dark overlay for text readability
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, 0, w, h);

      // === PHASE 1: Hook text (0-3s) ===
      const hookAlpha = t < 0.05 ? t / 0.05 : t < 0.4 ? 1 : t < 0.45 ? 1 - (t - 0.4) / 0.05 : 0;
      const hookScale = t < 0.05 ? easeOutBounce(t / 0.05) : 1;

      if (hookAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = hookAlpha;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Hook text
        const hookFontSize = Math.min(w * 0.065, 48);
        ctx.font = `900 ${hookFontSize}px "Inter", system-ui, -apple-system, sans-serif`;

        const hookLines = wrapText(ctx, script.hook.toUpperCase(), w * 0.85);
        const lineHeight = hookFontSize * 1.2;
        const hookStartY = h * 0.3 - (hookLines.length * lineHeight) / 2;

        hookLines.forEach((line, i) => {
          const lineOffset =
            (1 - hookScale) * 30 * (i % 2 === 0 ? -1 : 1);
          const y = hookStartY + i * lineHeight + lineOffset;

          // Text shadow
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillText(line, w / 2 + 2, y + 2);

          // Main text
          ctx.fillStyle = "white";
          ctx.fillText(line, w / 2, y);
        });
        ctx.restore();
      }

      // === PHASE 2: Overlay text + GIF (2-6s) ===
      const overlayAlpha =
        t < 0.25 ? 0 : t < 0.3 ? (t - 0.25) / 0.05 : t < 0.7 ? 1 : t < 0.75 ? 1 - (t - 0.7) / 0.05 : 0;

      if (overlayAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = overlayAlpha;

        // Overlay text
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const overlayFontSize = Math.min(w * 0.08, 64);
        ctx.font = `900 ${overlayFontSize}px "Inter", system-ui, -apple-system, sans-serif`;

        const overlayLines = wrapText(ctx, script.overlayText.toUpperCase(), w * 0.85);
        const oLineHeight = overlayFontSize * 1.2;
        const oStartY = h * 0.25 - (overlayLines.length * oLineHeight) / 2;

        const bounceIn = easeOutCubic(Math.min(1, (overlayAlpha)));

        overlayLines.forEach((line, i) => {
          const y = oStartY + i * oLineHeight + (1 - bounceIn) * 40;
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillText(line, w / 2 + 3, y + 3);
          ctx.fillStyle = "#FFD700";
          ctx.fillText(line, w / 2, y);
        });

        // GIF overlay
        if (gifLoadedRef.current && gifImageRef.current) {
          const gifW = w * 0.4;
          const gifH = gifW * (gifImageRef.current.height / gifImageRef.current.width);
          const gifX = (w - gifW) / 2;
          const gifY = h * 0.5;

          // Bounce in
          const gifBounce = easeOutBounce(Math.min(1, (overlayAlpha)));

          ctx.save();
          ctx.globalAlpha = overlayAlpha * gifBounce;
          ctx.shadowColor = "rgba(0,0,0,0.4)";
          ctx.shadowBlur = 20;
          ctx.drawImage(gifImageRef.current, gifX, gifY, gifW, gifH);
          ctx.restore();
        }

        // Pulsing circle decoration
        const pulseR = 80 + Math.sin(t * Math.PI * 6) * 20;
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.68, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fill();

        ctx.restore();
      }

      // === PHASE 3: CTA (5-8s) ===
      const ctaAlpha = t < 0.6 ? 0 : t < 0.65 ? (t - 0.6) / 0.05 : 1;

      if (ctaAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = ctaAlpha;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const ctaFontSize = Math.min(w * 0.055, 42);
        ctx.font = `800 ${ctaFontSize}px "Inter", system-ui, -apple-system, sans-serif`;

        // CTA pill background
        const ctaText = script.cta.toUpperCase();
        const ctaWidth = ctx.measureText(ctaText).width + 60;
        const ctaHeight = ctaFontSize * 1.8;
        const ctaX = (w - ctaWidth) / 2;
        const ctaY = h * 0.82 - ctaHeight / 2;

        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.roundRect(ctaX, ctaY, ctaWidth, ctaHeight, ctaHeight / 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "white";
        ctx.fillText(ctaText, w / 2, h * 0.82);

        // Product name
        ctx.font = `500 ${Math.min(w * 0.035, 28)}px "Inter", system-ui`;
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(script.productName, w / 2, h * 0.92);

        ctx.restore();
      }

      // Progress bar at bottom
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(0, h - 4, w, 4);
      ctx.fillStyle = "white";
      ctx.fillRect(0, h - 4, w * t, 4);
    },
    [script]
  );

  const startPlayback = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsPlaying(true);
    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const t = Math.min(elapsed / TOTAL_DURATION, 1);

      setProgress(t);

      drawFrame(ctx, canvas.width, canvas.height, elapsed % TOTAL_DURATION);

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setIsPlaying(false);
        setProgress(1);
      }
    };

    animRef.current = requestAnimationFrame(animate);
  }, [drawFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawFrame(ctx, canvas.width, canvas.height, 0);

    return () => cancelAnimationFrame(animRef.current);
  }, [drawFrame]);

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isRecording) return;

    setIsRecording(true);
    setIsPlaying(true);
    startTimeRef.current = performance.now();

    const stream = canvas.captureStream(FPS);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: 5000000,
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${script.productName.replace(/\s+/g, "-")}-ugc-video.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsRecording(false);
      setIsPlaying(false);
      setProgress(0);

      const ctx2 = canvas.getContext("2d");
      if (ctx2) drawFrame(ctx2, canvas.width, canvas.height, 0);
    };

    mediaRecorder.start();

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const t = Math.min(elapsed / TOTAL_DURATION, 1);

      setProgress(t);
      drawFrame(ctx, canvas.width, canvas.height, elapsed % TOTAL_DURATION);

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        mediaRecorder.stop();
      }
    };

    animRef.current = requestAnimationFrame(animate);
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-black shadow-lg">
      <canvas
        ref={canvasRef}
        width={1080}
        height={1920}
        className="w-full max-w-[280px] mx-auto block"
        style={{ aspectRatio: "9/16" }}
      />

      <div className="flex items-center gap-2 p-3 bg-surface">
        <button
          onClick={() => {
            cancelAnimationFrame(animRef.current);
            setIsPlaying(false);
            setProgress(0);
            startPlayback();
          }}
          disabled={isPlaying || isRecording}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
          {isPlaying ? "Playing..." : "Play"}
        </button>

        <button
          onClick={handleDownload}
          disabled={isRecording}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {isRecording ? (
            <>
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Recording...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Save Video
            </>
          )}
        </button>

        {isRecording && (
          <span className="text-xs text-muted ml-auto">{Math.round(progress * 100)}%</span>
        )}
      </div>
    </div>
  );
}
