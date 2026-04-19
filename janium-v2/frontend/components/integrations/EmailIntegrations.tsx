"use client";

import * as React from "react";
import { CheckCircle2, XCircle, MoreHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  UnderlineTabs,
  UnderlineTabsList,
  UnderlineTabsTrigger,
  UnderlineTabsContent,
} from "@/components/ui/underline-tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// --- DUMMY DATA ---
const domainsData = [
  { name: "janium.io", dkim: true, spf: true, hourlyLimit: 12, dailyLimit: 56 },
  {
    name: "webflow.com",
    dkim: false,
    spf: false,
    hourlyLimit: 21,
    dailyLimit: 23,
  },
  {
    name: "example.com",
    dkim: false,
    spf: true,
    hourlyLimit: 54,
    dailyLimit: 12,
  },
  {
    name: "figma.com",
    dkim: true,
    spf: false,
    hourlyLimit: 30,
    dailyLimit: 45,
  },
  {
    name: "figma.com",
    dkim: true,
    spf: false,
    hourlyLimit: 30,
    dailyLimit: 45,
  },
  {
    name: "figma.com",
    dkim: true,
    spf: false,
    hourlyLimit: 30,
    dailyLimit: 45,
  },
];

const emailsData = [
  {
    email: "jason@janium.io",
    singleSender: true,
    responseIntegration: true,
    hourlyLimit: 12,
    dailyLimit: 56,
  },
  {
    email: "webflow@company.com",
    singleSender: false,
    responseIntegration: false,
    hourlyLimit: 21,
    dailyLimit: 23,
  },
  {
    email: "example@test.com",
    singleSender: false,
    responseIntegration: true,
    hourlyLimit: 54,
    dailyLimit: 12,
  },
];

const emailGroupsData = [
  {
    name: "Group 1",
    emails: ["jason@janium.io", "support@janium.io"],
  },
  {
    name: "Group 2",
    emails: ["sales@example.com", "marketing@example.com"],
  },
];

/**
 * Domains section component
 */
export function DomainsSection() {
  const router = useRouter();

  const navigateToDomainAuth = () => {
    router.push("/integrations/domain-authentication");
  };

  return (
    <div className="mb-12">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Domains</h2>
          <p className="text-slate-400 text-sm"></p>
        </div>
        <Button onClick={navigateToDomainAuth}>Authenticate New Domain</Button>
      </div>
      <div className="rounded-lg border border-slate-800">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-slate-900">
              <TableHead className="text-white">Domain</TableHead>
              <TableHead className="text-white">DKIM</TableHead>
              <TableHead className="text-white">Mail From/SPF</TableHead>
              <TableHead className="text-white">Hourly Limit</TableHead>
              <TableHead className="text-white">Daily Limit</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {domainsData.map((domain, index) => (
              <TableRow
                key={index}
                className="border-slate-800 hover:bg-slate-800/50"
              >
                <TableCell className="font-medium">{domain.name}</TableCell>
                <TableCell>
                  {domain.dkim ? (
                    <CheckCircle2 className="text-zinc-50" />
                  ) : (
                    <XCircle className="text-zinc-500" />
                  )}
                </TableCell>
                <TableCell>
                  {domain.spf ? (
                    <CheckCircle2 className="text-zinc-50" />
                  ) : (
                    <XCircle className="text-zinc-500" />
                  )}
                </TableCell>
                <TableCell>{domain.hourlyLimit}</TableCell>
                <TableCell>{domain.dailyLimit}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 hover:bg-slate-700"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="bg-slate-900 border-slate-700 text-white"
                    >
                      <DropdownMenuItem>Edit</DropdownMenuItem>
                      <DropdownMenuItem>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Emails section component
 */
export function EmailsSection() {
  const router = useRouter();

  const navigateToEmailAuth = () => {
    router.push("/integrations/email-authentication");
  };

  return (
    <div className="mb-12">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Emails</h2>
          <p className="text-slate-400 text-sm"></p>
        </div>
        <Button onClick={navigateToEmailAuth}>Authenticate New Email</Button>
      </div>
      <div className="rounded-lg border border-slate-800">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-slate-900">
              <TableHead className="text-white">Email Address</TableHead>
              <TableHead className="text-white">Single Sender</TableHead>
              <TableHead className="text-white">Response Integration</TableHead>
              <TableHead className="text-white">Hourly Limit</TableHead>
              <TableHead className="text-white">Daily Limit</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {emailsData.map((email, index) => (
              <TableRow
                key={index}
                className="border-slate-800 hover:bg-slate-800/50"
              >
                <TableCell className="font-medium">{email.email}</TableCell>
                <TableCell>
                  {email.singleSender ? (
                    <CheckCircle2 className="text-green-500" />
                  ) : (
                    <XCircle className="text-slate-500" />
                  )}
                </TableCell>
                <TableCell>
                  {email.responseIntegration ? (
                    <CheckCircle2 className="text-green-500" />
                  ) : (
                    <XCircle className="text-slate-500" />
                  )}
                </TableCell>
                <TableCell>{email.hourlyLimit}</TableCell>
                <TableCell>{email.dailyLimit}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 hover:bg-slate-700"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="bg-slate-900 border-slate-700 text-white"
                    >
                      <DropdownMenuItem>Edit</DropdownMenuItem>
                      <DropdownMenuItem>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Email groups section component
 */
export function EmailGroupsSection() {
  return (
    <div className="mb-12">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Email Groups</h2>
          <p className="text-slate-400 text-sm"></p>
        </div>
        <Button>Add New Email Group</Button>
      </div>
      <Accordion type="single" collapsible className="w-full space-y-4">
        {emailGroupsData.map((group, index) => (
          <AccordionItem
            key={index}
            value={`item-${index + 1}`}
            className="bg-slate-900 border-slate-800 rounded-lg px-4"
          >
            <AccordionTrigger className="hover:no-underline text-lg">
              {group.name}
            </AccordionTrigger>
            <AccordionContent>
              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-sm font-medium mb-2 text-slate-300">
                  Associated Emails
                </h3>
                <div className="flex flex-wrap gap-2 p-3 border border-slate-700 rounded-lg min-h-[60px] bg-slate-950">
                  {group.emails.map((email, emailIndex) => (
                    <div
                      key={emailIndex}
                      className="bg-slate-700/50 text-slate-50 rounded-md px-2 py-1 flex items-center gap-1.5 text-sm"
                    >
                      <span>{email}</span>
                      <button className="text-slate-400 hover:text-white">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

/**
 * Combined Email Integrations content with tabs support
 */
export function EmailIntegrationsContent() {
  // Check if any section has more than 5 items
  const shouldUseTabs =
    domainsData.length > 5 ||
    emailsData.length > 5 ||
    emailGroupsData.length > 5;

  if (shouldUseTabs) {
    return (
      <UnderlineTabs defaultValue="domains" className="w-full">
        <UnderlineTabsList>
          <UnderlineTabsTrigger value="domains">Domains</UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="emails">Emails</UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="email_groups">
            Email Groups
          </UnderlineTabsTrigger>
        </UnderlineTabsList>

        <UnderlineTabsContent value="domains">
          <DomainsSection />
        </UnderlineTabsContent>

        <UnderlineTabsContent value="emails">
          <EmailsSection />
        </UnderlineTabsContent>

        <UnderlineTabsContent value="email_groups">
          <EmailGroupsSection />
        </UnderlineTabsContent>
      </UnderlineTabs>
    );
  }

  return (
    <div>
      <DomainsSection />
      <EmailsSection />
      <EmailGroupsSection />
    </div>
  );
}
