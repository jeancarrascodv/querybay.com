import React from "react";
import {
  ChevronRight,
  Plus,
  PenSquare,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Contact } from "./mock-data";

interface ContactInfoProps {
  contact: Contact | null;
}

export const ContactInfo = ({ contact }: ContactInfoProps) => {
  if (!contact) {
    return (
      <div className="w-[350px] border-l bg-slate-900 p-4 hidden lg:block">
        <div className="text-center text-muted-foreground mt-10">
          Select a contact to view details
        </div>
      </div>
    );
  }

  return (
    <div className="w-[350px] border-l bg-slate-900 flex flex-col h-full hidden lg:flex">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg">Contact Info</h2>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="bg-secondary/30 rounded-xl p-4 flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={contact.avatar} />
              <AvatarFallback>{contact.name.substring(0, 2)}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold">{contact.name}</h3>
              <p className="text-sm text-muted-foreground">
                {contact.location}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Emails</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                {contact.emails.map((email, i) => (
                  <div key={i}>{email}</div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-medium mb-2">Phone Numbers</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                {contact.phones.map((phone, i) => (
                  <div key={i}>{phone}</div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-medium mb-2">Roles</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>
                  Vice President of Sales at{" "}
                  <span className="underline cursor-pointer">Google</span>
                </div>
                <div>
                  Founder at{" "}
                  <span className="underline cursor-pointer">XYZ Company</span>
                </div>
              </div>
            </div>
          </div>

          {/* Accordions / Sections */}
          <div className="pt-4">
            <Accordion type="multiple" className="w-full">
              <AccordionItem value="campaign-info">
                <AccordionTrigger className="hover:no-underline hover:bg-secondary/20 px-2 -mx-2 rounded-md">
                  Campaign Info
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <div className="space-y-2">
                    {contact.campaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="flex items-center justify-between p-2 bg-secondary/10 rounded-md"
                      >
                        <span className="text-sm font-medium">
                          {campaign.name}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            campaign.status === "active"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : campaign.status === "completed"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          }`}
                        >
                          {campaign.status}
                        </span>
                      </div>
                    ))}
                    {contact.campaigns.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No active campaigns
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="contact-log">
                <AccordionTrigger className="hover:no-underline hover:bg-secondary/20 px-2 -mx-2 rounded-md">
                  Contact Log
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <div className="space-y-3 relative pl-2">
                    {/* Timeline line */}
                    <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

                    {contact.contactLog.map((log) => (
                      <div key={log.id} className="flex gap-3 relative">
                        <div className="mt-1 relative z-10 bg-background">
                          {log.status === "completed" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <span className="text-sm font-medium">
                              {log.title}
                            </span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                              {log.date}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {contact.contactLog.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No logs available
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="notes">
                <AccordionTrigger className="hover:no-underline hover:bg-secondary/20 px-2 -mx-2 rounded-md group">
                  <div className="flex items-center justify-between w-full pr-2">
                    <span>Notes</span>
                    <span className="text-xs text-green-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Add
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <div className="space-y-4">
                    {contact.notes.map((note) => (
                      <div
                        key={note.id}
                        className="bg-secondary/20 p-3 rounded-md space-y-2"
                      >
                        <p className="text-sm text-muted-foreground">
                          {note.content}
                        </p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{note.date}</span>
                          <PenSquare className="h-3 w-3 cursor-pointer hover:text-foreground" />
                        </div>
                      </div>
                    ))}

                    <div className="space-y-2">
                      <Textarea
                        placeholder="Write Note Here"
                        className="min-h-[80px] text-sm resize-none"
                      />
                      <div className="flex justify-end">
                        <Button size="sm" className="h-8">
                          Add Note
                        </Button>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
