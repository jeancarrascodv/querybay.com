"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@apollo/client";
import { useContactsStore, ContactList } from "@/store/useContactsStore";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLinkedInIntegrations } from "@/hooks/useLinkedInIntegrations";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";
import { useToast } from "@/components/ui/use-toast";
import { Copy, Edit, Check, Trash2 } from "lucide-react";
import { Textarea } from "../ui/textarea";
import { Mutations } from "@/graphql/team";

interface ContactListSidebarProps {
  contactLists: ContactList[];
  loading: boolean;
  setImportModalOpen: (open: boolean) => void;
  teamId: string | null;
}

export function ContactListSidebar({
  contactLists,
  loading,
  setImportModalOpen,
  teamId,
}: ContactListSidebarProps) {
  const { selectedListId, setSelectedListId, getContactLists } =
    useContactsStore();
  const {
    loading: isFetchingLinkedIn,
    integrations,
    refetchIntegrations,
  } = useLinkedInIntegrations();
  const { isRefreshing } = useTokenRefresh();
  const { toast } = useToast();

  useEffect(() => {
    if (!isFetchingLinkedIn && integrations.length === 0) {
      refetchIntegrations();
    }
  }, [isFetchingLinkedIn, integrations.length, refetchIntegrations]);

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<ContactList | null>(null);
  const [editName, setEditName] = useState("");
  const [copied, setCopied] = useState(false);

  // Mutations
  const [mutateContactList, { loading: renaming }] = useMutation(
    Mutations.MUTATE_CONTACT_LIST,
  );
  const [deleteContactLists, { loading: deleting }] = useMutation(
    Mutations.DELETE_CONTACT_LISTS,
  );

  // Delete confirmation modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<ContactList | null>(null);

  const handleEditClick = (e: React.MouseEvent, list: ContactList) => {
    e.stopPropagation();
    setEditingList(list);
    setEditName(list.name);
    setEditModalOpen(true);
  };

  const handleCopyClick = (e: React.MouseEvent, list: ContactList) => {
    e.stopPropagation();
    setEditingList(list);
    setCopied(false);
    setCopyModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingList || !editName.trim() || !teamId) return;

    try {
      await mutateContactList({
        variables: { id: editingList.id, name: editName.trim() },
      });

      toast({
        title: "List Renamed",
        description: `List renamed to "${editName}"`,
      });

      // Refresh contact lists
      await getContactLists(teamId);

      setEditModalOpen(false);
      setEditingList(null);
      setEditName("");
    } catch (error) {
      console.error("Error renaming list:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to rename the list",
      });
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, list: ContactList) => {
    e.stopPropagation();
    setListToDelete(list);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!listToDelete || !teamId) return;

    try {
      await deleteContactLists({
        variables: { ids: [listToDelete.id] },
      });

      toast({
        title: "List Deleted",
        description: `"${listToDelete.name}" has been deleted`,
      });

      // Clear selection if deleted list was selected
      if (selectedListId === listToDelete.id) {
        setSelectedListId(null);
      }

      // Refresh contact lists
      await getContactLists(teamId);
    } catch (error) {
      console.error("Error deleting list:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete the list",
      });
    } finally {
      setDeleteConfirmOpen(false);
      setListToDelete(null);
    }
  };

  const handleCopyUrl = () => {
    if (!editingList?.salesNavQuery) return;

    navigator.clipboard.writeText(editingList.salesNavQuery);
    setCopied(true);

    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Card className="h-full w-64 mx-3 border-border dark:bg-gray-850 dark:border-gray-700">
        <CardContent className="p-4">
          <ScrollArea className="h-[calc(100vh-140px)] mt-2">
            <Button
              onClick={() => setImportModalOpen(true)}
              className="bg-primary dark:bg-white-600 hover:bg-primary/90 dark:hover:bg-white-700 text-primary-foreground"
              disabled={!teamId || isFetchingLinkedIn || isRefreshing}
            >
              Import Contacts
            </Button>
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <Loader />
              </div>
            ) : (
              <div className="space-y-4 mt-10">
                {contactLists.map((list) => (
                  <Card
                    key={list.id}
                    className={`w-full cursor-pointer transition-colors group ${
                      selectedListId === list.id
                        ? "dark:bg-blue-600/20 bg-accent"
                        : "hover:bg-accent/50 dark:hover:bg-gray-700/50"
                    }`}
                    onClick={() => setSelectedListId(list.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex flex-col w-full items-start gap-1">
                        <div className="flex justify-between items-center w-full">
                          <span className="font-medium text-sm">
                            {list.name}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground dark:text-gray-400">
                          {list.salesNavQuery
                            ? "Sales Navigator"
                            : "Imported from CSV"}{" "}
                          {list.linkedinId
                            ? "- " +
                                integrations.find(
                                  (i) => i.id === list.linkedinId,
                                )?.fullName || "LinkedIn"
                            : ""}
                        </p>
                        <div className="flex w-full items-center justify-between">
                          <div className="flex justify-between items-center w-full mt-1">
                            <div className="visible group-hover:hidden">
                              <p className="text-xs text-muted-foreground dark:text-gray-400 ">
                                {list.createdDate
                                  ? new Date(
                                      list.createdDate,
                                    ).toLocaleDateString()
                                  : ""}
                              </p>
                            </div>
                            {/* Action buttons - visible on hover */}
                            <div className="flex gap-1 hidden group-hover:flex">
                              <button
                                onClick={(e) => handleEditClick(e, list)}
                                className="p-1 rounded hover:bg-accent transition-colors"
                                title="Edit list name"
                                disabled={renaming}
                              >
                                <Edit className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </button>
                              {list.salesNavQuery && (
                                <button
                                  onClick={(e) => handleCopyClick(e, list)}
                                  className="p-1 rounded hover:bg-accent transition-colors"
                                  title="Copy Sales Navigator URL"
                                >
                                  <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                </button>
                              )}
                              <button
                                onClick={(e) => handleDeleteClick(e, list)}
                                className="p-1 rounded hover:bg-destructive/10 transition-colors"
                                title="Delete list"
                                disabled={deleting}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          </div>
                          <span className="text-xs">
                            {list.contacts?.length || 0}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Edit List Name Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent
          className="bg-card border-border shadow-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-card-foreground">
              Edit List Name
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="list-name" className="text-card-foreground">
                List Name
              </Label>
              <Input
                id="list-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter list name"
                className="mt-2 bg-background border-border text-foreground"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setEditModalOpen(false)}
                className="border-border text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={!editName.trim() || renaming}
                className="bg-white text-black hover:bg-gray-200"
              >
                {renaming ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Copy Sales Navigator URL Modal */}
      <Dialog open={copyModalOpen} onOpenChange={setCopyModalOpen}>
        <DialogContent
          className="bg-card border-border shadow-lg min-w-[800px] max-h-[800px]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-card-foreground">
              Sales Navigator URL
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-card-foreground">URL</Label>
              <div className="flex gap-2 mt-2">
                <Textarea
                  value={editingList?.salesNavQuery || "No URL available"}
                  readOnly
                  className="bg-background border-border text-foreground flex-1 min-h-[300px] h-full"
                />
                <Button
                  onClick={handleCopyUrl}
                  disabled={!editingList?.salesNavQuery}
                  variant="outline"
                  className="border-border text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => setCopyModalOpen(false)}
                className="bg-white text-black hover:bg-gray-200"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent
          className="bg-card border-border shadow-lg max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-card-foreground">
              Delete Contact List
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <strong>&quot;{listToDelete?.name}&quot;</strong>? This action
              cannot be undone and will remove all{" "}
              {listToDelete?.contacts?.length || 0} contacts from this list.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setListToDelete(null);
                }}
                className="border-border text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmDelete}
                disabled={deleting}
                variant="destructive"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
