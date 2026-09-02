"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Submit button for bare `<form action={serverAction}>` forms.
 *
 * A plain Button in a server-action form gives no feedback and no double-tap
 * protection: the settings page's "Regenerate handle" could be tapped twice
 * and re-roll the handle twice. useFormStatus only works from INSIDE the form,
 * which is why this is its own component rather than a prop on Button.
 */
export function PendingButton({
  children,
  pendingLabel = "Working…",
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
