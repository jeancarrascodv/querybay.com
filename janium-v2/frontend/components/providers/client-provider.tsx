"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { ApolloClientProvider } from "@/lib/apollo-client";

export function ClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ApolloClientProvider>
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false}>
          {children}
          <Toaster />
        </ThemeProvider>
      </ApolloClientProvider>
    </AuthProvider>
  );
}
