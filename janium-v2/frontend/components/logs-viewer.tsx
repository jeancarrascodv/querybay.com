"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSubscription } from "@apollo/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ScrollText,
  Trash2,
  Filter,
  Calendar,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { LOGS_SUBSCRIPTION } from "@/graphql/team";
import { cn } from "@/lib/utils";

interface LogEntry {
  level: string;
  message: string;
  target: string;
  timestamp: string;
  teamId?: string;
  campaignId?: string;
  campaignStepId?: string;
  contactId?: string;
  linkedinId?: string;
  actionId?: string;
  requestId?: string;
  fields?: unknown;
}

interface LogsFilterOptions {
  linkedinId?: string;
  campaignId?: string;
  campaignStepId?: string;
  actionId?: string;
  contactId?: string;
  requestId?: string;
  fromDate?: Date;
  toDate?: Date;
  minLevel?: string;
  targetContains?: string;
  messageContains?: string;
}

interface LogsViewerProps {
  asModal?: boolean;
  open?: boolean;
  onClose?: () => void;
  linkedinAccounts?: Array<{ id: string; fullName: string }>;
  campaigns?: Array<{ id: string; name: string }>;
  campaignSteps?: Array<{ id: string; name: string }>;
  /** When true, only show level + message filters inline; fullscreen still shows all */
  compactFilters?: boolean;
  initialFilters?: LogsFilterOptions;
  maxLogs?: number;
  title?: string;
  description?: string;
  className?: string;
  height?: string | number;
  defaultShowHistory?: boolean;
  /** Max historical logs to fetch from DB (default: 1000) */
  historyLimit?: number;
  /** Heartbeat interval in seconds (default: 10) */
  heartbeatIntervalSecs?: number;
  /** Called when fullscreen state changes */
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

const LOG_LEVELS = [
  { value: "TRACE", label: "Trace" },
  { value: "DEBUG", label: "Debug" },
  { value: "INFO", label: "Info" },
  { value: "WARN", label: "Warn" },
  { value: "ERROR", label: "Error" },
];

const HIDDEN_TARGETS = new Set([
  "janium::logs::history::start",
  "janium::logs::history::end",
  "janium::logs::subscription::start",
  "janium::logs::heartbeat",
]);

const LEVEL_ORDER: Record<string, number> = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
};

function buildLogJson(log: LogEntry): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    timestamp: log.timestamp,
    level: log.level,
    target: log.target,
    message: log.message,
  };
  if (log.teamId) obj.teamId = log.teamId;
  if (log.campaignId) obj.campaignId = log.campaignId;
  if (log.campaignStepId) obj.campaignStepId = log.campaignStepId;
  if (log.contactId) obj.contactId = log.contactId;
  if (log.linkedinId) obj.linkedinId = log.linkedinId;
  if (log.actionId) obj.actionId = log.actionId;
  if (log.requestId) obj.requestId = log.requestId;
  if (log.fields && typeof log.fields === "object" && Object.keys(log.fields as object).length > 0) {
    obj.fields = log.fields;
  }
  return obj;
}

const LEVEL_CLASS: Record<string, string> = {
  ERROR: "text-red-400",
  WARN: "text-yellow-400",
  INFO: "text-blue-400",
  DEBUG: "text-gray-400",
  TRACE: "text-gray-600",
};

const LogRow = React.memo(function LogRow({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-800/50 last:border-0">
      <div
        className="flex gap-2 py-0.5 leading-5 cursor-pointer hover:bg-white/5 px-1 -mx-1 rounded min-w-0"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-gray-600 shrink-0 w-3">
          {expanded ? (
            <ChevronDown className="h-3 w-3 mt-1" />
          ) : (
            <ChevronRight className="h-3 w-3 mt-1" />
          )}
        </span>
        <span className="text-gray-500 shrink-0">{log.timestamp}</span>
        <span
          className={`shrink-0 font-bold uppercase w-[44px] text-center ${LEVEL_CLASS[log.level] || "text-gray-600"}`}
        >
          {log.level}
        </span>
        <span className="text-gray-500 shrink-0">{log.target}</span>
        <span className="text-green-300 truncate min-w-0">{log.message}</span>
      </div>
      {expanded && (
        <pre className="text-[11px] leading-4 text-cyan-300 bg-gray-900/80 rounded mx-4 my-1 p-2 overflow-x-auto whitespace-pre-wrap break-all select-text">
          {JSON.stringify(buildLogJson(log), null, 2)}
        </pre>
      )}
    </div>
  );
});

