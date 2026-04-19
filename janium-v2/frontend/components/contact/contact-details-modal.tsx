"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Contact,
  CampaignContact,
  CampaignStep,
  ContactEmail,
  ContactPhone,
} from "@/types/contact";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
  DialogHeader,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useLazyQuery } from "@apollo/client";
import {
  Queries as CampaignStepQueries,
  Mutations as CampaignStepMutations,
} from "@/graphql/campaignStep";
import { useAuth } from "@/contexts/AuthContext";
import {
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Calendar,
  Tag,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  X,
  ExternalLink,
  Copy,
  Check,
  Briefcase,
  Globe,
  DollarSign,
  Users,
  Edit2,
  Save,
  Loader2,
  Play,
  AlertTriangle,
  ScrollText,
} from "lucide-react";
import { LogsViewer } from "@/components/logs-viewer";

interface ContactDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  campaignContact?: CampaignContact | null;
  campaignId?: string;
}

// Editable field configuration
interface EditableFieldConfig {
  key: string;
  label: string;
  type: "text" | "email" | "url";
}

// Helper function for campaign status badge variants
const getCampaignStatusBadgeVariant = (status: string): string => {
  switch (status) {
    case "END_STEP":
    case "FINISHED":
      return "bg-green-500/20 text-green-400";
    case "IN_PROGRESS":
      return "bg-blue-500/20 text-blue-400";
    case "PENDING_START_STEP":
      return "bg-yellow-500/20 text-yellow-400";
    case "PENDING_START_STEP_ERROR":
    case "IN_PROGRESS_ERROR":
      return "bg-red-500/20 text-red-400";
    case "WAITING_FOR_CONTACT":
      return "bg-purple-500/20 text-purple-400";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
};

const getCampaignStatusIcon = (status: string) => {
  switch (status) {
    case "END_STEP":
    case "FINISHED":
      return <CheckCircle2 className="h-5 w-5 text-green-400" />;
    case "IN_PROGRESS":
      return <Clock className="h-5 w-5 text-blue-400" />;
    case "PENDING_START_STEP":
      return <Clock className="h-5 w-5 text-yellow-400" />;
    case "PENDING_START_STEP_ERROR":
    case "IN_PROGRESS_ERROR":
      return <XCircle className="h-5 w-5 text-red-400" />;
    case "WAITING_FOR_CONTACT":
      return <AlertCircle className="h-5 w-5 text-purple-400" />;
    default:
      return <AlertCircle className="h-5 w-5 text-gray-400" />;
  }
};
const formatCampaignStatus = (status: string) => {
  return (
    status
      ?.replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase()) || "Pending"
  );
};

