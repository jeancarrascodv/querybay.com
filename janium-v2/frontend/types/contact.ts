export type ContactStatus = "CONNECTED" | "PENDING" | "NOT_CONNECTED";

// GraphQL Schema Types
export type CampaignContactStatus =
  | "PENDING_START_STEP"
  | "PENDING_START_STEP_ERROR"
  | "IN_PROGRESS"
  | "IN_PROGRESS_ERROR"
  | "END_STEP"
  | "FINISHED";

export type EmailType = "WORK" | "PERSONAL";
export type EmailSource = "LINKED_IN" | "JANIUM" | "EXTERNAL";
export type EmailValidation = "UNKNOWN" | "ACCEPT_ALL" | "VALID";
export type PhoneType = "UNKNOWN" | "WORK" | "PERSONAL" | "MOBILE";

export interface ContactEmail {
  id: string;
  email: string;
  emailsSent: number;
  emailsOpened: number;
  priority: number;
  emailType: EmailType;
  emailSource: EmailSource;
  confidenceScore: number;
  validationType: EmailValidation;
  inactiveReason?: string;
  __typename?: string;
}

export interface ContactPhone {
  id: string;
  phone: string;
  phoneType: PhoneType;
  priority: number;
  confidenceScore: number;
  __typename?: string;
}

export interface Company {
  id: string;
  liProfileHandle: string;
  name?: string;
  website?: string;
  city?: string;
  state?: string;
  stateAbbr?: string;
  countryFull?: string;
  country2?: string;
  country3?: string;
  location?: string;
  phone1?: string;
  phone2?: string;
  phone3?: string;
  annualRevenue?: number;
  websiteDomain?: string;
  foundedYear?: number;
  industry?: string;
  revenueRange?: string;
  staffCount?: number;
  staffCountRange?: string;
  __typename?: string;
}

export interface Contact {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName?: string;
  preferredName?: string;
  title?: string;
  department?: string;
  seniority?: string;
  liProfileHandle?: string;
  liSalesNavProfileUrl?: string;
  city?: string;
  state?: string;
  stateAbbr?: string;
  countryFull?: string;
  country2?: string;
  country3?: string;
  location?: string;
  companyId?: string;
  company?: Company;
  emails: ContactEmail[];
  liSalesNavProfileId?: string;
  phones: ContactPhone[];
  // Legacy fields for backward compatibility
  companyName?: string;
  status?:
    | "INITIALIZED"
    | "PENDING_CONN_REQ"
    | "CONNECTION"
    | "WITHDRAWN"
    | "WITHDRAWN_BY_USER"
    | "NEW_CONTACT"
    | "IN_QUEUE"
    | "END_OF_CAMPAIGN"
    | "CONNECT_REQ"
    | "SENT_LINKEDIN"
    | "CONNECTED"
    | "SENT_EMAIL"
    | "REPLIED"
    | "DISQUALIFIED";
  updatedAt?: string;
  createdAt?: string;
  phoneNumber?: string;
  __typename?: string;
}

export interface CampaignContact {
  id: string;
  contactId: string;
  stepId: string;
  status: CampaignContactStatus;
  extraData?: any;
  lastAction: string; // Timestamp
  contact?: Contact;
  __typename?: string;
  templateData?: any;
  campaign?: {
    get?: {
      id: string;
      name: string;
      active: boolean;
    };
  };
}

export interface CampaignStep {
  id: string;
  campaignId: string;
  enabled: boolean;
  priority: number;
  stepData?: {
    __typename?: string;
    subject?: string;
    body?: string;
    from?: string;
    replyToPrevious?: boolean;
    linkedinMessage?: string;
    connectionRequestMessage?: string;
  };
}

// Input Types for GraphQL Mutations
export interface AddCampaignContact {
  contactId: string; // UUID
  extraData?: any; // ExtraData
}

export interface ContactFilter {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ContactsResponse {
  getContacts: Contact[];
  error?: string;
}

export interface ContactList {
  id: string;
  teamId: string;
  name: string;
  salesNavQuery?: string;
  csv?: string;
  contactIds: string[];
  contacts: Contact[];
  __typename?: string;
}

export interface ContactRow {
  bestEmail: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName?: string;
  preferredName?: string;
  title?: string;
  department?: string;
  seniority?: string;
  liProfileHandle?: string;
  city?: string;
  state?: string;
  stateAbbr?: string;
  country?: string;
  country2?: string;
  country3?: string;
  location?: string;
  linkedinEmail?: string;
  email1?: string;
  email1Validation?: string;
  email1Confidence?: string;
  email2?: string;
  email2Validation?: string;
  email2Confidence?: string;
  personalEmail?: string;
  personalEmailValidation?: string;
  personalEmailConfidence?: string;
  phone1?: string;
  phone2?: string;
  phone3?: string;
  mobilePhone1?: string;
  mobilePhone1Confidence?: string;
  mobilePhone2?: string;
  mobilePhone2Confidence?: string;
  mobilePhone3?: string;
  mobilePhone3Confidence?: string;
  companyliProfileHandle?: string;
  companyName?: string;
  companyWebsite?: string;
  companyCity?: string;
  companyState?: string;
  companyStateAbbr?: string;
  companyCountry?: string;
  companyCountry2?: string;
  companyCountry3?: string;
  companyLocation?: string;
  companyPhone1?: string;
  companyPhone2?: string;
  companyPhone3?: string;
  companyAnnualRevenue?: number;
  companyWebsiteDomain?: string;
  companyFoundedYear?: number;
  companyIndustry?: string;
  companyRevenueRange?: string;
  companyStaffCount?: number;
  companyStaffCountRange?: string;
}

export interface RejectedContact {
  contactRow: ContactRow;
  matchedIds: string[];
  message: string;
  __typename?: string;
}

export interface ContactListResult {
  contactList: ContactList;
  contacts: Contact[];
  companies: Company[];
  rejectedContacts: RejectedContact[];
  __typename?: string;
}
