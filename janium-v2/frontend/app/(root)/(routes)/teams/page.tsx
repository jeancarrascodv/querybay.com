"use client";

import TeamManager from "@/components/TeamManager";
import TeamDataTable from "@/components/TeamDataTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TeamsPage() {
  return (
    <div className="flex-1 m-8 mt-5 flex flex-col h-screen max-h-[calc(100vh-64px)] overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <Tabs defaultValue="data" className="w-full h-full flex flex-col">
        <TabsList className="w-fit mb-4">
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>
        <TabsContent value="teams" className="flex-1">
          <TeamManager />
        </TabsContent>
        <TabsContent value="data" className="flex-1 relative">
          <TeamDataTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
