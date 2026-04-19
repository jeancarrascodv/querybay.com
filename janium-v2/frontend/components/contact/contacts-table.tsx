"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useContactsStore } from "@/store/useContactsStore";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ContactDetailsModal } from "./contact-details-modal";
import { Contact } from "@/types/contact";

// Constants
const ITEMS_PER_PAGE = 25;

// Sort direction type
type SortDirection = "asc" | "desc" | null;
type SortField = "name" | "title" | "company" | "location" | "status" | null;

// Helper function for status badge
const getStatusBadgeVariant = (
  status: string,
):
  | "default"
  | "destructive"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "purple"
  | "green-light"
  | "green-dark"
  | "gray-light"
  | "gray-medium"
  | "gray-dark"
  | "green-mid-light"
  | "green-mid-dark"
  | "amber"
  | "orange" => {
  switch (status) {
    case "CONNECTION":
      return "success"; // Bright green for active connection
    case "CONNECTED":
      return "green-dark"; // Darker green for established connection
    case "REPLIED":
      return "green-dark"; // Light green for replied status
    case "PENDING_CONN_REQ":
      return "green-mid-light"; // Light blue for pending
    case "CONNECT_REQ":
      return "green-mid-dark"; // Darker blue for connection requests
    case "SENT_EMAIL":
      return "green-light"; // Amber for sent email`
    case "SENT_LINKEDIN":
      return "green-mid-light"; // Orange for sent LinkedIn message
    case "WITHDRAWN":
      return "destructive"; // Red for withdrawn
    case "WITHDRAWN_BY_USER":
      return "destructive"; // Red for withdrawn by user
    case "DISQUALIFIED":
      return "destructive"; // Dark gray for disqualified
    case "NEW_CONTACT":
      return "outline"; // Purple for new contacts
    case "IN_QUEUE":
      return "gray-light"; // Light gray for in queue
    case "END_OF_CAMPAIGN":
      return "gray-dark"; // Medium gray for campaign end
    default:
      return "secondary"; // Default secondary color
  }
};

