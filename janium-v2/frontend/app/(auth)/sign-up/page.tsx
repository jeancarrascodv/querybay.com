"use client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { SignUpForm } from "@/components/signup-form";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SignUpPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/integrations");
    }
  }, [isAuthenticated, router]);

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
            Create Your Account
          </h1>
          <p className="text-gray-400 text-center mb-8">
            Sign up to get started with Janium
          </p>
        </CardHeader>
        <CardContent>
          <SignUpForm invitecode="" />
        </CardContent>
      </Card>
    </div>
  );
}
