"use client";

import React, { useState } from "react";
import { MessageList } from "./message-list";
import { ChatArea } from "./chat-area";
import { ContactInfo } from "./contact-info";
import { mockContacts } from "./mock-data";

export const InboxPage = () => {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    mockContacts[0].id
  );

  const selectedContact =
    mockContacts.find((c) => c.id === selectedContactId) || null;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-900 ml-5 m-5 rounded-xl ">
      <MessageList
        contacts={mockContacts}
        selectedContactId={selectedContactId}
        onSelectContact={setSelectedContactId}
      />
      <ChatArea contact={selectedContact} />
      <ContactInfo contact={selectedContact} />
    </div>
  );
};
