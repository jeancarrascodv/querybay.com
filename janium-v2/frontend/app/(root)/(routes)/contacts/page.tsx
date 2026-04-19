"use client";

import { useEffect, useRef } from "react";
import { useMutation } from "@apollo/client";
import { useContactsStore } from "@/store/useContactsStore";
import { ContactListSidebar } from "@/components/contact/contact-list-sidebar";
import { ContactsTable } from "@/components/contact/contacts-table";
import { ImportContactsModal } from "@/components/contact/import-contacts-modal";
import { AddToCampaignModal } from "@/components/contact/add-to-campaign-modal";
import { Button } from "@/components/ui/button";
import { Mutations } from "@/graphql/team";
import { LoadingState, BackgroundRefreshIndicator } from "@/components/ui/loading-state";
import TeamSwitcher from "@/components/team-switcher";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";
import { useTeamStore } from "@/store/useTeamStore";

export default function ImportClient() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { refreshAccessToken, isRefreshing } = useTokenRefresh();
  const { teams } = useTeamStore();
  const {
    setImportModalOpen,
    importModalOpen,
    addToCampaignModalOpen,
    contactLists,
    getContactLists,
    isInitialLoading,
    isBackgroundRefreshing,
    loading: storeLoading,
    error: storeError,
  } = useContactsStore();

  const teamId = user?.team_id;
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // GraphQL mutation for uploading contacts
  const [uploadContactsMutation, { loading: uploading }] = useMutation(
    Mutations.UPLOAD_CONTACTS,
  );

  const loading = storeLoading || uploading;

  // Fetch contact lists when teamId changes (uses cache-first, background refresh)
  useEffect(() => {
    if (teamId) {
      getContactLists(teamId);
    }
  }, [teamId, getContactLists]);

  // Auto-refresh every 30 seconds when no modals are open (contacts can change externally)
  useEffect(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    // Only set up interval if we have a teamId and no modals are open
    if (teamId && !importModalOpen && !addToCampaignModalOpen) {
      refreshIntervalRef.current = setInterval(() => {
        // Force refresh in background - will show cached data while fetching
        if (!isInitialLoading) {
          getContactLists(teamId, true);
        }
      }, 30000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [teamId, importModalOpen, addToCampaignModalOpen, isInitialLoading, getContactLists]);

  // Handle team change
  const handleTeamChange = async (newTeamId: string) => {
    try {
      await refreshAccessToken(newTeamId);
      await getContactLists(newTeamId);

      toast({
        title: "Team Switched",
        description: `Switched to ${teams.find((t) => t.id === newTeamId)?.name}`,
      });
    } catch (error) {
      console.error("Error switching teams:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to switch teams",
      });
    }
  };

  // Handle file upload
  const handleFileUpload = async (file: File, listName: string) => {
    if (!teamId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No team selected",
      });
      return;
    }

    try {
      const result = await uploadContactsMutation({
        variables: { file, listName },
      });

      const uploadData = result.data?.team?.uploadContactListCsv;

      if (uploadData) {
        const contactsCount = uploadData.contacts?.length || 0;
        const rejectedCount = uploadData.rejectedContacts?.length || 0;

        toast({
          title: "Upload Successful",
          description: `Uploaded ${contactsCount} contacts to "${uploadData.contactList?.name}"${rejectedCount > 0 ? `. ${rejectedCount} contacts were rejected.` : ""}`,
        });

        await getContactLists(teamId);
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description:
          error instanceof Error ? error.message : "Failed to upload contacts",
      });
    }
  };

  return (
    <div className="flex h-[calc(100vh-80px)] bg-background dark:bg-gray-900 text-foreground dark:text-gray-200 font-sans overflow-hidden">
      {/* Sidebar */}
      <ContactListSidebar
        contactLists={contactLists}
        loading={isInitialLoading}
        setImportModalOpen={setImportModalOpen}
        teamId={teamId || null}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Background refresh indicator */}
        {isBackgroundRefreshing && (
          <div className="absolute top-4 right-4 z-10">
            <BackgroundRefreshIndicator isRefreshing={isBackgroundRefreshing} />
          </div>
        )}

        {/* Contacts Table */}
        <div className="flex-1 flex flex-col overflow-hidden p-4">
          {!teamId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p>Please select a team to view contacts</p>
            </div>
          ) : (
            <LoadingState
              isInitialLoading={isInitialLoading}
              isBackgroundRefreshing={isBackgroundRefreshing}
              isEmpty={contactLists.length === 0}
              emptyMessage="No contact lists found"
              emptyDescription="Import your first contact list to get started"
              emptyAction={{
                label: "Import Contacts",
                onClick: () => setImportModalOpen(true),
              }}
              error={storeError}
              onRetry={() => teamId && getContactLists(teamId, true)}
            >
              <ContactsTable />
            </LoadingState>
          )}
        </div>
      </main>

      {/* Modals */}
      <ImportContactsModal
        onFileUpload={handleFileUpload}
        teamId={teamId}
        uploading={uploading}
      />
      <AddToCampaignModal teamId={teamId || ""} />
    </div>
  );
}
