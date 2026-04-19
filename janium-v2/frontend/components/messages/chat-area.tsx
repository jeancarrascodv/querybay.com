import React from "react";
import {
  MoreVertical,
  Send,
  Settings,
  Inbox,
  Mail,
  Linkedin,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Contact } from "./mock-data";
import { cn } from "@/lib/utils";

interface ChatAreaProps {
  contact: Contact | null;
}

export const ChatArea = ({ contact }: ChatAreaProps) => {
  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-1 ">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="h-20 w-20 bg-secondary/30 rounded-full flex items-center justify-center">
            <Inbox className="h-10 w-10" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="font-semibold text-lg text-foreground">
              Integrations Text
            </h3>
            <p>Select a chat to start messaging</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[98%] flex-1 bg-slate-800 m-3 rounded-xl ">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-slate-700 rounded-t-xl h-[69px]">
        <div className="flex items-center gap-4">
          <Avatar className="h-11 w-11">
            <AvatarImage src={contact.avatar} />
            <AvatarFallback>{contact.name.substring(0, 2)}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold text-base">{contact.name}</h3>
            <p className="text-xs text-muted-foreground">
              {contact.role}, {contact.company}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-5 w-5 text-muted-foreground" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-6 py-4 ">
        <div className="space-y-6">
          {/* Date Separator */}
          <div className="flex items-center gap-4 my-6">
            <Separator className="flex-1" />
            <span className="text-xs font-medium text-muted-foreground">
              Nov 16
            </span>
            <Separator className="flex-1" />
          </div>

          {contact.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex flex-col gap-2 max-w-[85%]",
                message.isMe ? "ml-auto items-end" : "items-start"
              )}
            >
              {/* Message Header */}
              <div className="flex items-center gap-2 px-1">
                {!message.isMe && (
                  <div className="flex items-center gap-2 bg-secondary/20 px-2 py-0.5 rounded-full">
                    {message.type === "email" ? (
                      <Mail className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Linkedin className="h-3 w-3 text-blue-600" />
                    )}
                    <span className="text-xs font-medium text-muted-foreground">
                      Via {message.type === "email" ? "Email" : "LinkedIn"}
                    </span>
                  </div>
                )}
                <span className="text-[11px] text-muted-foreground uppercase font-medium">
                  {message.timestamp}
                </span>
                {message.isMe && (
                  <div className="flex items-center gap-2 bg-secondary/20 px-2 py-0.5 rounded-full">
                    <span className="text-xs font-medium text-muted-foreground">
                      Via {message.type === "email" ? "Email" : "LinkedIn"}
                    </span>
                    <Avatar className="h-4 w-4">
                      <AvatarImage src="https://github.com/shadcn.png" />
                      <AvatarFallback>ME</AvatarFallback>
                    </Avatar>
                  </div>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={cn(
                  "p-4 text-[15px] leading-relaxed shadow-sm",
                  message.isMe
                    ? "bg-[#bfffd5] text-slate-700 rounded-tl-[18px] rounded-bl-[18px] rounded-br-[18px] rounded-tr-none"
                    : "bg-[#c9e5fb] dark:bg-blue-900/20 text-slate-800 dark:text-slate-200 rounded-tr-2xl rounded-br-2xl rounded-bl-2xl"
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t ">
        <div className="flex items-center gap-2 bg-slate-900  p-2 rounded-xl border border-transparent  transition-colors">
          {/* Channel Selector */}
          <Select defaultValue="linkedin">
            <SelectTrigger className="w-fit h-8 gap-2 px-3 border shadow-sm bg-slate-800 hover:bg-accent/50 transition-colors rounded-lg focus:ring-0 hover:text-white">
              <SelectValue placeholder="Select channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linkedin">
                <div className="flex items-center gap-2">
                  <span>LinkedIn</span>
                </div>
              </SelectItem>
              <SelectItem value="email">
                <div className="flex items-center gap-2">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <span>Email</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Type your message here"
            className="flex-1 border-none bg-transparent shadow-none focus-visible:ring-0 h-auto py-2"
          />

          <div className="flex items-center gap-1 border-l pl-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button size="icon" className="h-8 w-8 rounded-lg shadow-sm">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
