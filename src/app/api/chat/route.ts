import { NextResponse } from "next/server";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

async function callClaude(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string
): Promise<string | null> {
  if (!ANTHROPIC_KEY) return null;

  try {
    const formattedHistory = history.slice(-8).map((m) => ({
      role: m.role,
      content: [{ type: "text", text: m.content.slice(0, 1200) }],
    }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 240,
        system: systemPrompt,
        messages: [
          ...formattedHistory,
          { role: "user", content: [{ type: "text", text: userMessage }] },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data?.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

function getSmartReply(userMessage: string): string {
  const msg = userMessage.toLowerCase().trim();

  if (/^(hi|hello|hey|sup|yo|howdy|greetings|what'?s up)\b/.test(msg)) {
    const replies = [
      "Hey there. Share your product URL and I will build a punchy UGC video for it.",
      "Hi. Drop a product link and I can turn it into a short-form UGC ad video.",
      "Yo. Send me your product URL and I will assemble a fun social video.",
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (/\b(what can you|what do you|help|how do|capabilities)\b/.test(msg)) {
    return "I can generate UGC videos for you. Send me a product URL and I will analyze the site, pick assets, and assemble a 5-10 second vertical video with trendy text, audio, and a GIF overlay.";
  }

  if (/\b(thanks|thank you|thx|ty|awesome|cool|nice|sick|fire)\b/.test(msg)) {
    const replies = [
      "Appreciate you. Got another product to try? Drop the link.",
      "No problem. Send another URL anytime and I can make a fresh cut.",
      "You are welcome. Share another product and I will make one more.",
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (/\b(who are you|what are you|about|your name)\b/.test(msg)) {
    return "I am your UGC video assistant. I chat naturally and turn product URLs into short social promo videos.";
  }

  if (/\b(test|testing)\b/.test(msg)) {
    return "I am up and running. Try sending a product URL like https://calai.app and I will generate a video.";
  }

  if (/https?:\/\/[^\s]+/.test(msg)) {
    const replies = [
      "URL detected. Analyzing product and assembling your video now.",
      "Nice URL. Give me a second to cook the video.",
      "Got it. Fetching the site and building your UGC video.",
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  return "I am mainly built for UGC product videos. Paste a product URL and I will generate one, or keep chatting and I can help shape your angle first.";
}

function normalizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (m: unknown): m is ChatMessage =>
        !!m &&
        typeof m === "object" &&
        "role" in m &&
        "content" in m &&
        ((m as { role: string }).role === "user" ||
          (m as { role: string }).role === "assistant") &&
        typeof (m as { content: string }).content === "string"
    )
    .slice(-8);
}

export async function POST(req: Request) {
  let message = "";

  try {
    const body = await req.json();
    message = typeof body?.message === "string" ? body.message : "";
    const history = normalizeHistory(body?.history);

    const systemPrompt = [
      "You are a friendly UGC video assistant.",
      "You help users create short-form marketing videos for products and brands.",
      "When someone shares a URL, say you are analyzing the product and generating a UGC-style video.",
      "For casual chat, be warm and concise like ChatGPT.",
      "Keep responses to 2-3 sentences.",
      "If asked about capabilities, explain that you generate UGC videos from product URLs.",
    ].join(" ");

    const aiReply = await callClaude(systemPrompt, history, message);
    const reply = aiReply || getSmartReply(message);

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ reply: getSmartReply(message) });
  }
}
