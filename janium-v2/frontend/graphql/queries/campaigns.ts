import { gql } from "@apollo/client";

const GET_TEAM_CAMPAIGNS = gql`
  query GetTeamCampaigns {
    team {
      campaigns {
        id
        name
      }
    }
  }
`;
