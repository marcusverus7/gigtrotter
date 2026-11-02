import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { safeNext } from "@/lib/safe-next";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // The event or page the person was looking at before signing up, if any.
  const next = safeNext((await searchParams).next, "");
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .single();

  return (
    <OnboardingWizard
      currentName={profile?.display_name ?? null}
      currentUsername={profile?.username ?? ""}
      next={next || null}
    />
  );
}
