"use client";

import * as React from "react";
import {
  CaretSortIcon,
  CheckIcon,
  PlusCircledIcon,
} from "@radix-ui/react-icons";

import { cn } from "@/lib/utils";
import { useTeam } from "@/hooks/useTeam";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PopoverTriggerProps = React.ComponentPropsWithoutRef<
  typeof PopoverTrigger
>;

// Custom team type
interface TeamItem {
  id: string;
  name: string;
}

interface TeamSwitcherProps extends PopoverTriggerProps {
  teams?: TeamItem[];
  currentTeamId?: string;
  onTeamChange?: (teamId: string) => void;
  className?: string;
}

export default function TeamSwitcher({
  className,
  teams: propTeams = [],
  currentTeamId: propCurrentTeamId,
  onTeamChange,
}: TeamSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const [showNewTeamDialog, setShowNewTeamDialog] = React.useState(false);

  // Get teams from the global store
  const {
    teams: storeTeams,
    currentTeamId: storeCurrentTeamId,
    switchTeam,
  } = useTeam(undefined, { fetchAllTeams: true });

  // Use store data if available, fallback to prop data
  const teams = storeTeams.length > 0 ? storeTeams : propTeams;
  const currentTeamId = storeCurrentTeamId || propCurrentTeamId;

  // Find current team from the teams array
  const currentTeam = React.useMemo(() => {
    return (
      teams.find((team) => team.id === currentTeamId) ||
      (teams.length > 0 ? teams[0] : { id: "", name: "Select Team" })
    );
  }, [teams, currentTeamId]);

  // Handle team change with both store and props callback
  const handleTeamChange = React.useCallback(
    (teamId: string) => {
      // Update the global store
      switchTeam(teamId);

      // Call the prop callback if provided
      if (onTeamChange) {
        onTeamChange(teamId);
      }
    },
    [switchTeam, onTeamChange]
  );

  return (
    <Dialog open={showNewTeamDialog} onOpenChange={setShowNewTeamDialog}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Select a team"
            className={cn("w-[200px] justify-between", className)}
          >
            <Avatar className="mr-2 h-5 w-5">
              <AvatarImage
                src={`https://avatar.vercel.sh/${currentTeam.id}.png`}
                alt={currentTeam.name}
              />
              <AvatarFallback>
                {currentTeam.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {currentTeam.name}
            <CaretSortIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandList>
              <CommandInput placeholder="Search team..." />
              <CommandEmpty>No team found.</CommandEmpty>
              <CommandGroup heading="Your Teams">
                {[...teams].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).map((team) => (
                  <CommandItem
                    key={team.id}
                    onSelect={() => {
                      handleTeamChange(team.id);
                      setOpen(false);
                    }}
                    className="text-sm"
                  >
                    <Avatar className="mr-2 h-5 w-5">
                      <AvatarImage
                        src={`https://avatar.vercel.sh/${team.id}.png`}
                        alt={team.name}
                        className={
                          currentTeam.id === team.id ? "" : "grayscale"
                        }
                      />
                      <AvatarFallback>
                        {team.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {team.name}
                    <CheckIcon
                      className={cn(
                        "ml-auto h-4 w-4",
                        currentTeam.id === team.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <CommandSeparator />
            <CommandList>
              <CommandGroup>
                <DialogTrigger asChild>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      setShowNewTeamDialog(true);
                    }}
                  >
                    <PlusCircledIcon className="mr-2 h-5 w-5" />
                    Create Team
                  </CommandItem>
                </DialogTrigger>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>
            Add a new team to manage products and customers.
          </DialogDescription>
        </DialogHeader>
        <div>
          <div className="space-y-4 py-2 pb-4">
            <div className="space-y-2">
              <Label htmlFor="name">Team name</Label>
              <Input id="name" placeholder="Acme Inc." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan">Subscription plan</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">
                    <span className="font-medium">Free</span> -{" "}
                    <span className="text-muted-foreground">
                      Trial for two weeks
                    </span>
                  </SelectItem>
                  <SelectItem value="pro">
                    <span className="font-medium">Pro</span> -{" "}
                    <span className="text-muted-foreground">
                      $9/month per user
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowNewTeamDialog(false)}>
            Cancel
          </Button>
          <Button type="submit">Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