export function ContactsTable() {
  const { user } = useAuth();
  const teamId = user?.team_id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    contacts,
    selectedContacts,
    selectContact,
    selectAllContacts,
    clearSelectedContacts,
    searchQuery,
    setSearchQuery,
    currentPage,
    setCurrentPage,
    setAddToCampaignModalOpen,
    contactLists,
    selectedListId,
    setSelectedListId,
    getContactLists,
    loading: storeLoading,
  } = useContactsStore();

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal state
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Track if we've handled the URL contact
  const [handledContactId, setHandledContactId] = useState<string | null>(null);

  // Track which contact to highlight after modal close (from URL navigation)
  const [highlightedContactId, setHighlightedContactId] = useState<string | null>(null);
  const [wasNavigatedContact, setWasNavigatedContact] = useState(false);

  const handleRefresh = async () => {
    if (!teamId) return;
    setIsRefreshing(true);
    try {
      await getContactLists(teamId);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewContact = (contact: Contact) => {
    setSelectedContact(contact);
    setIsModalOpen(true);
    setWasNavigatedContact(false); // Regular view, not from navigation
  };

  const handleCloseModal = () => {
    // If this was a navigated contact, highlight the row and scroll to it
    if (wasNavigatedContact && selectedContact) {
      const contactIdToHighlight = selectedContact.id;
      setHighlightedContactId(contactIdToHighlight);

      // Clear the URL param now that modal is closing
      router.replace("/contacts", { scroll: false });

      // Scroll to the row after a brief delay to allow DOM to update
      setTimeout(() => {
        const row = document.getElementById(`contact-row-${contactIdToHighlight}`);
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);

      setTimeout(() => {
        setHighlightedContactId(null);
      }, 3000); // Highlight for 3 seconds
    }
    setIsModalOpen(false);
    setSelectedContact(null);
    setWasNavigatedContact(false);
  };

  // Sorting state - no default sort for contacts table (contacts don't have lastActivity)
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

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

  // Filter and sort contacts
  const processedContacts = useMemo(() => {
    let result = contacts;

    // First, filter by selected contact list if one is selected
    if (selectedListId) {
      const selectedList = contactLists.find(
        (list) => list.id === selectedListId,
      );
      if (selectedList && selectedList.contacts) {
        result = selectedList.contacts;
      } else {
        result = []; // No contacts if selected list doesn't exist or has no contacts
      }
    }

    // Apply search filtering
    if (searchQuery) {
      result = result.filter(
        (contact) =>
          (contact.firstName + " " + contact.lastName)
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          contact.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          contact.companyName
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          contact.location?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    // Apply sorting
    if (sortField && sortDirection) {
      result = [...result].sort((a, b) => {
        let valueA, valueB;

        // Get the values to compare based on sortField
        switch (sortField) {
          case "name":
            valueA = a.firstName + " " + a.lastName;
            valueB = b.firstName + " " + b.lastName;
            break;
          case "title":
            valueA = a.title || "";
            valueB = b.title || "";
            break;
          case "company":
            valueA = a.companyName || "";
            valueB = b.companyName || "";
            break;
          case "location":
            valueA = a.location || "";
            valueB = b.location || "";
            break;
          case "status":
            valueA = a.status || "";
            valueB = b.status || "";
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
  }, [
    contacts,
    searchQuery,
    sortField,
    sortDirection,
    selectedListId,
    contactLists,
  ]);

  const totalPages = Math.ceil(processedContacts.length / ITEMS_PER_PAGE);

  const paginatedContacts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return processedContacts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [processedContacts, currentPage]);

  // Handle contactId from URL search params - navigate to page and open modal
  useEffect(() => {
    const contactId = searchParams.get("contactId");

    // Skip if no contactId, already handled, or no contact lists loaded
    if (!contactId || contactId === handledContactId || contactLists.length === 0) {
      return;
    }

    // Search through all contact lists to find the contact
    let foundContact: Contact | null = null;
    let foundListId: string | null = null;

    for (const list of contactLists) {
      const contact = list.contacts?.find((c) => c.id === contactId);
      if (contact) {
        foundContact = contact;
        foundListId = list.id;
        break;
      }
    }

    if (foundContact && foundListId) {
      // Clear search query if any
      if (searchQuery) {
        setSearchQuery("");
      }

      // Select the list containing the contact (this will update processedContacts)
      if (selectedListId !== foundListId) {
        setSelectedListId(foundListId);
      }

      // Find the index in the list's contacts
      const listContacts = contactLists.find((l) => l.id === foundListId)?.contacts || [];
      const contactIndex = listContacts.findIndex((c) => c.id === contactId);

      if (contactIndex !== -1) {
        // Calculate which page the contact is on
        const targetPage = Math.floor(contactIndex / ITEMS_PER_PAGE) + 1;

        // Navigate to the correct page
        setCurrentPage(targetPage);

        // Open the modal with the contact
        setSelectedContact(foundContact);
        setIsModalOpen(true);
        setWasNavigatedContact(true); // Mark as navigated for highlight on close

        // Mark as handled (URL will be cleared when modal closes)
        setHandledContactId(contactId);
      }
    }
  }, [searchParams, contactLists, handledContactId, setCurrentPage, searchQuery, setSearchQuery, selectedListId, setSelectedListId]);

  // Handle select all contacts on the current page
  const handleSelectAllOnPage = () => {
    selectAllContacts(paginatedContacts.map((contact) => contact.id));
  };

  // Count selected contacts on the current page
  const selectedOnCurrentPage = paginatedContacts.filter((contact) =>
    selectedContacts.has(contact.id),
  ).length;

  const isAllSelected =
    selectedOnCurrentPage === paginatedContacts.length &&
    paginatedContacts.length > 0;

  const selectedCount = useMemo(
    () => selectedContacts.size,
    [selectedContacts],
  );

  const currentList = useMemo(
    () => contactLists.find((list) => list.id === selectedListId),
    [contactLists, selectedListId],
  );

  const totalContactsInCurrentList = selectedListId
    ? currentList?.contacts?.length || 0
    : contacts.length;

  const handleSelectAllFromList = () => {
    // Use contacts from the selected list if one is selected
    if (selectedListId && currentList?.contacts) {
      selectAllContacts(currentList.contacts.map((contact) => contact.id));
    } else {
      // Fall back to all contacts if no list is selected
      selectAllContacts(contacts.map((contact) => contact.id));
    }
  };
  return (
    <div className="flex flex-col w-full  overflow-hidden">
      {/* Sticky Header Controls */}
      <div className="flex-shrink-0 flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4  sticky top-0 z-10 ">
        {/* Left Side: Selection Info & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 max-w-full min-w-[50px] w-fit ">
          <label
            htmlFor="select-all-header"
            className="text-sm text-muted-foreground dark:text-gray-400 whitespace-nowrap"
          >
            {selectedCount} / {totalContactsInCurrentList} selected
          </label>
          <div className="flex flex-col items-start gap-2 w-fit ">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedCount > 0) {
                  clearSelectedContacts();
                } else {
                  handleSelectAllFromList();
                }
              }}
              className="text-foreground dark:text-gray-300 border-input dark:border-gray-600  hover:bg-accent dark:hover:bg-gray-700 p-2 gap-2 flex items-center justify-center"
            >
              <Checkbox
                id="select-all-header"
                checked={selectedCount > 0}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isAllSelected) {
                    clearSelectedContacts();
                  } else {
                    handleSelectAllFromList();
                  }
                }}
                aria-label="Select all contacts on this page"
              />
              <span className="truncate">
                {selectedCount > 0
                  ? "Unselect all from list"
                  : "Select all from list"}
              </span>
            </Button>
          </div>
          {selectedCount > 0 && (
            <Button
              variant="default" // Primary button style
              size="sm"
              onClick={() => setAddToCampaignModalOpen(true)}
              disabled={selectedCount === 0}
              className="bg-primary dark:bg-white-600 hover:bg-primary/90 dark:hover:bg-white-700 text-primary-foreground truncate"
            >
              <span className="truncate">
                Add selected contacts to campaign
              </span>
            </Button>
          )}
        </div>

        {/* Right Side: Refresh, Search & Pagination */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Refresh Button */}
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing || storeLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>

          {/* Search Bar */}
          <div className="relative w-full sm:w-auto min-w-[20px] max-w-[300px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1); // Reset to page 1 on search
              }}
              className="pl-9 w-full sm:w-full bg-background dark:bg-gray-800 border-input dark:border-gray-600 focus:border-primary dark:focus:border-blue-500 truncate"
            />
          </div>

          {/* Pagination */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-gray-400">
            <span className="flex w-full">
              Showing{" "}
              {processedContacts.length > 0
                ? (currentPage - 1) * ITEMS_PER_PAGE + 1
                : 0}{" "}
              -{" "}
              {Math.min(currentPage * ITEMS_PER_PAGE, processedContacts.length)}{" "}
              {/* Removed 'of X' based on image */}
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
                    {/* Display current page / total pages - simplified */}
                    <span className="px-3 py-1 border border-transparent rounded-md">
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

      {/* Table with sticky header */}
      <div className="flex-1 rounded-md border border-border dark:border-gray-700 overflow-auto min-h-0">
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
                  className="cursor-pointer min-w-[150px]"
                  onClick={() => handleSort("title")}
                >
                  <div className="flex items-center">
                    Title
                    {renderSortIcon("title")}
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
                  onClick={() => handleSort("location")}
                >
                  <div className="flex items-center">
                    Location
                    {renderSortIcon("location")}
                  </div>
                </TableHead>
                <TableHead className="w-[120px] min-w-[120px]">
                  <div className="flex items-center">Campaign</div>
                </TableHead>
                <TableHead className="w-[160px] min-w-[160px]">
                  <div className="flex items-center">Last Activity</div>
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
              {paginatedContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    No contacts found
                    {searchQuery ? ` matching "${searchQuery}"` : ""}.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedContacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    id={`contact-row-${contact.id}`}
                    className={`hover:bg-muted/50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors duration-1000 ${
                      highlightedContactId === contact.id
                        ? "bg-primary/20 dark:bg-primary/30"
                        : ""
                    }`}
                    onClick={() => handleViewContact(contact)}
                  >
                    <TableCell className="pl-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedContacts.has(contact.id)}
                        onCheckedChange={() => selectContact(contact.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-foreground dark:text-gray-300 truncate min-w-[200px]">
                      {contact.fullName}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground dark:text-gray-400 truncate max-w-[150px]"
                      title={contact.title}
                    >
                      {contact.title}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground dark:text-gray-400 truncate max-w-[80px]"
                      title={
                        Array.isArray(contact.company)
                          ? contact.company[0]?.name
                          : contact.company?.name || contact.companyName
                      }
                    >
                      {Array.isArray(contact.company)
                        ? contact.company[0]?.name
                        : contact.company?.name || contact.companyName}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground dark:text-gray-400 truncate max-w-[150px]"
                      title={contact.location}
                    >
                      {contact.location}
                    </TableCell>
                    <TableCell className="text-muted-foreground dark:text-gray-400">
                      {}
                    </TableCell>
                    <TableCell className="text-muted-foreground dark:text-gray-400">
                      {contact.updatedAt
                        ? new Date(contact.updatedAt).toLocaleString("en-US", {
                            month: "2-digit",
                            day: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getStatusBadgeVariant(contact.status || "")}
                      >
                        {contact.status
                          ? contact.status?.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
                          : "In Queue"}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewContact(contact)}
                        className="h-8 w-8 p-0 hover:bg-accent dark:hover:bg-gray-700"
                      >
                        <Eye className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ContactDetailsModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        contact={selectedContact}
      />
    </div>
  );
}
