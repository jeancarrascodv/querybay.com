"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useState, useEffect, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useRouter, useSearchParams } from "next/navigation";
import { authService } from "@/lib/auth-service";
import { TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/constants/timezones";

const formSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    title: z.string().min(1, "Title is required"),
    company: z.string().min(1, "Company is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    timezone: z.string().min(1, "Timezone is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof formSchema>;

interface SignUpFormProps {
  invitecode: string;
}

function SignUpFormContent({ invitecode }: SignUpFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Extract invite code from path: /signup/jXsAqwBbnw8
  const inviteCode = searchParams.get("code") || invitecode;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      title: "",
      company: "",
      email: "",
      password: "",
      confirmPassword: "",
      timezone: "",
    },
  });

  const onSubmit = async (values: FormData) => {
    setIsLoading(true);
    try {
      // Use auth service with all fields
      await authService.signup({
        email: values.email,
        password: values.password,
        first_name: values.firstName,
        last_name: values.lastName,
        title: values.title,
        company: values.company,
        timezone: values.timezone,
        invite_code: inviteCode || null,
      });

      toast({
        title: "Success",
        description: "Account created successfully. Redirecting...",
      });

      // Redirect to teams after successful signup
      router.push("/integrations");
    } catch (error) {
      console.error("Signup error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Something went wrong",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
      {/* First Name and Last Name */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="firstName" className="text-white text-sm mb-2 block">
            First Name
          </Label>
          <Input
            id="firstName"
            {...form.register("firstName")}
            disabled={isLoading}
            className="border text-white placeholder:text-gray-500"
            style={{
              backgroundColor: "#020817",
              borderColor: form.formState.errors.firstName
                ? "#ef4444"
                : "#1E293B",
            }}
          />
          <div className="h-5 mt-1">
            {form.formState.errors.firstName && (
              <p className="text-red-500 text-xs">
                {form.formState.errors.firstName.message}
              </p>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="lastName" className="text-white text-sm mb-2 block">
            Last Name
          </Label>
          <Input
            id="lastName"
            {...form.register("lastName")}
            disabled={isLoading}
            className="border text-white placeholder:text-gray-500"
            style={{
              backgroundColor: "#020817",
              borderColor: form.formState.errors.lastName
                ? "#ef4444"
                : "#1E293B",
            }}
          />
          <div className="h-5 mt-1">
            {form.formState.errors.lastName && (
              <p className="text-red-500 text-xs">
                {form.formState.errors.lastName.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Title and Company */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="title" className="text-white text-sm mb-2 block">
            Title
          </Label>
          <Input
            id="title"
            {...form.register("title")}
            disabled={isLoading}
            className="border text-white placeholder:text-gray-500"
            style={{
              backgroundColor: "#020817",
              borderColor: form.formState.errors.title ? "#ef4444" : "#1E293B",
            }}
          />
          <div className="h-5 mt-1">
            {form.formState.errors.title && (
              <p className="text-red-500 text-xs">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="company" className="text-white text-sm mb-2 block">
            Company
          </Label>
          <Input
            id="company"
            {...form.register("company")}
            disabled={isLoading}
            className="border text-white placeholder:text-gray-500"
            style={{
              backgroundColor: "#020817",
              borderColor: form.formState.errors.company
                ? "#ef4444"
                : "#1E293B",
            }}
          />
          <div className="h-5 mt-1">
            {form.formState.errors.company && (
              <p className="text-red-500 text-xs">
                {form.formState.errors.company.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Email */}
      <div>
        <Label htmlFor="email" className="text-white text-sm mb-2 block">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="user@example.com"
          {...form.register("email")}
          disabled={isLoading}
          className="border text-white placeholder:text-gray-500"
          style={{
            backgroundColor: "#020817",
            borderColor: form.formState.errors.email ? "#ef4444" : "#1E293B",
          }}
        />
        <div className="h-5 mt-1">
          {form.formState.errors.email && (
            <p className="text-red-500 text-xs">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>
      </div>

      {/* Password */}
      <div>
        <Label htmlFor="password" className="text-white text-sm mb-2 block">
          Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            {...form.register("password")}
            disabled={isLoading}
            className="border text-white placeholder:text-gray-500 pr-10"
            style={{
              backgroundColor: "#020817",
              borderColor: form.formState.errors.password
                ? "#ef4444"
                : "#1E293B",
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="h-5 mt-1">
          {form.formState.errors.password && (
            <p className="text-red-500 text-xs">
              {form.formState.errors.password.message}
            </p>
          )}
        </div>
      </div>

      {/* Re-confirm Password */}
      <div>
        <Label
          htmlFor="confirmPassword"
          className="text-white text-sm mb-2 block"
        >
          Re-confirm Password
        </Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            {...form.register("confirmPassword")}
            disabled={isLoading}
            className="border text-white placeholder:text-gray-500 pr-10"
            style={{
              backgroundColor: "#020817",
              borderColor: form.formState.errors.confirmPassword
                ? "#ef4444"
                : "#1E293B",
            }}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
          >
            {showConfirmPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="h-5 mt-1">
          {form.formState.errors.confirmPassword && (
            <p className="text-red-500 text-xs">
              {form.formState.errors.confirmPassword.message}
            </p>
          )}
        </div>
      </div>

      {/* Timezone */}
      <div>
        <Label htmlFor="timezone" className="text-white text-sm mb-2 block">
          Timezone
        </Label>
        <Select
          value={form.watch("timezone")}
          onValueChange={(value) => form.setValue("timezone", value)}
          disabled={isLoading}
        >
          <SelectTrigger
            className="w-full border text-white"
            style={{
              backgroundColor: "#020817",
              borderColor: form.formState.errors.timezone
                ? "#ef4444"
                : "#1E293B",
            }}
          >
            <SelectValue
              placeholder={
                TIMEZONES.find((tz) => tz.value === DEFAULT_TIMEZONE)?.label ||
                "Select timezone"
              }
            />
          </SelectTrigger>
          <SelectContent
            className="border"
            style={{
              backgroundColor: "#020617",
              borderColor: "#1E293B",
            }}
          >
            {TIMEZONES.map((tz) => (
              <SelectItem
                key={tz.value}
                value={tz.value}
                className="text-white hover:bg-[#1E293B]"
              >
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="h-5 mt-1">
          {form.formState.errors.timezone && (
            <p className="text-red-500 text-xs">
              {form.formState.errors.timezone.message}
            </p>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={isLoading}
        className="w-full bg-gray-300 hover:bg-gray-400 text-black font-medium text-sm py-3 mt-6"
      >
        {isLoading ? "Loading..." : "Sign Up"}
      </Button>

      <div className="text-center text-sm text-gray-400 mt-4">
        Already have an account?{" "}
        <a href="/sign-in" className="text-gray-300 hover:underline">
          Sign in
        </a>
      </div>
    </form>
  );
}

export function SignUpForm({ invitecode }: SignUpFormProps) {
  return (
    <Suspense fallback={<div className="text-white">Loading...</div>}>
      <SignUpFormContent invitecode={invitecode} />
    </Suspense>
  );
}
