import {
  AllowedMessagingDayTimes,
  SendEmailData,
  UiBox,
} from "./campaign.types";

// Main Campaign Step type
export interface CampaignStep {
  id: string;
  campaignId: string;
  priority: number;
  stepData: CampaignStepData;
  weeklyRestrictions?: AllowedMessagingDayTimes;
  ui?: {
    box: UiBox;
  };
  enabled?: boolean; // Whether the step is enabled/active
}

// Step data can be various types
export interface CampaignStepData {
  __typename:
    | "SendEmailData"
    | "SendLinkedInMessageData"
    | "SendLinkedInConnectionRequest";
  sendEmail?: SendEmailData;
  sendLinkedInMessage?: {
    linkedinMessage: string;
  };
  sendLinkedInConnectionRequest?: {
    connectionRequestMessage: string;
  };
  // Other step types can be added here
}

// Input for creating a new campaign step
export interface CreateCampaignStep {
  id: string; // Unique ID for the step
  stepData: CampaignStepDataInput;
  priority?: number;
  weeklyRestrictions?: WeeklyRestrictionsInput | null; // null means "use campaign settings"
  ui?: UiInput;
  enabled?: boolean; // Whether the step is enabled/active
}

export interface CampaignStepDataInput {
  sendEmail?: SendEmailInput;
  sendLinkedInMessage?: SendLinkedInMessageInput;
  sendLinkedInConnectionRequest?: SendLinkedInConnectionRequestInput;
  // Other step type inputs can be added here
}

export interface SendEmailInput {
  subject: string;
  body: string;
  from: string[];
  replyToPrevious: boolean;
}

export interface SendLinkedInMessageInput {
  linkedinMessage: string;
}

export interface SendLinkedInConnectionRequestInput {
  connectionRequestMessage: string;
}

export interface WeeklyRestrictionsInput {
  sunday?: DailyRestrictionInput;
  monday?: DailyRestrictionInput;
  tuesday?: DailyRestrictionInput;
  wednesday?: DailyRestrictionInput;
  thursday?: DailyRestrictionInput;
  friday?: DailyRestrictionInput;
  saturday?: DailyRestrictionInput;
}

export interface DailyRestrictionInput {
  startTime: string; // format HH:MM:SS
  endTime: string; // format HH:MM:SS
}



export interface UiInput {
  box: UiBoxInput;
}

export interface UiBoxInput {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

// Input for modifying an existing campaign step
export interface MutateCampaignStep {
  id: string; // ID of the step to modify
  stepData?: CampaignStepDataInput;
  priority?: number;
  weeklyRestrictions?: WeeklyRestrictionsInput | null; // null means "use campaign settings"
  ui?: UiInput;
  enabled?: boolean; // Enable/disable the step
}

// Campaign Step Links
export interface CampaignStepLink {
  id: string;
  prev: string; // ID of previous step
  next: string; // ID of next step
  delay: Span;
  randomDelay?: Span;
  filter?: CampaignStepLinkFilter;
}

export interface Span {
  businessDays?: number;
  seconds?: number;
  days?: number;
}

export interface SpanInput {
  businessDays?: number;
  seconds?: number;
  days?: number;
}

// Input for creating a new campaign step link
export interface CreateCampaignStepLink {
  prev: {
    uuid?: string; // Optional UUID for the previous step
    tag?: string; // Optional tag for the next step
  }; // ID of previous step
  next: {
    uuid?: string; // Optional UUID for the next step
    tag?: string; // Optional tag for the next step
  }; // ID of next step
  delay: SpanInput;
  randomDelay?: SpanInput;
  filter?: CampaignStepLinkFilterInput;
}

// Input for modifying an existing campaign step link
export interface MutateCampaignStepLink {
  id: string; // ID of the link to modify
  prev: {
    uuid?: string; // Optional UUID for the next step
    tag?: string; // Optional tag for the next step
  }; // ID of previous step
  next: {
    uuid?: string; // Optional UUID for the next step
    tag?: string; // Optional tag for the next step  }; // ID of next step
  };
  delay?: SpanInput;
  randomDelay?: SpanInput;
  filter?: CampaignStepLinkFilterInput;
}

// Filter types (union type in GraphQL)
export type CampaignStepLinkFilter =
  | OpenedPreviousEmail
  | OpenedAnyEmail
  | RespondedPreviousEmail
  | RespondedAnyEmail
  | ConstFilter
  | AndFilter
  | OrFilter
  | NotFilter;

export interface OpenedPreviousEmail {
  within?: Span;
}

export interface OpenedAnyEmail {
  within?: Span;
}

export interface RespondedPreviousEmail {
  within?: Span;
}

export interface RespondedAnyEmail {
  within?: Span;
}

export interface ConstFilter {
  pass: boolean;
}

export interface AndFilter {
  and: CampaignStepLinkFilter[];
}

export interface OrFilter {
  or: CampaignStepLinkFilter[];
}

export interface NotFilter {
  not: CampaignStepLinkFilter;
}

// Filter input types for GraphQL
export interface CampaignStepLinkFilterInput {
  openedPreviousEmail?: OpenedPreviousEmailInput;
  openedAnyEmail?: OpenedAnyEmailInput;
  respondedPreviousEmail?: RespondedPreviousEmailInput;
  respondedAnyEmail?: RespondedAnyEmailInput;
  const?: ConstFilterInput;
  and?: AndFilterInput;
  or?: OrFilterInput;
  not?: NotFilterInput;
}

export interface OpenedPreviousEmailInput {
  within?: SpanInput;
}

export interface OpenedAnyEmailInput {
  within?: SpanInput;
}

export interface RespondedPreviousEmailInput {
  within?: SpanInput;
}

export interface RespondedAnyEmailInput {
  within?: SpanInput;
}

export interface ConstFilterInput {
  pass: boolean;
}

export interface AndFilterInput {
  and: CampaignStepLinkFilterInput[];
}

export interface OrFilterInput {
  or: CampaignStepLinkFilterInput[];
}

export interface NotFilterInput {
  not: CampaignStepLinkFilterInput;
}

// Bulk update input
export interface BulkUpdateStepsInput {
  stepCreations?: CreateCampaignStep[];
  stepMutations?: MutateCampaignStep[];
  stepDeletions?: string[];
  linkCreations?: CreateCampaignStepLink[];
  linkMutations?: MutateCampaignStepLink[];
  linkDeletions?: string[];
}

// Campaign contact
export interface CampaignContact {
  id: string;
  contactId: string;
  stepId: string;
  status: CampaignContactStatus;
  extraData?: any;
  lastAction: string; // ISO date string
  contact?: Contact;
  templateData?: any;
}

export enum CampaignContactStatus {
  ERROR = "ERROR",
  PENDING_START_STEP = "PENDING_START_STEP",
  IN_PROGRESS = "IN_PROGRESS",
  END_STEP = "END_STEP",
  FINISHED = "FINISHED",
}

export interface Contact {
  id: string;
  firstName: string;
  lastName?: string;
  fullName?: string;
  emails?: ContactEmail[];
}

export interface ContactEmail {
  id: string;
  email: string;
  emailType: string;
}

export interface AddCampaignContact {
  contactId: string;
  extraData?: any;
}

// For backward compatibility
export type CampaignStepInput = CreateCampaignStep;
export type CampaignStepUpdateInput = MutateCampaignStep;
export interface CampaignStepFilter {
  // Keeping this for backward compatibility
}
