"use client";

import { useEffect } from "react";
import { useMutation } from "@apollo/client";
import { useContactsStore } from "@/store/useContactsStore";
import { ContactListSidebar } from "@/components/contact/contact-list-sidebar";
import { ContactsTable } from "@/components/contact/contacts-table";
import { ImportContactsModal } from "@/components/contact/import-contacts-modal";
import { AddToCampaignModal } from "@/components/contact/add-to-campaign-modal";
import { Button } from "@/components/ui/button";
import { Mutations } from "@/graphql/team";
import { Loader } from "@/components/ui/loader";
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
    contactLists,
    getContactLists,
    loading: storeLoading,
    error: storeError,
  } = useContactsStore();

  const teamId = user?.team_id;

  // GraphQL mutation for uploading contacts
  const [uploadContactsMutation, { loading: uploading }] = useMutation(
    Mutations.UPLOAD_CONTACTS
  );

  const loading = storeLoading || uploading;

  // Fetch contact lists when teamId changes
  useEffect(() => {
    if (teamId) {
      getContactLists(teamId);
    }
  }, [teamId, getContactLists]);

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
    <div className="flex h-screen bg-background dark:bg-gray-900 text-foreground dark:text-gray-200 font-sans">
      {/* Team Switcher */}
      <div className="absolute top-4 right-4 z-10">
        <TeamSwitcher
          teams={teams}
          currentTeamId={teamId || undefined}
          onTeamChange={handleTeamChange}
        />
      </div>

      {/* Sidebar */}
      <ContactListSidebar
        contactLists={contactLists}
        loading={loading}
        setImportModalOpen={setImportModalOpen}
        teamId={teamId || null}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        {/* <header className="flex justify-between items-center p-4 bg-background dark:bg-gray-900">
          <h1 className="text-xl font-semibold text-foreground dark:text-white">
            {teams.length > 0 && teamId
              ? `Team: ${teams.find((t) => t.id === teamId)?.name || "Default"}`
              : "Select a team"}
          </h1>
 
        </header> */}

        {/* Contacts Table */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader />
            </div>
          ) : storeError ? (
            <div className="flex flex-col items-center justify-center h-full text-destructive">
              <p className="text-lg font-semibold mb-2">
                Error Loading Contacts
              </p>
              <p className="text-sm text-muted-foreground mb-4">{storeError}</p>
              <Button
                onClick={() => teamId && getContactLists(teamId)}
                variant="outline"
              >
                Retry
              </Button>
            </div>
          ) : !teamId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p>Please select a team to view contacts</p>
            </div>
          ) : contactLists.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p className="text-lg mb-2">No contact lists found</p>
              <p className="text-sm mb-4">
                Import your first contact list to get started
              </p>
              <Button onClick={() => setImportModalOpen(true)} className="mt-4">
                Import Contacts
              </Button>
            </div>
          ) : (
            <ContactsTable />
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
