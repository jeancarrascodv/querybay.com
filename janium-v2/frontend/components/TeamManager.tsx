"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import React from "react";
import {
  Users,
  Plus,
  UserPlus,
  MoreHorizontal,
  Mail,
  Copy,
  Check,
  ScrollText,
} from "lucide-react";
import { LogsViewerTrigger } from "@/components/logs-viewer";
import { useTeam, type Invite } from "@/hooks/useTeam";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";
import { DEFAULT_TIMEZONE } from "@/lib/constants/timezones";
import { useAuth } from "@/contexts/AuthContext";
import { CampaignSchedulePicker } from "@/components/Campaign/CampaignSchedulePicker";
import { cleanTypename } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "Active" | "Invited" | "Pending";
  joinedDate: string;
  avatar?: string;
}

interface Team {
  id: string;
  name: string;
  description: string;
  members: TeamMember[];
  expanded?: boolean;
}

export default function TeamManager() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { refreshAccessToken, isRefreshing } = useTokenRefresh();
  const currentTeamId = user?.team_id;

  const isSuperAdmin = useMemo(() => {
    return user?.privileges.includes("SuperAdmin");
  }, [user]);
  const isTeamAdmin = useMemo(() => {
    return user?.privileges.includes("TeamAdmin");
  }, [user]);
  const isTeamMember = useMemo(() => {
    return user?.privileges.includes("TeamMember");
  }, [user]);

  const {
    teams: allTeams,
    teamsLoading,
    teamsError,
    refetchTeams,
    invites,
    invitesLoading: loading,
    createInvite,
    creatingInvite,
    removeInvite,
    removingInvite: removing,
    createTeam,
    creating: creatingTeam,
    mutateTeam,
    mutating: mutatingTeam,
    timezones,
  } = useTeam(currentTeamId, {
    fetchInvites: true,
    fetchUsers: true,
    fetchAllTeams: true,
    fetchTimezones: true,
  });

  // Use dummy teams if allTeams is empty

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [editTeamOpen, setEditTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<{
    id: string;
    name: string;
    timezone: string;
    allowedMessagingDayTimes?: any;
  } | null>(null);
  const [editTimeWindow, setEditTimeWindow] = useState<[number, number]>([
    9, 17,
  ]);
  const [editSelectedDays, setEditSelectedDays] = useState({
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
    sun: false,
  });
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [newTeam, setNewTeam] = useState({
    name: "",
    description: "",
    timezone: DEFAULT_TIMEZONE,
  });
  const [newMember, setNewMember] = useState({
    email: "",
    role: 1, // TeamAdmin
    message: "",
    teamId: currentTeamId || "",
  });

  // Auto-save state for edit team modal
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSavingInternal, setIsSavingInternal] = useState(false);
  const isInitialLoadRef = useRef(true);
  const performSaveRef = useRef<() => Promise<void>>();

  const availableTimezones = useMemo(() => {
    return timezones.map((tz: any) => ({
      value: tz.name,
      label: `${tz.name} (${tz.shortName})`,
    }));
  }, [timezones]);

  // Convert GraphQL teams and invites to display format - memoized to prevent re-render loops
  const transformedTeams = useMemo(() => {
    if (!allTeams || allTeams.length === 0) {
      return [];
    }

    return allTeams.map((team) => {
      const members: TeamMember[] = [];

      // Add active users from team.users
      if (team.users && team.users.length > 0) {
        members.push(
          ...team.users.map((user) => ({
            id: user.id,
            name:
              `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
              user.email.split("@")[0],
            email: user.email,
            role: user.title || "Team Member",
            status: "Active" as const,
            joinedDate: new Date().toISOString().split("T")[0], // TODO: Get actual join date from backend
          })),
        );
      }

      // Add pending invites for this team
      const teamInvites = invites.filter((invite) => invite.teamId === team.id);
      if (teamInvites.length > 0) {
        members.push(
          ...teamInvites.map((invite) => ({
            id: invite.code,
            name: invite.email.split("@")[0],
            email: invite.email,
            role: invite.privileges,
            status: "Invited" as const,
            joinedDate: new Date(invite.createdAt).toISOString().split("T")[0],
          })),
        );
      }

      return {
        id: team.id,
        name: team.name,
        description: `Team in ${team.timeZone}`,
        members,
      };
    });
  }, [allTeams, invites]);

  useEffect(() => {
    if (transformedTeams.length > 0) {
      // Sort teams alphabetically by name
      const sortedTeams = [...transformedTeams].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      );
      setTeams(sortedTeams);
    } else if (allTeams && allTeams.length > 0) {
      // Show teams even if no members/invites yet
      const teamsWithoutMembers = allTeams.map((team) => ({
        id: team.id,
        name: team.name,
        description: `Team in ${team.timeZone}`,
        members: [],
      }));
      // Sort teams alphabetically by name
      const sortedTeams = teamsWithoutMembers.sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      );
      setTeams(sortedTeams);
    }
  }, [transformedTeams, allTeams]);

  const handleTeamChangeInDialog = async (teamId: string) => {
    await refreshAccessToken(teamId);
    setNewMember({ ...newMember, teamId });
  };
  const handleCreateTeam = useCallback(async () => {
    if (!newTeam.name.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a team name",
      });
      return;
    }

    if (!newTeam.timezone) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a timezone",
      });
      return;
    }

    try {
      // Refresh token before creating team if we have a current team
      if (currentTeamId) {
        await refreshAccessToken(currentTeamId);
      }

      const team = await createTeam({
        name: newTeam.name,
        timezone: newTeam.timezone,
      });
      if (team) {
        await refreshAccessToken(team.id);
      }

      toast({
        title: "Success",
        description: `Team "${newTeam.name}" created successfully!`,
      });

      setNewTeam({ name: "", description: "", timezone: DEFAULT_TIMEZONE });
      setCreateTeamOpen(false);
    } catch (error) {
      console.error("Error creating team:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to create team",
      });
    }
  }, [
    newTeam.name,
    newTeam.timezone,
    currentTeamId,
    refreshAccessToken,
    createTeam,
    toast,
  ]);

  // Convert 24:00 to 00:00 for end-of-day when sending to backend API
  const normalizeTimeRestrictions = useCallback((restrictions: any) => {
    if (!restrictions) return restrictions;
    const normalized: any = {};
    for (const day of Object.keys(restrictions)) {
      if (restrictions[day]) {
        let endTime = restrictions[day].endTime;
        // Convert 24:00:00 to 00:00:00 for backend API
        if (endTime === "24:00:00") {
          endTime = "00:00:00";
        }
        normalized[day] = {
          startTime: restrictions[day].startTime,
          endTime: endTime,
        };
      } else {
        normalized[day] = null;
      }
    }
    return normalized;
  }, []);

  const performSave = useCallback(async () => {
    if (!editingTeam) return;

    if (!editingTeam.name.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a team name",
      });
      return;
    }

    if (!editingTeam.timezone) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a timezone",
      });
      return;
    }

    // Refresh token for the team being edited
    await refreshAccessToken(editingTeam.id);

    await mutateTeam({
      name: editingTeam.name,
      timeZone: editingTeam.timezone,
      allowedMessagingDayTimes: cleanTypename(
        normalizeTimeRestrictions(editingTeam.allowedMessagingDayTimes),
      ),
    });

    // Refetch teams to get updated data
    await refetchTeams();
  }, [
    editingTeam,
    refreshAccessToken,
    mutateTeam,
    refetchTeams,
    toast,
    normalizeTimeRestrictions,
  ]);

  // Keep ref updated with latest performSave
  performSaveRef.current = performSave;

  const handleEditTeam = useCallback(async () => {
    if (!editingTeam) return;

    try {
      await performSave();

      toast({
        title: "Success",
        description: `Team "${editingTeam.name}" updated successfully!`,
      });

      setEditingTeam(null);
      setEditTeamOpen(false);
    } catch (error) {
      console.error("Error updating team:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to update team",
      });
    }
  }, [editingTeam, performSave, toast]);

  // Reset change tracking when edit modal opens/closes
  useEffect(() => {
    if (editTeamOpen) {
      isInitialLoadRef.current = true;
      setHasChanges(false);
      // Allow state to settle before enabling change tracking
      const timer = setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setHasChanges(false);
      isInitialLoadRef.current = true;
    }
  }, [editTeamOpen]);

  // Track changes after initial load is complete
  useEffect(() => {
    if (!editTeamOpen || !editingTeam || isInitialLoadRef.current) return;
    setHasChanges(true);
  }, [
    editTeamOpen,
    editingTeam?.name,
    editingTeam?.timezone,
    editingTeam?.allowedMessagingDayTimes,
    editTimeWindow,
    editSelectedDays,
  ]);

  // Auto-save effect - save when there are changes
  useEffect(() => {
    if (!hasChanges || isSavingInternal || !editingTeam) return;

    const timer = setTimeout(async () => {
      try {
        setIsSavingInternal(true);
        await performSaveRef.current?.();
        setLastSaved(new Date());
        setSaveSuccess(true);
        setHasChanges(false);
        setTimeout(() => setSaveSuccess(false), 2000);
      } catch (error) {
        console.error("Auto-save failed:", error);
      } finally {
        setIsSavingInternal(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [hasChanges, isSavingInternal, editingTeam]);

  // Save on unmount if there are pending changes
  useEffect(() => {
    return () => {
      if (hasChanges && editingTeam && !isSavingInternal) {
        performSaveRef.current?.().catch((error) => {
          console.error("Background save on unmount failed:", error);
        });
      }
    };
  }, [hasChanges, editingTeam, isSavingInternal]);

  const handleInviteMember = useCallback(async () => {
    if (!newMember.email.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter an email address",
      });
      return;
    }

    const selectedTeamId = newMember.teamId || currentTeamId;

    if (!selectedTeamId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No team selected",
      });
      return;
    }

    try {
      // Refresh token before creating invite
      await refreshAccessToken(selectedTeamId);

      // Convert role number to privilege enum name
      const privilegeMap: { [key: number]: string } = {
        1: "TeamAdmin",
        2: "TeamMember",
        3: "TeamViewer",
      };

      const result = await createInvite(
        {
          email: newMember.email,
          privileges: [privilegeMap[newMember.role]],
        },
        selectedTeamId, // Pass the selected team ID
      );

      // Extract the invite code from the result
      if (result && result.code) {
        setInviteCode(result.code);
        setShowInviteCode(true);
      }

      toast({
        title: "Success",
        description: `Invite sent to ${newMember.email}`,
      });

      setNewMember({ email: "", role: 2, message: "", teamId: selectedTeamId });
      setInviteMemberOpen(false);
    } catch (error) {
      console.error("Error inviting member:", error);

      // Check if it's a session expiration error
      if (error instanceof Error && error.message.includes("Session expired")) {
        toast({
          variant: "destructive",
          title: "Session Expired",
          description: "Your session has expired. Refreshing the page...",
        });
        // Auto-refresh after a short delay
        // setTimeout(() => {
        //   window.location.reload();
        // }, 1500);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            error instanceof Error ? error.message : "Failed to send invite",
        });
      }
    }
  }, [
    newMember.email,
    newMember.role,
    newMember.teamId,
    currentTeamId,
    refreshAccessToken,
    createInvite,
    toast,
  ]);

  const handleRemoveInvite = useCallback(
    async (code: string, email: string) => {
      try {
        // Refresh token before removing invite
        if (currentTeamId) {
          await refreshAccessToken(currentTeamId);
        }

        await removeInvite(code);
        toast({
          title: "Success",
          description: `Invite for ${email} has been removed`,
        });
      } catch (error) {
        console.error("Error removing invite:", error);

        // Check if it's a session expiration error
        if (
          error instanceof Error &&
          error.message.includes("Session expired")
        ) {
          toast({
            variant: "destructive",
            title: "Session Expired",
            description: "Your session has expired. Refreshing the page...",
          });
          // Auto-refresh after a short delay
          // setTimeout(() => {
          //   window.location.reload();
          // }, 1500);
        } else {
          toast({
            variant: "destructive",
            title: "Error",
            description:
              error instanceof Error
                ? error.message
                : "Failed to remove invite",
          });
        }
      }
    },
    [currentTeamId, refreshAccessToken, removeInvite, toast],
  );

  const handleResendInvite = useCallback(
    async (code: string, email: string) => {
      // First remove the old invite, then create a new one
      try {
        // Refresh token before resending invite
        if (currentTeamId) {
          await refreshAccessToken(currentTeamId);
        }

        await removeInvite(code);
        await createInvite({
          email,
          privileges: ["TeamMember"], // Default to TeamMember privilege
        });
        toast({
          title: "Success",
          description: `Invite resent to ${email}`,
        });
      } catch (error) {
        console.error("Error resending invite:", error);

        // Check if it's a session expiration error
        if (
          error instanceof Error &&
          error.message.includes("Session expired")
        ) {
          toast({
            variant: "destructive",
            title: "Session Expired",
            description: "Your session has expired. Refreshing the page...",
          });
          // Auto-refresh after a short delay
          // setTimeout(() => {
          //   window.location.reload();
          // }, 1500);
        } else {
          toast({
            variant: "destructive",
            title: "Error",
            description:
              error instanceof Error
                ? error.message
                : "Failed to resend invite",
          });
        }
      }
    },
    [currentTeamId, refreshAccessToken, removeInvite, createInvite, toast],
  );

  const handleCopyCode = async () => {
    if (inviteCode) {
      const inviteUrl = `${window.location.origin}/sign-up/${inviteCode}`;
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusBadgeVariant = (
    memberStatus?: string,
  ): "default" | "secondary" | "outline" => {
    if (!memberStatus) return "outline";

    switch (memberStatus) {
      case "Active":
        return "default";
      case "Invited":
        return "secondary";
      case "Pending":
        return "outline";
      default:
        return "outline";
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId],
    );
  };

  const toggleTeamSelection = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;

    const teamMemberIds = team.members.map((member) => member.id);
    const allTeamMembersSelected = teamMemberIds.every((id) =>
      selectedMembers.includes(id),
    );

    if (allTeamMembersSelected) {
      setSelectedMembers((prev) =>
        prev.filter((id) => !teamMemberIds.includes(id)),
      );
    } else {
      setSelectedMembers((prev) =>
        Array.from(new Set([...prev, ...teamMemberIds])),
      );
    }
  };

  const isTeamFullySelected = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team || team.members.length === 0) return false;
    return team.members.every((member) => selectedMembers.includes(member.id));
  };

  const isTeamPartiallySelected = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team || team.members.length === 0) return false;
    return (
      team.members.some((member) => selectedMembers.includes(member.id)) &&
      !isTeamFullySelected(teamId)
    );
  };
  if (!user) return <></>;

  return (
    <div className="space-y-6 h-full">
      {/* Header with Action Buttons */}
      <div className="flex justify-between items-center mb-6 sticky top-0 z-20 pb-4 bg-background">
        <div>
          <h1 className="text-2xl font-bold">Team Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your teams and team members
          </p>
        </div>
        <div className="flex gap-3">
          {/* View Logs Button */}
          <LogsViewerTrigger
            buttonText="View Logs"
            buttonVariant="outline"
            title="Team Logs"
            defaultShowHistory={false}
          />

          <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
            {isSuperAdmin && (
              <DialogTrigger asChild>
                <Button className="bg-white text-black hover:bg-gray-200">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Team
                </Button>
              </DialogTrigger>
            )}
            <DialogContent
              className="bg-card border-border shadow-lg"
              onPointerDownOutside={(e) => e.preventDefault()}
              onEscapeKeyDown={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle className="text-card-foreground mb-3 block">
                  Create New Team
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label
                    htmlFor="team-name"
                    className="text-card-foreground mb-3 block"
                  >
                    Team Name
                  </Label>
                  <Input
                    id="team-name"
                    value={newTeam.name}
                    onChange={(e) =>
                      setNewTeam({ ...newTeam, name: e.target.value })
                    }
                    placeholder="e.g., Sales Team Alpha"
                    className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="team-timezone"
                    className="text-card-foreground mb-3 block"
                  >
                    Timezone
                  </Label>
                  <SearchableSelect
                    options={availableTimezones}
                    value={newTeam.timezone}
                    onValueChange={(value) =>
                      setNewTeam({ ...newTeam, timezone: value })
                    }
                    placeholder="Select timezone"
                    searchPlaceholder="Search timezones..."
                    className="w-full"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="team-description"
                    className="text-card-foreground mb-3 block"
                  >
                    Description (Optional)
                  </Label>
                  <Textarea
                    id="team-description"
                    value={newTeam.description}
                    onChange={(e) =>
                      setNewTeam({ ...newTeam, description: e.target.value })
                    }
                    placeholder="Brief description of the team's purpose..."
                    className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewTeam({
                        name: "",
                        description: "",
                        timezone: DEFAULT_TIMEZONE,
                      });
                      setCreateTeamOpen(false);
                    }}
                    disabled={creatingTeam}
                    className="border-border text-foreground hover:bg-muted"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateTeam}
                    disabled={creatingTeam}
                    className="bg-white text-black hover:bg-gray-200"
                  >
                    {creatingTeam ? "Creating..." : "Create Team"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={editTeamOpen} onOpenChange={setEditTeamOpen}>
            <DialogContent
              className="bg-card border-border shadow-lg max-h-[90vh] overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              onPointerDownOutside={(e) => e.preventDefault()}
              onEscapeKeyDown={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <div className="flex-col items-center justify-between gap-4">
                  {isTeamMember && (
                    <DialogTitle className="text-card-foreground  block mb-1">
                      Edit Team
                    </DialogTitle>
                  )}
                  <p className="text-xs text-muted-foreground/50 ">
                    {isSavingInternal ? (
                      <span className="text-yellow-500/50">Saving...</span>
                    ) : saveSuccess ? (
                      <span className="text-green-500/50">✓ Changes saved</span>
                    ) : lastSaved ? (
                      `Last saved: ${Math.floor((new Date().getTime() - lastSaved.getTime()) / 1000)}s ago`
                    ) : (
                      "Changes save automatically"
                    )}
                  </p>
                </div>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label
                    htmlFor="edit-team-name"
                    className="text-card-foreground mb-3 block"
                  >
                    Team Name
                  </Label>
                  <Input
                    id="edit-team-name"
                    value={editingTeam?.name || ""}
                    onChange={(e) =>
                      setEditingTeam(
                        editingTeam
                          ? { ...editingTeam, name: e.target.value }
                          : null,
                      )
                    }
                    placeholder="e.g., Sales Team Alpha"
                    className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="edit-team-timezone"
                    className="text-card-foreground mb-3 block"
                  >
                    Timezone
                  </Label>
                  <SearchableSelect
                    options={availableTimezones}
                    value={editingTeam?.timezone || ""}
                    onValueChange={(value) =>
                      setEditingTeam(
                        editingTeam
                          ? { ...editingTeam, timezone: value }
                          : null,
                      )
                    }
                    placeholder="Select timezone"
                    searchPlaceholder="Search timezones..."
                    className="w-full"
                  />
                </div>
                <div>
                  <Label className="text-card-foreground mb-3 block">
                    Allowed Messaging Times
                  </Label>
                  <div className="p-4 border border-border rounded-lg bg-background">
                    <CampaignSchedulePicker
                      timeWindow={editTimeWindow}
                      selectedDays={editSelectedDays}
                      onTimeWindowChange={(value, day) => {
                        setEditTimeWindow(value);
                      }}
                      onDaySelectionChange={(days) => {
                        setEditSelectedDays(days);
                      }}
                      weeklyRestrictions={editingTeam?.allowedMessagingDayTimes}
                      onWeeklyRestrictionsChange={(restrictions) => {
                        setEditingTeam(
                          editingTeam
                            ? {
                                ...editingTeam,
                                allowedMessagingDayTimes: restrictions,
                              }
                            : null,
                        );
                      }}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditTeamOpen(false);
                      setEditingTeam(null);
                    }}
                    disabled={mutatingTeam}
                    className="border-border text-foreground hover:bg-muted"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={inviteMemberOpen}
            onOpenChange={(open) => {
              setInviteMemberOpen(open);
              if (open && currentTeamId) {
                // Pre-select current team when dialog opens
                setNewMember({ ...newMember, teamId: currentTeamId });
              }
            }}
          >
            {isTeamAdmin && (
              <DialogTrigger asChild>
                <Button className="bg-white text-black hover:bg-gray-200">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Member
                </Button>
              </DialogTrigger>
            )}
            <DialogContent
              className="bg-card border-border shadow-lg"
              onPointerDownOutside={(e) => e.preventDefault()}
              onEscapeKeyDown={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle className="text-card-foreground mb-3 block">
                  Invite Team Member
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label
                    htmlFor="invite-team"
                    className="text-card-foreground mb-3 block"
                  >
                    Team
                  </Label>
                  <SearchableSelect
                    options={allTeams.map((team) => ({
                      value: team.id,
                      label: team.name,
                    }))}
                    value={newMember.teamId || currentTeamId || ""}
                    onValueChange={handleTeamChangeInDialog}
                    placeholder="Select a team"
                    searchPlaceholder="Search teams..."
                    emptyMessage="No teams found"
                    disabled={teamsLoading || isRefreshing}
                    isLoading={isRefreshing}
                    loadingText="Switching team..."
                    className="w-full"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="member-email"
                    className="text-card-foreground mb-3 block"
                  >
                    Email
                  </Label>
                  <Input
                    id="member-email"
                    type="email"
                    placeholder="user@example.com"
                    value={newMember.email}
                    onChange={(e) =>
                      setNewMember({ ...newMember, email: e.target.value })
                    }
                    disabled={isRefreshing}
                    className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="member-role"
                    className="text-card-foreground mb-3 block"
                  >
                    Privileges
                  </Label>
                  <Select
                    value={String(newMember.role)}
                    onValueChange={(value) =>
                      setNewMember({ ...newMember, role: parseInt(value) })
                    }
                    disabled={isRefreshing}
                  >
                    <SelectTrigger className="bg-background border-border text-foreground hover:bg-accent hover:text-accent-foreground">
                      <SelectValue placeholder="Select privileges" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border shadow-lg">
                      <SelectItem
                        value="1"
                        className="text-card-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer focus:bg-accent focus:text-accent-foreground"
                      >
                        Team Admin - Full team management access
                      </SelectItem>
                      <SelectItem
                        value="2"
                        className="text-card-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer focus:bg-accent focus:text-accent-foreground"
                      >
                        Team Member - Standard access
                      </SelectItem>
                      <SelectItem
                        value="3"
                        className="text-card-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer focus:bg-accent focus:text-accent-foreground"
                      >
                        Team Viewer - Read-only access
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewMember({
                        email: "",
                        role: 2,
                        message: "",
                        teamId: currentTeamId || "",
                      });
                      setInviteMemberOpen(false);
                    }}
                    disabled={creatingInvite || isRefreshing}
                    className="border-border text-foreground hover:bg-muted"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleInviteMember}
                    disabled={creatingInvite || isRefreshing}
                    className="bg-white text-black hover:bg-gray-200"
                  >
                    {creatingInvite ? "Creating..." : "Create Invite Link"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showInviteCode} onOpenChange={setShowInviteCode}>
            <DialogContent
              className="bg-card border-border shadow-lg"
              onPointerDownOutside={(e) => e.preventDefault()}
              onEscapeKeyDown={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle className="text-card-foreground mb-3 block">
                  Invite Link
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Share this link with the team member to join:
                </p>
                <div className="bg-muted/50 border border-border rounded-lg p-3 flex flex-col gap-2">
                  <div className="overflow-x-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <code className="text-sm font-mono text-foreground whitespace-nowrap block">
                      {typeof window !== "undefined" && inviteCode
                        ? `${window.location.origin}/sign-up/${inviteCode}`
                        : ""}
                    </code>
                  </div>
                  <Button
                    onClick={handleCopyCode}
                    variant="outline"
                    size="sm"
                    className="w-full text-foreground hover:bg-muted border-border"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    onClick={() => {
                      setInviteCode(null);
                      setShowInviteCode(false);
                      setCopied(false);
                    }}
                    className="bg-white text-black hover:bg-gray-200"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Teams Table */}
      {loading || teamsLoading ? (
        <div className="p-12 text-center border border-border rounded-lg bg-card">
          <div className="animate-spin h-12 w-12 mx-auto mb-4 border-4 border-muted-foreground border-t-white rounded-full" />
          <p className="text-muted-foreground">
            Loading teams, users, and invites...
          </p>
        </div>
      ) : teamsError ? (
        <div className="p-12 text-center border border-border rounded-lg bg-card">
          <div className="text-destructive mb-4">⚠️</div>
          <h3 className="text-lg font-semibold mb-2 text-card-foreground">
            Error loading data
          </h3>
          <p className="text-muted-foreground mb-4">
            {teamsError?.message || "Failed to load teams or users"}
          </p>
        </div>
      ) : teams.length === 0 ? (
        <div className="p-12 text-center border border-border rounded-lg bg-card">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2 text-card-foreground">
            No teams found
          </h3>
          <p className="text-muted-foreground mb-4">
            Create your first team to get started
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="max-h-[calc(110vh-280px)] overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <table className="w-full">
              <thead className="bg-background border-b border-sidebar-border sticky top-0 z-10">
                <tr>
                  <th className="text-left p-4 text-sidebar-foreground font-medium w-12">
                    <Checkbox
                      checked={selectedMembers.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          const allMemberIds = teams.flatMap((team) =>
                            team.members.map((member) => member.id),
                          );
                          setSelectedMembers(allMemberIds);
                        } else {
                          setSelectedMembers([]);
                        }
                      }}
                      className="border-white data-[state=checked]:bg-white data-[state=checked]:text-black"
                    />
                  </th>
                  <th className="text-left p-4 text-sidebar-foreground font-medium">
                    Member
                  </th>
                  <th className="text-left p-4 text-sidebar-foreground font-medium">
                    Role
                  </th>
                  <th className="text-left p-4 text-sidebar-foreground font-medium">
                    Email
                  </th>
                  <th className="text-left p-4 text-sidebar-foreground font-medium">
                    Status
                  </th>
                  <th className="text-left p-4 text-sidebar-foreground font-medium">
                    Joined
                  </th>
                  <th className="text-left p-4 text-sidebar-foreground font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <React.Fragment key={team.id}>
                    {/* Team Header Row */}
                    <tr className="bg-muted/30 border-b border-border">
                      <td className="p-4 w-12">
                        <Checkbox
                          checked={isTeamFullySelected(team.id)}
                          ref={(el) => {
                            if (el) {
                              const checkbox = el.querySelector("button");
                              if (checkbox) {
                                (checkbox as any).indeterminate =
                                  isTeamPartiallySelected(team.id);
                              }
                            }
                          }}
                          onCheckedChange={() => toggleTeamSelection(team.id)}
                          className="border-white data-[state=checked]:bg-white data-[state=checked]:text-black"
                        />
                      </td>
                      <td colSpan={5} className="p-4">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-semibold text-card-foreground text-lg">
                              {team.name}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {team.description}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {isTeamMember && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-muted"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="bg-card border-border"
                            >
                              <DropdownMenuItem
                                onClick={() => {
                                  // Find the full team data from allTeams
                                  const fullTeam = allTeams.find(
                                    (t) => t.id === team.id,
                                  );
                                  if (fullTeam) {
                                    // Check if allowedMessagingDayTimes is null or has all times set to 0-0
                                    const isEmptyOrZeroTimes = (
                                      restrictions: any,
                                    ) => {
                                      if (!restrictions) return true;

                                      const days = [
                                        "monday",
                                        "tuesday",
                                        "wednesday",
                                        "thursday",
                                        "friday",
                                        "saturday",
                                        "sunday",
                                      ];
                                      return days.every((day) => {
                                        const dayRestriction =
                                          restrictions[day];
                                        if (!dayRestriction) return true;

                                        // Check if times are 00:00:00 to 00:00:00
                                        return (
                                          dayRestriction.startTime ===
                                            "00:00:00" &&
                                          dayRestriction.endTime === "00:00:00"
                                        );
                                      });
                                    };

                                    // Create default Monday-Friday 9-5 schedule
                                    const defaultMessagingTimes = {
                                      monday: {
                                        startTime: "09:00:00",
                                        endTime: "17:00:00",
                                      },
                                      tuesday: {
                                        startTime: "09:00:00",
                                        endTime: "17:00:00",
                                      },
                                      wednesday: {
                                        startTime: "09:00:00",
                                        endTime: "17:00:00",
                                      },
                                      thursday: {
                                        startTime: "09:00:00",
                                        endTime: "17:00:00",
                                      },
                                      friday: {
                                        startTime: "09:00:00",
                                        endTime: "17:00:00",
                                      },
                                      saturday: null,
                                      sunday: null,
                                    };

                                    setEditingTeam({
                                      id: fullTeam.id,
                                      name: fullTeam.name,
                                      timezone: fullTeam.timeZone,
                                      allowedMessagingDayTimes:
                                        isEmptyOrZeroTimes(
                                          fullTeam.allowedMessagingDayTimes,
                                        )
                                          ? defaultMessagingTimes
                                          : fullTeam.allowedMessagingDayTimes,
                                    });

                                    // Initialize schedule picker state from team data
                                    const restrictions = isEmptyOrZeroTimes(
                                      fullTeam.allowedMessagingDayTimes,
                                    )
                                      ? defaultMessagingTimes
                                      : fullTeam.allowedMessagingDayTimes;

                                    if (restrictions) {
                                      const dayMapping: Record<
                                        string,
                                        keyof typeof editSelectedDays
                                      > = {
                                        monday: "mon",
                                        tuesday: "tue",
                                        wednesday: "wed",
                                        thursday: "thu",
                                        friday: "fri",
                                        saturday: "sat",
                                        sunday: "sun",
                                      };

                                      const newSelectedDays = {
                                        mon: false,
                                        tue: false,
                                        wed: false,
                                        thu: false,
                                        fri: false,
                                        sat: false,
                                        sun: false,
                                      };

                                      Object.keys(restrictions).forEach(
                                        (day) => {
                                          const shortDay = dayMapping[day];
                                          if (shortDay && restrictions[day]) {
                                            newSelectedDays[shortDay] = true;
                                          }
                                        },
                                      );

                                      setEditSelectedDays(newSelectedDays);
                                    }

                                    setEditTeamOpen(true);
                                  }
                                }}
                                className="text-foreground hover:bg-muted cursor-pointer"
                              >
                                Edit Team
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>

                    {/* Team Members */}
                    {team.members.length > 0 ? (
                      team.members.map((member) => (
                        <tr
                          key={member.id}
                          className="border-b border-border hover:bg-muted/50 bg-card"
                        >
                          <td className="p-4 w-12">
                            <Checkbox
                              checked={selectedMembers.includes(member.id)}
                              onCheckedChange={() =>
                                toggleMemberSelection(member.id)
                              }
                              className="border-white data-[state=checked]:bg-white data-[state=checked]:text-black"
                            />
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-white text-black flex items-center justify-center text-xs font-medium">
                                {member.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .toUpperCase()}
                              </div>
                              <span className="text-card-foreground">
                                {member.name}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-card-foreground">
                            {member.role}
                          </td>
                          <td className="p-4 text-card-foreground">
                            {member.email}
                          </td>
                          <td className="p-4">
                            <Badge
                              variant={getStatusBadgeVariant(member?.status)}
                            >
                              {member?.status || "Pending"}
                            </Badge>
                          </td>
                          <td className="p-4 text-card-foreground">
                            {new Date(member.joinedDate).toLocaleDateString()}
                          </td>
                          <td className="p-4">
                            {member?.status !== "Active" && isTeamMember && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-muted"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  className="bg-popover border-border text-popover-foreground"
                                  align="end"
                                  sideOffset={4}
                                >
                                  {member?.status === "Invited" && (
                                    <>
                                      <DropdownMenuItem
                                        className="text-popover-foreground hover:bg-muted cursor-pointer focus:bg-muted"
                                        onClick={() =>
                                          handleResendInvite(
                                            member.id,
                                            member.email,
                                          )
                                        }
                                        disabled={removing}
                                      >
                                        <Mail className="h-4 w-4 mr-2" />
                                        Resend Invite
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-destructive hover:bg-destructive/10 cursor-pointer focus:bg-destructive/10"
                                        onClick={() =>
                                          handleRemoveInvite(
                                            member.id,
                                            member.email,
                                          )
                                        }
                                        disabled={removing}
                                      >
                                        Remove Invite
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-b border-border bg-card">
                        <td colSpan={7} className="p-8 text-center">
                          <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-muted-foreground">
                            No members yet
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Invite members to get started
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedMembers.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-4 border-t border-border bg-muted/30 backdrop-blur-sm">
          <div className="flex items-center justify-between max-w-screen-xl mx-auto">
            <span className="text-sm text-foreground">
              {selectedMembers.length} member
              {selectedMembers.length !== 1 ? "s" : ""} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-foreground border-border hover:bg-muted bg-transparent"
              >
                Bulk Actions
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-foreground border-border hover:bg-muted bg-transparent"
              >
                Remove Selected
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
