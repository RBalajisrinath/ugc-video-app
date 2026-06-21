# UGC Video Generator

A Next.js app that takes a product URL and generates a real 8-second MP4 video with background footage, reaction GIFs, and animated text overlays.

## Quick Start

```bash
cd ugc-video-app
npm install
npm run dev
# Open http://localhost:3000
# Paste a product URL (e.g., https://calai.app)
```

## How it Works

1. **Chat UI** - Paste any product URL
2. **Auto-detect** - URL triggers video generation endpoint
3. **Pipeline:**
   - Scrape website content (Cheerio)
   - Generate TikTok-native script via Claude (hook, overlay text, GIF search term, CTA)
   - Download background image (Unsplash/Picsum, 25+ pool)
   - Download reaction GIF (Tenor API)
   - Assemble with ffmpeg: Ken Burns zoom + GIF overlay + animated text overlays
4. **Output** - Unique 8s MP4 (9:16 vertical, ~1-2MB) served from `/public/videos`

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Chat UI + video player
│   ├── api/
│   │   ├── chat/route.ts           # Natural chat (Claude)
│   │   └── generate-video/route.ts # Video assembly (ffmpeg)
│   └── components/
│       └── UGCVideoPlayer.tsx      # Canvas video player (fallback)
├── globals.css
└── layout.tsx
```

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
ANTHROPIC_API_KEY=sk-ant-...        # From https://console.anthropic.com
TENOR_API_KEY=AIzaSy...             # From https://developers.google.com/tenor
```

## Tech Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- Anthropic Claude (script generation)
- Tenor API (reaction GIFs)
- Unsplash/Picsum (background images)
- ffmpeg (video assembly)
- Cheerio (web scraping)

## Evaluation Criteria

| Criterion | Implementation |
|-----------|----------------|
| End-to-end | Paste URL → MP4 in chat |
| Creative output | TikTok-native hooks, varied GIFs, trending text animations |
| Social trends | Reaction GIFs, vertical 9:16, timed text overlays |
| Speed/robustness | ~15-30s, AI fallback scripts, error handling |
| Technical quality | Modular architecture, ffmpeg assembly (not canvas), proper error handling |

## Known Gaps

- No audio layer (requires royalty-free music API)
- Could add trend detection (hashtag scraping)