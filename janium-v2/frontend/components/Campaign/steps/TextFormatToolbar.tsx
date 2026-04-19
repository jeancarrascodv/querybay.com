import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bold, Italic, Link, List, Type } from "lucide-react";

interface TextFormatToolbarProps {
  onFormat: (format: string) => void;
}

export const TextFormatToolbar = ({ onFormat }: TextFormatToolbarProps) => {
  return (
    <div className="flex gap-1 p-1 border rounded-md bg-background">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => onFormat("bold")}
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => onFormat("italic")}
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => onFormat("link")}
      >
        <Link className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => onFormat("list")}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
};
