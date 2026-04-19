import { gql } from "@apollo/client";
import {
  LINKEDIN_INTEGRATION_FRAGMENT,
  CAMPAIGN_FULL_FRAGMENT,
  CONTACT_LIST_FRAGMENT,
  INVITE_FRAGMENT,
  WEEKLY_RESTRICTIONS_FRAGMENT,
} from "./fragments";

// Fragment definitions
export const SPAN_FRAGMENT = gql`
  fragment span on Span {
    businessDays
    days
    seconds
  }
`;

// ============================================================================
// Separate Queries for Different Data Types (Different Caching Strategies)
// ============================================================================
// Each query is optimized for its data volatility:
// - Teams: Static, cache aggressively (rarely changes)
// - LinkedIn Integrations: Refresh regularly (changes often)
// - Actions: Refresh regularly (constantly updating)
// - Contacts: Refresh regularly (constantly updating)
// - Campaign Contacts: Cache-first, don't auto-refresh

// Teams Query - Static data, cache aggressively (never auto-refresh)
export const TEAMS_QUERY = gql`
  query Teams {
    allTeams {
      id
      name
      timeZone
      allowedMessagingDayTimes {
        ...WeeklyRestrictionsFragment
      }
      users {
        id
        email
        firstName
        lastName
        title
        company
        timezone
        defaultTeamId
      }
    }
    team {
      get {
        id
        name
        timeZone
        allowedMessagingDayTimes {
          ...WeeklyRestrictionsFragment
        }
      }
    }
    # Timezones are static, fetch once and cache
    timezones {
      name
      shortName
      offsetSeconds
    }
    # Default settings for system-wide defaults
    defaultSetting {
      maxConsecutiveLinkedinFailures
    }
  }
  ${WEEKLY_RESTRICTIONS_FRAGMENT}
`;

// LinkedIn Integrations Query - Refresh regularly
export const LINKEDIN_INTEGRATIONS_QUERY = gql`
  query LinkedInIntegrations {
    team {
      get {
        id
        allowedMessagingDayTimes {
          ...WeeklyRestrictionsFragment
        }
      }
      linkedInIntegrations {
        get {
          ...LinkedInIntegrationFragment
        }
      }
    }
  }
  ${LINKEDIN_INTEGRATION_FRAGMENT}
  ${WEEKLY_RESTRICTIONS_FRAGMENT}
`;

// Contact Lists Query - Refresh regularly (contacts change often)
export const CONTACT_LISTS_QUERY = gql`
  query ContactLists {
    team {
      contactLists {
        ...ContactListFragment
      }
    }
  }
  ${CONTACT_LIST_FRAGMENT}
`;

// Legacy consolidated query (kept for backward compatibility)
export const TEAM_DATA_QUERY = gql`
  query TeamData(
    $includeAllTeams: Boolean! = false
    $includeUsers: Boolean! = false
    $includeLinkedIn: Boolean! = false
    $includeCampaigns: Boolean! = false
    $includeContactLists: Boolean! = false
    $includeInvites: Boolean! = false
    $includeTimezones: Boolean! = false
    $includeDefaultSettings: Boolean! = false
  ) {
    allTeams @include(if: $includeAllTeams) {
      id
      name
      timeZone
      allowedMessagingDayTimes {
        ...WeeklyRestrictionsFragment
      }
      users {
        id
        email
        firstName
        lastName
        title
        company
        timezone
        defaultTeamId
      }
    }
    team {
      get {
        id
        name
        timeZone
        allowedMessagingDayTimes {
          ...WeeklyRestrictionsFragment
        }
        users @include(if: $includeUsers) {
          id
          email
          firstName
          lastName
          title
          company
          timezone
          defaultTeamId
        }
      }
      linkedInIntegrations @include(if: $includeLinkedIn) {
        get {
          ...LinkedInIntegrationFragment
        }
      }
      campaigns @include(if: $includeCampaigns) {
        get {
          ...CampaignFullFragment
        }
      }
      contactLists @include(if: $includeContactLists) {
        ...ContactListFragment
      }
      invites(allTeams: true) @include(if: $includeInvites) {
        ...InviteFragment
      }
    }
    timezones @include(if: $includeTimezones) {
      name
      shortName
      offsetSeconds
    }
    defaultSetting @include(if: $includeDefaultSettings) {
      maxConsecutiveLinkedinFailures
    }
  }
  ${LINKEDIN_INTEGRATION_FRAGMENT}
  ${CAMPAIGN_FULL_FRAGMENT}
  ${CONTACT_LIST_FRAGMENT}
  ${INVITE_FRAGMENT}
`;

// ============================================================================
// Report Data Query
// ============================================================================

