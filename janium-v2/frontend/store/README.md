# Global State Management

This directory contains the Zustand stores used for global state management in the application.

## Overview

We use Zustand for global state management with persist middleware to save critical data in localStorage. This approach provides:

1. **Persistent state** - Data is preserved across page refreshes
2. **Server-side rendering compatibility** - Works well with Next.js
3. **Simple API** - No providers, reducers, or complex setup
4. **TypeScript support** - Full type safety for our stores

## Stores

### `useTeamStore`

Manages team data across the application:

- Teams list
- Current selected team
- Contact lists for the current team

### `useCampaignStore`

Manages campaign data:

- Current campaigns
- Campaign settings
- Campaign metrics

### `useContactsStore`

Manages contact data:

- Contact lists
- Contact filtering and sorting

## Usage Pattern

Our state management follows these principles:

1. **Server-first data fetching** - Initial data is fetched on the server when possible
2. **Client-side caching** - Data is cached on the client to minimize refetching
3. **Periodic refresh** - Critical data is refreshed periodically
4. **Focus-based refresh** - Data is refreshed when the app regains focus

## Integration with Next.js App Router

The stores are designed to work with Next.js Server Components:

1. Server components fetch initial data
2. Data is passed to client components via props
3. Client components initialize the store with the data using initializer components
4. The store is then used for all subsequent interactions

## Helpful Hooks

In the `/hooks` directory, we provide wrapper hooks that make it easier to use the stores:

- `useTeam` - Wrapper for team store with additional helper methods
- `useTeamRefresh` - Hook for refreshing team data periodically
- `useCampaign` - Wrapper for campaign store
- `useContacts` - Wrapper for contacts store
