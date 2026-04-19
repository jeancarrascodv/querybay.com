// This file is deprecated. Please use the main GraphQL files in the parent directory.
// Re-export to maintain backward compatibility
import { Queries as ContactsQueries } from "../contacts";
import { Queries as CampaignQueries } from "../campaign";
import { Queries as CampaignStepQueries } from "../campaignStep";
import { Queries as TeamQueries } from "../team";

export { ContactsQueries, CampaignQueries, CampaignStepQueries, TeamQueries };

// Re-export specific queries used in the old pattern
export const { GET_CONTACTS, GET_ALL_CONTACT_LISTS, GET_TEAM_CONTACT_LISTS } =
  ContactsQueries;
export const { GET_CAMPAIGNS } = CampaignQueries;
