# GraphQL Structure

This directory contains all GraphQL queries and mutations used throughout the application, organized by domain entities.

## Structure

- `index.ts`: Exports all GraphQL operations for easy imports
- Entity-specific files:
  - `contacts.ts`: Queries and mutations for contacts and contact lists
  - `campaign.ts`: Queries and mutations for campaigns
  - `campaignStep.ts`: Queries and mutations for campaign steps
  - `team.ts`: Queries and mutations for teams

## Usage

### Preferred way (using namespaced imports)

```typescript
import { Queries, Mutations } from "@/graphql/contacts";

// Example usage
const { data } = await client.query({
  query: Queries.GET_TEAM_CONTACT_LISTS,
  variables: { teamId },
});

const result = await client.mutate({
  mutation: Mutations.UPLOAD_CONTACTS,
  variables: {
    /* your variables */
  },
});
```

### Alternative (using direct imports)

```typescript
import { GraphQL } from "@/graphql";

// Example usage
const { data } = await client.query({
  query: GraphQL.Contacts.Queries.GET_TEAM_CONTACT_LISTS,
  variables: { teamId },
});
```

## Legacy folders

The `queries` and `mutations` folders are kept for backward compatibility but are deprecated.
Please use the main GraphQL files instead.
