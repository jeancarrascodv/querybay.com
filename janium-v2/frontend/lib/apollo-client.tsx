"use client";

import {
  ApolloClient,
  InMemoryCache,
  from,
  split,
  ApolloProvider,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";
import { RetryLink } from "@apollo/client/link/retry";
import { HttpLink } from "@apollo/client/link/http";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";
import createUploadLink from "apollo-upload-client/createUploadLink.mjs";
import { toast } from "@/components/ui/use-toast";

// Use direct backend GraphQL URL
const graphqlUrl =
  process.env.NEXT_PUBLIC_GRAPHQL_URL || "https://api.dev.janium.ai";

// Auth link - adds Bearer token to GraphQL requests
const authLink = setContext(async (_, { headers }) => {
  try {
    // Get access token from sessionStorage
    // Dynamically import to avoid SSR issues
    const { authClient } = await import("@/lib/auth-client");
    const token = authClient.getAccessToken();

    // Add Bearer token if available
    return {
      headers: {
        ...headers,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    };
  } catch (error) {
    console.error("Error in auth link:", error);
    return { headers };
  }
});

// Create an upload link that supports multipart form requests
const uploadLink = createUploadLink({
  uri: graphqlUrl,
  credentials: "include", // Changed from "same-origin" to support direct backend calls
  // Remove fetchOptions entirely - don't set a static abort signal
  // The API route will handle timeout, not the client
  headers: {
    "Apollo-Require-Preflight": "true",
  },
  isExtractableFile: (value: unknown): value is File | Blob => {
    return (
      (typeof File !== "undefined" && value instanceof File) ||
      (typeof Blob !== "undefined" && value instanceof Blob)
    );
  },
  FormData: typeof FormData !== "undefined" ? FormData : undefined,
});

// Keep the HTTP link for non-upload operations
const httpLink = new HttpLink({
  uri: graphqlUrl,
  credentials: "same-origin", // Changed from "same-origin" to support direct backend calls
  // Remove fetchOptions entirely - don't set a static abort signal
  // The API route will handle timeout, not the client
  headers: {
    "Apollo-Require-Preflight": "true",
  },
});

// Error link - handles GraphQL errors and displays toasts
const errorLink = onError(({ graphQLErrors, networkError, operation }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path, extensions }) => {
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`,
      );

      // Display error toast
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      });
    });
  }

  if (networkError) {
    console.error(`[Network error]: ${networkError}`);
    toast({
      variant: "destructive",
      title: "Network Error",
      description:
        "Failed to connect to the server. Please check your connection.",
    });
  }
});

const retryLink = new RetryLink({
  delay: {
    initial: 300,
    max: 3000,
    jitter: true,
  },
  attempts: {
    max: 2,
    retryIf: (error, operation) => {
      // Don't retry on abort errors
      if (error?.message?.includes("abort")) {
        console.warn("Skipping retry for abort error:", error.message);
        return false;
      }

      // Don't retry on specific status codes
      const statusCode =
        error?.statusCode ||
        error?.response?.status ||
        error?.networkError?.status;

      const doNotRetry =
        statusCode === 400 ||
        statusCode === 401 ||
        statusCode === 404 ||
        statusCode === 403;

      if (!doNotRetry && error) {
        console.log("Retrying request, error:", error.message);
      }

      return !doNotRetry;
    },
  },
});

// WebSocket link for subscriptions (browser only)
const wsLink =
  typeof window !== "undefined"
    ? new GraphQLWsLink(
        createClient({
          url: (() => {
            const url = new URL(graphqlUrl);
            url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
            url.pathname =
              url.pathname.replace(/\/?$/, "").replace(/\/+$/, "") + "/ws";
            return url.toString();
          })(),
          connectionParams: async () => {
            const { authClient } = await import("@/lib/auth-client");
            const token = authClient.getAccessToken();
            return token ? { authorization: `Bearer ${token}` } : {};
          },

          // Keep the WS connection alive between subscriptions so it doesn't
          // tear down and reconnect every time a modal opens/closes.
          lazyCloseTimeout: 30_000,
        }),
      )
    : null;

// Split: subscriptions go directly to WS (auth via connectionParams),
// queries/mutations go through the HTTP chain with error/auth/retry links.
const httpChain = from([errorLink, authLink, retryLink, uploadLink]);

const link = wsLink
  ? split(
      ({ query }) => {
        const definition = getMainDefinition(query);
        return (
          definition.kind === "OperationDefinition" &&
          definition.operation === "subscription"
        );
      },
      wsLink,
      httpChain,
    )
  : httpChain;

// Client-side Apollo client
export const client = new ApolloClient({
  link,
  cache: new InMemoryCache({
    addTypename: true, // Enable __typename for union types
  }),
  defaultOptions: {
    mutate: {
      errorPolicy: "all",
    },
    query: {
      errorPolicy: "all",
      fetchPolicy: "network-only", // Always fetch from network to avoid cached errors
    },
    watchQuery: {
      errorPolicy: "all",
      fetchPolicy: "cache-and-network", // Use cache but also fetch fresh data
    },
  },
});

// Apollo Provider component
export function ApolloClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
