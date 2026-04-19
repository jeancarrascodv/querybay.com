"use client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignInForm } from "@/components/signin-form";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function SignInPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/integrations");
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center font-sans py-12"
      style={{ backgroundColor: "#1A2337" }}
    >
      <Card
        className="w-full max-w-[530px] p-8 rounded-lg"
        style={{ backgroundColor: "#020617" }}
      >
        <CardHeader className="space-y-1">
          <h1 className="text-2xl font-semibold text-white text-center mb-2">
            Sign In to Janium
          </h1>
          <p className="text-gray-400 text-center mb-8">
            Enter your credentials to access your account
          </p>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
    </div>
  );
}
