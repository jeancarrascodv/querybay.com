// This file is deprecated. Please use the main GraphQL files in the parent directory.
// Re-export to maintain backward compatibility
import { Mutations as ContactsMutations } from "../contacts";
import { Mutations as CampaignMutations } from "../campaign";
import { Mutations as CampaignStepMutations } from "../campaignStep";
import { Mutations as TeamMutations } from "../team";

// Import new mutations from the mutations folder
import { ContactMutations } from "./contacts";

export {
  ContactsMutations,
  CampaignMutations,
  CampaignStepMutations,
  TeamMutations,
  ContactMutations,
};

// Re-export specific mutations used in the old pattern
export const { UPLOAD_CONTACTS, ADD_CONTACTS_TO_CAMPAIGN } = ContactsMutations;
export const { CREATE_CAMPAIGN, UPDATE_CAMPAIGN } = CampaignMutations;

// Re-export new mutations
export const {
  ADD_CONTACTS_TO_CAMPAIGN: ADD_CONTACTS_TO_CAMPAIGN_NEW,
  UPLOAD_CONTACTS_CSV,
} = ContactMutations;
