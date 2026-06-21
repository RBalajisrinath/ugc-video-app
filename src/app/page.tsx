"use client";

import { useState, useRef, useEffect, FormEvent } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  videoUrl?: string;
  videoTitle?: string;
  generating?: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hey! I'm your UGC video creator. Send me a product URL and I'll assemble a viral-style short video for it. You can also just chat with me!",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const extractProductUrl = (text: string): string | null => {
    const httpMatch = text.match(/https?:\/\/[^\s]+/i)?.[0] || null;
    if (httpMatch) return httpMatch;

    const bareDomain =
      text.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/i)?.[0] ||
      null;

    if (!bareDomain) return null;
    if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(bareDomain)) return null;
    return `https://${bareDomain.replace(/^https?:\/\//i, "")}`;
  };

  const sendMessage = async (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const detectedUrl = extractProductUrl(trimmed);

    if (detectedUrl) {
      const assistantMsg: Message = {
        role: "assistant",
        content: "",
        generating: true,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const res = await fetch("/api/generate-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, url: detectedUrl }),
        });
        const data = await res.json();

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: data.message || "Here's your UGC video!",
            videoUrl: data.videoUrl,
            videoTitle: data.videoTitle,
            generating: false,
          };
          return updated;
        });
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Sorry, something went wrong generating your video. Try again!",
            generating: false,
          };
          return updated;
        });
      }
    } else {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: messages.slice(-10),
          }),
        });
        const data = await res.json();

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sorry, I had trouble processing that. Could you try again?",
          },
        ]);
      }
    }

    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-base font-semibold text-gray-900">
            UGC Video Generator
          </h1>
          <p className="text-xs text-muted">
            AI assembles trending assets into short-form videos
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto chat-scrollbar px-4 md:px-0">
        <div className="max-w-3xl mx-auto py-6 space-y-1">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              } animate-fade-in`}
            >
              <div
                className={`max-w-[90%] md:max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-accent text-white rounded-br-md"
                    : "bg-surface text-gray-900 border border-border rounded-bl-md"
                }`}
              >
                {msg.generating ? (
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-accent rounded-full typing-dot" />
                      <div className="w-2 h-2 bg-accent rounded-full typing-dot" />
                      <div className="w-2 h-2 bg-accent rounded-full typing-dot" />
                    </div>
                    <span className="text-sm text-muted">
                      Assembling your video...
                    </span>
                  </div>
                ) : (
                  <>
                    {msg.content && (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    )}
                    {msg.videoUrl && (
                      <div className="mt-3 rounded-xl overflow-hidden border border-border bg-black">
                        <video
                          controls
                          autoPlay
                          playsInline
                          className="w-full max-w-[280px] mx-auto block"
                        >
                          <source src={msg.videoUrl} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                        {msg.videoTitle && (
                          <div className="flex items-center justify-between px-3 py-2 bg-surface">
                            <p className="text-xs text-muted truncate">
                              {msg.videoTitle}
                            </p>
                            <a
                              href={msg.videoUrl}
                              download
                              className="text-xs text-accent font-medium hover:underline shrink-0 ml-2"
                            >
                              Save
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="border-t border-border bg-white px-4 py-4">
        <form
          onSubmit={sendMessage}
          className="max-w-3xl mx-auto flex items-end gap-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message or paste a product URL..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm text-gray-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
            style={{ maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="h-11 w-11 rounded-xl bg-accent text-white flex items-center justify-center hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 12h14M12 5l7 7-7 7"
              />
            </svg>
          </button>
        </form>
      </footer>
    </div>
  );
}
