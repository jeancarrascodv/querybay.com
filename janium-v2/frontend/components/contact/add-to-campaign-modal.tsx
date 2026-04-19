"use client";

import { useState, useEffect, useMemo } from "react";
import { useContactsStore } from "@/store/useContactsStore";
import { useCampaignStore } from "@/store/useCampaignStore";
import { useCampaign } from "@/hooks/useCampaign";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Campaign {
  id: string;
  name: string;
}

export function AddToCampaignModal({ teamId }: { teamId: string }) {
  const {
    addToCampaignModalOpen,
    setAddToCampaignModalOpen,
    selectedContacts,
    addContactsToCampaign,
    selectedListId,
    contactLists,
  } = useContactsStore();
  const { campaigns, getCampaigns } = useCampaignStore();
  const { toast } = useToast();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Get the selected contact list name (memoized to avoid recalculating on every render)
  const selectedListName = useMemo(() => {
    if (!selectedListId) return null;
    return (
      contactLists.find((list) => list.id === selectedListId)?.name ?? null
    );
  }, [selectedListId, contactLists]);

  // Reset campaign selection when modal opens and campaigns are loaded
  useEffect(() => {
    if (addToCampaignModalOpen && campaigns?.length > 0) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [addToCampaignModalOpen, campaigns]);

  const handleClose = () => {
    setAddToCampaignModalOpen(false);
    setSelectedCampaignId("");
  };
  useEffect(() => {
    if (campaigns?.length === 0) {
      setLoadingCampaigns(true);
      getCampaigns().finally(() => {
        setLoadingCampaigns(false);
      });
    }
  }, [teamId]);

  const handleAddToCampaign = async () => {
    if (!selectedCampaignId) return;

    setIsLoading(true);
    try {
      // Convert Set to Array for the API call
      const contactIds = Array.from(selectedContacts);

      const result = await addContactsToCampaign(
        selectedCampaignId,
        contactIds,
        teamId, // Pass the team ID
      );

      // Show detailed feedback based on results
      if (result.added > 0 && result.skipped > 0) {
        toast({
          title: "Contacts added with duplicates skipped",
          description: `Added ${result.added} new contacts. Skipped ${result.skipped} duplicates out of ${result.total} total.`,
          variant: "default",
        });
      } else if (result.added > 0 && result.skipped === 0) {
        toast({
          title: "Contacts added successfully",
          description: `Successfully added ${result.added} contact${result.added !== 1 ? "s" : ""} to the campaign.`,
          variant: "default",
        });
      } else if (result.skipped > 0 && result.added === 0) {
        toast({
          title: "No new contacts added",
          description: `All ${result.skipped} contact${result.skipped !== 1 ? "s" : ""} were already in the campaign.`,
          variant: "default",
        });
      }

      handleClose();
    } catch (error) {
      console.error("Failed to add contacts to campaign:", error);
      toast({
        title: "Error adding contacts",
        description: "Failed to add contacts to campaign. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCount = selectedContacts.size;
  if (campaigns === undefined) return null;

  return (
    <Dialog
      open={addToCampaignModalOpen}
      onOpenChange={setAddToCampaignModalOpen}
    >
      <DialogContent className="sm:max-w-md bg-background dark:bg-gray-850 border-border dark:border-gray-700 text-foreground dark:text-gray-200">
        <DialogHeader>
          <DialogTitle className="text-foreground dark:text-white">
            Add contacts to campaign
          </DialogTitle>
          <DialogDescription className="text-muted-foreground dark:text-gray-400">
            Add selected contacts to an existing campaign
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground dark:text-gray-400">
              You have selected {selectedCount} contact
              {selectedCount !== 1 ? "s" : ""}.
            </p>
            {selectedListName && (
              <p className="text-sm text-muted-foreground dark:text-gray-400 flex items-center gap-2">
                <span className="font-medium text-foreground dark:text-gray-300">
                  From Contact list:
                </span>{" "}
                <span className="inline-flex text-foreground dark:text-white">
                  {selectedListName}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="campaignSelect">Choose a Campaign</Label>
            <Select
              value={selectedCampaignId}
              onValueChange={setSelectedCampaignId}
              disabled={loadingCampaigns}
            >
              <SelectTrigger
                id="campaignSelect"
                className="bg-background dark:bg-gray-700 border-input dark:border-gray-600"
              >
                <SelectValue
                  placeholder={
                    loadingCampaigns
                      ? "Loading campaigns..."
                      : "Select a campaign"
                  }
                />
              </SelectTrigger>
              <SelectContent className="bg-background dark:bg-gray-800 border-input dark:border-gray-600">
                {loadingCampaigns ? (
                  <SelectItem value="loading" disabled>
                    Loading campaigns...
                  </SelectItem>
                ) : campaigns?.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No campaigns available
                  </SelectItem>
                ) : (
                  campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            className="border border-input dark:border-gray-600 hover:bg-accent dark:hover:bg-gray-700 text-foreground dark:text-gray-300"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAddToCampaign}
            disabled={
              !selectedCampaignId ||
              campaigns?.length === 0 ||
              isLoading ||
              loadingCampaigns
            }
            className="bg-primary  hover:bg-primary/90 text-primary-foreground"
          >
            {isLoading ? "Adding..." : "Add to Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
