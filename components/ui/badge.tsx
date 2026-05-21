import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("ui-badge", {
  defaultVariants: {
    variant: "default",
  },
  variants: {
    variant: {
      default: "ui-badge--default",
      outline: "ui-badge--outline",
      secondary: "ui-badge--secondary",
    },
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ className, variant }))} {...props} />;
}

export { Badge, badgeVariants };
