"use client";

import { useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Am I ready for the Data Platform Engineer role?",
  "What is the fastest internal move for me right now?",
  "Which of my skills did the system find that my job title hides?",
];

export function AssistantChat({ initialMessages }: { initialMessages: Message[] }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const question = text.trim();
    if (question.length < 2 || pending) return;

    setPending(true);
    setError(null);
    setInput("");
    setMessages((current) => [
      ...current,
      { id: `local-${Date.now()}`, role: "user", content: question },
    ]);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "The assistant could not answer.");
        return;
      }

      setMessages((current) => [
        ...current,
        { id: `reply-${Date.now()}`, role: "assistant", content: body.reply },
      ]);
    } catch {
      setError("Network problem — try again.");
    } finally {
      setPending(false);
      requestAnimationFrame(() =>
        endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="min-h-[320px] space-y-3 rounded-xl border border-line bg-panel/70 p-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Ask about your skills, the open roles, or what to learn next. The
            assistant only sees your own profile.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "bg-accent text-[#08111f]"
                    : "border border-line bg-panel-raised text-ink"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))
        )}

        {pending ? (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-line bg-panel-raised px-4 py-2.5 text-sm text-muted">
              Thinking…
            </div>
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}

      {messages.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => send(suggestion)}
              className="rounded-full border border-line bg-panel-raised/60 px-3.5 py-1.5 text-xs text-muted transition hover:border-accent/50 hover:text-ink"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about your career here…"
          maxLength={1000}
          className="flex-1 rounded-lg border border-line bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60"
        />
        <button
          type="submit"
          disabled={pending || input.trim().length < 2}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#08111f] transition hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
