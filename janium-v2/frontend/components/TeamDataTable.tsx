"use client";

import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { useQuery } from "@apollo/client";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REPORT_DATA_QUERY } from "@/graphql/team";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamStore } from "@/store/useTeamStore";

const headerGroups = [
  { label: "Connection Requests", colSpan: 5 },
  { label: "New Connections", colSpan: 4 },
  { label: "LI Messages Sent", colSpan: 4 },
  { label: "LI Responses", colSpan: 4 },
  { label: "Emails Sent", colSpan: 4 },
  { label: "Email Responses", colSpan: 4 },
  { label: "Daily Email", colSpan: 3 },
];

interface ReportDataRow {
  linkedinId: string;
  teamId: string;
  activeCampaignsCount: number;
  loginActiveLastValidated: string | null;
  salesNavigatorActiveLastValidated: string | null;
  linkedin: {
    get: { id: string; fullName: string; linkedinProfileUrl: string };
  };
  team: { get: { id: string; name: string } };
  linkedinErrorsDailyCount: number;
  linkedinErrorsWeeklyCount: number;
  linkedinErrorsMonthlyCount: number;
  linkedinErrorsTotalCount: number;
  connectionRequestQueueSize: number;
  connectionRequestDailyCount: number;
  connectionRequestWeeklyCount: number;
  connectionRequestMonthlyCount: number;
  connectionRequestTotalCount: number;
  newConnectionsDailyCount: number;
  newConnectionsWeeklyCount: number;
  newConnectionsMonthlyCount: number;
  newConnectionsTotalCount: number;
  linkedinMessagesSentDailyCount: number;
  linkedinMessagesSentWeeklyCount: number;
  linkedinMessagesSentMonthlyCount: number;
  linkedinMessagesSentTotalCount: number;
  linkedinResponsesReceivedDailyCount: number;
  linkedinResponsesReceivedWeeklyCount: number;
  linkedinResponsesReceivedMonthlyCount: number;
  linkedinResponsesReceivedTotalCount: number;
  emailsSentDailyCount: number;
  emailsSentWeeklyCount: number;
  emailsSentMonthlyCount: number;
  emailsSentTotalCount: number;
  emailsResponsesDailyCount: number;
  emailsResponsesWeeklyCount: number;
  emailsResponsesMonthlyCount: number;
  emailsResponsesTotalCount: number;
}

interface TableRow {
  id: string;
  user: string;
  team: string;
  activeCampaigns: number;
  loginActive: string;
  snActive: string;
  errors: { d: number; w: number; m: number; t: number };
  connectionReq: { queue: number; d: number; w: number; m: number; t: number };
  newConnections: { d: number; w: number; m: number; t: number };
  liMsgSent: { d: number; w: number; m: number; t: number };
  liResponses: { d: number; w: number; m: number; t: number };
  emailsSent: { d: number; w: number; m: number; t: number };
  emailResponses: { d: number; w: number; m: number; t: number };
  dailyEmail: { on: boolean; type: string; sender: string };
}

type SortKey =
  | "user"
  | "team"
  | "activeCampaigns"
  | "loginActive"
  | "snActive"
  | "errors.d"
  | "errors.w"
  | "errors.m"
  | "errors.t"
  | "connectionReq.queue"
  | "connectionReq.d"
  | "connectionReq.w"
  | "connectionReq.m"
  | "connectionReq.t"
  | "newConnections.d"
  | "newConnections.w"
  | "newConnections.m"
  | "newConnections.t"
  | "liMsgSent.d"
  | "liMsgSent.w"
  | "liMsgSent.m"
  | "liMsgSent.t"
  | "liResponses.d"
  | "liResponses.w"
  | "liResponses.m"
  | "liResponses.t"
  | "emailsSent.d"
  | "emailsSent.w"
  | "emailsSent.m"
  | "emailsSent.t"
  | "emailResponses.d"
  | "emailResponses.w"
  | "emailResponses.m"
  | "emailResponses.t";

type SortDir = "asc" | "desc" | null;

function getNestedValue(row: TableRow, key: SortKey): string | number {
  const parts = key.split(".") as [keyof TableRow, string?];
  if (parts.length === 1) return row[parts[0]] as string;
  const group = row[parts[0]] as Record<string, number>;
  return group[parts[1]!];
}