export const REPORT_DATA_QUERY = gql`
  query ReportData {
    reportData {
      linkedinId
      teamId
      activeCampaignsCount
      loginActiveLastValidated
      salesNavigatorActiveLastValidated
      linkedinErrorsDailyCount
      linkedinErrorsWeeklyCount
      linkedinErrorsMonthlyCount
      linkedinErrorsTotalCount
      connectionRequestQueueSize
      connectionRequestDailyCount
      connectionRequestWeeklyCount
      connectionRequestMonthlyCount
      connectionRequestTotalCount
      newConnectionsDailyCount
      newConnectionsWeeklyCount
      newConnectionsMonthlyCount
      newConnectionsTotalCount
      linkedinMessagesSentDailyCount
      linkedinMessagesSentWeeklyCount
      linkedinMessagesSentMonthlyCount
      linkedinMessagesSentTotalCount
      linkedinResponsesReceivedDailyCount
      linkedinResponsesReceivedWeeklyCount
      linkedinResponsesReceivedMonthlyCount
      linkedinResponsesReceivedTotalCount
      emailsSentDailyCount
      emailsSentWeeklyCount
      emailsSentMonthlyCount
      emailsSentTotalCount
      emailsResponsesDailyCount
      emailsResponsesWeeklyCount
      emailsResponsesMonthlyCount
      emailsResponsesTotalCount
      linkedin {
        get {
          id
          fullName
          linkedinProfileUrl
        }
      }
      team {
        get {
          id
          name
        }
      }
    }
  }
`;

// ============================================================================
// LinkedIn Actions Query
// ============================================================================
// Query to fetch action requests, history, and failures for all LinkedIn integrations

export const LINKEDIN_ACTIONS_QUERY = gql`
  query LinkedInActions($historyLimit: Int) {
    team {
      linkedInIntegrations {
        get {
          id
          fullName
        }
        actionRequests {
          id
          actionType
          action {
            ... on SendConnectionRequest {
              profileUrl
              message
            }
            ... on ScrapeSalesNavQuery {
              salesNavigatorUrl
              contactListId
            }
            ... on SyncConnections {
              fullSync
            }
            ... on DownloadInbox {
              fullSync
            }
          }
          teamId
          linkedinId
          campaignId
          campaignStepId
          contactId
          expiresAt
          priority
          nextAttemptAt
          lastAttemptStatus
          attempts
          linkedIn {
            get {
              id
              fullName
            }
          }
          contact {
            id
            fullName
            firstName
            lastName
            liProfileHandle
            liSalesNavProfileId
          }
          campaign {
            get {
              id
              name
            }
          }
          campaignStep {
            id
            stepData {
              __typename
            }
          }
        }
        actionRequestHistory(limit: $historyLimit) {
          id
          actionType
          action {
            ... on SendConnectionRequest {
              profileUrl
              message
            }
            ... on ScrapeSalesNavQuery {
              salesNavigatorUrl
              contactListId
            }
            ... on SyncConnections {
              fullSync
            }
            ... on DownloadInbox {
              fullSync
            }
          }
          teamId
          linkedinId
          campaignId
          campaignStepId
          contactId
          priority
          startedAt
          completedAt
          attempts
          description
          linkedIn {
            get {
              id
              fullName
            }
          }
          contact {
            id
            fullName
            firstName
            lastName
            liProfileHandle
          }
          campaign {
            get {
              id
              name
            }
          }
          campaignStep {
            id
            stepData {
              __typename
            }
          }
        }
        actionRequestFailures {
          id
          actionType
          action {
            ... on SendConnectionRequest {
              profileUrl
              message
            }
            ... on ScrapeSalesNavQuery {
              salesNavigatorUrl
              contactListId
            }
            ... on SyncConnections {
              fullSync
            }
            ... on DownloadInbox {
              fullSync
            }
          }
          teamId
          linkedinId
          campaignId
          campaignStepId
          contactId
          priority
          failedAt
          attempts
          error
          hasHtml
          hasScreenshot
          description
          linkedIn {
            get {
              id
              fullName
            }
          }
          contact {
            id
            fullName
            firstName
            lastName
            liProfileHandle
          }
          campaign {
            get {
              id
              name
            }
          }
          campaignStep {
            id
            stepData {
              __typename
            }
          }
        }
      }
    }
  }
`;

// ============================================================================
// Subscriptions
// ============================================================================

export const LOGS_SUBSCRIPTION = gql`
  subscription Logs($filter: LogFilter) {
    logs(filter: $filter) {
      level
      message
      target
      timestamp
      teamId
      campaignId
      campaignStepId
      contactId
      linkedinId
      actionId
      requestId
      fields
    }
  }
`;

