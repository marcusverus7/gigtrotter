import type { Metadata } from "next";
import Link from "next/link";

import { GigTrotterMark } from "@/components/brand";
import { UpdatePasswordForm } from "@/features/auth/update-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default function UpdatePasswordPage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[70vh] w-[70vh] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute right-[-10%] bottom-[-10%] h-[50vh] w-[50vh] rounded-full bg-secondary/15 blur-[120px]" />
      </div>
      <header className="container py-6">
        <Link href="/">
          <GigTrotterMark />
        </Link>
      </header>
      <div className="container flex flex-1 items-center justify-center pb-20">
        <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border/60 bg-card/40 p-8 backdrop-blur-xl">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight">
              Set a new password
            </h1>
            <p className="text-sm text-muted-foreground">
              Choose a new password for your account.
            </p>
          </div>
          <UpdatePasswordForm />
        </div>
      </div>
    </main>
  );
}
