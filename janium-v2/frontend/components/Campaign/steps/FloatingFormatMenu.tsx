import { Button } from "@/components/ui/button";
import { Bold, Italic, Link, List } from "lucide-react";

interface FloatingFormatMenuProps {
  onFormat: (format: string) => void;
  position: { x: number; y: number } | null;
  onClose?: () => void;
}

export const FloatingFormatMenu = ({
  onFormat,
  position,
}: FloatingFormatMenuProps) => {
  if (!position) return null;

  return (
    <div
      className="format-menu fixed z-[60] bg-popover text-popover-foreground shadow-md rounded-md border flex gap-1 p-1"
      style={{
        top: `${position.y}px`,
        left: `${position?.x}px`,
        transform: "translateX(-50%)", // Only center horizontally
      }}
    >
      <Button variant="ghost" size="sm" onClick={() => onFormat("bold")}>
        <Bold className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onFormat("italic")}>
        <Italic className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onFormat("link")}>
        <Link className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onFormat("list")}>
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
};
