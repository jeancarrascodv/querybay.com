import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoaderProps {
  size?: number;
  className?: string;
}

export const Loader = ({ size = 24, className }: LoaderProps) => {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <Loader2
        className={cn("animate-spin text-muted-foreground", className)}
        size={size}
      />
    </div>
  );
};
