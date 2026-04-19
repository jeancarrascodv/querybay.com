import React from "react";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Contact } from "./mock-data";

interface MessageListProps {
  contacts: Contact[];
  selectedContactId: string | null;
  onSelectContact: (id: string) => void;
}

export const MessageList = ({
  contacts,
  selectedContactId,
  onSelectContact,
}: MessageListProps) => {
  return (
    <div className="flex flex-col h-full border-r  w-[400px]">
      <div className="p-5 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground">
            <Search className="h-4 w-4" />
          </div>
          <Input
            placeholder="Search..."
            className="pl-10 bg-secondary/30 border-none h-11 rounded-xl"
          />
        </div>

        {/* Filter Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">All Messages</span>
            <span className="text-xs text-muted-foreground">▼</span>
          </div>
          <Filter className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="flex flex-col gap-2 pb-4">
          {contacts.map((contact) => {
            const isUnread = contact.unreadCount > 0;
            const isSelected = selectedContactId === contact.id;

            return (
              <div
                key={contact.id}
                className={cn(
                  "flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all duration-200",
                  isSelected && !isUnread && "bg-secondary/50",
                  isUnread && "bg-green-50 dark:bg-green-900/10",
                  !isSelected && !isUnread && "hover:bg-secondary/30"
                )}
                onClick={() => onSelectContact(contact.id)}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={contact.avatar} />
                    <AvatarFallback>
                      {contact.name.substring(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  {contact.status === "online" && (
                    <span className="absolute top-0 left-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5">
                      <h3 className="font-semibold text-sm truncate">
                        {contact.name}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {contact.role}, {contact.company}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        {contact.lastMessageTime}
                      </span>
                      {contact.conversationStatus === "talking" && (
                        <div className="flex items-center gap-1 bg-slate-800 text-white px-1.5 py-0.5 rounded text-[10px] font-medium">
                          <span>Talking</span>
                          <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-sm text-muted-foreground truncate flex-1">
                      {contact.lastMessage}
                    </p>
                    {isUnread && (
                      <div className="h-5 w-5 rounded-full bg-green-400 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-slate-900">
                          {contact.unreadCount}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
