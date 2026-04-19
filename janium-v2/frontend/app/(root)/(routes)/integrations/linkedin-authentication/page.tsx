"use client";
import * as React from "react";
import {
  ArrowLeft,
  User,
  Calendar,
  MessageCircle,
  UserPlus,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function LinkedInAuthenticationPage() {
  const router = useRouter();

  const handleBack = () => {
    router.push("/integrations");
  };

  const navigateToEmailIntegrations = () => {
    router.push("/integrations");
  };

  return (
    <div className="bg-[#0B1120] text-slate-50 p-8 min-h-screen">
      <Tabs defaultValue="linkedin" className="w-full">
        {/* Top-level Tabs: Email / LinkedIn */}
        <TabsList className="bg-transparent p-0">
          <TabsTrigger
            value="email"
            className="text-slate-300 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none"
            onClick={navigateToEmailIntegrations}
          >
            Email Integrations
          </TabsTrigger>
          <TabsTrigger
            value="linkedin"
            className="text-slate-300 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none"
          >
            LinkedIn Integrations
          </TabsTrigger>
        </TabsList>

        {/* LinkedIn Content */}
        <TabsContent value="linkedin" className="mt-6">
          <div className=" mx-auto">
            <div className="space-y-8">
              {/* Profile Information */}
              <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
                <div className="flex items-center mb-6">
                  <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center mr-4">
                    <User className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Jason Hawkes</h2>
                    <p className="text-slate-400 text-sm">jason@janium.io</p>
                  </div>
                  <div className="ml-auto">
                    <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-md text-sm font-medium">
                      Active
                    </span>
                  </div>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-3 gap-6 mb-6">
                  <div className="text-center">
                    <h3 className="text-slate-400 text-sm mb-1">Connections</h3>
                    <p className="text-2xl font-bold">1234</p>
                  </div>
                  <div className="text-center">
                    <h3 className="text-slate-400 text-sm mb-1">
                      Profile views since last week
                    </h3>
                    <p className="text-2xl font-bold">1234</p>
                  </div>
                  <div className="text-center">
                    <h3 className="text-slate-400 text-sm mb-1">
                      Weekly search appearances
                    </h3>
                    <p className="text-2xl font-bold">1234</p>
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
                <div className="flex items-center mb-6">
                  <Calendar className="h-6 w-6 mr-3 text-blue-500" />
                  <h2 className="text-xl font-semibold">Schedule</h2>
                </div>
                <p className="text-slate-400 text-sm mb-6">
                  Select the days and times when you want to run campaigns to be
                  more targeted to your specific market.
                </p>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium mb-3">Timezone</h3>
                    <Select>
                      <SelectTrigger className="bg-slate-900 border-slate-700 w-48">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="pst">PST (UTC-8)</SelectItem>
                        <SelectItem value="est">EST (UTC-5)</SelectItem>
                        <SelectItem value="utc">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-medium">From</span>
                        <span className="text-sm text-slate-400">9:00 AM</span>
                      </div>
                      <Slider
                        defaultValue={[9]}
                        max={24}
                        step={1}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-medium">To</span>
                        <span className="text-sm text-slate-400">6:00 PM</span>
                      </div>
                      <Slider
                        defaultValue={[18]}
                        max={24}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="weekend"
                      className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="weekend" className="text-sm">
                      Send on weekends
                    </label>
                  </div>
                </div>

                <Button className="mt-6">Save</Button>
              </div>

              {/* Connection Request Warm-up */}
              <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
                <div className="flex items-center mb-6">
                  <MessageCircle className="h-6 w-6 mr-3 text-blue-500" />
                  <h2 className="text-xl font-semibold">
                    Connection Request Warm-up
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      Connection Request Per Day
                    </label>
                    <Input
                      type="number"
                      defaultValue="10"
                      className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      First Week
                    </label>
                    <Input
                      type="number"
                      defaultValue="7"
                      className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      Second Week
                    </label>
                    <Input
                      type="number"
                      defaultValue="14"
                      className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      Fourth Week
                    </label>
                    <Input
                      type="number"
                      defaultValue="21"
                      className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <Button className="mt-4">Save</Button>
              </div>

              {/* Invite Manager */}
              <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
                <div className="flex items-center mb-6">
                  <UserPlus className="h-6 w-6 mr-3 text-blue-500" />
                  <h2 className="text-xl font-semibold">Invite Manager</h2>
                </div>

                <div className="space-y-4">
                  <p className="text-slate-400 text-sm">
                    • Invite manager will limit the number of connection
                    requests that should be sent each day by dividing the
                    24-hour day into x time periods.
                  </p>
                  <p className="text-slate-400 text-sm">
                    • Invites are distributed to make sure you don&apos;t
                    overload sending time windows.
                  </p>
                  <p className="text-slate-400 text-sm">
                    • An automatic calculator is built-in such. The process will
                    take out all data depending on the effectiveness of
                    randomizing invites.
                  </p>
                </div>

                <div className="mt-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">1400</span>
                    <span className="text-sm font-medium">2000</span>
                  </div>
                  <Slider
                    defaultValue={[1700]}
                    min={1400}
                    max={2000}
                    step={50}
                    className="w-full"
                  />
                </div>

                <Button className="mt-6">Update</Button>
              </div>

              {/* Connector Priority and Activity Manager */}
              <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
                <div className="flex items-center mb-6">
                  <Activity className="h-6 w-6 mr-3 text-blue-500" />
                  <h2 className="text-xl font-semibold">
                    Connector Priority and Activity Manager
                  </h2>
                </div>

                <div className="space-y-6">
                  {[
                    { label: "Daily Limits", value: 350 },
                    { label: "Direct Messages", value: 350 },
                    { label: "Linkedin Leads", value: 75 },
                    { label: "Connection Requests", value: 350 },
                    { label: "Visit Messages", value: 350 },
                    { label: "Survey Links", value: 350 },
                    { label: "Open Invites", value: 350 },
                    { label: "Premium Invites", value: 350 },
                    { label: "Sales to Work", value: 350 },
                  ].map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm font-medium w-48">
                        {item.label}
                      </span>
                      <div className="flex-1 mx-6">
                        <Slider
                          defaultValue={[item.value]}
                          max={500}
                          step={25}
                          className="w-full"
                        />
                      </div>
                      <span className="text-sm text-slate-400 w-12 text-right">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>

                <Button className="mt-6">Update</Button>
              </div>

              <div className="flex justify-between items-center pt-6">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  className="bg-slate-900 border-slate-700 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button onClick={handleBack}>Complete LinkedIn Setup</Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
