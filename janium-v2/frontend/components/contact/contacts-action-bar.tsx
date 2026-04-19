"use client";

import { useMemo } from "react";
import { useContactsStore } from "@/store/useContactsStore";
import { Button } from "@/components/ui/button";
import { useCampaignStore } from "@/store/useCampaignStore";

export function ContactsActionBar() {
  const {
    selectedContacts,
    contacts,
    selectAllContacts,
    setAddToCampaignModalOpen,
    contactLists,
    selectedListId,
  } = useContactsStore();

  const selectedCount = useMemo(
    () => selectedContacts.size,
    [selectedContacts],
  );

  const currentList = useMemo(
    () => contactLists.find((list) => list.id === selectedListId),
    [contactLists, selectedListId],
  );

  const totalContactsInCurrentList = currentList?.count || contacts.length;

  const handleSelectAllFromList = () => {
    // In a real app, this might involve an API call to get all IDs
    // For now, we'll use the contacts we have loaded
    selectAllContacts(contacts.map((contact) => contact.id));
  };

  return (
    <div className="flex items-center justify-between p-4 bg-background dark:bg-gray-850 border-b border-border dark:border-gray-700 text-sm">
      <div className="flex items-center space-x-4">
        <span className="text-muted-foreground dark:text-gray-400">
          {selectedCount} / {totalContactsInCurrentList} contacts selected
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAllFromList}
          disabled={!selectedListId}
          className="text-foreground dark:text-gray-300 border-input dark:border-gray-600 hover:bg-accent dark:hover:bg-gray-700 hover:text-foreground dark:hover:text-gray-100"
        >
          Select all from list
        </Button>

        <Button
          variant="default"
          size="sm"
          onClick={() => setAddToCampaignModalOpen(true)}
          disabled={selectedCount === 0}
          className="bg-primary  hover:bg-primary/90 text-primary-foreground"
        >
          Add selected contacts to campaign
        </Button>
      </div>
    </div>
  );
}
