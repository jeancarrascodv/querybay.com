import { Contact } from "./contact";

/**
 * Status types for a contact within a campaign
 */
export enum CampaignContactStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  PAUSED = "PAUSED",
  SKIPPED = "SKIPPED",
  // Add other status types as needed
}

/**
 * CampaignContact represents a contact that has been added to a campaign
 */
export interface CampaignContact {
  id: string; // UUID
  contactId: string; // UUID
  stepOrLinkId: string; // UUID
  status: CampaignContactStatus;
  extraData?: any; // JSON
  lastAction: string; // Timestamp
  contact?: Contact;
  templateData?: any; // JSON object containing template variables
}

/**
 * Input type for adding a contact to a campaign
 */
export interface AddCampaignContact {
  contactId: string; // UUID
  extraData?: any; // JSON
}

/**
 * Input type for modifying a campaign
 */
export interface MutateCampaign {
  name?: string;
  description?: string;
  // Add other modifiable campaign fields as needed
}