function sortRows(
  rows: TableRow[],
  key: SortKey | null,
  dir: SortDir,
): TableRow[] {
  if (!key || !dir) return rows;
  return [...rows].sort((a, b) => {
    const va = getNestedValue(a, key);
    const vb = getNestedValue(b, key);
    if (typeof va === "string" && typeof vb === "string") {
      const cmp = va.localeCompare(vb, undefined, { sensitivity: "base" });
      return dir === "asc" ? cmp : -cmp;
    }
    const diff = (va as number) - (vb as number);
    return dir === "asc" ? diff : -diff;
  });
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || !dir)
    return <ArrowUpDown className="inline ml-0.5 h-3 w-3 opacity-40" />;
  if (dir === "asc") return <ChevronUp className="inline ml-0.5 h-3 w-3" />;
  return <ChevronDown className="inline ml-0.5 h-3 w-3" />;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  } catch {
    return "—";
  }
}

function transformReportData(data: ReportDataRow[]): TableRow[] {
  return data.map((r) => ({
    id: r.linkedinId,
    user: r.linkedin.get.fullName,
    team: r.team.get.name,
    activeCampaigns: r.activeCampaignsCount,
    loginActive: formatTimestamp(r.loginActiveLastValidated),
    snActive: formatTimestamp(r.salesNavigatorActiveLastValidated),
    errors: {
      d: r.linkedinErrorsDailyCount,
      w: r.linkedinErrorsWeeklyCount,
      m: r.linkedinErrorsMonthlyCount,
      t: r.linkedinErrorsTotalCount,
    },
    connectionReq: {
      queue: r.connectionRequestQueueSize,
      d: r.connectionRequestDailyCount,
      w: r.connectionRequestWeeklyCount,
      m: r.connectionRequestMonthlyCount,
      t: r.connectionRequestTotalCount,
    },
    newConnections: {
      d: r.newConnectionsDailyCount,
      w: r.newConnectionsWeeklyCount,
      m: r.newConnectionsMonthlyCount,
      t: r.newConnectionsTotalCount,
    },
    liMsgSent: {
      d: r.linkedinMessagesSentDailyCount,
      w: r.linkedinMessagesSentWeeklyCount,
      m: r.linkedinMessagesSentMonthlyCount,
      t: r.linkedinMessagesSentTotalCount,
    },
    liResponses: {
      d: r.linkedinResponsesReceivedDailyCount,
      w: r.linkedinResponsesReceivedWeeklyCount,
      m: r.linkedinResponsesReceivedMonthlyCount,
      t: r.linkedinResponsesReceivedTotalCount,
    },
    emailsSent: {
      d: r.emailsSentDailyCount,
      w: r.emailsSentWeeklyCount,
      m: r.emailsSentMonthlyCount,
      t: r.emailsSentTotalCount,
    },
    emailResponses: {
      d: r.emailsResponsesDailyCount,
      w: r.emailsResponsesWeeklyCount,
      m: r.emailsResponsesMonthlyCount,
      t: r.emailsResponsesTotalCount,
    },
    dailyEmail: { on: false, type: "DFY Resp", sender: "" },
  }));
}

