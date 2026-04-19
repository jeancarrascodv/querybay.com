import { gql } from "@apollo/client";

// ============================================================================
// Shared GraphQL Fragments
// ============================================================================
// These fragments are reused across multiple queries to ensure consistency
// and reduce duplication. Import and spread them in your queries/mutations.

/**
 * Core user fields - basic info
 */
export const USER_FRAGMENT = gql`
  fragment UserFragment on User {
    id
    email
    firstName
    lastName
    title
    company
    timezone
    defaultTeamId
  }
`;

/**
 * Weekly time restrictions (shared across teams, campaigns, LinkedIn)
 */
export const WEEKLY_RESTRICTIONS_FRAGMENT = gql`
  fragment WeeklyRestrictionsFragment on WeeklyRestrictions {
    sunday {
      startTime
      endTime
    }
    monday {
      startTime
      endTime
    }
    tuesday {
      startTime
      endTime
    }
    wednesday {
      startTime
      endTime
    }
    thursday {
      startTime
      endTime
    }
    friday {
      startTime
      endTime
    }
    saturday {
      startTime
      endTime
    }
  }
`;

/**
 * Core team fields - minimal info
 */
export const TEAM_CORE_FRAGMENT = gql`
  fragment TeamCoreFragment on Team {
    id
    name
    timeZone
  }
`;

/**
 * Full team fields with users and scheduling
 */
export const TEAM_FULL_FRAGMENT = gql`
  fragment TeamFullFragment on Team {
    id
    name
    timeZone
    allowedMessagingDayTimes {
      ...WeeklyRestrictionsFragment
    }
    users {
      ...UserFragment
    }
  }
  ${WEEKLY_RESTRICTIONS_FRAGMENT}
  ${USER_FRAGMENT}
`;

/**
 * LinkedIn integration fields - complete data
 */
export const LINKEDIN_INTEGRATION_FRAGMENT = gql`
  fragment LinkedInIntegrationFragment on LinkedIn {
    id
    primaryUserId
    teamId
    linkedinProfileUrl
    fullName
    maxPendingConnectionRequests
    maxConnectionRequestsPerWeek
    maxConnectionRequestsPerDay
    dailyConnectionRequestsVariationPct
    minimumDelayBetweenConnectionRequestsMs
    weeklyRestrictions {
      ...WeeklyRestrictionsFragment
    }
    warmupEnabled
    warmupPeriodDays
    warmupStartingConnectionRequestsPerDay
    maxConsecutiveErrors
    todayMaxConnectionRequests
    todayExecutableWindowStart
    todayExecutableWindowEnd
    todayOptionsUpdated
    connections
    loginActiveLastValidated
    salesNavigatorActiveLastValidated
    proxyUrl
    timezone
  }
  ${WEEKLY_RESTRICTIONS_FRAGMENT}
`;

/**
 * Campaign core fields
 */
export const CAMPAIGN_CORE_FRAGMENT = gql`
  fragment CampaignCoreFragment on Campaign {
    id
    name
    active
    linkedinIds
  }
`;

/**
 * Campaign with scheduling
 */
export const CAMPAIGN_FULL_FRAGMENT = gql`
  fragment CampaignFullFragment on Campaign {
    id
    name
    active
    linkedinIds
    allowedMessagingDayTimes {
      ...WeeklyRestrictionsFragment
    }
  }
  ${WEEKLY_RESTRICTIONS_FRAGMENT}
`;

/**
 * Contact list fields
 */
export const CONTACT_LIST_FRAGMENT = gql`
  fragment ContactListFragment on ContactList {
    id
    name
  }
`;

/**
 * Contact with basic info
 */
export const CONTACT_FRAGMENT = gql`
  fragment ContactFragment on Contact {
    id
    firstName
    lastName
    emails {
      email
      validationType
    }
    company {
      id
      name
      liProfileHandle
    }
  }
`;

/**
 * Invite fields
 */
export const INVITE_FRAGMENT = gql`
  fragment InviteFragment on Invite {
    code
    email
    teamId
    privileges
    createdAt
    createdById
    expiresAt
    createdBy {
      id
      firstName
      lastName
      email
    }
  }
`;