export const Queries = {
  GET_TEAMS: gql`
    query getTeams {
      allTeams {
        name
        id
        timeZone
        allowedMessagingDayTimes {
          ...WeeklyRestrictionsFragment
        }
        users {
          id
          email
          defaultTeamId
          firstName
          lastName
          title
          company
          timezone
        }
      }
    }
    ${WEEKLY_RESTRICTIONS_FRAGMENT}
  `,

  GET_TEAM: gql`
    query getTeam {
      team {
        campaigns {
          steps {
            stepData {
              sendEmail {
                subject
                body
                from
                replyToPrevious
              }
            }
            id
            priority
          }
          links {
            id
            filter {
              __typename
              ... on ConstFilter {
                pass
              }
              ... on OpenedAnyEmail {
                within {
                  ...span
                }
              }
            }
            prev
            next
            delay {
              ...span
            }
            randomDelay {
              ...span
            }
          }
          contacts {
            id
          }
        }
        contactLists {
          id
          name
          contacts {
            id
            firstName
            lastName
            emails {
              email
              emailType
              priority
              emailSource
              validationType
            }
            company {
              id
              liProfileHandle
              name
              country2
              country3
            }
          }
        }
      }
    }
    ${SPAN_FRAGMENT}
  `,

  GET_TEAM_WITH_CONTACTS: gql`
    query getTeamWithContacts {
      team {
        contactLists {
          id
          name
          contacts {
            id
            firstName
            lastName
            emails {
              email
              emailType
              priority
              emailSource
              validationType
            }
            company {
              id
              name
              country2
              country3
              liProfileHandle
            }
          }
        }
      }
    }
  `,

  GET_CAMPAIGN_CONTACT: gql`
    query campaignContact($id: ID!) {
      campaign(id: $id) {
        contacts {
          id
          contact {
            firstName
          }
          status
          extraData
        }
      }
    }
  `,

  GET_TEAM_INVITES: gql`
    query getTeamInvites {
      team {
        invites(allTeams: true) {
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
      }
    }
  `,

  GET_TEAM_USERS: gql`
    query getTeamUsers {
      team {
        get {
          id
          name
          timeZone
          users {
            id
            email
            defaultTeamId
            firstName
            lastName
            title
            company
            timezone
          }
        }
      }
    }
  `,

  GET_LINKEDIN_INTEGRATIONS: gql`
    query getLinkedInIntegrations {
      team {
        linkedInIntegrations {
          get {
            id
            primaryUserId
            teamId
            linkedinProfileUrl
            fullName
            maxPendingConnectionRequests
            maxConnectionRequestsPerWeek
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
            connections
            loginActiveLastValidated
            salesNavigatorActiveLastValidated
            proxyUrl
          }
        }
      }
    }
    ${WEEKLY_RESTRICTIONS_FRAGMENT}
  `,

  GET_DEFAULT_SETTINGS: gql`
    query getDefaultSettings {
      defaultSetting {
        maxConsecutiveLinkedinFailures
      }
    }
  `,

  GET_TIMEZONES: gql`
    query getTimezones {
      timezones {
        name
        shortName
        offsetSeconds
      }
    }
  `,
};

