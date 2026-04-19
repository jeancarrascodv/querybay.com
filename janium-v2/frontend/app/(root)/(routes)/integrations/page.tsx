"use client";

import * as React from "react";
import {
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  X,
  ExternalLink,
  Bot,
  PowerOff,
  Power,
} from "lucide-react";
import { LinkedInSettingsModal } from "@/components/LinkedInSettingsModal";
import { LinkedInIntegration } from "@/hooks/useLinkedInIntegrations";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useLinkedInIntegrations } from "@/hooks/useLinkedInIntegrations";
import { EmailIntegrationsContent } from "@/components/integrations/EmailIntegrations";
import {
  LoadingState,
  BackgroundRefreshIndicator,
} from "@/components/ui/loading-state";

export default function IntegrationsPage() {
  const { toast } = useToast();
  const {
    integrations: linkedInIntegrations,
    teamWeeklyRestrictions,
    loading: linkedInLoading,
    creating: creatingLinkedIn,
    updating: updatingLinkedIn,
    createLinkedIn,
    updateLinkedIn,
    startBrowser,
    stopBrowser,
    stopContainer,
    cleanContainer,
    syncConnections,
    refetchIntegrations,
  } = useLinkedInIntegrations();

  // Track initial load vs background refresh
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false);

  React.useEffect(() => {
    if (!linkedInLoading && !hasLoadedOnce && linkedInIntegrations.length > 0) {
      setHasLoadedOnce(true);
    }
  }, [linkedInLoading, hasLoadedOnce, linkedInIntegrations]);

  const isInitialLoading = linkedInLoading && !hasLoadedOnce;
  const isBackgroundRefreshing = linkedInLoading && hasLoadedOnce;

  const [addLinkedInOpen, setAddLinkedInOpen] = React.useState(false);
  const [editLinkedInOpen, setEditLinkedInOpen] = React.useState(false);
  const [editingLinkedInId, setEditingLinkedInId] = React.useState<
    string | null
  >(null);
  const [settingsModalOpen, setSettingsModalOpen] = React.useState(false);
  const [selectedAccount, setSelectedAccount] =
    React.useState<LinkedInIntegration | null>(null);
  const [openingBrowser, setOpeningBrowser] = React.useState<string | null>(
    null,
  );
  const [closingBrowser, setClosingBrowser] = React.useState<string | null>(
    null,
  );
  const [stoppingContainerFor, setStoppingContainerFor] = React.useState<
    string | null
  >(null);
  const [browserStopped, setBrowserStopped] = React.useState<
    Record<string, boolean>
  >({});

  const [newLinkedIn, setNewLinkedIn] = React.useState({
    linkedinProfileUrl: "",
    fullName: "",
    maxPendingConnections: 1800,
    maxConnectionsPerWeek: 100,
    maxMessagesPerWeek: 200,
    proxyUrl: "",
  });

  const [editLinkedIn, setEditLinkedIn] = React.useState({
    primaryUserId: "",
    maxPendingConnections: 1800,
    maxConnectionsPerWeek: 100,
    maxMessagesPerWeek: 200,
    proxyUrl: "",
  });

  const handleAddLinkedIn = async () => {
    if (!newLinkedIn.linkedinProfileUrl.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a Profile URL Link",
      });
      return;
    }

    if (!newLinkedIn.fullName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter the full name",
      });
      return;
    }

    try {
      await createLinkedIn({
        linkedinProfileUrl: newLinkedIn.linkedinProfileUrl,
        fullName: newLinkedIn.fullName,
        maxPendingConnectionRequests: newLinkedIn.maxPendingConnections,
        maxConnectionRequestsPerWeek: newLinkedIn.maxConnectionsPerWeek,
        maxConnectionRequestsPerDay: 30,
        dailyConnectionRequestsVariationPct: 20,
        minimumDelayBetweenConnectionRequestsMs: 180000,
        weeklyRestrictions: {
          monday: undefined,
          tuesday: undefined,
          wednesday: undefined,
          thursday: undefined,
          friday: undefined,
          saturday: undefined,
          sunday: undefined,
        },
        warmupEnabled: true,
        warmupPeriodDays: 20,
        warmupStartingConnectionRequestsPerDay: 5,
        proxyUrl: newLinkedIn.proxyUrl || undefined,
      });

      toast({
        title: "Success",
        description: "LinkedIn account added successfully!",
      });

      setNewLinkedIn({
        linkedinProfileUrl: "",
        fullName: "",
        maxPendingConnections: 1800,
        maxConnectionsPerWeek: 100,
        maxMessagesPerWeek: 200,
        proxyUrl: "",
      });
      setAddLinkedInOpen(false);
    } catch (error) {
      console.error("Error adding LinkedIn account:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to add LinkedIn account",
      });
    }
  };

  const handleOpenEditLinkedIn = (account: LinkedInIntegration) => {
    setEditingLinkedInId(account.id);
    setEditLinkedIn({
      primaryUserId: account.primaryUserId || "",
      maxPendingConnections: account.maxPendingConnectionRequests || 1800,
      maxConnectionsPerWeek: account.maxConnectionRequestsPerWeek || 100,
      maxMessagesPerWeek: 100,
      proxyUrl: account.proxyUrl || "",
    });
    setEditLinkedInOpen(true);
  };

  const handleOpenSettingsModal = (account: LinkedInIntegration) => {
    setSelectedAccount(account);
    setSettingsModalOpen(true);
  };

  const handleUpdateLinkedIn = async () => {
    if (!editingLinkedInId) return;

    try {
      await updateLinkedIn(editingLinkedInId, {
        primaryUserId: editLinkedIn.primaryUserId || undefined,
        maxPendingConnectionRequests: editLinkedIn.maxPendingConnections,
        maxConnectionRequestsPerWeek: editLinkedIn.maxConnectionsPerWeek,
        proxyUrl: editLinkedIn.proxyUrl || undefined,
      });

      toast({
        title: "Success",
        description: "LinkedIn account updated successfully!",
      });

      setEditLinkedInOpen(false);
      setEditingLinkedInId(null);
    } catch (error) {
      console.error("Error updating LinkedIn account:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update LinkedIn account",
      });
    }
  };

  const handleOpenLinkedIn = async (accountId: string) => {
    setOpeningBrowser(accountId);
    try {
      const url = await startBrowser(accountId);
      if (url) {
        const newURL = process.env.NEXT_PUBLIC_API_URL + url;
        window.open(newURL, "_blank");
        toast({
          title: "Success",
          description: "LinkedIn browser opened successfully!",
        });
      }
    } catch (error) {
      console.error("Error opening LinkedIn browser:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to open LinkedIn browser",
      });
    } finally {
      setOpeningBrowser(null);
    }
  };

  const handleStopLinkedIn = async (accountId: string) => {
    setClosingBrowser(accountId);
    try {
      await stopBrowser(accountId);
      setBrowserStopped((prev) => ({ ...prev, [accountId]: true }));
      toast({
        title: "Success",
        description: "LinkedIn browser closed successfully!",
      });
      // Auto-hide the "Stop Container" button after 20 seconds
      setTimeout(() => {
        setBrowserStopped((prev) => ({ ...prev, [accountId]: false }));
      }, 20000);
    } catch (error) {
      console.error("Error stopping LinkedIn browser:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to close LinkedIn browser",
      });
    } finally {
      setClosingBrowser(null);
    }
  };

  const handleStopContainer = async (accountId: string) => {
    setStoppingContainerFor(accountId);
    try {
      await stopContainer(accountId);
      setBrowserStopped((prev) => ({ ...prev, [accountId]: false }));
      toast({
        title: "Success",
        description: "LinkedIn container stopped successfully!",
      });
    } catch (error) {
      console.error("Error stopping LinkedIn container:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to stop LinkedIn container",
      });
    } finally {
      setStoppingContainerFor(null);
    }
  };

  return (
    <div className="flex flex-col h-full m-8 mt-5">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Integrations</h1>
          <BackgroundRefreshIndicator isRefreshing={isBackgroundRefreshing} />
        </div>
      </div>
      <Tabs defaultValue="linkedin" className="w-full">
        <TabsList>
          {/* <TabsTrigger value="email">Email</TabsTrigger> */}
          <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
        </TabsList>

        {/* Email Integrations Content */}
        <TabsContent value="email">
          <EmailIntegrationsContent />
        </TabsContent>

        {/* LinkedIn Integrations Content */}
        <TabsContent value="linkedin">
          <div className="mt-6">
            {/* Connected Accounts Section */}
            <div className="mb-12">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-semibold">Connected Accounts</h2>
                </div>
                <Dialog
                  open={addLinkedInOpen}
                  onOpenChange={setAddLinkedInOpen}
                >
                  <DialogTrigger asChild>
                    <Button>Add New LinkedIn Account</Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-border shadow-lg max-w-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-card-foreground mb-3 block">
                        LinkedIn Account
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid gap-4">
                        <div>
                          <Label
                            htmlFor="fullName"
                            className="text-card-foreground mb-3 block"
                          >
                            Full Name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="fullName"
                            placeholder="John Doe"
                            value={newLinkedIn.fullName}
                            onChange={(e) =>
                              setNewLinkedIn({
                                ...newLinkedIn,
                                fullName: e.target.value,
                              })
                            }
                            className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                          />
                        </div>
                      </div>

                      <div>
                        <Label
                          htmlFor="profileUrl"
                          className="text-card-foreground mb-3 block"
                        >
                          Profile URL <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="profileUrl"
                          placeholder="https://www.linkedin.com/in/john-doe-123456"
                          value={newLinkedIn.linkedinProfileUrl}
                          onChange={(e) =>
                            setNewLinkedIn({
                              ...newLinkedIn,
                              linkedinProfileUrl: e.target.value,
                            })
                          }
                          className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter the handle from your LinkedIn profile URL (e.g.,
                          from https://www.linkedin.com/in/john-doe-123456)
                        </p>
                      </div>
                      <div>
                        <Label
                          htmlFor="proxyUrl"
                          className="text-card-foreground mb-3 block"
                        >
                          Proxy URL
                        </Label>
                        <Input
                          id="proxyUrl"
                          placeholder="https://proxy.example.com"
                          value={newLinkedIn.proxyUrl}
                          onChange={(e) =>
                            setNewLinkedIn({
                              ...newLinkedIn,
                              proxyUrl: e.target.value,
                            })
                          }
                          className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                        />
                      </div>

                      <div className="space-y-4">
                        <div>
                          <Label
                            htmlFor="maxPending"
                            className="text-card-foreground mb-3 block"
                          >
                            Max Pending Connections
                          </Label>
                          <Input
                            id="maxPending"
                            type="number"
                            min="0"
                            max="2000"
                            value={newLinkedIn.maxPendingConnections}
                            onChange={(e) =>
                              setNewLinkedIn({
                                ...newLinkedIn,
                                maxPendingConnections:
                                  parseInt(e.target.value) || 0,
                              })
                            }
                            className="bg-background border-border text-foreground"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Range: 0-2000 (Default: 1800)
                          </p>
                        </div>
                        <div>
                          <Label
                            htmlFor="maxWeeklyRequests"
                            className="text-card-foreground mb-3 block"
                          >
                            Max Connection Requests/Week
                          </Label>
                          <Input
                            id="maxWeeklyRequests"
                            type="number"
                            min="0"
                            max="150"
                            value={newLinkedIn.maxConnectionsPerWeek}
                            onChange={(e) =>
                              setNewLinkedIn({
                                ...newLinkedIn,
                                maxConnectionsPerWeek:
                                  parseInt(e.target.value) || 0,
                              })
                            }
                            className="bg-background border-border text-foreground"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Range: 0-150 (Default: 100)
                          </p>
                        </div>
                        <div>
                          <Label
                            htmlFor="maxWeeklyMessages"
                            className="text-card-foreground mb-3 block"
                          >
                            Max Messages/Week
                          </Label>
                          <Input
                            id="maxWeeklyMessages"
                            type="number"
                            min="0"
                            max="400"
                            value={newLinkedIn.maxMessagesPerWeek}
                            onChange={(e) =>
                              setNewLinkedIn({
                                ...newLinkedIn,
                                maxMessagesPerWeek:
                                  parseInt(e.target.value) || 0,
                              })
                            }
                            className="bg-background border-border text-foreground"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Range: 0-400 (Default: 200)
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-4">
                        <Button
                          variant="outline"
                          onClick={() => setAddLinkedInOpen(false)}
                          disabled={creatingLinkedIn}
                          className="border-border text-foreground hover:bg-accent hover:text-accent-foreground"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAddLinkedIn}
                          disabled={creatingLinkedIn}
                          className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          {creatingLinkedIn ? "Adding..." : "Add Account"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Edit LinkedIn Dialog */}
                <Dialog
                  open={editLinkedInOpen}
                  onOpenChange={setEditLinkedInOpen}
                >
                  <DialogContent className="bg-card border-border shadow-lg max-w-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-card-foreground mb-3 block">
                        Edit LinkedIn Account
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label
                          htmlFor="edit-proxyUrl"
                          className="text-card-foreground mb-2 block"
                        >
                          Proxy URL
                        </Label>
                        <Input
                          id="edit-proxyUrl"
                          placeholder="https://proxy.example.com"
                          value={editLinkedIn.proxyUrl}
                          onChange={(e) =>
                            setEditLinkedIn({
                              ...editLinkedIn,
                              proxyUrl: e.target.value,
                            })
                          }
                          className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                        />
                      </div>

                      <div className="space-y-4">
                        <div>
                          <Label
                            htmlFor="edit-maxPendingConnections"
                            className="text-card-foreground mb-2 block"
                          >
                            Max Pending Connections
                          </Label>
                          <Input
                            id="edit-maxPendingConnections"
                            type="number"
                            value={editLinkedIn.maxPendingConnections}
                            onChange={(e) =>
                              setEditLinkedIn({
                                ...editLinkedIn,
                                maxPendingConnections: parseInt(e.target.value),
                              })
                            }
                            className="bg-background border-border text-foreground"
                          />
                        </div>

                        <div>
                          <Label
                            htmlFor="edit-maxConnectionsPerWeek"
                            className="text-card-foreground mb-2 block"
                          >
                            Max Connections Per Week
                          </Label>
                          <Input
                            id="edit-maxConnectionsPerWeek"
                            type="number"
                            value={editLinkedIn.maxConnectionsPerWeek}
                            onChange={(e) =>
                              setEditLinkedIn({
                                ...editLinkedIn,
                                maxConnectionsPerWeek: parseInt(e.target.value),
                              })
                            }
                            className="bg-background border-border text-foreground"
                          />
                        </div>

                        <div>
                          <Label
                            htmlFor="edit-maxMessagesPerWeek"
                            className="text-card-foreground mb-2 block"
                          >
                            Max Messages Per Week
                          </Label>
                          <Input
                            id="edit-maxMessagesPerWeek"
                            type="number"
                            value={editLinkedIn.maxMessagesPerWeek}
                            onChange={(e) =>
                              setEditLinkedIn({
                                ...editLinkedIn,
                                maxMessagesPerWeek: parseInt(e.target.value),
                              })
                            }
                            className="bg-background border-border text-foreground"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-4">
                        <Button
                          variant="outline"
                          onClick={() => setEditLinkedInOpen(false)}
                          disabled={updatingLinkedIn}
                          className="border-border text-foreground hover:bg-muted"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleUpdateLinkedIn}
                          disabled={updatingLinkedIn}
                          className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          {updatingLinkedIn ? "Updating..." : "Update Account"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Accounts Table */}
              <div className="border border-border rounded-lg overflow-hidden">
                {isInitialLoading ? (
                  <div className="p-12 text-center">
                    <div className="animate-spin h-12 w-12 mx-auto mb-4 border-4 border-muted-foreground border-t-primary rounded-full" />
                    <p className="text-muted-foreground">
                      Loading LinkedIn accounts...
                    </p>
                  </div>
                ) : linkedInIntegrations.length === 0 ? (
                  <div className="p-12 text-center">
                    <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2 text-card-foreground">
                      No LinkedIn accounts yet
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Click &apos;Add New LinkedIn Account&apos; to get started!
                    </p>
                  </div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                    <table className="w-auto min-w-full">
                      <thead className="bg-secondary border-b border-border sticky top-0 z-10">
                        <tr className="h-[50px]">
                          <th className="text-left px-3 font-medium text-sm leading-5 whitespace-nowrap w-[100px] min-w-[100px]">
                            Status
                          </th>
                          <th className="text-left px-3 font-medium text-sm leading-5 whitespace-nowrap">
                            Browser Controls
                          </th>
                          <th className="text-left px-3 font-medium text-sm leading-5 whitespace-nowrap">
                            Name
                          </th>
                          <th className="text-left px-3 font-medium text-sm leading-5 whitespace-nowrap max-w-[250px]">
                            Profile Handle
                          </th>
                          <th className="text-left px-3 font-medium text-sm leading-5 whitespace-nowrap">
                            Proxy
                          </th>
                          <th className="text-left px-3 font-medium text-sm leading-5 whitespace-nowrap">
                            Logged In
                          </th>
                          <th className="text-left px-3 font-medium text-sm leading-5 whitespace-nowrap">
                            Sales Navigator
                          </th>
                          <th className="text-left px-3 font-medium text-sm leading-5 whitespace-nowrap">
                            CR/week
                          </th>
                          <th className="text-left px-3 font-medium text-sm leading-5 whitespace-nowrap">
                            Msg/day
                          </th>
                          <th className="text-left px-3 font-medium text-sm leading-5 whitespace-nowrap"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...linkedInIntegrations]
                          .sort((a, b) =>
                            (a.fullName || "").localeCompare(b.fullName || ""),
                          )
                          .map((account) => {
                            const getStatus = () => {
                              if (!account.loginActiveLastValidated)
                                return "offline";
                              const lastValidated = new Date(
                                account.loginActiveLastValidated,
                              ).getTime();
                              const twoDaysAgo =
                                Date.now() - 2 * 24 * 60 * 60 * 1000;
                              if (lastValidated > twoDaysAgo) {
                                return browserStopped[account.id]
                                  ? "automating"
                                  : "running";
                              }
                              return "offline";
                            };
                            const status = getStatus();

                            const isLinkedInActive =
                              account.loginActiveLastValidated &&
                              new Date(
                                account.loginActiveLastValidated,
                              ).getTime() >
                                Date.now() - 2 * 24 * 60 * 60 * 1000;

                            const isSalesNavActive =
                              account.salesNavigatorActiveLastValidated &&
                              new Date(
                                account.salesNavigatorActiveLastValidated,
                              ).getTime() >
                                Date.now() - 2 * 24 * 60 * 60 * 1000;

                            const hasProxy = !!account.proxyUrl;

                            return (
                              <tr
                                key={account.id}
                                className="border-b border-border hover:bg-muted/50 h-[50px] cursor-pointer"
                                onClick={() => handleOpenSettingsModal(account)}
                              >
                                <td
                                  className="px-3 whitespace-nowrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                                        status === "running"
                                          ? "bg-green-500/10 text-green-500 border border-green-500/20"
                                          : status === "automating"
                                            ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                                            : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                                      }`}
                                    >
                                      {status === "running"
                                        ? "Running"
                                        : status === "automating"
                                          ? "Automating"
                                          : "Offline"}
                                    </span>
                                  </div>
                                </td>
                                <td
                                  className="px-3 whitespace-nowrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center justify-left gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-white bg-transparent hover:bg-secondary hover:border-secondary hover:text-white text-sm"
                                      onClick={() =>
                                        handleOpenLinkedIn(account.id)
                                      }
                                      disabled={openingBrowser === account.id}
                                    >
                                      {openingBrowser === account.id
                                        ? "Opening..."
                                        : "Open"}
                                      <ExternalLink className="h-3 w-3 ml-1" />
                                    </Button>
                                    {!browserStopped[account.id] ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                        onClick={() =>
                                          handleStopLinkedIn(account.id)
                                        }
                                        disabled={closingBrowser === account.id}
                                        title="Shutdown Browser"
                                      >
                                        {closingBrowser === account.id ? (
                                          <span className="animate-spin">
                                            ⏳
                                          </span>
                                        ) : (
                                          <X className="h-4 w-4" />
                                        )}
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                        onClick={() =>
                                          handleStopContainer(account.id)
                                        }
                                        disabled={
                                          stoppingContainerFor === account.id
                                        }
                                        title="Stop Container"
                                      >
                                        {stoppingContainerFor === account.id ? (
                                          <span className="animate-spin">
                                            ⏳
                                          </span>
                                        ) : (
                                          <Power className="h-4 w-4" />
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 text-card-foreground text-sm leading-5 whitespace-nowrap max-w-[200px] truncate">
                                  {account.fullName}
                                </td>
                                <td className="px-3 text-card-foreground text-sm leading-5 whitespace-nowrap max-w-[250px] truncate">
                                  {account.linkedinProfileUrl}
                                </td>
                                <td className="px-3 whitespace-nowrap">
                                  {hasProxy ? (
                                    <CheckCircle2 className="h-5 w-5 text-white" />
                                  ) : (
                                    <XCircle className="h-5 w-5 text-slate-500" />
                                  )}
                                </td>
                                <td className="px-3 whitespace-nowrap">
                                  {isLinkedInActive ? (
                                    <CheckCircle2 className="h-5 w-5 text-white" />
                                  ) : (
                                    <XCircle className="h-5 w-5 text-slate-500" />
                                  )}
                                </td>
                                <td className="px-3 whitespace-nowrap">
                                  {isSalesNavActive ? (
                                    <CheckCircle2 className="h-5 w-5 text-white" />
                                  ) : (
                                    <XCircle className="h-5 w-5 text-slate-500" />
                                  )}
                                </td>
                                <td className="px-3 text-sm text-card-foreground whitespace-nowrap">
                                  {account.maxConnectionRequestsPerWeek ?? "-"}
                                </td>
                                <td className="px-3 text-sm text-card-foreground whitespace-nowrap">
                                  -
                                </td>
                                <td
                                  className="px-3 whitespace-nowrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 hover:bg-accent"
                                      onClick={() =>
                                        handleOpenSettingsModal(account)
                                      }
                                      title="Settings"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* LinkedIn Settings Modal */}
            <LinkedInSettingsModal
              open={settingsModalOpen}
              onOpenChange={setSettingsModalOpen}
              account={selectedAccount}
              onSave={updateLinkedIn}
              onRefetch={refetchIntegrations}
              isSaving={updatingLinkedIn}
              teamWeeklyRestrictions={teamWeeklyRestrictions}
              onCleanContainer={cleanContainer}
              onSyncConnections={syncConnections}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
