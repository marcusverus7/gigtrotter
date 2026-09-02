"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const ADJECTIVES = [
  "midnight",
  "crimson",
  "silver",
  "golden",
  "velvet",
  "copper",
  "sapphire",
  "emerald",
  "amber",
  "indigo",
  "quiet",
  "wild",
  "northern",
  "southern",
  "electric",
  "lunar",
  "solar",
  "tidal",
  "swift",
  "restless",
  "radiant",
  "obsidian",
  "ivory",
  "glacial",
  "verdant",
  "scarlet",
  "azure",
  "cobalt",
  "dawn",
  "dusk",
];
const NOUNS = [
  "fox",
  "wolf",
  "heron",
  "otter",
  "panther",
  "falcon",
  "crane",
  "sparrow",
  "leopard",
  "badger",
  "dolphin",
  "raven",
  "owl",
  "hare",
  "lynx",
  "stag",
  "kestrel",
  "viper",
  "marten",
  "swan",
  "jaguar",
  "tiger",
  "ibis",
  "phoenix",
  "kraken",
  "dragon",
  "manta",
  "seal",
  "puffin",
  "swallow",
];

function randomHandle() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${a}-${n}-${num}`;
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function regenerateAnonHandle() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Try a few times to avoid collisions; the unique constraint will catch any.
  for (let i = 0; i < 6; i++) {
    const handle = randomHandle();
    const hash = await sha256Hex(handle + user.id);
    const { error } = await supabase
      .from("profiles")
      .update({
        anon_handle: handle,
        anon_hash: hash,
        anon_views: 0,
        anon_revoked: false,
      })
      .eq("id", user.id)
      .select()
      .single();
    if (!error) {
      revalidatePath("/app/settings");
      return;
    }
  }
  // Redirect, not throw: these run from bare <form action> submits, and a
  // thrown error replaces the entire settings page with the route error
  // boundary — a page-sized crash for a button-sized failure.
  redirect("/app/settings?e=regen");
}

export async function toggleAnonRevoked() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: current } = await supabase
    .from("profiles")
    .select("anon_revoked")
    .eq("id", user.id)
    .single();

  if (!current) throw new Error("Profile missing");

  // .select() so RLS silent-fails surface as zero rows, not silent success.
  const { data, error } = await supabase
    .from("profiles")
    .update({ anon_revoked: !current.anon_revoked })
    .eq("id", user.id)
    .select("anon_revoked");

  if (error || !data || data.length === 0) {
    redirect("/app/settings?e=toggle");
  }
  revalidatePath("/app/settings");
}