export const Mutations = {
  // Team Mutations
  CREATE_TEAM: gql`
    mutation createTeam($name: String!, $timezone: String!) {
      createTeam(name: $name, timezone: $timezone) {
        id
        timeZone
      }
    }
  `,

  CREATE_INVITE: gql`
    mutation createInvite($invite: CreateInvite!) {
      team {
        createInvite(invite: $invite) {
          code
          email
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
      }
    }
  `,

  REMOVE_INVITE: gql`
    mutation removeInvite($code: String!) {
      team {
        removeInvite(code: $code)
      }
    }
  `,

  CREATE_LINKEDIN: gql`
    mutation createLinkedIn($linkedin: CreateLinkedIn!) {
      team {
        createLinkedin(linkedin: $linkedin) {
          id
          primaryUserId
          teamId
          linkedinProfileUrl
          fullName
          maxPendingConnectionRequests
          maxConnectionRequestsPerWeek
          maxConnectionRequestsPerDay
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
          connections
          loginActiveLastValidated
          salesNavigatorActiveLastValidated
          proxyUrl
        }
      }
    }
    ${WEEKLY_RESTRICTIONS_FRAGMENT}
  `,

  START_LINKEDIN_BROWSER: gql`
    mutation startLinkedInBrowser($linkedInId: ID!) {
      team {
        linkedin(id: $linkedInId) {
          startBrowser
        }
      }
    }
  `,
  STOP_LINKEDIN_BROWSER: gql`
    mutation stopLinkedInBrowser($linkedInId: ID!) {
      team {
        linkedin(id: $linkedInId) {
          stopBrowser
        }
      }
    }
  `,
  STOP_LINKEDIN_CONTAINER: gql`
    mutation stopLinkedInContainer($linkedInId: ID!) {
      team {
        linkedin(id: $linkedInId) {
          stopContainer
        }
      }
    }
  `,
  CLEAN_LINKEDIN_CONTAINER: gql`
    mutation cleanLinkedInContainer($linkedInId: ID!) {
      team {
        linkedin(id: $linkedInId) {
          cleanContainer
        }
      }
    }
  `,
  RETRY_ACTION_FAILURE: gql`
    mutation retryActionFailure($linkedInId: ID!, $actionRequestId: ID!) {
      team {
        linkedin(id: $linkedInId) {
          retryActionFailure(actionRequestId: $actionRequestId)
        }
      }
    }
  `,
  CREATE_LINKEDIN_CONTACT_LIST: gql`
    mutation createLinkedInContactList(
      $linkedInId: ID!
      $listName: String!
      $salesNavQuery: String!
    ) {
      team {
        linkedin(id: $linkedInId) {
          createContactList(listName: $listName, salesNavQuery: $salesNavQuery)
        }
      }
    }
  `,

  SYNC_CONNECTIONS: gql`
    mutation syncConnections($linkedInId: ID!, $fullSync: Boolean!) {
      team {
        linkedin(id: $linkedInId) {
          syncConnections(fullSync: $fullSync)
        }
      }
    }
  `,

  UPDATE_LINKEDIN: gql`
    mutation updateLinkedIn($linkedInId: ID!, $mutation: MutateLinkedIn!) {
      team {
        linkedin(id: $linkedInId) {
          modify(mutation: $mutation) {
            id
            primaryUserId
            teamId
            linkedinProfileUrl
            fullName
            maxPendingConnectionRequests
            maxConnectionRequestsPerWeek
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
          }
        }
      }
    }
    ${WEEKLY_RESTRICTIONS_FRAGMENT}
  `,

  // Campaign Mutations
  CREATE_CAMPAIGN: gql`
    mutation createCampaign($campaign: CampaignInput!) {
      team {
        createCampaign(campaign: $campaign) {
          id
          name
        }
      }
    }
  `,

  ADD_CONTACTS_TO_CAMPAIGN: gql`
    mutation addContactsToCampaign(
      $campaignId: ID!
      $contact: CampaignContactInput!
    ) {
      team {
        campaign(id: $campaignId) {
          addCampaignContact(contact: $contact) {
            id
            contact {
              id
            }
            lastAction
            status
            stepId
            extraData
          }
        }
      }
    }
  `,

  ADD_CAMPAIGN_STEP: gql`
    mutation addStep($campaignId: ID!, $step: CampaignStepInput!) {
      team {
        campaign(id: $campaignId) {
          addCampaignStep(step: $step) {
            id
            campaignId
            priority
            stepData {
              sendEmail {
                subject
                body
                from
                replyToPrevious
              }
            }
            weeklyRestrictions {
              monday {
                startTime
                endTime
              }
            }
          }
        }
      }
    }
  `,

  ADD_CAMPAIGN_STEP_LINK: gql`
    mutation addLink($campaignId: ID!, $link: CampaignStepLinkInput!) {
      team {
        campaign(id: $campaignId) {
          addCampaignStepLink(link: $link) {
            id
            prev
            next
            delay {
              ...span
            }
            randomDelay {
              ...span
            }
            filter {
              __typename
              ... on ConstFilter {
                pass
              }
            }
          }
        }
      }
    }
    ${SPAN_FRAGMENT}
  `,

  // Contact List Mutations
  UPLOAD_CONTACTS: gql`
    mutation uploadContacts($file: Upload!, $listName: String!) {
      team {
        uploadContactListCsv(listName: $listName, csvFile: $file) {
          contactList {
            id
            name
          }
          contacts {
            id
            firstName
          }
          companies {
            id
            name
          }
          rejectedContacts {
            matchedIds
            message
            contactRow {
              bestEmail
              firstName
            }
          }
        }
      }
    }
  `,

  MUTATE_CONTACT_LIST: gql`
    mutation mutateContactList($id: ID!, $name: String) {
      team {
        mutateContactList(id: $id, name: $name)
      }
    }
  `,

  DELETE_CONTACT_LISTS: gql`
    mutation deleteContactLists($ids: [ID!]!) {
      team {
        deleteContactLists(ids: $ids)
      }
    }
  `,
};
