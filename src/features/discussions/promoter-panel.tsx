"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  Megaphone,
  Pin,
  Plus,
  Send,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createPromoterAnnouncement } from "./actions";

type Announcement = {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_url: string | null;
  is_pinned: boolean;
  created_at: string;
};

export function AnnouncementsList({
  announcements,
}: {
  announcements: Announcement[];
}) {
  if (announcements.length === 0) return null;

  return (
    <div className="space-y-3">
      {announcements.map((a) => (
        <Card
          key={a.id}
          className={
            a.is_pinned
              ? "border-primary/40 bg-primary/5"
              : "border-secondary/30 bg-secondary/5"
          }
        >
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center gap-2">
              {a.is_pinned ? (
                <Pin className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Megaphone className="h-3.5 w-3.5 text-secondary" />
              )}
              <CardTitle className="text-sm">{a.title}</CardTitle>
              <Badge variant="outline" className="ml-auto text-[9px]">
                Promoter
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {a.body}
            </p>
            {a.cta_url && a.cta_label ? (
              <a
                href={a.cta_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {a.cta_label}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function PromoterAnnouncementForm({
  eventId,
}: {
  eventId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [isPinned, setIsPinned] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createPromoterAnnouncement({
          eventId,
          title,
          body,
          ctaLabel: ctaLabel || null,
          ctaUrl: ctaUrl || null,
          isPinned,
        });
        toast.success("Announcement sent to all ticket holders.");
        setOpen(false);
        setTitle("");
        setBody("");
        setCtaLabel("");
        setCtaUrl("");
        setIsPinned(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't send.");
      }
    });
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Megaphone className="mr-1 h-4 w-4" />
        Send announcement to ticket holders
      </Button>
    );
  }

  return (
    <Card className="border-secondary/30">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-secondary" />
          <CardTitle className="text-sm">New announcement</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Merch drop this Friday!"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Message</Label>
            <Input
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Exclusive 20% off for everyone who came to the gig..."
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ann-cta">CTA label (optional)</Label>
              <Input
                id="ann-cta"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="Get tickets to our next gig"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-url">CTA link</Label>
              <Input
                id="ann-url"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="rounded border-border"
            />
            <Pin className="h-3 w-3" />
            Pin to top of discussion
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              <Send className="mr-1 h-3 w-3" />
              {pending ? "Sending…" : "Send to all"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
