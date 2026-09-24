"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit button that disables itself while its form's Server Action runs,
 * preventing double submits. The only client-side piece of the actions.
 */
export function PendingButton({
  disabled,
  ...props
}: Omit<ComponentProps<"button">, "type">) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
    />
  );
}
