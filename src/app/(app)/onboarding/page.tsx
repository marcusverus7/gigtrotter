import Link from "next/link";
import { ArrowRight, Camera, ScanLine, ShieldCheck, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Permission ladder (§11.2): start with share-sheet only, earn camera-roll
 * after first value, inbox after week one, location last. The onboarding flow
 * only asks for what is needed to deliver the very next bit of value.
 */
const steps = [
  {
    icon: ScanLine,
    title: "Capture your first item",
    body: "Drop a screenshot or forward an email — your tonight's ticket or the latest one. We'll build a confirm card from it.",
    cta: { label: "Open Capture", href: "/app/capture" },
  },
  {
    icon: Camera,
    title: "Backfill from your camera roll",
    body: "We'll scan for ticket-shaped screenshots already on your phone. Your map populates in minutes.",
    cta: { label: "Run backfill scan", href: "/app/capture/backfill" },
  },
  {
    icon: Ticket,
    title: "Set your default audience",
    body: "Inner Circle is the default. You can choose differently per pin, anytime.",
    cta: { label: "Settings", href: "/app/settings" },
  },
];

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-secondary" />
          Your life, your map, your terms.
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome.</h1>
        <p className="max-w-xl text-muted-foreground">
          No forms. No grind. Capture-first means the app earns its place by
          holding what you already need. Pick a starting move.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <Card key={s.title} className="flex flex-col">
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">{s.title}</CardTitle>
              <CardDescription>{s.body}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button asChild size="sm" className="w-full">
                <Link href={s.cta.href}>
                  {s.cta.label} <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
