import { ApolloClient, InMemoryCache, from } from "@apollo/client";
import { RetryLink } from "@apollo/client/link/retry";
import { HttpLink } from "@apollo/client/link/http";
import createUploadLink from "apollo-upload-client/createUploadLink.mjs";

// Direct connection to GraphQL server for server-side use only
// This is used in API routes and server components where we can connect directly
const graphqlUrl =
  process.env.NEXT_PUBLIC_GRAPHQL_URL || "https://api.dev.janium.ai";

// Create an upload link that supports multipart form requests
const uploadLink = createUploadLink({
  uri: graphqlUrl,
  credentials: "include",
  fetchOptions: {
    mode: "cors",
  },
  headers: {
    "Apollo-Require-Preflight": "true",
  },
});

// Keep the HTTP link for non-upload operations
const httpLink = new HttpLink({
  uri: graphqlUrl,
  credentials: "include",
  fetchOptions: {
    mode: "cors",
  },
  headers: {
    "Apollo-Require-Preflight": "true",
  },
});

const retryLink = new RetryLink({
  delay: {
    initial: 300,
    max: 3000,
    jitter: true,
  },
  attempts: {
    max: 2,
    retryIf: (error) => {
      console.log("Retry link error:", error);
      const doNotRetry =
        error.statusCode === 400 ||
        error.statusCode === 401 ||
        error.statusCode === 404;
      return !doNotRetry;
    },
  },
});

// Server-side Apollo client - only use this in API routes and server components
// This connects directly to the GraphQL server for better performance on the server
export const serverClient = new ApolloClient({
  link: from([retryLink, uploadLink, httpLink]),
  cache: new InMemoryCache({
    addTypename: true, // Enable __typename for union types
  }),
  defaultOptions: {
    mutate: {
      errorPolicy: "all",
    },
    query: {
      errorPolicy: "all",
      fetchPolicy: "no-cache", // Don't cache anything, always fetch fresh data
    },
  },
});

// Legacy client export for backward compatibility (will be removed)
// NOTE: For client-side components, use the Apollo provider and hooks from @/lib/apollo-client.tsx
export const client = serverClient;
