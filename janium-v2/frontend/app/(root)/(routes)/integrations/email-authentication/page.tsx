"use client";
import * as React from "react";
import { ArrowLeft, Mail, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "next/navigation";

export default function EmailAuthenticationPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);

  const handleBack = () => {
    router.push("/integrations");
  };

  return (
    <div className="bg-[#0B1120] text-slate-50 p-8 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {step === 1 ? (
          // Step 1: Collect Email Details
          <div>
            <div className="flex items-center mb-8">
              <Button
                variant="ghost"
                onClick={handleBack}
                className="mr-4 p-2 hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-3xl font-bold">Authenticate Email Address</h1>
            </div>

            <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
              <div className="mb-6">
                <div className="flex items-center mb-4">
                  <Mail className="h-6 w-6 mr-3 text-blue-500" />
                  <h2 className="text-xl font-semibold">
                    Email Authentication Setup
                  </h2>
                </div>
                <p className="text-slate-400">
                  To authenticate your email address for sending campaigns,
                  please provide your email credentials and preferences.
                </p>
              </div>

              <div className="grid gap-6 max-w-md">
                <div className="grid gap-2">
                  <label
                    htmlFor="email-address"
                    className="text-sm font-medium"
                  >
                    Email Address
                  </label>
                  <Input
                    id="email-address"
                    type="email"
                    placeholder="your-email@example.com"
                    className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                  />
                </div>

                <div className="grid gap-2">
                  <label
                    htmlFor="email-password"
                    className="text-sm font-medium"
                  >
                    Email Password / App Password
                  </label>
                  <Input
                    id="email-password"
                    type="password"
                    placeholder="Your email password"
                    className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500">
                    For Gmail, use an app-specific password instead of your
                    regular password.
                  </p>
                </div>

                <div className="grid gap-2">
                  <label htmlFor="smtp-server" className="text-sm font-medium">
                    SMTP Server
                  </label>
                  <Input
                    id="smtp-server"
                    placeholder="smtp.gmail.com"
                    className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label htmlFor="smtp-port" className="text-sm font-medium">
                      SMTP Port
                    </label>
                    <Input
                      id="smtp-port"
                      placeholder="587"
                      className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="encryption" className="text-sm font-medium">
                      Encryption
                    </label>
                    <select className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm focus:ring-blue-500">
                      <option value="tls">TLS</option>
                      <option value="ssl">SSL</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                </div>

                <Button onClick={() => setStep(2)} className="w-fit">
                  Test Connection & Continue
                </Button>
              </div>
            </div>
          </div>
        ) : (
          // Step 2: Email Configuration and Settings
          <div>
            <div className="flex items-center mb-8">
              <Button
                variant="ghost"
                onClick={handleBack}
                className="mr-4 p-2 hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-3xl font-bold">Email Configuration</h1>
            </div>

            <div className="space-y-8">
              {/* Connection Status */}
              <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-2">
                      Connection Status
                    </h2>
                    <p className="text-slate-400">
                      Email connection test results and authentication status.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-green-500 font-medium">
                      Connected
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-900 rounded-lg">
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
                      <span className="font-medium">SMTP Connection</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Successfully connected
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
                      <span className="font-medium">Authentication</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Credentials verified
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
                      <span className="font-medium">Send Test</span>
                    </div>
                    <p className="text-xs text-slate-400">Test email sent</p>
                  </div>
                </div>
              </div>

              {/* Email Settings */}
              <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
                <h2 className="text-xl font-semibold mb-6">Email Settings</h2>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-slate-900 rounded-lg">
                    <div>
                      <h3 className="font-medium">Single Sender Mode</h3>
                      <p className="text-sm text-slate-400">
                        Use this email as the sole sender for campaigns
                      </p>
                    </div>
                    <Checkbox
                      id="single-sender"
                      className="border-slate-600 data-[state=checked]:bg-blue-600"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-900 rounded-lg">
                    <div>
                      <h3 className="font-medium">Response Integration</h3>
                      <p className="text-sm text-slate-400">
                        Monitor and handle email responses automatically
                      </p>
                    </div>
                    <Checkbox
                      id="response-integration"
                      className="border-slate-600 data-[state=checked]:bg-blue-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label
                        htmlFor="hourly-limit"
                        className="text-sm font-medium block mb-2"
                      >
                        Hourly Send Limit
                      </label>
                      <Input
                        id="hourly-limit"
                        type="number"
                        placeholder="50"
                        className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Maximum emails to send per hour
                      </p>
                    </div>
                    <div>
                      <label
                        htmlFor="daily-limit"
                        className="text-sm font-medium block mb-2"
                      >
                        Daily Send Limit
                      </label>
                      <Input
                        id="daily-limit"
                        type="number"
                        placeholder="500"
                        className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Maximum emails to send per day
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Warm-up Configuration */}
              <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
                <h2 className="text-xl font-semibold mb-6">Email Warm-up</h2>
                <p className="text-slate-400 mb-6">
                  Gradually increase sending volume to build sender reputation
                  and improve deliverability.
                </p>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-900 rounded-lg">
                    <div>
                      <h3 className="font-medium">Enable Email Warm-up</h3>
                      <p className="text-sm text-slate-400">
                        Automatically warm up this email address
                      </p>
                    </div>
                    <Checkbox
                      id="enable-warmup"
                      className="border-slate-600 data-[state=checked]:bg-blue-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label
                        htmlFor="warmup-start"
                        className="text-sm font-medium block mb-2"
                      >
                        Starting Volume
                      </label>
                      <Input
                        id="warmup-start"
                        type="number"
                        placeholder="5"
                        className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="warmup-increment"
                        className="text-sm font-medium block mb-2"
                      >
                        Daily Increment
                      </label>
                      <Input
                        id="warmup-increment"
                        type="number"
                        placeholder="3"
                        className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="warmup-max"
                        className="text-sm font-medium block mb-2"
                      >
                        Max Volume
                      </label>
                      <Input
                        id="warmup-max"
                        type="number"
                        placeholder="100"
                        className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-6">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="bg-slate-900 border-slate-700 hover:bg-slate-800"
                >
                  Back to Email Setup
                </Button>
                <Button onClick={handleBack}>
                  Complete Email Authentication
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