export default function TeamDataTable() {
  const { isAuthenticated } = useAuth();
  const { currentTeamId, isSwitchingTeam } = useTeamStore();

  const {
    data,
    loading,
    error,
    refetch: rawRefetch,
  } = useQuery<{ reportData: ReportDataRow[] }>(REPORT_DATA_QUERY, {
    variables: {
      // Include teamId so Apollo refetches when team changes
      _teamId: currentTeamId,
    },
    skip: !isAuthenticated || !currentTeamId || isSwitchingTeam,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: false,
  });

  const refetch = useCallback(async () => {
    return await rawRefetch({
      fetchPolicy: "network-only",
    });
  }, [rawRefetch]);

  const prevTeamIdRef = useRef(currentTeamId);
  useEffect(() => {
    if (currentTeamId) {
      prevTeamIdRef.current = currentTeamId;
      refetch();
    }
  }, [currentTeamId, refetch]);

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        if (sortDir === "asc") {
          setSortDir("desc");
        } else if (sortDir === "desc") {
          setSortDir(null);
          setSortKey(null);
        } else {
          setSortDir("asc");
        }
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey, sortDir],
  );

  const rawRows = useMemo(
    () => (data?.reportData ? transformReportData(data.reportData) : []),
    [data],
  );

  const rows = useMemo(
    () => sortRows(rawRows, sortKey, sortDir),
    [rawRows, sortKey, sortDir],
  );

  if (loading && rows.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#020817]">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 mx-auto mb-4 border-4 border-muted-foreground border-t-white rounded-full" />
          <p className="text-muted-foreground">Loading report data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#020817]">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load report data</p>
          <p className="text-muted-foreground text-sm">{error.message}</p>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#020817]">
        <p className="text-muted-foreground">No report data available</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-[#020817]">
      <div className="flex-1 overflow-auto mb-4 border rounded-xl border-slate-800 bg-[#020817] scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <table
          className="w-full bg-[#020817] border-separate border-spacing-0"
          style={{ minWidth: "2000px" }}
        >
          {/* Row 1: Merged group headers */}
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#0F1729] border-b border-sidebar-border">
              <th
                className="sticky left-0 z-40 bg-[#0F1729] text-left p-3 text-sidebar-foreground font-medium text-sm cursor-pointer select-none group hover:bg-[#162040] transition-colors"
                style={{ minWidth: "180px", maxWidth: "180px", width: "180px" }}
                rowSpan={2}
                onClick={() => handleSort("user")}
              >
                LinkedIn Account
                <SortIndicator active={sortKey === "user"} dir={sortDir} />
              </th>
              <th
                className="text-left p-3 text-sidebar-foreground font-medium text-sm border-r border-slate-500/40 cursor-pointer select-none group hover:bg-[#162040] transition-colors"
                rowSpan={2}
                onClick={() => handleSort("team")}
              >
                Team
                <SortIndicator active={sortKey === "team"} dir={sortDir} />
              </th>
              <th
                className="text-center p-3 text-sidebar-foreground font-medium text-sm border-r border-slate-500/40 cursor-pointer select-none group hover:bg-[#162040] transition-colors"
                rowSpan={2}
                onClick={() => handleSort("activeCampaigns")}
              >
                Active
                <br />
                Campaigns
                <SortIndicator
                  active={sortKey === "activeCampaigns"}
                  dir={sortDir}
                />
              </th>
              <th
                className="text-center p-3 text-sidebar-foreground font-medium text-sm border-r border-slate-500/40 cursor-pointer select-none group hover:bg-[#162040] transition-colors"
                rowSpan={2}
                onClick={() => handleSort("loginActive")}
              >
                Login
                <br />
                Active
                <SortIndicator
                  active={sortKey === "loginActive"}
                  dir={sortDir}
                />
              </th>
              <th
                className="text-center p-3 text-sidebar-foreground font-medium text-sm border-r border-slate-500/40 cursor-pointer select-none group hover:bg-[#162040] transition-colors"
                rowSpan={2}
                onClick={() => handleSort("snActive")}
              >
                SN
                <br />
                Active
                <SortIndicator active={sortKey === "snActive"} dir={sortDir} />
              </th>
              <th
                colSpan={4}
                className="text-center p-3 text-sidebar-foreground font-medium text-sm border-r border-slate-500/25"
              >
                LI Errors
              </th>
              {headerGroups.map((group, idx) => (
                <th
                  key={group.label}
                  colSpan={group.colSpan}
                  className={`text-center p-3 text-sidebar-foreground font-medium text-sm ${
                    idx === headerGroups.length - 1
                      ? ""
                      : "border-r border-slate-500/25"
                  }`}
                >
                  {group.label}
                </th>
              ))}
            </tr>
            {/* Row 2: Sub-headers */}
            <tr className="bg-[#0F1729] border-b border-sidebar-border">
              {/* Errors: D, W, M, T */}
              {(["d", "w", "m", "t"] as const).map((p, i) => (
                <th
                  key={`err-${p}`}
                  className={`text-center p-2 text-muted-foreground font-normal text-xs cursor-pointer select-none group hover:bg-[#162040] transition-colors border-r ${i === 3 ? "border-slate-500/40" : "border-slate-700/30"}`}
                  onClick={() => handleSort(`errors.${p}` as SortKey)}
                >
                  {p.toUpperCase()}
                  <SortIndicator
                    active={sortKey === `errors.${p}`}
                    dir={sortDir}
                  />
                </th>
              ))}
              {/* Connection Req: Queue, D, W, M, T */}
              <th
                className="text-center p-2 text-muted-foreground font-normal text-xs border-r border-slate-700/30 cursor-pointer select-none group hover:bg-[#162040] transition-colors"
                onClick={() => handleSort("connectionReq.queue")}
              >
                Queue
                <SortIndicator
                  active={sortKey === "connectionReq.queue"}
                  dir={sortDir}
                />
              </th>
              {(["d", "w", "m", "t"] as const).map((p, i) => (
                <th
                  key={`cr-${p}`}
                  className={`text-center p-2 text-muted-foreground font-normal text-xs cursor-pointer select-none group hover:bg-[#162040] transition-colors border-r ${i === 3 ? "border-slate-500/40" : "border-slate-700/30"}`}
                  onClick={() => handleSort(`connectionReq.${p}` as SortKey)}
                >
                  {p.toUpperCase()}
                  <SortIndicator
                    active={sortKey === `connectionReq.${p}`}
                    dir={sortDir}
                  />
                </th>
              ))}
              {/* New Connections: D, W, M, T */}
              {(["d", "w", "m", "t"] as const).map((p, i) => (
                <th
                  key={`nc-${p}`}
                  className={`text-center p-2 text-muted-foreground font-normal text-xs cursor-pointer select-none group hover:bg-[#162040] transition-colors border-r ${i === 3 ? "border-slate-500/40" : "border-slate-700/30"}`}
                  onClick={() => handleSort(`newConnections.${p}` as SortKey)}
                >
                  {p.toUpperCase()}
                  <SortIndicator
                    active={sortKey === `newConnections.${p}`}
                    dir={sortDir}
                  />
                </th>
              ))}
              {/* LI Msg Sent: D, W, M, T */}
              {(["d", "w", "m", "t"] as const).map((p, i) => (
                <th
                  key={`lm-${p}`}
                  className={`text-center p-2 text-muted-foreground font-normal text-xs cursor-pointer select-none group hover:bg-[#162040] transition-colors border-r ${i === 3 ? "border-slate-500/40" : "border-slate-700/30"}`}
                  onClick={() => handleSort(`liMsgSent.${p}` as SortKey)}
                >
                  {p.toUpperCase()}
                  <SortIndicator
                    active={sortKey === `liMsgSent.${p}`}
                    dir={sortDir}
                  />
                </th>
              ))}
              {/* LI Responses: D, W, M, T */}
              {(["d", "w", "m", "t"] as const).map((p, i) => (
                <th
                  key={`lr-${p}`}
                  className={`text-center p-2 text-muted-foreground font-normal text-xs cursor-pointer select-none group hover:bg-[#162040] transition-colors border-r ${i === 3 ? "border-slate-500/40" : "border-slate-700/30"}`}
                  onClick={() => handleSort(`liResponses.${p}` as SortKey)}
                >
                  {p.toUpperCase()}
                  <SortIndicator
                    active={sortKey === `liResponses.${p}`}
                    dir={sortDir}
                  />
                </th>
              ))}
              {/* Emails Sent: D, W, M, T */}
              {(["d", "w", "m", "t"] as const).map((p, i) => (
                <th
                  key={`es-${p}`}
                  className={`text-center p-2 text-muted-foreground font-normal text-xs cursor-pointer select-none group hover:bg-[#162040] transition-colors border-r ${i === 3 ? "border-slate-500/40" : "border-slate-700/30"}`}
                  onClick={() => handleSort(`emailsSent.${p}` as SortKey)}
                >
                  {p.toUpperCase()}
                  <SortIndicator
                    active={sortKey === `emailsSent.${p}`}
                    dir={sortDir}
                  />
                </th>
              ))}
              {/* Email Responses: D, W, M, T */}
              {(["d", "w", "m", "t"] as const).map((p, i) => (
                <th
                  key={`er-${p}`}
                  className={`text-center p-2 text-muted-foreground font-normal text-xs cursor-pointer select-none group hover:bg-[#162040] transition-colors border-r ${i === 3 ? "border-slate-500/40" : "border-slate-700/30"}`}
                  onClick={() => handleSort(`emailResponses.${p}` as SortKey)}
                >
                  {p.toUpperCase()}
                  <SortIndicator
                    active={sortKey === `emailResponses.${p}`}
                    dir={sortDir}
                  />
                </th>
              ))}
              {/* Daily Email: Active, Type, Sender (not sortable) */}
              <th className="text-center p-2 text-muted-foreground font-normal text-xs border-r border-slate-700/30">
                Active
              </th>
              <th className="text-center p-2 text-muted-foreground font-normal text-xs border-r border-slate-700/30">
                Type
              </th>
              <th className="text-center p-2 text-muted-foreground font-normal text-xs">
                Sender
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const rowBg = idx % 2 === 0 ? "bg-[#020817]" : "bg-[#0B1120]";
              return (
                <tr
                  key={row.id}
                  className={`border-b border-slate-800/60 ${rowBg}`}
                >
                  {/* LinkedIn Account - sticky left */}
                  <td
                    className={`sticky left-0 z-10 ${rowBg} px-2 py-1.5 text-card-foreground text-xs font-medium whitespace-nowrap`}
                    style={{
                      minWidth: "180px",
                      maxWidth: "180px",
                      width: "180px",
                    }}
                  >
                    {row.user}
                  </td>
                  {/* Team */}
                  <td
                    className={`px-2 py-1.5 text-muted-foreground text-xs border-r border-slate-500/40 whitespace-nowrap ${rowBg}`}
                  >
                    {row.team}
                  </td>
                  {/* Active Campaigns */}
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-500/40 ${rowBg}`}
                  >
                    {row.activeCampaigns}
                  </td>
                  {/* Login Active */}
                  <td
                    className={`px-2 py-1.5 text-center text-muted-foreground text-xs border-r border-slate-500/40 whitespace-nowrap ${rowBg}`}
                  >
                    {row.loginActive}
                  </td>
                  {/* SN Active */}
                  <td
                    className={`px-2 py-1.5 text-center text-muted-foreground text-xs border-r border-slate-500/40 whitespace-nowrap ${rowBg}`}
                  >
                    {row.snActive}
                  </td>
                  {/* Errors: D, W, M, T */}
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.errors.d}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.errors.w}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.errors.m}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-500/40 ${rowBg}`}
                  >
                    {row.errors.t}
                  </td>
                  {/* Connection Req: Queue, D, W, M, T */}
                  <td
                    className={`px-2 py-1.5 text-center text-xs border-r border-slate-700/20 ${rowBg} ${
                      row.connectionReq.queue === 0
                        ? "text-[#fe3f39] font-bold"
                        : row.connectionReq.queue <= 99
                          ? "text-[#fe3f39]"
                          : row.connectionReq.queue <= 199
                            ? "text-[#e77974]"
                            : "text-card-foreground"
                    }`}
                  >
                    {row.connectionReq.queue}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.connectionReq.d}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.connectionReq.w}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.connectionReq.m}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-500/40 ${rowBg}`}
                  >
                    {row.connectionReq.t}
                  </td>
                  {/* New Connections */}
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.newConnections.d}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.newConnections.w}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.newConnections.m}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-500/40 ${rowBg}`}
                  >
                    {row.newConnections.t}
                  </td>
                  {/* LI Msg Sent */}
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.liMsgSent.d}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.liMsgSent.w}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.liMsgSent.m}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-500/40 ${rowBg}`}
                  >
                    {row.liMsgSent.t}
                  </td>
                  {/* LI Responses */}
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.liResponses.d}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.liResponses.w}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.liResponses.m}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-500/40 ${rowBg}`}
                  >
                    {row.liResponses.t}
                  </td>
                  {/* Emails Sent */}
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.emailsSent.d}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.emailsSent.w}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.emailsSent.m}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-500/40 ${rowBg}`}
                  >
                    {row.emailsSent.t}
                  </td>
                  {/* Email Responses */}
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.emailResponses.d}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.emailResponses.w}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-700/20 ${rowBg}`}
                  >
                    {row.emailResponses.m}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center text-card-foreground text-xs border-r border-slate-500/40 ${rowBg}`}
                  >
                    {row.emailResponses.t}
                  </td>
                  {/* Daily Email */}
                  <td
                    className={`px-1 py-1.5 text-center border-r border-slate-700/20 ${rowBg}`}
                  >
                    <div className="flex justify-center">
                      <Switch
                        checked={row.dailyEmail.on}
                        className="scale-75 data-[state=checked]:!bg-[#9fecb2] data-[state=unchecked]:!bg-[#1E293B]"
                      />
                    </div>
                  </td>
                  <td
                    className={`px-1 py-1.5 text-center border-r border-slate-700/20 ${rowBg}`}
                  >
                    <Select defaultValue={row.dailyEmail.type}>
                      <SelectTrigger className="h-4 w-[88px] mx-auto !text-[9px] !leading-none bg-transparent border-slate-600 text-card-foreground rounded-full pl-3 pr-1.5 py-0 shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:opacity-50 [&>svg]:shrink-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:text-center *:data-[slot=select-value]:!text-[9px] *:data-[slot=select-value]:!leading-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0F1729] border-slate-700 text-white">
                        <SelectItem
                          value="DFY Resp"
                          className="text-xs text-white focus:text-white focus:bg-slate-600"
                        >
                          DFY Resp
                        </SelectItem>
                        <SelectItem
                          value="Client Resp"
                          className="text-xs text-white focus:text-white focus:bg-slate-600"
                        >
                          Client Resp
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td
                    className={`px-2 py-1.5 text-muted-foreground text-xs whitespace-nowrap ${rowBg}`}
                  >
                    {row.dailyEmail.sender}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
