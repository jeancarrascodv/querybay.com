import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash,
  Share,
  ExternalLink,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Eye,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Contact, CampaignContact } from "@/types/contact";
import { useContactsStore } from "@/store/useContactsStore";
import { useTeamStore } from "@/store/useTeamStore";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { ContactDetailsModal } from "@/components/contact/contact-details-modal";
import { BackgroundRefreshIndicator } from "@/components/ui/loading-state";

interface SourceTabProps {
  campaignId: string;
}

// Constants
const ITEMS_PER_PAGE = 30;

// Sort direction type
type SortDirection = "asc" | "desc" | null;
type SortField =
  | "name"
  | "title"
  | "company"
  | "location"
  | "status"
  | "lastActivity"
  | null;

const convertToCSV = (contacts: Contact[]) => {
  const headers = [
    "Full Name",
    "Company",
    "Title",
    "Location",
    "Email",
    "Last Updated",
  ];
  const rows = contacts.map((contact) => [
    contact.fullName || `${contact.firstName} ${contact.lastName}`,
    contact.company?.name || contact.companyName || "",
    contact.title || "",
    contact.location || contact.city || "",
    contact.emails?.[0]?.email || "",
    contact.updatedAt ? new Date(contact.updatedAt).toLocaleDateString() : "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  return csvContent;
};

// Helper function for campaign status badge styles - matching actions page styling
const getCampaignStatusBadgeStyles = (status: string): string => {
  switch (status) {
    case "END_STEP":
    case "FINISHED":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "IN_PROGRESS":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "PENDING_START_STEP":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    case "PENDING_START_STEP_ERROR":
    case "IN_PROGRESS_ERROR":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "WAITING_FOR_CONTACT":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
};

export function SourceTab({ campaignId }: SourceTabProps) {
  const router = useRouter();
  const {
    campaignContacts,
    loading: campaignLoading,
    getCampaignContacts,
    setCampaignContacts,
    isInitialLoading: campaignInitialLoading,
    isBackgroundRefreshing: campaignBackgroundRefreshing,
  } = useContactsStore();
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Sorting state - default to last activity (descending - newest first)
  const [sortField, setSortField] = useState<SortField>("lastActivity");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const currentTeamId = useTeamStore((state) => state.currentTeamId);

  // Modal state
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedCampaignContact, setSelectedCampaignContact] =
    useState<CampaignContact | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewContact = (
    contact: Contact,
    campaignContact: CampaignContact,
  ) => {
    setSelectedContact(contact);
    setSelectedCampaignContact(campaignContact);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedContact(null);
    setSelectedCampaignContact(null);
  };

  // Fetch campaign contacts when team or campaign changes
  // Uses cached-first approach: shows cached data immediately, refreshes in background
  useEffect(() => {
    if (currentTeamId && campaignId) {
      // getCampaignContacts now handles caching automatically
      // It will show cached data immediately if available, then refresh in background
      getCampaignContacts(currentTeamId, campaignId);
    }
  }, [campaignId, currentTeamId]);

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortField(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      // New field, set to asc
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Render sort indicator
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    if (sortDirection === "asc") return <ChevronUp className="ml-2 h-4 w-4" />;
    if (sortDirection === "desc")
      return <ChevronDown className="ml-2 h-4 w-4" />;
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };
  // Get unique statuses for filter
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(
      campaignContacts.map((c) => c.status || "IN_QUEUE"),
    );
    return Array.from(statuses).sort();
  }, [campaignContacts]);

  // Filter and sort campaign contacts
  const processedCampaignContacts = useMemo(() => {
    let result = campaignContacts;

    // Apply search filtering
    if (searchQuery) {
      result = result.filter((campaignContact) => {
        const contact = campaignContact.contact;
        if (!contact) return false;

        const fullName =
          contact.fullName || `${contact.firstName} ${contact.lastName}`;
        return (
          fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          contact.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (contact.company?.name || contact.companyName)
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          (contact.location || contact.city)
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase())
        );
      });
    }

    // Apply status filtering
    if (statusFilter !== "all") {
      result = result.filter((campaignContact) => {
        const status = campaignContact.status || "IN_QUEUE";
        return status === statusFilter;
      });
    }

    // Apply sorting
    if (sortField && sortDirection) {
      result = [...result].sort((a, b) => {
        let valueA, valueB;
        const contactA = a.contact;
        const contactB = b.contact;

        if (!contactA || !contactB) return 0;

        // Get the values to compare based on sortField
        switch (sortField) {
          case "name":
            valueA =
              contactA.fullName || `${contactA.firstName} ${contactA.lastName}`;
            valueB =
              contactB.fullName || `${contactB.firstName} ${contactB.lastName}`;
            break;
          case "title":
            valueA = contactA.title || "";
            valueB = contactB.title || "";
            break;
          case "company":
            valueA = contactA.company?.name || contactA.companyName || "";
            valueB = contactB.company?.name || contactB.companyName || "";
            break;
          case "location":
            valueA = contactA.location || contactA.city || "";
            valueB = contactB.location || contactB.city || "";
            break;
          case "status":
            valueA = a.status || "";
            valueB = b.status || "";
            break;
          case "lastActivity":
            valueA = a.lastAction || "";
            valueB = b.lastAction || "";
            break;
          default:
            return 0;
        }

        // Compare the values
        if (valueA < valueB) return sortDirection === "asc" ? -1 : 1;
        if (valueA > valueB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [campaignContacts, searchQuery, statusFilter, sortField, sortDirection]);

  const totalPages = Math.ceil(
    processedCampaignContacts.length / ITEMS_PER_PAGE,
  );

  const paginatedCampaignContacts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return processedCampaignContacts.slice(
      startIndex,
      startIndex + ITEMS_PER_PAGE,
    );
  }, [processedCampaignContacts, currentPage]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(
        paginatedCampaignContacts.map((contact) => contact.id),
      );
    } else {
      setSelectedContacts([]);
    }
  };

  const handleSelectContact = (contactId: string) => {
    setSelectedContacts((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId],
    );
  };

  // Handle select all contacts on the current page
  const handleSelectAllOnPage = () => {
    const contactIds = paginatedCampaignContacts.map((contact) => contact.id);
    if (isAllSelected) {
      // If all are selected, unselect all
      setSelectedContacts([]);
    } else {
      // Otherwise, select all on current page
      setSelectedContacts(contactIds);
    }
  };

  // Count selected contacts on the current page
  const selectedOnCurrentPage = paginatedCampaignContacts.filter((contact) =>
    selectedContacts.includes(contact.id),
  ).length;

  const isAllSelected =
    selectedOnCurrentPage === paginatedCampaignContacts.length &&
    paginatedCampaignContacts.length > 0;

  const handleExport = () => {
    const selectedContactsData = campaignContacts
      .filter((campaignContact) =>
        selectedContacts.includes(campaignContact.id),
      )
      .map((campaignContact) => campaignContact.contact)
      .filter(Boolean);

    const csvContent = convertToCSV(selectedContactsData);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `campaign-contacts-${campaignId}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full border rounded-md">
      {/* Fixed Header Controls - uses flex-shrink-0 to stay in place */}
      <div className="flex-shrink-0 flex flex-col gap-4 bg-background p-4 border-b">
        {/* Main controls - wraps on smaller screens */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left side: Search, Filter, Buttons */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
            {/* Search Bar */}
            <div className="relative w-full sm:w-auto min-w-[200px] max-w-[280px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1); // Reset to page 1 on search
                }}
                className="pl-9 w-full bg-background dark:bg-gray-800 border-input dark:border-gray-600 focus:border-primary dark:focus:border-blue-500"
              />
            </div>

            {/* Status Filter */}
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[180px] sm:w-[160px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                <SelectItem
                  value="all"
                  className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  All Statuses
                </SelectItem>
                {uniqueStatuses.map((status) => (
                  <SelectItem
                    key={status}
                    value={status}
                    className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    {status
                      .replace(/_/g, " ")
                      .toLowerCase()
                      .replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Background refresh indicator */}
            <BackgroundRefreshIndicator
              isRefreshing={campaignBackgroundRefreshing}
            />

            {/* Action Buttons - wrap on small screens */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selectedContacts.length === 0}
                className="text-xs sm:text-sm px-2 sm:px-3"
              >
                <Share className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="sm:hidden">Move</span>
                <span className="hidden sm:inline">Transfer</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedContacts.length === 0}
                onClick={handleExport}
                className="text-xs sm:text-sm px-2 sm:px-3"
              >
                <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="sm:hidden">Exp</span>
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedContacts.length === 0}
                className="text-xs sm:text-sm px-2 sm:px-3"
              >
                <Trash className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="sm:hidden">Del</span>
                <span className="hidden sm:inline">Delete</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  router.push("/import");
                }}
                className="text-xs sm:text-sm px-2 sm:px-3"
              >
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="whitespace-nowrap">Add Contacts</span>
              </Button>
            </div>
          </div>

          {/* Right side: Selection Info and Pagination */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between lg:justify-end gap-3">
            {/* Selection Info */}
            <div className="text-sm text-muted-foreground dark:text-gray-400 whitespace-nowrap">
              {selectedContacts.length} of {processedCampaignContacts.length}{" "}
              selected
            </div>

            {/* Pagination */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-gray-400">
              <span className="whitespace-nowrap text-xs sm:text-sm">
                {processedCampaignContacts.length > 0
                  ? `${(currentPage - 1) * ITEMS_PER_PAGE + 1}-${Math.min(
                      currentPage * ITEMS_PER_PAGE,
                      processedCampaignContacts.length,
                    )} of ${processedCampaignContacts.length}`
                  : "0 of 0"}
              </span>
              {totalPages > 1 && (
                <Pagination className="m-0 p-0">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() =>
                          currentPage > 1 && setCurrentPage(currentPage - 1)
                        }
                        className={`px-2 ${currentPage <= 1 ? "pointer-events-none opacity-50" : "hover:bg-accent dark:hover:bg-gray-700 cursor-pointer"}`}
                        aria-disabled={currentPage <= 1}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-2 py-1 text-xs sm:text-sm border border-transparent rounded-md">
                        {currentPage}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        onClick={() =>
                          currentPage < totalPages &&
                          setCurrentPage(currentPage + 1)
                        }
                        className={`px-2 ${currentPage >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-accent dark:hover:bg-gray-700 cursor-pointer"}`}
                        aria-disabled={currentPage >= totalPages}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table - scrolls independently while header stays fixed */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="min-w-[1000px]">
          <Table noWrapper>
            <TableHeader className="bg-muted dark:bg-gray-800 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[40px] pl-2">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={handleSelectAllOnPage}
                  />
                </TableHead>
                <TableHead
                  className="cursor-pointer min-w-[150px]"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center">
                    Name
                    {renderSortIcon("name")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer min-w-[80px]"
                  onClick={() => handleSort("company")}
                >
                  <div className="flex items-center">
                    Company
                    {renderSortIcon("company")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer min-w-[150px]"
                  onClick={() => handleSort("title")}
                >
                  <div className="flex items-center">
                    Title
                    {renderSortIcon("title")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer min-w-[150px]"
                  onClick={() => handleSort("location")}
                >
                  <div className="flex items-center">
                    Location
                    {renderSortIcon("location")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer w-[180px] min-w-[180px]"
                  onClick={() => handleSort("lastActivity")}
                >
                  <div className="flex items-center">
                    Latest Activity
                    {renderSortIcon("lastActivity")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer min-w-[120px]"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center">
                    Status
                    {renderSortIcon("status")}
                  </div>
                </TableHead>
                <TableHead className="w-[80px] min-w-[80px]">
                  <div className="flex items-center">View</div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignInitialLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                      Loading campaign contacts...
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedCampaignContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    {searchQuery
                      ? `No contacts found matching "${searchQuery}"`
                      : 'No contacts in this campaign yet. Click "Add Contacts" to get started.'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCampaignContacts.map((campaignContact: any) => {
                  const contact = campaignContact.contact;
                  if (!contact) return null;

                  return (
                    <TableRow
                      key={campaignContact.id}
                      className="hover:bg-muted/50 dark:hover:bg-gray-700/30 cursor-pointer"
                      onClick={() =>
                        handleViewContact(contact, campaignContact)
                      }
                    >
                      <TableCell
                        className="pl-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedContacts.includes(
                            campaignContact.id,
                          )}
                          onCheckedChange={() =>
                            handleSelectContact(campaignContact.id)
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium text-foreground dark:text-gray-300 truncate max-w-[150px]">
                        {contact.fullName ||
                          `${contact.firstName} ${contact.lastName}`}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground dark:text-gray-400 truncate max-w-[80px]"
                        title={
                          contact.company?.name || contact.companyName || "N/A"
                        }
                      >
                        {contact.company?.name || contact.companyName || "N/A"}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground dark:text-gray-400 truncate max-w-[150px]"
                        title={contact.title || "N/A"}
                      >
                        {contact.title || "N/A"}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground dark:text-gray-400 truncate max-w-[150px]"
                        title={contact.location || contact.city || "N/A"}
                      >
                        {contact.location || contact.city || "N/A"}
                      </TableCell>
                      <TableCell className="text-muted-foreground dark:text-gray-400">
                        {campaignContact.lastAction
                          ? new Date(campaignContact.lastAction).toLocaleString(
                              "en-US",
                              {
                                month: "2-digit",
                                day: "2-digit",
                                year: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`pointer-events-none rounded-full px-2.5 py-0.5 text-xs font-medium ${getCampaignStatusBadgeStyles(
                            campaignContact.status || "IN_QUEUE",
                          )}`}
                        >
                          {campaignContact.status
                            ?.replace(/_/g, " ")
                            .toLowerCase()
                            .replace(/\b\w/g, (c: String) => c.toUpperCase()) ||
                            "In Queue"}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleViewContact(contact, campaignContact)
                          }
                          className="h-8 w-8 p-0 hover:bg-accent dark:hover:bg-gray-700"
                        >
                          <Eye className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ContactDetailsModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        contact={selectedContact}
        campaignContact={selectedCampaignContact}
        campaignId={campaignId}
      />
    </div>
  );
}
