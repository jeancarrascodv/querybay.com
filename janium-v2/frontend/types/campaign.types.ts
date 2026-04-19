export type UUID = string;

export interface ActionRequest {
  id: UUID;
  status: ActionStatus;
  createdFromStepCampaignContact?: UUID;
  actionType: ActionType;
  customerId: string;
  salesNavigatorUrl?: string;
  profileUrl?: string;
  profileName?: string;
  campaignId?: UUID;
  messageContent?: string;
  sendConnectionRequest?: boolean;
  downloadFullProfileInfo?: boolean;
  storeContactDataToDb?: boolean;
  maxPagesToScrape?: number;
  maxProfilesPerPage?: number;
  priority: number;
  profileListUrls?: string[];
  historicProfileListUrls?: string[];
  maxConnRequest?: number;
  skipFirst?: number;
  progress?: string;
  continueAfter?: string;
  parentActionId?: UUID;
  amountOfProfiles?: number;
  executingWindowMin?: number;
  executingWindowMax?: number;
  updatedAt?: string;
  createdAt?: string;
  isALoop?: boolean;
}

export enum ActionStatus {
  ReceivedRequest = "received_request",
  InProgress = "in_progress",
  Finalized = "finalized",
  AutomatorFinalized = "automator_finalized",
  Cancelled = "cancelled",
}

export enum ActionType {
  ProcessSalesNavigatorUrl = "process_sales_navigator_url",
  ProcessListOfProfiles = "process_list_of_profiles",
  ProcessProfile = "process_profile",
  SendConnectionRequest = "send_connection_request",
  SendMessage = "send_message",
  ProcessSalesNavigatorProfileUrl = "process_sales_navigator_profile_url",
  DownloadSentInvitations = "download_sent_invitations",
  DownloadReceivedInvitations = "download_received_invitations",
  WithdrawConnection = "withdraw_connection",
  DownloadLastActiveConnections = "download_last_active_connections",
  WithdrawOlderPendingConnections = "withdraw_older_pending_connections",
  DownloadNewMessages = "download_new_messages",
  LoopDownloadNewMessages = "loop_download_new_messages",
  LoopDownloadSentInvitations = "loop_download_sent_invitations",
}

export interface NewActionRequest {
  type: string;
  status: string;
}

export interface ActionRequestFilter {
  id?: UUID;
  status?: string;
  type?: string;
}



export interface DayTime {
  startTime: number;
  endTime: number;
}

export interface AllowedMessagingDayTimes {
  sunday?: DayTime;
  monday?: DayTime;
  tuesday?: DayTime;
  wednesday?: DayTime;
  thursday?: DayTime;
  friday?: DayTime;
  saturday?: DayTime;
}

export interface UiBox {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface SendEmailData {
  subject: string;
  body: string;
  from: string;
  replyToPrevious: boolean;
}

export interface SendMessageData {
  message: string;
  // Add other LinkedIn message specific fields as needed
}

export interface StepData {
  sendEmail?: SendEmailData;
  sendMessage?: SendMessageData;
  // Add other step data types as needed
}

export interface CampaignStep {
  id: string;
  campaignId: string;
  priority: number;
  stepData: StepData;
  weeklyRestrictions: AllowedMessagingDayTimes;
  ui: {
    box: UiBox;
  };
}

export interface CampaignContact {
  id: string;
  contactId: string;
  status: string;
  extraData?: any;
  lastAction?: string;
  templateData?: any;
  contact?: any;
}

export interface Campaign {
  id: string;
  name: string;
  active: boolean;
  allowedMessagingDayTimes?: AllowedMessagingDayTimes;
  steps?: CampaignStep[];
  // Additional properties used in the codebase
  contacts?: CampaignContact[];
  campaignName?: string; // Some parts of the code use name, others use campaignName
  isActive?: boolean; // Some parts of the code use active, others use isActive
  dailyExecutingWindowMin?: number;
  dailyExecutingWindowMax?: number;
  allowedExecutingDays?: string[] | Record<string, boolean>;
  emailFromId?: string;
  linkedinIds?: string[]; // LinkedIn account IDs associated with this campaign
}

export interface DayTimeInput {
  startTime: string;
  endTime: string;
}

export interface AllowedMessagingDayTimesInput {
  sunday?: DayTimeInput;
  monday?: DayTimeInput;
  tuesday?: DayTimeInput;
  wednesday?: DayTimeInput;
  thursday?: DayTimeInput;
  friday?: DayTimeInput;
  saturday?: DayTimeInput;
}

export interface UiBoxInput {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface StepDataInput {
  sendEmail?: {
    subject: string;
    body: string;
    from: string;
    replyToPrevious: boolean;
  };
  sendMessage?: {
    message: string;
    // Add other LinkedIn message specific fields as needed
  };
  // Add other step types as needed
}

export interface CampaignStepInput {
  id?: string;
  campaignId?: string;
  priority: number;
  stepData: StepDataInput;
  weeklyRestrictions?: AllowedMessagingDayTimesInput;
  ui?: {
    box: UiBoxInput;
  };
}

export interface CampaignInput {
  name: string;
  active: boolean;
  allowedMessagingDayTimes?: AllowedMessagingDayTimesInput;
  steps?: CampaignStepInput[];
}

export interface CampaignUpdateInput {
  name?: string;
  active?: boolean;
  allowedMessagingDayTimes?: AllowedMessagingDayTimesInput;
  steps?: CampaignStepInput[];
}

export interface CampaignFilter {
  id?: string;
  teamId?: string;
  active?: boolean;
}

export interface Contact {
  id: UUID;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewContact {
  firstName: string;
  lastName: string;
  email: string;
  status: string;
}

export interface UpdateContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  status?: string;
}

export interface ContactFilter {
  id?: UUID;
  email?: string;
  status?: string;
}

export interface CampaignStep {
  id: UUID;
  campaignId: UUID;
  stepType: string;
  sequence: number;
  customStepType?: string;
  config: Record<string, any>;
}

export interface StepCampaignContact {
  id: UUID;
  campaignId: UUID;
  contactId: UUID;
  currentStepId: UUID;
  status: string;
}
