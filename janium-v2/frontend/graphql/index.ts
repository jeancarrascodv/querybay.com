// Export all GraphQL queries and mutations from here for easy imports
export * from "./contacts";
export * from "./fragments";
export { TEAM_DATA_QUERY } from "./team";

// Re-export with namespaces for better organization
import * as ContactsQueries from "./contacts";
import * as CampaignQueries from "./campaign";
import * as CampaignStepQueries from "./campaignStep";
import * as TeamQueries from "./team";
import * as Fragments from "./fragments";

export const GraphQL = {
  Contacts: ContactsQueries,
  Campaign: CampaignQueries,
  CampaignStep: CampaignStepQueries,
  Team: TeamQueries,
  Fragments,
};
