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
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";

export default function SignUpPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const invitecode = params.invitecode as string;

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/integrations");
    }
  }, [isAuthenticated, router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center py-12 p-4"
      style={{ backgroundColor: "#1A2337" }}
    >
      <Card
        className="w-full max-w-[530px] border-0"
        style={{ backgroundColor: "#020617" }}
      >
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center text-white">
            Sign Up for Janium
          </CardTitle>
          <CardDescription className="text-center text-gray-400">
            Create your account to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm invitecode={invitecode} />
        </CardContent>
      </Card>
    </div>
  );
}
