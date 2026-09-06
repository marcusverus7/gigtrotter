"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitFeedback } from "./actions";

const categories = ["Bug", "Idea", "Design", "General"] as const;

export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("General");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!message.trim()) return;
    const fd = new FormData();
    fd.set("message", message);
    fd.set("pageUrl", pathname);
    fd.set("category", category.toLowerCase());

    startTransition(async () => {
      // This is the control testers use most. It used to check only
      // res.success, so a failed submission reset the button to "Send" and
      // said nothing -- the tester assumed it sent, and the feedback was gone.
      try {
        const res = await submitFeedback(fd);
        if (res.success) {
          setError(null);
          setSent(true);
          setTimeout(() => {
            setOpen(false);
            setSent(false);
            setMessage("");
            setCategory("General");
          }, 1500);
        } else {
          setError(res.error ?? "Couldn't send that — try again.");
        }
      } catch {
        setError("Couldn't send that — check your connection and try again.");
      }
    });
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_30px_rgba(124,58,237,0.45)] transition-all hover:scale-105 hover:shadow-[0_12px_40px_rgba(124,58,237,0.55)] active:scale-95 md:bottom-8 md:right-8"
      >
        <MessageSquarePlus className="h-5 w-5" />
        Feedback
      </button>

      {/* Overlay + panel */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-end p-4 md:items-end md:p-8">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-200 rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close feedback"
              className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            {sent ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                  <Send className="h-5 w-5" />
                </div>
                <p className="text-lg font-semibold">Thanks!</p>
                <p className="text-sm text-muted-foreground">
                  Your feedback helps us build something great.
                </p>
              </div>
            ) : (
              <>
                <h3 className="mb-1 text-lg font-semibold">Send feedback</h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  Bug? Idea? Anything — we read every message.
                </p>

                <div className="mb-3 flex gap-1.5">
                  {categories.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      aria-pressed={category === c}
                      className={`min-h-10 rounded-full px-4 text-xs font-medium transition-colors ${
                        category === c
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={4}
                  className="mb-3 resize-none"
                  autoFocus
                />

                {error ? (
                  <p role="alert" className="mb-2 text-xs text-destructive">
                    {error}
                  </p>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Page: {pathname}
                  </span>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!message.trim() || isPending}
                    className="gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {isPending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
