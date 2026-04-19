"use client";

import { useEffect, useMemo, useState } from "react";
import { useContactsStore } from "@/store/useContactsStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UploadCloud, Download } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLinkedInIntegrations } from "@/hooks/useLinkedInIntegrations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTeam } from "@/hooks/useTeam";

interface ImportContactsModalProps {
  onFileUpload?: (file: File, listName: string) => Promise<void>;
  teamId?: string | null;
  teamName?: string;
  uploading?: boolean;
}

export function ImportContactsModal({
  onFileUpload,
  teamId,
  teamName = "",
  uploading = false,
}: ImportContactsModalProps = {}) {
  const { user } = useAuth();
  const { teams, currentTeamId } = useTeam();
  const {
    importModalOpen,
    setImportModalOpen,
    importContacts,
    getContactLists,
  } = useContactsStore();
  const [activeTab, setActiveTab] = useState<"csv" | "salesNav">("salesNav");
  const [listName, setListName] = useState("");
  const [salesNavUrl, setSalesNavUrl] = useState("");
  const [selectedLinkedInProfile, setSelectedLinkedInProfile] =
    useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const currentTeam = useMemo(
    () => teams.find((team) => team.id === (teamId || currentTeamId)),
    [teams, teamId, currentTeamId],
  );
  // Get LinkedIn integrations for the dropdown
  const {
    integrations: linkedInIntegrations,
    refetchIntegrations,
    createContactList,
    creatingContactList,
  } = useLinkedInIntegrations();

  useEffect(() => {
    if (importModalOpen) {
      // Reset form state when modal opens
      refetchIntegrations();
    }
  }, [importModalOpen, refetchIntegrations, currentTeamId]);

  const handleClose = () => {
    setImportModalOpen(false);
    // Reset form state
    setListName("");
    setSalesNavUrl("");
    setSelectedLinkedInProfile("");
    setFileName(null);
    setFile(null);
    setUploadError(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      setFileName(selectedFile.name);
      setFile(selectedFile);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      const droppedFile = event.dataTransfer.files[0];
      setFileName(droppedFile.name);
      setFile(droppedFile);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      window.location.href = "/api/contacts/template";
      toast({
        title: "Template Download Started",
        description: "Your CSV template is being downloaded",
      });
    } catch (error) {
      console.error("Error downloading template:", error);
      toast({
        title: "Download Failed",
        description: "Failed to download template. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleImport = async () => {
    setIsLoading(true);
    setUploadError(null);

    try {
      if (activeTab === "csv" && file) {
        if (!onFileUpload) {
          throw new Error("File upload handler not provided");
        }

        if (!teamId) {
          throw new Error("No team selected");
        }

        if (!user) {
          throw new Error("Not authenticated");
        }

        // Use the GraphQL mutation handler passed from parent
        await onFileUpload(file, listName);

        toast({
          title: "CSV Upload Successful",
          description: "Your contacts have been successfully imported.",
        });

        handleClose();
      } else if (
        activeTab === "salesNav" &&
        salesNavUrl &&
        selectedLinkedInProfile
      ) {
        // Use the createContactList mutation for Sales Navigator
        const contactListId = await createContactList(
          selectedLinkedInProfile,
          listName,
          salesNavUrl,
        );

        toast({
          title: "Sales Navigator Import Successful",
          description: `Contact list created with ID: ${contactListId}`,
        });

        // Refresh contact lists after successful import
        if (teamId || currentTeamId) {
          await getContactLists(teamId || currentTeamId || "");
        }

        handleClose();
      }
    } catch (error) {
      console.error("Import failed:", error);
      setUploadError(
        error instanceof Error ? error.message : "Unknown error occurred",
      );
      toast({
        title: "Import Failed",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isImportDisabled =
    !listName ||
    (activeTab === "csv" && !file) ||
    (activeTab === "salesNav" && (!salesNavUrl || !selectedLinkedInProfile));

  return (
    <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
      <DialogContent className="sm:max-w-md bg-background dark:bg-gray-850 border-border dark:border-gray-700 text-foreground dark:text-gray-200">
        <DialogHeader>
          <DialogTitle className="text-foreground dark:text-white">
            Import Contacts
          </DialogTitle>
          <DialogDescription className="text-muted-foreground dark:text-gray-400">
            {teamId
              ? `Import contacts to ${currentTeam?.name || "Unknown Team"}`
              : "Import contacts from CSV or Sales Navigator"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="listName">List Name</Label>
            <Input
              id="listName"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="Choose a name for this contact list"
              className="bg-background dark:bg-gray-700 border-input dark:border-gray-600"
            />
          </div>

          <Tabs
            defaultValue="salesNav"
            onValueChange={(v) => setActiveTab(v as "csv" | "salesNav")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="salesNav">Sales Navigator</TabsTrigger>
              <TabsTrigger value="csv">Upload CSV</TabsTrigger>
            </TabsList>

            <TabsContent value="csv" className="mt-4">
              {/* Template download button */}
              <div className="mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="w-full border-input dark:border-gray-600 text-foreground dark:text-gray-300 flex items-center justify-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV Template
                </Button>
                <p className="mt-1 text-xs text-muted-foreground dark:text-gray-400">
                  Download our template to ensure your CSV has all required
                  columns.
                </p>
              </div>

              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer border-border dark:border-gray-600 bg-muted/50 dark:bg-gray-700/50 hover:bg-muted dark:hover:bg-gray-700/80 transition-colors"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                  <UploadCloud className="w-8 h-8 mb-3 text-muted-foreground dark:text-gray-400" />
                  {fileName ? (
                    <p className="text-sm text-foreground dark:text-gray-300 font-medium">
                      {fileName}
                    </p>
                  ) : (
                    <>
                      <p className="mb-1 text-sm text-muted-foreground dark:text-gray-400">
                        <span className="font-semibold">Choose a file</span> or
                        drag & drop it here
                      </p>
                      <p className="text-xs text-muted-foreground/70 dark:text-gray-500">
                        Max File size: 200MB (CSV)
                      </p>
                    </>
                  )}
                </div>
                <input
                  id="dropzone-file"
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept=".csv"
                  onChange={handleFileChange}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  document.getElementById("dropzone-file")?.click()
                }
                className="w-full mt-2 border-input dark:border-gray-600 text-foreground dark:text-gray-300"
              >
                Browse File
              </Button>
            </TabsContent>

            <TabsContent value="salesNav" className="mt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="linkedInProfile">LinkedIn Profile</Label>
                  <Select
                    value={selectedLinkedInProfile}
                    onValueChange={setSelectedLinkedInProfile}
                  >
                    <SelectTrigger
                      className="bg-background dark:bg-gray-700 border-input dark:border-gray-600"
                      disabled={linkedInIntegrations.length === 0}
                    >
                      <SelectValue placeholder="Select a LinkedIn profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {linkedInIntegrations.map((integration) => (
                        <SelectItem key={integration.id} value={integration.id}>
                          {integration.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {linkedInIntegrations.length === 0 && (
                    <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                      No LinkedIn profiles available. Please add a LinkedIn
                      integration first.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="salesNavUrl">Sales Navigator URL</Label>
                  <Input
                    id="salesNavUrl"
                    type="url"
                    value={salesNavUrl}
                    onChange={(e) => setSalesNavUrl(e.target.value)}
                    placeholder="Paste Sales Navigator URL here"
                    className="bg-background dark:bg-gray-700 border-input dark:border-gray-600"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {uploadError && (
            <div className="text-red-500 text-sm mt-2">
              Error: {uploadError}
            </div>
          )}
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
            type="submit"
            onClick={handleImport}
            disabled={
              isImportDisabled ||
              isLoading ||
              uploading ||
              (activeTab === "salesNav" && creatingContactList)
            }
            className="bg-primary hover:bg-primary/90  text-primary-foreground"
          >
            {isLoading ||
            uploading ||
            (activeTab === "salesNav" && creatingContactList)
              ? "Importing..."
              : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