export function LogsViewer({
  asModal = true,
  open: controlledOpen,
  onClose,
  linkedinAccounts = [],
  campaigns = [],
  campaignSteps = [],
  compactFilters = false,
  initialFilters = {},
  maxLogs: initialMaxLogs = 500,
  title = "Live Logs",
  description,
  className,
  height = "400px",
  defaultShowHistory = true,
  historyLimit,
  heartbeatIntervalSecs,
  onFullscreenChange,
}: LogsViewerProps) {
  // Super admin gate
  const { user } = useAuth();
  const isSuperAdmin = useMemo(() => process.env.NODE_ENV === "development" || user?.privileges?.includes("SuperAdmin"), [user]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [showHistory, setShowHistory] = useState(defaultShowHistory);
  const [internalOpen, setInternalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [maxLogsState, setMaxLogsState] = useState(initialMaxLogs);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Filter states — use raw ID for text inputs, "all"/ID for selects
  const [linkedinIdFilter, setLinkedinIdFilter] = useState(initialFilters.linkedinId || (linkedinAccounts.length > 0 ? "all" : ""));
  const [campaignIdFilter, setCampaignIdFilter] = useState(initialFilters.campaignId || (campaigns.length > 0 ? "all" : ""));
  const [campaignStepIdFilter, setCampaignStepIdFilter] = useState(initialFilters.campaignStepId || (campaignSteps.length > 0 ? "all" : ""));
  const [actionIdFilter, setActionIdFilter] = useState(initialFilters.actionId || "");
  const [contactIdFilter, setContactIdFilter] = useState(initialFilters.contactId || "");
  const [requestIdFilter, setRequestIdFilter] = useState(initialFilters.requestId || "");
  const [minLevelFilter, setMinLevelFilter] = useState(initialFilters.minLevel || "all");
  const [targetContainsFilter, setTargetContainsFilter] = useState(initialFilters.targetContains || "");
  const [messageContainsFilter, setMessageContainsFilter] = useState(initialFilters.messageContains || "");
  const get24hAgoDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  };
  const [fromDate, setFromDate] = useState<string>(
    initialFilters.fromDate
      ? initialFilters.fromDate.toISOString().split("T")[0]
      : defaultShowHistory
        ? get24hAgoDate()
        : ""
  );
  const [toDate, setToDate] = useState<string>(
    initialFilters.toDate ? initialFilters.toDate.toISOString().split("T")[0] : ""
  );

  // When showHistory is toggled on, auto-set fromDate to 24hrs ago
  useEffect(() => {
    if (showHistory && !fromDate) {
      setFromDate(get24hAgoDate());
    }
  }, [showHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refs for scroll management
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Batching: buffer incoming logs and flush on rAF
  const logBufferRef = useRef<LogEntry[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const maxLogsRef = useRef(maxLogsState);
  maxLogsRef.current = maxLogsState;

  // History phase: buffer all logs during history loading, sort and flush when done
  const historyPhaseRef = useRef(false);
  const historyBufferRef = useRef<LogEntry[]>([]);

  const flushLogBuffer = useCallback(() => {
    rafIdRef.current = null;
    const buffered = logBufferRef.current;
    if (buffered.length === 0) return;
    logBufferRef.current = [];
    // Newest first: prepend new live logs at the top
    setLogs((prev) => [...buffered.reverse(), ...prev].slice(0, maxLogsRef.current));
  }, []);

  const flushHistoryBuffer = useCallback(() => {
    const historyLogs = historyBufferRef.current;
    historyBufferRef.current = [];
    // Sort newest-first (descending) — historical logs already arrive newest-to-oldest
    // from the DB, but live logs may be interleaved during history phase.
    historyLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    setLogs((prev) => [...prev, ...historyLogs].slice(0, maxLogsRef.current));
  }, []);

  const enqueueLog = useCallback(
    (entry: LogEntry) => {
      // Handle history phase markers
      if (entry.target === "janium::logs::history::start") {
        historyPhaseRef.current = true;
        historyBufferRef.current = [];
        setIsLoadingHistory(true);
        return;
      }
      if (entry.target === "janium::logs::history::end") {
        historyPhaseRef.current = false;
        setIsLoadingHistory(false);
        flushHistoryBuffer();
        return;
      }
      if (HIDDEN_TARGETS.has(entry.target)) return;

      if (historyPhaseRef.current) {
        // During history phase, buffer everything and flush together when history ends
        historyBufferRef.current.push(entry);
        return;
      }

      logBufferRef.current.push(entry);
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushLogBuffer);
      }
    },
    [flushLogBuffer, flushHistoryBuffer]
  );

  // Track whether user is scrolled to top (newest logs are at top)
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 40;
    shouldAutoScrollRef.current = el.scrollTop < threshold;
  }, []);

  // Auto-scroll to top when new logs arrive (newest first)
  useEffect(() => {
    if (shouldAutoScrollRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [logs]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  const isOpen = !asModal ? true : controlledOpen !== undefined ? controlledOpen : internalOpen;
  const handleClose = () => {
    if (onClose) onClose();
    else setInternalOpen(false);
  };

  // Escape exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
        onFullscreenChange?.(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen, onFullscreenChange]);

  // Build subscription filter
  const subscriptionFilter = useMemo(() => {
    if (!isOpen) return { filter: null };
    const filter: Record<string, unknown> = {};
    if (linkedinIdFilter && linkedinIdFilter !== "all") filter.linkedinId = linkedinIdFilter;
    if (campaignIdFilter && campaignIdFilter !== "all") filter.campaignId = campaignIdFilter;
    if (campaignStepIdFilter && campaignStepIdFilter !== "all") filter.campaignStepId = campaignStepIdFilter;
    if (actionIdFilter) filter.actionId = actionIdFilter;
    if (contactIdFilter) filter.contactId = contactIdFilter;
    if (requestIdFilter) filter.requestId = requestIdFilter;
    if (minLevelFilter && minLevelFilter !== "all") filter.minLevel = minLevelFilter.toUpperCase();
    if (targetContainsFilter) filter.targetContains = targetContainsFilter;
    if (messageContainsFilter) filter.messageContains = messageContainsFilter;
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      filter.startTime = from.toISOString();
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      filter.endTime = to.toISOString();
    }
    filter.liveLogs = isLive;
    filter.historyLogs = showHistory;
    if (historyLimit != null) filter.historyLimit = historyLimit;
    if (heartbeatIntervalSecs != null) filter.heartbeatIntervalSecs = heartbeatIntervalSecs;
    return { filter };
  }, [
    isOpen, isLive, showHistory, linkedinIdFilter, campaignIdFilter,
    campaignStepIdFilter, actionIdFilter, contactIdFilter, requestIdFilter,
    minLevelFilter, targetContainsFilter, messageContainsFilter, fromDate, toDate,
    historyLimit, heartbeatIntervalSecs,
  ]);

  useSubscription(LOGS_SUBSCRIPTION, {
    variables: subscriptionFilter,
    skip: !isOpen || (!isLive && !showHistory),
    onData: ({ data }) => {
      if (data?.data?.logs) {
        enqueueLog(data.data.logs);
      }
    },
  });

  const handleClearLogs = useCallback(() => {
    logBufferRef.current = [];
    historyBufferRef.current = [];
    setLogs([]);
  }, []);

  const handleResetFilters = useCallback(() => {
    setLinkedinIdFilter(linkedinAccounts.length > 0 ? "all" : "");
    setCampaignIdFilter(campaigns.length > 0 ? "all" : "");
    setCampaignStepIdFilter(campaignSteps.length > 0 ? "all" : "");
    setActionIdFilter("");
    setContactIdFilter("");
    setRequestIdFilter("");
    setMinLevelFilter("all");
    setTargetContainsFilter("");
    setMessageContainsFilter("");
    setFromDate("");
    setToDate("");
  }, [linkedinAccounts.length, campaigns.length, campaignSteps.length]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => {
      const next = !v;
      onFullscreenChange?.(next);
      return next;
    });
  }, [onFullscreenChange]);

  // Client-side filter for already-collected logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (linkedinIdFilter && linkedinIdFilter !== "all" && log.linkedinId !== linkedinIdFilter) return false;
      if (campaignIdFilter && campaignIdFilter !== "all" && log.campaignId !== campaignIdFilter) return false;
      if (campaignStepIdFilter && campaignStepIdFilter !== "all" && log.campaignStepId !== campaignStepIdFilter) return false;
      if (actionIdFilter && log.actionId !== actionIdFilter) return false;
      if (contactIdFilter && log.contactId !== contactIdFilter) return false;
      if (requestIdFilter && log.requestId !== requestIdFilter) return false;
      if (minLevelFilter && minLevelFilter !== "all") {
        const minOrder = LEVEL_ORDER[minLevelFilter.toUpperCase()] ?? 0;
        const logOrder = LEVEL_ORDER[log.level?.toUpperCase()] ?? 0;
        if (logOrder < minOrder) return false;
      }
      if (targetContainsFilter && !log.target?.toLowerCase().includes(targetContainsFilter.toLowerCase())) return false;
      if (messageContainsFilter && !log.message?.toLowerCase().includes(messageContainsFilter.toLowerCase())) return false;
      return true;
    });
  }, [
    logs, linkedinIdFilter, campaignIdFilter, campaignStepIdFilter,
    actionIdFilter, contactIdFilter, requestIdFilter, minLevelFilter,
    targetContainsFilter, messageContainsFilter,
  ]);

  // ── Shared JSX blocks (NOT components — just variables) ──

  const filtersJsx = (showAll: boolean) => (
    <div className="space-y-3 p-4 bg-muted/50 rounded-lg shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleResetFilters} className="h-7 text-xs">
          Reset
        </Button>
      </div>

      {/* Filter inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-3 items-end">
        {showAll && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs h-4 leading-4">LinkedIn Account</Label>
            {linkedinAccounts.length > 0 ? (
              <Select value={linkedinIdFilter} onValueChange={setLinkedinIdFilter}>
                <SelectTrigger className="w-full text-sm"><SelectValue placeholder="All Accounts" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {linkedinAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input placeholder="Enter LinkedIn ID..." value={linkedinIdFilter} onChange={(e) => setLinkedinIdFilter(e.target.value)} className="text-sm" />
            )}
          </div>
        )}
        {showAll && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs h-4 leading-4">Campaign</Label>
            {campaigns.length > 0 ? (
              <Select value={campaignIdFilter} onValueChange={setCampaignIdFilter}>
                <SelectTrigger className="w-full text-sm"><SelectValue placeholder="All Campaigns" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input placeholder="Enter Campaign ID..." value={campaignIdFilter} onChange={(e) => setCampaignIdFilter(e.target.value)} className="text-sm" />
            )}
          </div>
        )}
        {showAll && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs h-4 leading-4">Campaign Step</Label>
            {campaignSteps.length > 0 ? (
              <Select value={campaignStepIdFilter} onValueChange={setCampaignStepIdFilter}>
                <SelectTrigger className="w-full text-sm"><SelectValue placeholder="All Steps" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Steps</SelectItem>
                  {campaignSteps.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input placeholder="Enter Step ID..." value={campaignStepIdFilter} onChange={(e) => setCampaignStepIdFilter(e.target.value)} className="text-sm" />
            )}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs h-4 leading-4">Min Level</Label>
          <Select value={minLevelFilter} onValueChange={setMinLevelFilter}>
            <SelectTrigger className="w-full text-sm"><SelectValue placeholder="All Levels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              {LOG_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {showAll && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs h-4 leading-4">Action ID</Label>
            <Input placeholder="Enter action ID..." value={actionIdFilter} onChange={(e) => setActionIdFilter(e.target.value)} className="text-sm" />
          </div>
        )}
        {showAll && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs h-4 leading-4">Contact ID</Label>
            <Input placeholder="Enter contact ID..." value={contactIdFilter} onChange={(e) => setContactIdFilter(e.target.value)} className="text-sm" />
          </div>
        )}
        {showAll && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs h-4 leading-4">Request ID</Label>
            <Input placeholder="Enter request ID..." value={requestIdFilter} onChange={(e) => setRequestIdFilter(e.target.value)} className="text-sm" />
          </div>
        )}
        {showAll && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs h-4 leading-4">Target Contains</Label>
            <Input placeholder="e.g. janium::automator" value={targetContainsFilter} onChange={(e) => setTargetContainsFilter(e.target.value)} className="text-sm" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs h-4 leading-4">Message Contains</Label>
          <Input placeholder="Search in messages..." value={messageContainsFilter} onChange={(e) => setMessageContainsFilter(e.target.value)} className="text-sm" />
        </div>
        {showAll && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs h-4 leading-4">From Date</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="text-sm" />
          </div>
        )}
        {showAll && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs h-4 leading-4">To Date</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="text-sm" />
          </div>
        )}
        {showAll && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs h-4 leading-4">Max Logs</Label>
            <Input
              type="number"
              min={10}
              max={10000}
              value={maxLogsState}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v > 0) setMaxLogsState(v);
              }}
              className="text-sm"
            />
          </div>
        )}
      </div>

      {/* Toggles — always at the bottom */}
      {showAll && (
        <div className="flex items-center gap-6 pt-2 border-t border-border/50">
          <div className="flex items-center space-x-2">
            <Switch id="live-mode" checked={isLive} onCheckedChange={setIsLive} />
            <Label htmlFor="live-mode" className="text-sm cursor-pointer">Live Updates</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="history-mode" checked={showHistory} onCheckedChange={setShowHistory} />
            <Label htmlFor="history-mode" className="text-sm cursor-pointer">Show History</Label>
          </div>
        </div>
      )}
    </div>
  );

  const logsHeaderJsx = (
    <div className="flex items-center justify-between shrink-0">
      <h4 className="font-medium flex items-center gap-2">
        <ScrollText className="h-4 w-4" />
        {title}
        {filteredLogs.length > 0 && (
          <span className="text-xs text-muted-foreground">({filteredLogs.length})</span>
        )}
        {isLoadingHistory && (
          <span className="text-xs text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full animate-pulse">
            Loading history...
          </span>
        )}
        {!isLive && !isLoadingHistory && (
          <span className="text-xs text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded-full">
            Paused
          </span>
        )}
      </h4>
      <div className="flex items-center gap-2">
        {filteredLogs.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClearLogs} className="h-7 text-muted-foreground hover:text-foreground">
            <Trash2 className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleFullscreen}
          className="h-7 text-muted-foreground hover:text-foreground"
          title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );

  const logsBodyJsx = (fullscreen: boolean) => (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className={cn(
        "overflow-auto rounded-lg font-mono text-xs px-3 py-2 bg-black/95 text-green-400 border",
        fullscreen && "flex-1"
      )}
      style={fullscreen ? undefined : { height: typeof height === "number" ? `${height}px` : height }}
    >
      {filteredLogs.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground font-sans text-sm">
          {isLoadingHistory
            ? "Loading historical logs..."
            : isLive
              ? "Waiting for log events..."
              : "Live logging is paused. Toggle 'Live' to resume."}
        </div>
      ) : (
        filteredLogs.map((log, i) => <LogRow key={i} log={log} />)
      )}
    </div>
  );

  // ── Render modes ──
  // compactFilters: inline shows only level + message; fullscreen always shows all
  const showAllFilters = !compactFilters;

  if (!isSuperAdmin) return null;

  if (isFullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-[100] bg-background flex flex-col pointer-events-auto">
        <div className="flex items-center justify-between p-4 pb-0 shrink-0">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={() => { setIsFullscreen(false); onFullscreenChange?.(false); }} className="h-8">
            <Minimize2 className="h-4 w-4 mr-1" />
            Exit Fullscreen
          </Button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col p-4 gap-4 overflow-hidden">
          {filtersJsx(true)}
          <div className="space-y-2 flex-1 min-h-0 flex flex-col">
            {logsHeaderJsx}
            {logsBodyJsx(true)}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (asModal) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className={cn("max-w-6xl max-h-[90vh] overflow-hidden flex flex-col", className)}>
          <DialogHeader className="shrink-0">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="space-y-4 min-h-0 overflow-y-auto">
            {filtersJsx(showAllFilters)}
            <div className="space-y-2 min-w-0">
              {logsHeaderJsx}
              {logsBodyJsx(false)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={handleClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className={cn("space-y-4 min-w-0 overflow-hidden", className)}>
      {filtersJsx(showAllFilters)}
      <div className="space-y-2 min-w-0">
        {logsHeaderJsx}
        {logsBodyJsx(false)}
      </div>
    </div>
  );
}

// ── Trigger component ──

interface LogsViewerTriggerProps {
  children?: React.ReactNode;
  linkedinAccounts?: Array<{ id: string; fullName: string }>;
  campaigns?: Array<{ id: string; name: string }>;
  campaignSteps?: Array<{ id: string; name: string }>;
  initialFilters?: LogsFilterOptions;
  buttonText?: string;
  buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  title?: string;
  defaultShowHistory?: boolean;
}

export function LogsViewerTrigger({
  children,
  linkedinAccounts = [],
  campaigns = [],
  campaignSteps = [],
  initialFilters,
  buttonText = "View Logs",
  buttonVariant = "outline",
  title = "Live Logs",
  defaultShowHistory,
}: LogsViewerTriggerProps) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const isSuperAdmin = useMemo(() => process.env.NODE_ENV === "development" || user?.privileges?.includes("SuperAdmin"), [user]);

  if (!isSuperAdmin) return null;

  return (
    <>
      {children ? (
        <div onClick={() => setOpen(true)}>{children}</div>
      ) : (
        <Button variant={buttonVariant} onClick={() => setOpen(true)}>
          <ScrollText className="h-4 w-4 mr-2" />
          {buttonText}
        </Button>
      )}
      <LogsViewer
        asModal
        open={open}
        onClose={() => setOpen(false)}
        linkedinAccounts={linkedinAccounts}
        campaigns={campaigns}
        campaignSteps={campaignSteps}
        initialFilters={initialFilters}
        title={title}
        defaultShowHistory={defaultShowHistory}
      />
    </>
  );
}

export type { LogsFilterOptions, LogEntry };