export function ContactDetailsModal({
  isOpen,
  onClose,
  contact,
  campaignContact,
  campaignId,
}: ContactDetailsModalProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "contact" | "company" | "campaign" | "logs"
  >("overview");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showNameInHeader, setShowNameInHeader] = useState(false);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<{
    key: string;
    label: string;
    value: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Auth for SuperAdmin check
  const { user } = useAuth();
  const isSuperAdmin = useMemo(() => {
    return user?.privileges?.includes("SuperAdmin");
  }, [user]);

  // Fetch campaign steps when viewing campaign tab
  const { data: stepsData } = useQuery(CampaignStepQueries.GET_CAMPAIGN_STEPS, {
    variables: { campaignId: campaignId || "" },
    skip: !isOpen || !campaignId || !campaignContact,
    fetchPolicy: "cache-first",
  });

  // Find the current step for this campaign contact
  const currentStep = stepsData?.team?.campaign?.steps?.find(
    (step: CampaignStep) => step.id === campaignContact?.stepId,
  );

  if (!contact) return null;

  const fullName =
    contact.fullName || `${contact.firstName} ${contact.lastName}`;
  const hasCampaign = !!campaignContact;

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      setShowNameInHeader(scrollContainerRef.current.scrollTop > 100);
    }
  };

  const handleCopyId = () => {
    if (contact?.id) {
      navigator.clipboard.writeText(contact.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleEditClick = (key: string, label: string, value: any) => {
    setEditingField({ key, label, value: value || "" });
    setEditValue(value || "");
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    // TODO: Implement when API mutation is available
    // Currently, there's no GraphQL mutation for editing contact fields
    console.log("Edit not implemented - no API mutation available");
    console.log("Would save:", editingField?.key, "=", editValue);
    setEditModalOpen(false);
    setEditingField(null);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-[#0A0E1A] border-[#1E2433] max-w-5xl text-white p-0 max-h-[90vh] flex flex-col">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 bg-[#0A0E1A] border-b border-[#1E2433] px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {showNameInHeader && (
                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-200">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                    {fullName?.charAt(0) ?? "?"}
                  </div>
                  <span className="text-white font-medium">{fullName}</span>
                  <span className="text-gray-500">|</span>
                </div>
              )}
              <div>
                <DialogTitle className="text-xl font-semibold text-white">
                  Contact Details
                </DialogTitle>
                <p className="text-xs text-gray-400 mt-1">
                  View complete contact information
                  {isSuperAdmin && " (Edit enabled for SuperAdmin)"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto scrollbar-hide"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {/* Hero Section with Avatar */}
            <div className="px-6 py-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                    {fullName?.charAt(0) ?? "?"}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {fullName}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {contact.title && contact.company?.name
                        ? `${contact.title} at ${contact.company.name}`
                        : contact.title ||
                          contact.company?.name ||
                          "No title/company"}
                    </p>
                    {contact.location && (
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3" />
                        {contact.location}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyId}
                  className="border-[#2A3142] text-gray-400 hover:bg-[#1E2433] bg-transparent text-xs hover:text-white hover:border-none"
                >
                  {copiedId ? (
                    <>
                      <Check className="h-3 w-3 mr-1 text-green-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy ID
                    </>
                  )}
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-6 border-b border-[#2A3142]">
                <TabButton
                  active={activeTab === "overview"}
                  onClick={() => setActiveTab("overview")}
                >
                  Overview
                </TabButton>
                <TabButton
                  active={activeTab === "contact"}
                  onClick={() => setActiveTab("contact")}
                >
                  Contact Info
                </TabButton>
                <TabButton
                  active={activeTab === "company"}
                  onClick={() => setActiveTab("company")}
                >
                  Company
                </TabButton>
                {hasCampaign && (
                  <TabButton
                    active={activeTab === "campaign"}
                    onClick={() => setActiveTab("campaign")}
                  >
                    Campaign
                  </TabButton>
                )}
                <TabButton
                  active={activeTab === "logs"}
                  onClick={() => setActiveTab("logs")}
                >
                  Logs
                </TabButton>
              </div>
            </div>

            {/* Tab Content */}
            <div className="px-6 pb-6 space-y-6">
              {activeTab === "overview" && (
                <OverviewTab
                  contact={contact}
                  isSuperAdmin={isSuperAdmin}
                  onEdit={handleEditClick}
                />
              )}
              {activeTab === "contact" && (
                <ContactTab
                  contact={contact}
                  isSuperAdmin={isSuperAdmin}
                  onEdit={handleEditClick}
                />
              )}
              {activeTab === "company" && (
                <CompanyTab
                  contact={contact}
                  isSuperAdmin={isSuperAdmin}
                  onEdit={handleEditClick}
                />
              )}
              {activeTab === "campaign" && hasCampaign && (
                <CampaignTab
                  campaignContact={campaignContact!}
                  currentStep={currentStep}
                  campaignId={campaignId}
                />
              )}
              {activeTab === "logs" && (
                <LogsViewer
                  asModal={false}
                  initialFilters={{ contactId: contact.id }}
                  title="Contact Logs"
                  height="400px"
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Field Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="bg-[#14182A] border-[#2A3142] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-semibold">
              Edit {editingField?.label}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Note: Contact editing is not yet supported by the API. This is a
              preview of the edit functionality.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm text-gray-400 mb-2">
                {editingField?.label}
              </Label>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="bg-[#0F1423] border-[#2A3142] text-white"
                placeholder={`Enter ${editingField?.label?.toLowerCase()}`}
              />
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-xs text-yellow-400">
                API mutation for editing contacts is not available yet. Changes
                will not be saved.
              </p>
            </div>
            <DialogFooter className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setEditModalOpen(false)}
                className="border-[#2A3142] text-white hover:bg-[#1E2433] bg-transparent hover:text-white hover:border-none"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled
                className="bg-gray-500 text-white cursor-not-allowed"
              >
                <Save className="h-4 w-4 mr-2" />
                Save (Disabled)
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors relative ${
        active ? "text-white" : "text-gray-400 hover:text-gray-300"
      }`}
    >
      {children}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
      )}
    </button>
  );
}

function OverviewTab({
  contact,
  isSuperAdmin,
  onEdit,
}: {
  contact: Contact;
  isSuperAdmin?: boolean;
  onEdit: (key: string, label: string, value: any) => void;
}) {
  const fullName =
    contact.fullName || `${contact.firstName} ${contact.lastName}`;

  return (
    <div className="space-y-6">
      {/* IDs Card */}
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Identifiers
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoItem label="Contact ID" value={contact.id} />
          <InfoItem label="Company ID" value={contact.companyId} />
        </div>
      </div>

      {/* Personal Information Card */}
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <User className="h-4 w-4" />
          Personal Information
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <EditableInfoItem
            label="Full Name"
            value={fullName}
            fieldKey="fullName"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="First Name"
            value={contact.firstName}
            fieldKey="firstName"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="Last Name"
            value={contact.lastName}
            fieldKey="lastName"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="Middle Name"
            value={contact.middleName}
            fieldKey="middleName"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="Preferred Name"
            value={contact.preferredName}
            fieldKey="preferredName"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="Title"
            value={contact.title}
            fieldKey="title"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="Department"
            value={contact.department}
            fieldKey="department"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="Seniority"
            value={contact.seniority}
            fieldKey="seniority"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
        </div>
      </div>

      {/* Location Card */}
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Location
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <EditableInfoItem
            label="Location"
            value={contact.location}
            fieldKey="location"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="City"
            value={contact.city}
            fieldKey="city"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="State"
            value={contact.state}
            fieldKey="state"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="State Abbr"
            value={contact.stateAbbr}
            fieldKey="stateAbbr"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="Country"
            value={contact.countryFull}
            fieldKey="countryFull"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="Country (2-letter)"
            value={contact.country2}
            fieldKey="country2"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
          <EditableInfoItem
            label="Country (3-letter)"
            value={contact.country3}
            fieldKey="country3"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
          />
        </div>
      </div>

      {/* LinkedIn Card */}
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <Linkedin className="h-4 w-4" />
          LinkedIn
        </h3>
        <div className="space-y-3">
          {contact.liProfileHandle ? (
            <div className="flex items-center gap-2">
              <a
                href={"https://www.linkedin.com/in/" + contact.liProfileHandle}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline flex items-center gap-2"
              >
                {contact.liProfileHandle}
                <ExternalLink className="h-3 w-3" />
              </a>
              {isSuperAdmin && (
                <button
                  onClick={() =>
                    onEdit(
                      "liProfileHandle",
                      "LinkedIn Handle",
                      contact.liProfileHandle,
                    )
                  }
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            <EditableInfoItem
              label="LinkedIn Handle"
              value={contact.liProfileHandle}
              fieldKey="liProfileHandle"
              isSuperAdmin={isSuperAdmin}
              onEdit={onEdit}
              showEmpty
            />
          )}
          <EditableInfoItem
            label="Sales Nav ID"
            value={contact.liSalesNavProfileId}
            fieldKey="liSalesNavProfileId"
            isSuperAdmin={isSuperAdmin}
            onEdit={onEdit}
            showEmpty
          />
        </div>
      </div>

      {/* Company Summary Card */}
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Company Summary
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoItem
            label="Company Name"
            value={contact.company?.name || contact.companyName}
          />
          <InfoItem label="Industry" value={contact.company?.industry} />
          <InfoItem label="Website" value={contact.company?.website} />
          <InfoItem
            label="Company Location"
            value={
              contact.company?.location ||
              [contact.company?.city, contact.company?.state]
                .filter(Boolean)
                .join(", ")
            }
          />
        </div>
      </div>
    </div>
  );
}

function ContactTab({
  contact,
  isSuperAdmin,
  onEdit,
}: {
  contact: Contact;
  isSuperAdmin?: boolean;
  onEdit: (key: string, label: string, value: any) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Emails Section */}
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Email Addresses ({contact.emails?.length || 0})
        </h3>
        {contact.emails && contact.emails.length > 0 ? (
          <div className="space-y-3">
            {contact.emails.map((email: ContactEmail) => (
              <div
                key={email.id}
                className="flex items-start justify-between p-3 rounded-lg bg-[#1E2433]"
              >
                <div className="space-y-1">
                  <div className="font-medium text-white flex items-center gap-2">
                    {email.email}
                    {isSuperAdmin && (
                      <button
                        onClick={() =>
                          onEdit(`email_${email.id}`, "Email", email.email)
                        }
                        className="text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge className="bg-[#2A3142] text-gray-300 text-xs border-0">
                      {email.emailType}
                    </Badge>
                    <Badge className="bg-[#2A3142] text-gray-300 text-xs border-0">
                      {email.emailSource}
                    </Badge>
                    <Badge className="bg-[#2A3142] text-gray-300 text-xs border-0">
                      Priority: {email.priority}
                    </Badge>
                  </div>
                </div>
                <div className="text-right text-sm space-y-1">
                  <div className="text-gray-400">
                    Validation:{" "}
                    <span
                      className={
                        email.validationType === "VALID"
                          ? "text-green-400"
                          : "text-yellow-400"
                      }
                    >
                      {email.validationType}
                    </span>
                  </div>
                  <div className="text-gray-400">
                    Confidence:{" "}
                    <span className="text-blue-400">
                      {email.confidenceScore}%
                    </span>
                  </div>
                  <div className="text-gray-400">
                    Emails Sent:{" "}
                    <span className="text-white">{email.emailsSent}</span>
                  </div>
                  {email.inactiveReason && (
                    <div className="text-red-400 text-xs">
                      {email.inactiveReason}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic">No email addresses available</p>
        )}
      </div>

      {/* Phones Section */}
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Phone Numbers ({contact.phones?.length || 0})
        </h3>
        {contact.phones && contact.phones.length > 0 ? (
          <div className="space-y-3">
            {contact.phones.map((phone: ContactPhone) => (
              <div
                key={phone.id}
                className="flex items-start justify-between p-3 rounded-lg bg-[#1E2433]"
              >
                <div className="space-y-1">
                  <div className="font-medium text-white flex items-center gap-2">
                    {phone.phone}
                    {isSuperAdmin && (
                      <button
                        onClick={() =>
                          onEdit(`phone_${phone.id}`, "Phone", phone.phone)
                        }
                        className="text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <Badge className="bg-[#2A3142] text-gray-300 text-xs border-0">
                    {phone.phoneType}
                  </Badge>
                </div>
                <div className="text-right text-sm text-gray-400">
                  Confidence:{" "}
                  <span className="text-blue-400">
                    {phone.confidenceScore}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic">No phone numbers available</p>
        )}
      </div>
    </div>
  );
}

function CompanyTab({
  contact,
  isSuperAdmin,
  onEdit,
}: {
  contact: Contact;
  isSuperAdmin?: boolean;
  onEdit: (key: string, label: string, value: any) => void;
}) {
  if (!contact.company) {
    return (
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-8 text-center">
        <Building2 className="h-12 w-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500">No company information available</p>
        {contact.companyId && (
          <p className="text-gray-600 text-sm mt-2">
            Company ID: {contact.companyId}
          </p>
        )}
      </div>
    );
  }

  const company = contact.company;

  return (
    <div className="space-y-6">
      {/* Company Overview */}
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <Briefcase className="h-4 w-4" />
          Company Details
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoItem label="Company ID" value={company.id} />
          <InfoItem label="Name" value={company.name} />
          <InfoItem label="Industry" value={company.industry} />
          <InfoItem label="Website" value={company.website} />
          <InfoItem label="Website Domain" value={company.websiteDomain} />
          <InfoItem label="Founded" value={company.foundedYear} />
          <InfoItem
            label="Annual Revenue"
            value={
              company.annualRevenue
                ? `$${company.annualRevenue.toLocaleString()}`
                : null
            }
          />
          <InfoItem label="Revenue Range" value={company.revenueRange} />
          <InfoItem
            label="Staff Count"
            value={company.staffCount?.toLocaleString()}
          />
          <InfoItem label="Staff Count Range" value={company.staffCountRange} />
        </div>
      </div>

      {/* Company Location */}
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Company Location
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoItem label="Location" value={company.location} />
          <InfoItem label="City" value={company.city} />
          <InfoItem label="State" value={company.state} />
          <InfoItem label="State Abbr" value={company.stateAbbr} />
          <InfoItem label="Country" value={company.countryFull} />
          <InfoItem label="Country (2-letter)" value={company.country2} />
          <InfoItem label="Country (3-letter)" value={company.country3} />
        </div>
      </div>

      {/* Company Contact */}
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Company Contact
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <InfoItem label="Phone 1" value={company.phone1} />
          <InfoItem label="Phone 2" value={company.phone2} />
          <InfoItem label="Phone 3" value={company.phone3} />
        </div>
      </div>

      {/* LinkedIn */}
      {company.liProfileHandle && (
        <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
            <Linkedin className="h-4 w-4" />
            Company LinkedIn
          </h3>
          <a
            href={company.liProfileHandle}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline flex items-center gap-2"
          >
            {company.liProfileHandle}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function CampaignTab({
  campaignContact,
  currentStep,
  campaignId,
}: {
  campaignContact: CampaignContact;
  currentStep?: CampaignStep;
  campaignId?: string;
}) {
  // Template rendering state
  const [isRendering, setIsRendering] = useState(false);
  const [renderedOutput, setRenderedOutput] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [hasAutoRendered, setHasAutoRendered] = useState(false);

  // Template render query
  const [renderTemplate] = useLazyQuery(CampaignStepMutations.RENDER_TEMPLATE);

  const getStepType = () => {
    if (!currentStep?.stepData) return "Unknown";
    const stepData = currentStep.stepData;
    if (
      stepData?.__typename === "SendEmail" ||
      stepData?.subject ||
      stepData?.body
    )
      return "Send Email";
    if (
      stepData?.__typename === "SendLinkedInMessage" ||
      stepData?.linkedinMessage
    )
      return "LinkedIn Message";
    if (
      stepData?.__typename === "SendLinkedInConnectionRequest" ||
      stepData?.connectionRequestMessage
    )
      return "Connection Request";
    return "Unknown";
  };

  // Get the template content from current step
  const getTemplateContent = useCallback(() => {
    if (!currentStep?.stepData) return null;
    const stepData = currentStep.stepData;
    if (stepData.body)
      return {
        type: "email",
        content: stepData.body,
        subject: stepData.subject,
      };
    if (stepData.linkedinMessage)
      return { type: "linkedin", content: stepData.linkedinMessage };
    if (stepData.connectionRequestMessage)
      return { type: "connection", content: stepData.connectionRequestMessage };
    return null;
  }, [currentStep?.stepData]);

  const templateInfo = getTemplateContent();

  // Parse template to find used fields
  const parseTemplateFields = (template: string): string[] => {
    const regex = /\{\{\s*(\w+)\s*\}\}/g;
    const fields: string[] = [];
    let match;
    while ((match = regex.exec(template)) !== null) {
      if (!fields.includes(match[1])) {
        fields.push(match[1]);
      }
    }
    return fields;
  };

  // Handle template rendering
  const handleRenderTemplate = useCallback(async () => {
    const currentTemplateInfo = getTemplateContent();
    if (
      !currentTemplateInfo ||
      !campaignId ||
      !campaignContact.id ||
      !currentStep?.id
    ) {
      setRenderError("Missing required data for rendering");
      return;
    }

    setIsRendering(true);
    setRenderError(null);
    setRenderedOutput(null);
    setMissingFields([]);

    try {
      const { data, error } = await renderTemplate({
        variables: {
          campaignId,
          campaignContactIds: [campaignContact.id],
          template: currentTemplateInfo.content,
        },
      });

      if (error) {
        setRenderError(error.message || "Failed to render template");
        return;
      }

      // Find the matching step and get its rendered output
      const steps = data?.team?.campaign?.steps || [];
      const matchingStep = steps.find((s: any) => s.id === currentStep?.id);
      const renderResults = matchingStep?.render || [];

      if (renderResults.length === 0) {
        setRenderError("No render results returned from server");
        return;
      }

      const result = renderResults[0];
      if (result === null) {
        // Find missing fields by comparing template fields with templateData
        const templateData = campaignContact.templateData || {};
        const usedFields = parseTemplateFields(currentTemplateInfo.content);
        const missing = usedFields.filter(
          (field) =>
            !templateData[field] ||
            templateData[field] === "" ||
            templateData[field] === null,
        );
        setMissingFields(missing);
        setRenderError(
          "Template rendering failed. This contact is missing required template fields.",
        );
      } else {
        setRenderedOutput(result);
      }
    } catch (err: any) {
      setRenderError(
        err?.message || "An unexpected error occurred while rendering",
      );
    } finally {
      setIsRendering(false);
    }
  }, [
    campaignId,
    campaignContact.id,
    campaignContact.templateData,
    currentStep?.id,
    getTemplateContent,
    renderTemplate,
  ]);

  // Auto-render template on mount
  useEffect(() => {
    if (
      !hasAutoRendered &&
      templateInfo &&
      campaignId &&
      campaignContact.id &&
      currentStep?.id
    ) {
      setHasAutoRendered(true);
      // Trigger render after a small delay to ensure component is ready
      const timer = setTimeout(() => {
        handleRenderTemplate();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [
    hasAutoRendered,
    templateInfo,
    campaignId,
    campaignContact.id,
    currentStep?.id,
    handleRenderTemplate,
  ]);

  // All standard template fields that should always be shown
  const ALL_TEMPLATE_FIELDS = [
    "first_name",
    "middle_name",
    "last_name",
    "full_name",
    "preferred_name",
    "title",
    "department",
    "seniority",
    "li_profile_handle",
    "li_profile_url",
    "li_sales_nav_profile_id",
    "city",
    "state",
    "state_abbr",
    "location",
    "country_full",
    "country2",
    "country3",
    "email",
    "phone",
    "company_name",
    "company_website",
    "company_website_domain",
    "company_city",
    "company_state",
    "company_location",
    "company_industry",
    "company_staff_count",
    "company_staff_count_range",
    "company_annual_revenue",
    "company_revenue_range",
    "day_of_week",
    "custom_message_1",
    "custom_message_2",
    "rsvp_code",
    "forwarding_key",
  ];

  const formatTemplateData = (data: any, showAllFields: boolean = false) => {
    if (!data && !showAllFields) return null;

    const templateData = data || {};

    // Get all keys - either from data or use all standard fields
    const allKeys = showAllFields
      ? new Set([...ALL_TEMPLATE_FIELDS, ...Object.keys(templateData)])
      : new Set(Object.keys(templateData));

    return Array.from(allKeys).map((key) => {
      const value = templateData[key];

      // Format the value - keep as-is for display
      let displayValue = value;
      if (typeof value === "boolean") {
        displayValue = value ? "Yes" : "No";
      } else if (
        value !== null &&
        value !== undefined &&
        typeof value === "object"
      ) {
        displayValue = JSON.stringify(value);
      }

      // Keep the key as-is (no formatting)
      return { key: key, value: displayValue, originalKey: key };
    });
  };

  const templateDataFormatted = formatTemplateData(
    campaignContact.templateData,
    true,
  );
  const extraDataFormatted = campaignContact.extraData
    ? formatTemplateData(campaignContact.extraData, false)
    : null;

  return (
    <div className="space-y-6">
      {/* Status Card */}

      {/* Campaign Step Info */}
      {currentStep && (
        <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Current Step
            <Badge
              className={`${getCampaignStatusBadgeVariant(campaignContact.status)} text-sm border-0`}
            >
              {formatCampaignStatus(campaignContact.status)}
            </Badge>
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <InfoItem label="Step Type" value={getStepType()} />
            <InfoItem
              label="Enabled"
              value={currentStep.enabled ? "Yes" : "No"}
            />
            <InfoItem label="Priority" value={currentStep.priority} />
          </div>

          {/* Step Details */}
          {currentStep.stepData && (
            <div className="mt-4 p-3 rounded-lg bg-[#1E2433]">
              <h4 className="text-xs font-medium text-gray-500 mb-2">
                Step Configuration
              </h4>
              {currentStep.stepData.subject && (
                <div className="mb-2">
                  <span className="text-xs text-gray-500">Subject:</span>
                  <p className="text-sm text-white mt-1">
                    {currentStep.stepData.subject}
                  </p>
                </div>
              )}
              {currentStep.stepData.body && (
                <div className="mb-2">
                  <span className="text-xs text-gray-500">Body:</span>
                  <p className="text-sm text-white mt-1 whitespace-pre-wrap">
                    {currentStep.stepData.body}
                  </p>
                </div>
              )}
              {currentStep.stepData.linkedinMessage && (
                <div className="mb-2">
                  <span className="text-xs text-gray-500">
                    LinkedIn Message:
                  </span>
                  <p className="text-sm text-white mt-1 whitespace-pre-wrap">
                    {currentStep.stepData.linkedinMessage}
                  </p>
                </div>
              )}
              {currentStep.stepData.connectionRequestMessage && (
                <div className="mb-2">
                  <span className="text-xs text-gray-500">
                    Connection Request Message:
                  </span>
                  <p className="text-sm text-white mt-1 whitespace-pre-wrap">
                    {currentStep.stepData.connectionRequestMessage}
                  </p>
                </div>
              )}
              {currentStep.stepData.from && (
                <InfoItem label="From" value={currentStep.stepData.from} />
              )}
              {currentStep.stepData.replyToPrevious !== undefined && (
                <InfoItem
                  label="Reply to Previous"
                  value={currentStep.stepData.replyToPrevious ? "Yes" : "No"}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Template Rendering Section */}
      {currentStep && templateInfo && (
        <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
              <Play className="h-4 w-4" />
              Template Preview for This Contact
            </h3>
            <Button
              onClick={handleRenderTemplate}
              disabled={isRendering}
              size="sm"
              className="bg-white hover:bg-gray-200 text-black text-xs"
            >
              {isRendering ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Rendering...
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1" />
                  Render Template
                </>
              )}
            </Button>
          </div>

          {/* Render Error */}
          {renderError && (
            <div className="p-3 bg-red-900/20 border border-red-700 rounded-md mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-red-400">{renderError}</p>
                  {missingFields.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-red-300 mb-1">
                        Missing required fields:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {missingFields.map((field) => (
                          <Badge
                            key={field}
                            className="bg-red-800/50 text-red-300 text-xs border border-red-600"
                          >
                            {`{{ ${field} }}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Rendered Output */}
          {renderedOutput && (
            <div className="space-y-3">
              {templateInfo.type === "email" && templateInfo.subject && (
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">
                    Rendered Subject
                  </Label>
                  <div className="p-2 bg-[#1E2433] rounded text-sm text-white border border-[#2A3142]">
                    {renderedOutput.includes("\n")
                      ? renderedOutput.split("\n")[0]
                      : templateInfo.subject}
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">
                  Rendered {templateInfo.type === "email" ? "Body" : "Message"}
                </Label>
                <div className="p-3 bg-[#1E2433] rounded text-sm text-white border border-[#2A3142] whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                  {renderedOutput}
                </div>
              </div>
            </div>
          )}

          {/* Initial State - No render yet */}
          {!renderedOutput && !renderError && !isRendering && (
            <p className="text-sm text-gray-500 italic">
              Click the button above to render the template for this contact.
            </p>
          )}
        </div>
      )}

      {/* Activity */}
      <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Activity
        </h3>
        <InfoItem
          label="Last Action"
          value={
            campaignContact.lastAction
              ? new Date(campaignContact.lastAction).toLocaleString()
              : "N/A"
          }
        />
      </div>

      {/* Extra Data - Formatted */}
      {extraDataFormatted && extraDataFormatted.length > 0 && (
        <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Extra Data
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {extraDataFormatted.map((item) => {
              const isEmpty =
                item.value === null ||
                item.value === undefined ||
                item.value === "";
              return (
                <div
                  key={item.originalKey}
                  className="flex flex-col gap-1 p-2 rounded bg-[#1E2433]"
                >
                  <span className="text-xs text-gray-500 font-mono">
                    {item.originalKey}
                  </span>
                  <span
                    className={`text-sm ${isEmpty ? "text-gray-600 italic" : "text-white"}`}
                  >
                    {isEmpty ? "null" : String(item.value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Template Data - Formatted */}
      {templateDataFormatted && templateDataFormatted.length > 0 && (
        <div className="bg-[#0F1423] rounded-lg border border-[#2A3142] p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Template Data
            {missingFields.length > 0 && (
              <Badge className="bg-red-500/20 text-red-400 text-xs border-0 ml-2">
                {missingFields.length} missing
              </Badge>
            )}
          </h3>
          <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
            {templateDataFormatted
              .sort((a, b) => {
                // Sort: missing fields first, then fields with values, then empty fields
                const aIsMissing = missingFields.includes(a.originalKey);
                const bIsMissing = missingFields.includes(b.originalKey);
                const aIsEmpty =
                  a.value === null || a.value === undefined || a.value === "";
                const bIsEmpty =
                  b.value === null || b.value === undefined || b.value === "";

                if (aIsMissing && !bIsMissing) return -1;
                if (!aIsMissing && bIsMissing) return 1;
                if (!aIsEmpty && bIsEmpty) return -1;
                if (aIsEmpty && !bIsEmpty) return 1;
                return a.key.localeCompare(b.key);
              })
              .map((item) => {
                const isMissing = missingFields.includes(item.originalKey);
                const isEmpty =
                  item.value === null ||
                  item.value === undefined ||
                  item.value === "";
                return (
                  <div
                    key={item.originalKey}
                    className={`flex flex-col gap-0.5 p-2 rounded ${
                      isMissing
                        ? "bg-red-900/30 border border-red-700/50"
                        : isEmpty
                          ? "bg-[#1E2433]/50"
                          : "bg-[#1E2433]"
                    }`}
                  >
                    <span
                      className={`text-xs font-mono ${isMissing ? "text-red-400" : "text-gray-500"}`}
                    >
                      {item.originalKey}
                      {isMissing && " (required)"}
                    </span>
                    <span
                      className={`text-sm ${isEmpty || isMissing ? "text-gray-600 italic" : "text-white"}`}
                    >
                      {isEmpty ? "null" : String(item.value)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({
  label,
  value,
  showEmpty = true,
}: {
  label: string;
  value: string | number | null | undefined;
  showEmpty?: boolean;
}) {
  if (!value && !showEmpty) return null;
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={`text-sm font-medium ${isEmpty ? "text-gray-600 italic" : "text-white"}`}
      >
        {isEmpty ? "null" : value}
      </span>
    </div>
  );
}

function EditableInfoItem({
  label,
  value,
  fieldKey,
  isSuperAdmin,
  onEdit,
  showEmpty = true,
}: {
  label: string;
  value: string | number | null | undefined;
  fieldKey: string;
  isSuperAdmin?: boolean;
  onEdit: (key: string, label: string, value: any) => void;
  showEmpty?: boolean;
}) {
  if (!value && !showEmpty) return null;
  const isEmpty = value === null || value === undefined || value === "";

  return (
    <div className="flex flex-col gap-1 group">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`text-sm font-medium ${isEmpty ? "text-gray-600 italic" : "text-white"}`}
        >
          {isEmpty ? "null" : value}
        </span>
        {isSuperAdmin && (
          <button
            onClick={() => onEdit(fieldKey, label, value)}
            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 transition-all"
          >
            <Edit2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
