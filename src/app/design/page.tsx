import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { GigTrotterMark, GigTrotterGlyph } from "@/components/brand";

export const metadata: Metadata = {
  title: "Design system",
  description: "Dark-Map Premium — palette, type scale, component samples.",
};

const palette = [
  { name: "background", token: "--background", note: "slate-950 base" },
  { name: "card", token: "--card", note: "lifted surface" },
  { name: "primary", token: "--primary", note: "violet-600 accent" },
  { name: "secondary", token: "--secondary", note: "cyan-500" },
  { name: "muted", token: "--muted", note: "subdued fills" },
  { name: "destructive", token: "--destructive", note: "errors" },
];

const circles = [
  { name: "Vault", variant: "vault", token: "--circle-vault" },
  { name: "Inner", variant: "inner", token: "--circle-inner" },
  { name: "Friends", variant: "friends", token: "--circle-friends" },
  { name: "Open", variant: "open", token: "--circle-open" },
] as const;

export default function DesignPage() {
  return (
    <main className="bg-aurora min-h-screen">
      <div className="container max-w-5xl space-y-12 py-12">
        <header className="space-y-3">
          <GigTrotterMark />
          <h1 className="text-3xl font-bold tracking-tight">
            Dark-Map Premium
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Visual quality is a stated moat — the pin popover and share cards are
            the most-screenshotted surfaces. Base slate-950, accent violet-600,
            secondary cyan-500. Inter for UI, Geist Mono for stats.
          </p>
        </header>

        <Separator />

        {/* Palette */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Palette</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {palette.map((c) => (
              <div key={c.name} className="space-y-2">
                <div
                  className="h-20 w-full rounded-lg border border-border"
                  style={{ background: `hsl(var(${c.token}))` }}
                />
                <div>
                  <p className="text-sm font-medium capitalize">{c.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {c.token}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Circles */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Circle audiences</h2>
          <p className="text-sm text-muted-foreground">
            Each audience has a colour that follows a pin everywhere it appears.
          </p>
          <div className="flex flex-wrap gap-3">
            {circles.map((c) => (
              <div
                key={c.name}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <span
                  className="h-8 w-8 rounded-full"
                  style={{ background: `hsl(var(${c.token}))` }}
                />
                <div>
                  <Badge variant={c.variant}>{c.name}</Badge>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {c.token}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Type scale */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Type scale</h2>
          <div className="space-y-3 rounded-xl border border-border bg-card p-6">
            <p className="text-4xl font-bold tracking-tight">Display · 4xl bold</p>
            <p className="text-2xl font-semibold">Heading · 2xl semibold</p>
            <p className="text-base">Body · base — Inter, the UI workhorse.</p>
            <p className="font-mono text-3xl tnum">128 · 42 · 17,402 km</p>
            <p className="font-mono text-xs text-muted-foreground">
              Stats use Geist Mono with tabular figures (.tnum)
            </p>
          </div>
        </section>

        {/* Buttons */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Buttons</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
          </div>
        </section>

        {/* Cards + form */}
        <section className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pin popover sample</CardTitle>
              <CardDescription>
                The hero surface. Obsessively polished.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <GigTrotterGlyph className="h-10 w-10" />
                <div>
                  <p className="font-medium">Fontaines D.C.</p>
                  <p className="text-sm text-muted-foreground">
                    Alexandra Palace · London
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge variant="inner">Inner Circle</Badge>
                <Badge variant="verified">Verified</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Form controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="d-email">Email</Label>
                <Input id="d-email" type="email" placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-handle">Anon handle</Label>
                <Input id="d-handle" placeholder="midnight-fox-204" />
              </div>
              <Button className="w-full">Save</Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
