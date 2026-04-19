"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export function SignInForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { login } = useAuth();
  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      // Use new auth system with cookie-based authentication
      await login(values.email, values.password);

      toast({
        title: "Success",
        description: "Signed in successfully",
      });

      // Redirect to teams page
      router.push("/integrations");
    } catch (error: any) {
      console.error("Sign-in error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Invalid credentials",
      });
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    if (user) {
      router.push("/integrations");
    }
  }, [user, router]);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
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
              {form.formState.errors.email.message || "Email is required"}
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
              {form.formState.errors.password.message || "Password is required"}
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
        {isLoading ? "Loading..." : "Sign In"}
      </Button>
    </form>
  );
}
