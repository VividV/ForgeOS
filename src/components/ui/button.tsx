import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.12)] hover:bg-accent-hover",
        dark: "bg-ink text-white hover:bg-ink-soft",
        secondary: "border border-line-strong bg-surface text-ink hover:bg-subtle",
        ghost: "text-ink-soft hover:bg-subtle hover:text-ink",
        danger: "bg-danger text-white hover:bg-danger-ink",
        "danger-outline": "border border-danger/40 bg-surface text-danger-ink hover:bg-danger-soft",
        link: "text-accent-ink underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 px-2.5 text-[13px]",
        md: "h-9 px-3.5 text-sm",
        lg: "h-11 px-5 text-[15px]",
        xl: "h-14 px-6 text-base", // factory floor touch targets
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild, loading, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };
