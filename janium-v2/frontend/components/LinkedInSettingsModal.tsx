"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Plus,
  X,
  HelpCircle,
  RefreshCw,
  Edit,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import { LogsViewerTrigger } from "@/components/logs-viewer";
import {
  LinkedInIntegration,
  UpdateLinkedInInput,
  WeeklyRestrictions,
} from "@/hooks/useLinkedInIntegrations";
import { useTeam } from "@/hooks/useTeam";
import { useAuth } from "@/contexts/AuthContext";

interface LinkedInSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: LinkedInIntegration | null;
  onSave: (
    linkedInId: string,
    data: UpdateLinkedInInput,
  ) => Promise<LinkedInIntegration | undefined>;
  onRefetch?: () => Promise<any>;
  isSaving?: boolean;
  teamWeeklyRestrictions?: WeeklyRestrictions | null;
  onCleanContainer?: (linkedInId: string) => Promise<void>;
  onSyncConnections?: (linkedInId: string, fullSync: boolean) => Promise<any>;
}

interface ScheduleConfig {
  day: string;
  enabled: boolean;
  start: number;
  end: number;
}

// Helper to convert time string "HH:MM:SS" to minutes from midnight
const timeStringToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// Helper to convert minutes from midnight to time string "HH:MM:SS"
const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:00`;
};

// Helper to parse 24hr time string "HH:MM:SS" or "HH:MM" to components
const parseTimeString = (
  time: string,
): { hours: number; minutes: number; period: "am" | "pm" } => {
  if (!time) return { hours: 12, minutes: 0, period: "pm" };
  const [hoursStr, minutesStr] = time.split(":");
  const hours24 = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  const period: "am" | "pm" = hours24 >= 12 ? "pm" : "am";
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;

  return { hours: hours12, minutes, period };
};

// Helper to build 24hr time string from 12hr components
const build24hrTimeString = (
  hours12: number,
  minutes: number,
  period: "am" | "pm",
): string => {
  let hours24 = hours12;
  if (period === "am") {
    if (hours12 === 12) hours24 = 0;
  } else {
    if (hours12 !== 12) hours24 = hours12 + 12;
  }
  return `${hours24.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`;
};

// Helper to format time for display in 12hr format (rounded to nearest minute)
const formatTimeTo12hr = (time: string): string => {
  if (!time) return "";
  const { hours, minutes, period } = parseTimeString(time);
  return `${hours}:${minutes.toString().padStart(2, "0")} ${period}`;
};

// Helper to sanitize number input (no leading zeros, no zero values, min value of 1)
const sanitizeNumberInput = (
  value: string,
  min: number = 1,
  max?: number,
): number | null => {
  // Remove leading zeros
  const sanitized = value.replace(/^0+/, "");

  // If result is empty (was "" or "0" or "00"), return NaN to allow clearing the field
  if (sanitized === "") return NaN;

  const num = parseInt(sanitized, 10);
  if (isNaN(num)) return null;
  if (num < min) return min;
  if (max !== undefined && num > max) return max;
  return num;
};

export function LinkedInSettingsModal({
  open,
  onOpenChange,
  account,
  onSave,
  onRefetch,
  isSaving,
  teamWeeklyRestrictions,
  onCleanContainer,
  onSyncConnections,
}: LinkedInSettingsModalProps) {
  const [isActive, setIsActive] = useState(true);
  const [proxyUrl, setProxyUrl] = useState("");

  const { defaultSettings } = useTeam(undefined, {
    fetchDefaultSettings: true,
  });

  const { user } = useAuth();

  // Check user privileges
  const isSuperAdmin = useMemo(() => {
    return user?.privileges?.includes("SuperAdmin");
  }, [user]);
  const isTeamAdmin = useMemo(() => {
    return user?.privileges?.includes("TeamAdmin");
  }, [user]);

  // Only admins can clean containers
  const canCleanContainer = isSuperAdmin || isTeamAdmin;

  const [schedule, setSchedule] = useState<ScheduleConfig[]>([
    { day: "Mon", enabled: true, start: 540, end: 1020 },
    { day: "Tue", enabled: true, start: 540, end: 1020 },
    { day: "Wed", enabled: true, start: 540, end: 1020 },
    { day: "Thu", enabled: true, start: 540, end: 1020 },
    { day: "Fri", enabled: true, start: 540, end: 1020 },
    { day: "Sat", enabled: false, start: 540, end: 1020 },
    { day: "Sun", enabled: false, start: 540, end: 1020 },
  ]);

  const [variabilityPct, setVariabilityPct] = useState(20);

  const [directMessages, setDirectMessages] = useState(75);
  const [dailyConnectionRequests, setDailyConnectionRequests] = useState(30);

  const [weeklyConnectionRequests, setWeeklyConnectionRequests] = useState(100);
  const [autoDistribute, setAutoDistribute] = useState(true);
  const [connectionWithMessage, setConnectionWithMessage] = useState(50);
  const [connectionWithoutMessage, setConnectionWithoutMessage] = useState(50);

  const [openInMails, setOpenInMails] = useState(100);
  const [premiumInMails, setPremiumInMails] = useState(100);

  const [maxPendingConnections, setMaxPendingConnections] = useState(1800);

  // Warmup enabled state
  const [warmupEnabled, setWarmupEnabled] = useState(true);

  // Warmup settings for Connection Requests
  const [crStartingPerDay, setCrStartingPerDay] = useState(5);
  const [crWarmupDays, setCrWarmupDays] = useState(15);
  const [crVariability, setCrVariability] = useState(20);

  // Warmup settings for Direct Messages (daily)
  const [msgStartingPerDay, setMsgStartingPerDay] = useState(25);
  const [msgWarmupDays, setMsgWarmupDays] = useState(3);
  const [msgVariability, setMsgVariability] = useState(20);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSavingInternal, setIsSavingInternal] = useState(false);

  // Proxy modal state
  const [proxyModalOpen, setProxyModalOpen] = useState(false);
  const [tempProxyUrl, setTempProxyUrl] = useState("");

  // Today's Window modal state
  const [todayWindowModalOpen, setTodayWindowModalOpen] = useState(false);

  // Today's Window state (stored as 24hr format strings)
  const [todayWindowStart, setTodayWindowStart] = useState("");
  const [todayWindowEnd, setTodayWindowEnd] = useState("");

  // Today's Window editable components
  const [startHours, setStartHours] = useState("");
  const [startMinutes, setStartMinutes] = useState("");
  const [startPeriod, setStartPeriod] = useState<"am" | "pm">("pm");
  const [endHours, setEndHours] = useState("");
  const [endMinutes, setEndMinutes] = useState("");
  const [endPeriod, setEndPeriod] = useState<"am" | "pm">("am");

  // Today's max connections and error count
  const [todayMaxConnections, setTodayMaxConnections] = useState(0);
  const [maxConsecutiveErrors, setMaxConsecutiveErrors] = useState(5);

  // Track whether using system defaults for max connections and errors
  const [useSystemDefaultMaxConnections, setUseSystemDefaultMaxConnections] =
    useState(true);
  const [useSystemDefaultMaxErrors, setUseSystemDefaultMaxErrors] =
    useState(true);

  // Modal states for max connections and max errors
  const [maxConnectionsModalOpen, setMaxConnectionsModalOpen] = useState(false);
  const [maxErrorsModalOpen, setMaxErrorsModalOpen] = useState(false);

  // Temp values for editing in modals
  const [tempMaxConnections, setTempMaxConnections] = useState(0);
  const [tempMaxErrors, setTempMaxErrors] = useState(2);
  const [
    tempUseSystemDefaultMaxConnections,
    setTempUseSystemDefaultMaxConnections,
  ] = useState(true);
  const [tempUseSystemDefaultMaxErrors, setTempUseSystemDefaultMaxErrors] =
    useState(true);

  // Default system values
  const SYSTEM_DEFAULT_MAX_CONNECTIONS = 0;
  const SYSTEM_DEFAULT_MAX_ERRORS = 2;

  // Scroll state for header name
  const [showNameInHeader, setShowNameInHeader] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Clean container dialog state
  const [cleanContainerOpen, setCleanContainerOpen] = useState(false);
  const [cleanContainerConfirmName, setCleanContainerConfirmName] =
    useState("");
  const [isCleaningContainer, setIsCleaningContainer] = useState(false);

  // Copy ID state
  const [copiedId, setCopiedId] = useState(false);

  // Use Team Settings state (default to true when no custom weeklyRestrictions)
  const [useTeamSettings, setUseTeamSettings] = useState(true);

  // Convert team weekly restrictions to schedule format for preview
  const teamSchedulePreview: ScheduleConfig[] = (() => {
    if (!teamWeeklyRestrictions) {
      // Default schedule when no team restrictions available
      return [
        { day: "Mon", enabled: true, start: 540, end: 1020 },
        { day: "Tue", enabled: true, start: 540, end: 1020 },
        { day: "Wed", enabled: true, start: 540, end: 1020 },
        { day: "Thu", enabled: true, start: 540, end: 1020 },
        { day: "Fri", enabled: true, start: 540, end: 1020 },
        { day: "Sat", enabled: false, start: 540, end: 1020 },
        { day: "Sun", enabled: false, start: 540, end: 1020 },
      ];
    }
    const dayMap: Record<string, string> = {
      monday: "Mon",
      tuesday: "Tue",
      wednesday: "Wed",
      thursday: "Thu",
      friday: "Fri",
      saturday: "Sat",
      sunday: "Sun",
    };
    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ] as const;
    return days.map((day) => {
      const restriction = teamWeeklyRestrictions[day];
      if (restriction) {
        return {
          day: dayMap[day],
          enabled: true,
          start: timeStringToMinutes(restriction.startTime),
          end: timeStringToMinutes(restriction.endTime),
        };
      }
      return {
        day: dayMap[day],
        enabled: false,
        start: 540,
        end: 1020,
      };
    });
  })();

  const [isSyncingConnections, setIsSyncingConnections] = useState(false);

  const handleSyncConnections = async () => {
    if (!account || !onSyncConnections) return;
    try {
      setIsSyncingConnections(true);
      await onSyncConnections(account.id, false);
    } catch (error) {
      console.error("Error syncing connections:", error);
    } finally {
      setIsSyncingConnections(false);
    }
  };

  // Handle toggling useTeamSettings - set default Mon-Fri 9-5 schedule when disabling
  const handleUseTeamSettingsChange = (checked: boolean) => {
    if (!checked) {
      // Set default Mon-Fri 9-5 schedule when unchecking "Use Team Settings"
      setSchedule([
        { day: "Mon", enabled: true, start: 540, end: 1020 }, // 9 AM to 5 PM
        { day: "Tue", enabled: true, start: 540, end: 1020 },
        { day: "Wed", enabled: true, start: 540, end: 1020 },
        { day: "Thu", enabled: true, start: 540, end: 1020 },
        { day: "Fri", enabled: true, start: 540, end: 1020 },
        { day: "Sat", enabled: false, start: 540, end: 1020 },
        { day: "Sun", enabled: false, start: 540, end: 1020 },
      ]);
    }
    setUseTeamSettings(checked);
  };

  // The schedule to display - team preview when using team settings, otherwise user's custom schedule
  const displaySchedule = useTeamSettings ? teamSchedulePreview : schedule;
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      // Show name in header after scrolling 100px
      setShowNameInHeader(scrollContainerRef.current.scrollTop > 100);
    }
  };

  // Load account data when modal opens
  useEffect(() => {
    if (account && open) {
      setProxyUrl(account.proxyUrl ?? "");
      setMaxPendingConnections(account.maxPendingConnectionRequests ?? 1800);
      setWeeklyConnectionRequests(account.maxConnectionRequestsPerWeek ?? 100);
      setDailyConnectionRequests(account.maxConnectionRequestsPerDay ?? 30);
      setVariabilityPct(account.dailyConnectionRequestsVariationPct ?? 20);

      // Load warmup settings from account
      setWarmupEnabled(account.warmupEnabled ?? true);
      setCrStartingPerDay(account.warmupStartingConnectionRequestsPerDay ?? 5);
      setCrWarmupDays(account.warmupPeriodDays ?? 21);
      setCrVariability(account.dailyConnectionRequestsVariationPct ?? 20);

      // Load today's window from account
      const startTime = account.todayExecutableWindowStart ?? "";
      const endTime = account.todayExecutableWindowEnd ?? "";
      setTodayWindowStart(startTime);
      setTodayWindowEnd(endTime);

      // Parse into editable components
      if (startTime) {
        const parsed = parseTimeString(startTime);
        setStartHours(parsed.hours.toString());
        setStartMinutes(parsed.minutes.toString().padStart(2, "0"));
        setStartPeriod(parsed.period);
      }
      if (endTime) {
        const parsed = parseTimeString(endTime);
        setEndHours(parsed.hours.toString());
        setEndMinutes(parsed.minutes.toString().padStart(2, "0"));
        setEndPeriod(parsed.period);
      }

      // Load today's max connections and error count
      // If the value is null/undefined, use system defaults
      const maxConn = account.todayMaxConnectionRequests;
      const maxErr = account.maxConsecutiveErrors;

      if (maxConn === null || maxConn === undefined) {
        setUseSystemDefaultMaxConnections(true);
        setTodayMaxConnections(SYSTEM_DEFAULT_MAX_CONNECTIONS);
      } else {
        setUseSystemDefaultMaxConnections(false);
        setTodayMaxConnections(maxConn);
      }

      if (maxErr === null || maxErr === undefined) {
        setUseSystemDefaultMaxErrors(true);
        setMaxConsecutiveErrors(SYSTEM_DEFAULT_MAX_ERRORS);
      } else {
        setUseSystemDefaultMaxErrors(false);
        setMaxConsecutiveErrors(maxErr);
      }

      // Load schedule from weeklyRestrictions
      if (account.weeklyRestrictions) {
        const dayMap: Record<string, string> = {
          monday: "Mon",
          tuesday: "Tue",
          wednesday: "Wed",
          thursday: "Thu",
          friday: "Fri",
          saturday: "Sat",
          sunday: "Sun",
        };
        const days = [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ] as const;

        // Check if all days are null (meaning use team settings)
        const allDaysNull = days.every(
          (day) => account.weeklyRestrictions[day] === null,
        );
        if (allDaysNull) {
          // All days are null means use team settings
          setUseTeamSettings(true);
        } else {
          const newSchedule: ScheduleConfig[] = [];
          days.forEach((day) => {
            const restriction = account.weeklyRestrictions[day];
            if (restriction) {
              newSchedule.push({
                day: dayMap[day],
                enabled: true,
                start: timeStringToMinutes(restriction.startTime),
                end: timeStringToMinutes(restriction.endTime),
              });
            } else {
              newSchedule.push({
                day: dayMap[day],
                enabled: false,
                start: 540,
                end: 1020,
              });
            }
          });
          setSchedule(newSchedule);
          setUseTeamSettings(false); // Custom schedule exists, don't use team settings
        }
      } else {
        // No weeklyRestrictions means use team settings
        setUseTeamSettings(true);
      }
    }
  }, [account, open]);

  // Sync time components to main state
  useEffect(() => {
    if (startHours && startMinutes) {
      const hours = parseInt(startHours, 10);
      const minutes = parseInt(startMinutes, 10);
      if (
        !isNaN(hours) &&
        !isNaN(minutes) &&
        hours >= 1 &&
        hours <= 12 &&
        minutes >= 0 &&
        minutes <= 59
      ) {
        setTodayWindowStart(build24hrTimeString(hours, minutes, startPeriod));
      }
    }
  }, [startHours, startMinutes, startPeriod]);

  useEffect(() => {
    if (endHours && endMinutes) {
      const hours = parseInt(endHours, 10);
      const minutes = parseInt(endMinutes, 10);
      if (
        !isNaN(hours) &&
        !isNaN(minutes) &&
        hours >= 1 &&
        hours <= 12 &&
        minutes >= 0 &&
        minutes <= 59
      ) {
        setTodayWindowEnd(build24hrTimeString(hours, minutes, endPeriod));
      }
    }
  }, [endHours, endMinutes, endPeriod]);

  // Track if user has made changes (skip initial load)
  const [hasChanges, setHasChanges] = useState(false);
  const isInitialLoadRef = useRef(true);
  const performSaveRef =
    useRef<() => Promise<LinkedInIntegration | undefined>>();

  // Reset hasChanges and initial load flag when modal opens/closes
  useEffect(() => {
    if (open) {
      isInitialLoadRef.current = true;
      setHasChanges(false);
      // Allow state to settle before enabling change tracking
      const timer = setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setHasChanges(false);
      isInitialLoadRef.current = true;
    }
  }, [open]);

  // Track changes after initial load is complete
  useEffect(() => {
    if (!open || !account || isInitialLoadRef.current) return;
    setHasChanges(true);
  }, [
    open,
    account,
    proxyUrl,
    schedule,
    variabilityPct,
    dailyConnectionRequests,
    weeklyConnectionRequests,
    maxPendingConnections,
    maxPendingConnections,
    useTeamSettings,
    warmupEnabled,
    crStartingPerDay,
    crWarmupDays,
    crVariability,
    todayWindowStart,
    todayWindowEnd,
    todayMaxConnections,
    maxConsecutiveErrors,
    useSystemDefaultMaxConnections,
    useSystemDefaultMaxErrors,
  ]);

  // Auto-save effect - only save when hasChanges is true
  useEffect(() => {
    if (!open || !account || !hasChanges || isSavingInternal) return;

    const timer = setTimeout(async () => {
      try {
        setIsSavingInternal(true);
        // Use ref to always get the latest performSave with current state values
        const result = await performSaveRef.current?.();
        setLastSaved(new Date());
        setSaveSuccess(true);
        setHasChanges(false);
        setTimeout(() => setSaveSuccess(false), 2000);

        // Refresh today's window from the mutation result or refetch
        if (result) {
          refreshTodayWindow(result);
        } else if (onRefetch) {
          // If no result returned, refetch to get updated data
          await onRefetch();
        }
      } catch (error) {
        console.error("Auto-save failed:", error);
      } finally {
        setIsSavingInternal(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [hasChanges, open, account, isSavingInternal]);

  // Handle modal close - save in background if there are unsaved changes
  const handleModalClose = (shouldClose: boolean) => {
    if (!shouldClose) {
      // User wants to close
      if (hasChanges && account && !isSavingInternal) {
        // There are unsaved changes, save in background and close immediately
        // Use ref to always get the latest performSave with current state values
        performSaveRef
          .current?.()
          .then((result) => {
            if (result && onRefetch) {
              onRefetch();
            }
          })
          .catch((error) => {
            console.error("Background save on close failed:", error);
          });
      }
      // Close immediately
      onOpenChange(false);
    } else {
      // Opening the modal
      onOpenChange(true);
    }
  };

  // Perform the actual save operation
  const performSave = async (): Promise<LinkedInIntegration | undefined> => {
    if (!account) return undefined;

    // Define day types
    type DayKey =
      | "monday"
      | "tuesday"
      | "wednesday"
      | "thursday"
      | "friday"
      | "saturday"
      | "sunday";
    const dayMap: Record<string, DayKey> = {
      Mon: "monday",
      Tue: "tuesday",
      Wed: "wednesday",
      Thu: "thursday",
      Fri: "friday",
      Sat: "saturday",
      Sun: "sunday",
    };

    // Build weeklyRestrictions - set to null if using team settings
    let finalWeeklyRestrictions: UpdateLinkedInInput["weeklyRestrictions"];

    if (useTeamSettings) {
      // Set entire weeklyRestrictions to null to signal using team settings
      finalWeeklyRestrictions = null;
    } else {
      // Convert schedule to weeklyRestrictions format
      const weeklyRestrictions: Record<
        string,
        { startTime: string; endTime: string } | null
      > = {};
      schedule.forEach((config) => {
        const dayKey = dayMap[config.day];
        if (config.enabled && dayKey) {
          weeklyRestrictions[dayKey] = {
            startTime: minutesToTimeString(config.start),
            endTime: minutesToTimeString(
              config.end === 24 * 60 ? 0 : config.end,
            ),
          };
        }
      });
      finalWeeklyRestrictions = weeklyRestrictions as any;
    }

    const updateData: UpdateLinkedInInput = {
      proxyUrl: proxyUrl.trim() || null,
      maxPendingConnectionRequests: maxPendingConnections,
      maxConnectionRequestsPerWeek: weeklyConnectionRequests,
      maxConnectionRequestsPerDay: dailyConnectionRequests,
      dailyConnectionRequestsVariationPct: crVariability,
      weeklyRestrictions: finalWeeklyRestrictions,
      // Warmup settings from UI
      warmupEnabled: warmupEnabled,
      warmupPeriodDays: crWarmupDays,
      warmupStartingConnectionRequestsPerDay: crStartingPerDay,
      // Today's window settings
      todayExecutableWindowStart: todayWindowStart || undefined,
      todayExecutableWindowEnd: todayWindowEnd || undefined,
      // Pass undefined when using system defaults, otherwise pass the user value
      todayMaxConnectionRequests: useSystemDefaultMaxConnections
        ? undefined
        : todayMaxConnections,
      maxConsecutiveErrors: useSystemDefaultMaxErrors
        ? undefined
        : maxConsecutiveErrors,
    };

    const result = await onSave(account.id, updateData);
    return result;
  };

  // Keep ref updated with latest performSave
  performSaveRef.current = performSave;

  // Helper to refresh today's window from updated account data
  const refreshTodayWindow = (updatedAccount: LinkedInIntegration) => {
    const startTime = updatedAccount.todayExecutableWindowStart ?? "";
    const endTime = updatedAccount.todayExecutableWindowEnd ?? "";

    setTodayWindowStart(startTime);
    setTodayWindowEnd(endTime);

    if (startTime) {
      const parsed = parseTimeString(startTime);
      setStartHours(parsed.hours.toString());
      setStartMinutes(parsed.minutes.toString().padStart(2, "0"));
      setStartPeriod(parsed.period);
    }
    if (endTime) {
      const parsed = parseTimeString(endTime);
      setEndHours(parsed.hours.toString());
      setEndMinutes(parsed.minutes.toString().padStart(2, "0"));
      setEndPeriod(parsed.period);
    }

    // Update max connections with system default tracking
    const maxConn = updatedAccount.todayMaxConnectionRequests;
    if (maxConn === null || maxConn === undefined) {
      setUseSystemDefaultMaxConnections(true);
      setTodayMaxConnections(SYSTEM_DEFAULT_MAX_CONNECTIONS);
    } else {
      setUseSystemDefaultMaxConnections(false);
      setTodayMaxConnections(maxConn);
    }
  };

  const handleSave = async () => {
    try {
      const result = await performSave();
      if (result) {
        refreshTodayWindow(result);
      } else if (onRefetch) {
        await onRefetch();
      }
    } catch (error) {
      console.error("Error saving LinkedIn settings:", error);
    }
  };

  const resetScheduleDefaults = () => {
    setSchedule([
      { day: "Mon", enabled: true, start: 540, end: 1020 },
      { day: "Tue", enabled: true, start: 540, end: 1020 },
      { day: "Wed", enabled: true, start: 540, end: 1020 },
      { day: "Thu", enabled: true, start: 540, end: 1020 },
      { day: "Fri", enabled: true, start: 540, end: 1020 },
      { day: "Sat", enabled: false, start: 540, end: 1020 },
      { day: "Sun", enabled: false, start: 540, end: 1020 },
    ]);
  };

  const resetWarmupDefaults = () => {
    setVariabilityPct(20);
  };

  const resetLimitsDefaults = () => {
    // Reset all Limit Manager values to recommended defaults
    setMaxPendingConnections(1800);
    setWeeklyConnectionRequests(100);
    setCrVariability(20);
    setWarmupEnabled(true);
    setCrStartingPerDay(5);
    setCrWarmupDays(15);
    setDirectMessages(75);
    setMsgVariability(20);
    setMsgStartingPerDay(25);
    setMsgWarmupDays(3);
  };

  const getCurrentTime = () => {
    const now = new Date();
    return now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? "pm" : "am";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`;
  };

  const toggleDay = (day: string) => {
    setSchedule((prev) =>
      prev.map((dayConfig) =>
        dayConfig.day === day
          ? { ...dayConfig, enabled: !dayConfig.enabled }
          : dayConfig,
      ),
    );
  };

  useEffect(() => {
    const total = weeklyConnectionRequests;
    const defaultSplit = Math.floor(total / 2);
    setConnectionWithMessage(defaultSplit);
    setConnectionWithoutMessage(total - defaultSplit);
  }, [weeklyConnectionRequests, autoDistribute]);

  const handleConnectionWithMessageChange = (value: number) => {
    const newWithMessage = Math.max(0, value);
    const total = weeklyConnectionRequests;
    const newWithoutMessage = Math.max(0, total - newWithMessage);
    setConnectionWithMessage(newWithMessage);
    setConnectionWithoutMessage(newWithoutMessage);
  };

  const handleConnectionWithoutMessageChange = (value: number) => {
    const newWithoutMessage = Math.max(0, value);
    const total = weeklyConnectionRequests;
    const newWithMessage = Math.max(0, total - newWithoutMessage);
    setConnectionWithoutMessage(newWithoutMessage);
    setConnectionWithMessage(newWithMessage);
  };

  const handleCopyId = () => {
    if (account?.id) {
      navigator.clipboard.writeText(account.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleCleanContainer = async () => {
    if (!account) return;

    if (cleanContainerConfirmName !== account.fullName) {
      return;
    }

    setIsCleaningContainer(true);
    try {
      await onCleanContainer?.(account.id);
      setCleanContainerOpen(false);
      setCleanContainerConfirmName("");
    } catch (error) {
      console.error("Error cleaning container:", error);
    } finally {
      setIsCleaningContainer(false);
    }
  };

  const openCleanContainerDialog = () => {
    setCleanContainerConfirmName("");
    setCleanContainerOpen(true);
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={handleModalClose}>
        <DialogContent className="bg-[#0A0E1A] border-[#1E2433] max-w-5xl text-white p-0  max-h-[90vh] flex flex-col">
          <div className="sticky top-0 z-10 bg-[#0A0E1A] border-b border-[#1E2433] px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {showNameInHeader && (
                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-200">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                    {account?.fullName?.charAt(0) ?? "U"}
                  </div>
                  <span className="text-white font-medium">
                    {account?.fullName ?? "User Name"}
                  </span>
                  <span className="text-gray-500">|</span>
                </div>
              )}
              <div>
                <DialogTitle className="text-xl font-semibold text-white">
                  LinkedIn Account Settings
                </DialogTitle>
                <p className="text-xs text-gray-400 mt-1">
                  {isSavingInternal ? (
                    <span className="text-yellow-400">Saving...</span>
                  ) : saveSuccess ? (
                    <span className="text-green-400">✓ Changes saved</span>
                  ) : lastSaved ? (
                    `Last saved: ${Math.floor((new Date().getTime() - lastSaved.getTime()) / 1000)}s ago`
                  ) : (
                    "Changes save automatically"
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleModalClose(false)}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-6 py-6 space-y-12 scrollbar-hide"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                      {account?.fullName?.charAt(0) ?? "U"}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {account?.fullName ?? "User Name"}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {account?.linkedinProfileUrl ?? "@username"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm text-gray-400 mb-2">Status</span>
                  <div className="flex items-center gap-3">
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                    <span className="text-sm text-white">
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6">
                <h2 className="text-lg font-semibold text-white">Overview</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyId}
                    className="border-[#2A3142] text-gray-400 hover:bg-[#1E2433] bg-transparent text-xs hover:text-white hover:border-none"
                  >
                    {copiedId ? (
                      <>
                        <Check className="h-3 w-3 mr-1 text-green-400" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 mr-1" />
                        Copy ID
                      </>
                    )}
                  </Button>
                  <LogsViewerTrigger
                    buttonText="Show Logs"
                    buttonVariant="outline"
                    initialFilters={{ linkedinId: account?.id }}
                    title="LinkedIn Account Logs"
                  />
                  {canCleanContainer && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openCleanContainerDialog}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400 hover:border-none bg-transparent text-xs"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clean Container
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 ">
                <div className="p-4">
                  <h3 className="text-sm text-gray-400 mb-3">
                    LinkedIn Login Status
                  </h3>
                  <div className="flex flex-col gap-1 ">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium w-fit ${
                        account?.loginActiveLastValidated &&
                        new Date(account.loginActiveLastValidated).getTime() >
                          Date.now() - 2 * 24 * 60 * 60 * 1000
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {account?.loginActiveLastValidated &&
                      new Date(account.loginActiveLastValidated).getTime() >
                        Date.now() - 2 * 24 * 60 * 60 * 1000
                        ? "Logged in"
                        : "Not logged in"}
                    </span>
                    {account?.loginActiveLastValidated && (
                      <span className="text-xs text-gray-400 mt-1">
                        Last checked:{" "}
                        {new Date(
                          account.loginActiveLastValidated,
                        ).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-sm text-gray-400 mb-3">
                    Sales Navigator Status
                  </h3>
                  <div className="flex flex-col gap-1">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium w-fit ${
                        account?.salesNavigatorActiveLastValidated
                          ? "bg-green-500/20 text-green-400"
                          : "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {account?.salesNavigatorActiveLastValidated
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-sm text-gray-400 mb-3">Connections</h3>
                  <div className="flex flex-col gap-1">
                    <span className="text-2xl font-bold text-white flex items-center gap-2">
                      {account?.connections ?? 0}
                      <Button
                        onClick={handleSyncConnections}
                        disabled={isSyncingConnections || !onSyncConnections}
                        size="sm"
                        variant="outline"
                        title="Sync Connections"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${isSyncingConnections ? "animate-spin" : ""}`}
                        />
                      </Button>
                    </span>
                  </div>
                </div>
              </div>

              {/* Today's Settings */}
              <h2 className="text-lg mt-6 font-semibold text-white">Today</h2>
              <div className="grid grid-cols-3 gap-4">
                {/* Today's Executable Window */}
                <div className="p-4">
                  <h3 className="text-sm text-gray-400 mb-3">
                    Executable Window
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-white">
                      {todayWindowStart && todayWindowEnd
                        ? `${formatTimeTo12hr(todayWindowStart)} - ${formatTimeTo12hr(todayWindowEnd)}`
                        : "Not set"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTodayWindowModalOpen(true)}
                      className="text-gray-400 hover:text-white hover:bg-[#1E2433] p-1 h-auto "
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {account?.timezone}
                  </p>
                </div>

                {/* Today's Max Connections */}
                <div className="p-4">
                  <h3 className="text-sm text-gray-400 mb-3">
                    Max Connection Requests
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-white">
                      {useSystemDefaultMaxConnections
                        ? SYSTEM_DEFAULT_MAX_CONNECTIONS
                        : todayMaxConnections}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTempMaxConnections(
                          useSystemDefaultMaxConnections
                            ? SYSTEM_DEFAULT_MAX_CONNECTIONS
                            : todayMaxConnections,
                        );
                        setTempUseSystemDefaultMaxConnections(
                          useSystemDefaultMaxConnections,
                        );
                        setMaxConnectionsModalOpen(true);
                      }}
                      className="text-gray-400 hover:text-white hover:bg-[#1E2433] p-1 h-auto hover:text-white hover:border-none"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* <p
                    className={`text-xs mt-1 ${useSystemDefaultMaxConnections ? "text-gray-400" : "text-red-400"}`}
                  >
                    {useSystemDefaultMaxConnections
                      ? "Using System Defaults"
                      : "Using User Inputs"}
                  </p> */}
                </div>

                {/* Max Consecutive Errors */}
                <div className="p-4">
                  <h3 className="text-sm text-gray-400 mb-3">
                    Max Allowed Errors
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-white">
                      {useSystemDefaultMaxErrors
                        ? `${defaultSettings?.maxConsecutiveLinkedinFailures ?? SYSTEM_DEFAULT_MAX_ERRORS}`
                        : maxConsecutiveErrors}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTempMaxErrors(
                          useSystemDefaultMaxErrors
                            ? SYSTEM_DEFAULT_MAX_ERRORS
                            : maxConsecutiveErrors,
                        );
                        setTempUseSystemDefaultMaxErrors(
                          useSystemDefaultMaxErrors,
                        );
                        setMaxErrorsModalOpen(true);
                      }}
                      className="text-gray-400 hover:text-white hover:bg-[#1E2433] p-1 h-auto hover:text-white hover:border-none"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                  <p
                    className={`text-xs mt-1 ${useSystemDefaultMaxErrors ? "text-gray-400" : "text-red-400"}`}
                  >
                    {useSystemDefaultMaxErrors
                      ? "Using System Defaults"
                      : "Using User Inputs"}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-[#2A3142]" />

            {/* Proxy Configuration */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-white">
                  Proxy Configuration
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-2">
                    Proxy URL
                  </label>
                  <Input
                    value={proxyUrl || "No proxy configured"}
                    disabled
                    className="bg-[#0F1423] border-[#2A3142] text-gray-400 placeholder:text-gray-500"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setTempProxyUrl(proxyUrl);
                    setProxyModalOpen(true);
                  }}
                  className="mt-6 border-[#2A3142] text-white hover:bg-[#1E2433] bg-transparent hover:text-white hover:border-none"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </div>
            </div>
            <div className="border-t border-[#2A3142]" />

            {/* Invite Manager */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">
                  Limit Manager
                </h2>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetLimitsDefaults}
                  className="text-gray-400 border-[#2A3142] hover:bg-[#1E2433] bg-transparent text-xs hover:text-white hover:border-none"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Reset to Recommended
                </Button>
              </div>

              {/* Max Pending Connections */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm text-white">
                    Max Pending Connection Requests
                  </label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-[#1E293B] text-white border-[#2A3142] max-w-xs">
                      <p className="text-xs">
                        Manage pending connection invites to stay below
                        LinkedIn&apos;s 2,000 limit. Invites are automatically
                        withdrawn to make room for new outreach.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  type="number"
                  value={maxPendingConnections}
                  onChange={(e) => {
                    const val = sanitizeNumberInput(e.target.value, 1, 2000);
                    if (val !== null) setMaxPendingConnections(val);
                  }}
                  min={1}
                  max={2000}
                  className="bg-[#0F1423] border-[#2A3142] text-white w-22"
                />
              </div>
              <div>
                <h3 className="text-base font-medium text-white mb-4">
                  Weekly Limits
                </h3>

                <div className="flex items-start gap-6">
                  <label className="text-sm flex items-center gap-2 text-white min-w-[180px] pt-6">
                    Connection Requests
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#1E293B] text-white border-[#2A3142] max-w-xs">
                        <p className="text-xs">
                          The weekly limit is the number of connection requests
                          that will be sent in a week.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </label>
                  <div className="relative flex-1 min-w-[300px]">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>0</span>
                      <span>200</span>
                    </div>
                    <div
                      className="absolute -top-1 bg-[#1E293B] text-white text-xs px-2 py-1 rounded-full pointer-events-none z-10"
                      style={{
                        left: `calc(${(weeklyConnectionRequests / 200) * 100}% - 16px)`,
                      }}
                    >
                      {weeklyConnectionRequests}
                    </div>
                    <Slider
                      value={[weeklyConnectionRequests]}
                      onValueChange={(val) =>
                        setWeeklyConnectionRequests(val[0])
                      }
                      max={200}
                      step={1}
                      className="[&_[role=slider]]:bg-white [&_[role=slider]]:h-5 [&_[role=slider]]:w-5  [&>span>span]:bg-[#76C796] mt-4"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Note: Only the first 100 connection requests will be sent with a
                message. The rest will be sent without a message.
              </p>
              <div className="mb-8">
                <h3 className="text-base font-medium text-white mb-4">
                  Daily Limits
                </h3>

                <div className="space-y-6">
                  <div className="flex items-start gap-6">
                    <label className="text-sm flex items-center gap-2 text-white min-w-[180px] pt-6">
                      Connection Requests
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="bg-[#1E293B] text-white border-[#2A3142] max-w-xs">
                          <p className="text-xs">
                            The daily limit is the maximum number of connection
                            requests that will be sent in a day.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </label>
                    <div className="relative flex-1 min-w-[300px]">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>0</span>
                        <span>50</span>
                      </div>
                      <div
                        className="absolute -top-1 bg-[#1E293B] text-white text-xs px-2 py-1 rounded-full pointer-events-none z-10"
                        style={{
                          left: `calc(${(dailyConnectionRequests / 50) * 100}% - 16px)`,
                        }}
                      >
                        {dailyConnectionRequests}
                      </div>
                      <Slider
                        value={[dailyConnectionRequests]}
                        onValueChange={(val) =>
                          setDailyConnectionRequests(val[0])
                        }
                        max={50}
                        step={1}
                        className="[&_[role=slider]]:bg-white [&_[role=slider]]:h-5 [&_[role=slider]]:w-5  [&>span>span]:bg-[#76C796] mt-4"
                      />
                    </div>
                  </div>
                  {/* Warmup for Connection Requests */}
                  <div className="ml-5 mt-6 space-y-4">
                    <div className="flex items-center gap-6">
                      <label className="text-sm text-white min-w-[180px]">
                        Variability (%)
                      </label>
                      <Input
                        type="number"
                        value={crVariability}
                        onChange={(e) => {
                          const val = sanitizeNumberInput(
                            e.target.value,
                            1,
                            100,
                          );
                          if (val !== null) setCrVariability(val);
                        }}
                        min={1}
                        max={100}
                        className="bg-[#0F1423] border-[#2A3142] text-white w-16 -ml-5"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="warmupEnabled"
                        checked={warmupEnabled}
                        onCheckedChange={(checked) =>
                          setWarmupEnabled(checked === true)
                        }
                        className="border-gray-400 data-[state=checked]:bg-white data-[state=checked]:border-white data-[state=checked]:text-black"
                      />
                      <label
                        htmlFor="warmupEnabled"
                        className="text-sm text-white cursor-pointer"
                      >
                        Enable Warmup
                      </label>
                    </div>
                    <div
                      className={`flex items-center gap-6 ${!warmupEnabled ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <h4 className="text-sm text-white min-w-[180px] -mt-3">
                        Warmup Settings
                      </h4>
                      <div className="flex flex-col items-left gap-1 -ml-5">
                        <Input
                          type="number"
                          value={crStartingPerDay}
                          onChange={(e) => {
                            const val = sanitizeNumberInput(
                              e.target.value,
                              1,
                              200,
                            );
                            if (val !== null) setCrStartingPerDay(val);
                          }}
                          min={1}
                          max={200}
                          className="bg-[#0F1423] border-[#2A3142] text-white w-16"
                          disabled={!warmupEnabled}
                        />
                        <label className="text-xs text-gray-400">
                          Starting CR/day
                        </label>
                      </div>
                      <div className="flex flex-col items-left gap-1">
                        <Input
                          type="number"
                          value={crWarmupDays}
                          onChange={(e) => {
                            const val = sanitizeNumberInput(
                              e.target.value,
                              1,
                              365,
                            );
                            if (val !== null) setCrWarmupDays(val);
                          }}
                          min={1}
                          max={365}
                          className="bg-[#0F1423] border-[#2A3142] text-white w-16"
                          disabled={!warmupEnabled}
                        />
                        <label className="text-xs text-gray-400">
                          Timeframe (Sending days)
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-6">
                    <label className="text-sm text-white min-w-[180px] pt-6">
                      Direct Messages
                    </label>
                    <div className="relative flex-1 min-w-[300px]">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>0</span>
                        <span>150</span>
                      </div>
                      <div
                        className="absolute -top-1 bg-[#1E293B] text-white text-xs px-2 py-1 rounded-full pointer-events-none z-10"
                        style={{
                          left: `calc(${(directMessages / 150) * 100}% - 16px)`,
                        }}
                      >
                        {directMessages}
                      </div>
                      <Slider
                        value={[directMessages]}
                        onValueChange={(val) => setDirectMessages(val[0])}
                        max={150}
                        step={1}
                        className="[&_[role=slider]]:bg-white [&_[role=slider]]:h-5 [&_[role=slider]]:w-5  [&>span>span]:bg-[#76C796] mt-4"
                      />
                    </div>
                  </div>

                  {/* Warmup for Direct Messages */}
                  <div className="ml-5 mt-6 space-y-4">
                    <div className="flex items-center gap-6">
                      <h4 className="text-sm text-white min-w-[180px]  -mt-3">
                        Warmup
                      </h4>
                      <div className="flex flex-col items-left gap-1 -ml-5">
                        <Input
                          type="number"
                          value={msgStartingPerDay}
                          onChange={(e) => {
                            const val = sanitizeNumberInput(
                              e.target.value,
                              1,
                              150,
                            );
                            if (val !== null) setMsgStartingPerDay(val);
                          }}
                          min={1}
                          max={150}
                          className="bg-[#0F1423] border-[#2A3142] text-white w-16"
                        />
                        <label className="text-xs text-gray-400">
                          Starting Msgs/day
                        </label>
                      </div>
                      <div className="flex flex-col items-left gap-1 ">
                        <Input
                          type="number"
                          value={msgWarmupDays}
                          onChange={(e) => {
                            const val = sanitizeNumberInput(
                              e.target.value,
                              1,
                              365,
                            );
                            if (val !== null) setMsgWarmupDays(val);
                          }}
                          min={1}
                          max={365}
                          className="bg-[#0F1423] border-[#2A3142] text-white w-16"
                        />
                        <label className="text-xs text-gray-400">
                          Timeframe (days)
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-[#2A3142]" />
            {/* Schedule Section */}
            <div className="space-y-6 ">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-white">Schedule</h2>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-[#1E293B] text-white border-[#2A3142] max-w-xs">
                      <p className="text-xs">
                        Recommended: 8-12 hours per day to appear human and
                        avoid LinkedIn flags
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetScheduleDefaults}
                  className="text-gray-400 border-[#2A3142] hover:bg-[#1E2433] bg-transparent text-xs hover:text-white hover:border-none"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Reset to Recommended
                </Button>
              </div>

              {/* Use Team Settings checkbox */}
              <div className="flex items-center gap-3">
                <Checkbox
                  id="useTeamSettings"
                  checked={useTeamSettings}
                  onCheckedChange={(checked) =>
                    handleUseTeamSettingsChange(checked === true)
                  }
                  className="border-gray-400 data-[state=checked]:bg-white data-[state=checked]:border-white data-[state=checked]:text-black"
                />
                <label
                  htmlFor="useTeamSettings"
                  className="text-sm text-white cursor-pointer"
                >
                  Use Team Settings
                </label>
              </div>

              <div
                className={`space-y-2 ${useTeamSettings ? "opacity-50 pointer-events-none" : ""}`}
              >
                <p className="text-xs text-gray-400 ">
                  Timezone : {account?.timezone}
                </p>
                {displaySchedule.map((config) => (
                  <div
                    key={config.day}
                    className="flex items-center gap-4 py-3 relative"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={config.day}
                        checked={config.enabled}
                        onCheckedChange={() => toggleDay(config.day)}
                        className="border-gray-400 data-[state=checked]:bg-white data-[state=checked]:border-white data-[state=checked]:text-black"
                        disabled={useTeamSettings}
                      />
                    </div>
                    <label
                      htmlFor={config.day}
                      className="text-sm text-white w-12 capitalize"
                    >
                      {config.day}
                    </label>
                    {config.enabled && (
                      <div className="flex-1 flex items-center gap-4">
                        <div className="flex-1 relative">
                          <div className="absolute -top-6 left-0 right-0 pointer-events-none">
                            {(() => {
                              const startPercent = (config.start / 1440) * 100;
                              const endPercent = (config.end / 1440) * 100;
                              const percentDiff = endPercent - startPercent;
                              const labelsOverlap = percentDiff < 15;

                              return (
                                <>
                                  <div
                                    className={`absolute text-xs text-gray-400 whitespace-nowrap ${
                                      labelsOverlap
                                        ? "translate-x-0"
                                        : startPercent < 10
                                          ? "translate-x-0"
                                          : startPercent > 90
                                            ? "-translate-x-full"
                                            : "-translate-x-1/2"
                                    }`}
                                    style={{
                                      left: labelsOverlap
                                        ? "0%"
                                        : `${startPercent}%`,
                                    }}
                                  >
                                    {formatTime(config.start)}
                                  </div>
                                  <div
                                    className={`absolute text-xs text-gray-400 whitespace-nowrap ${
                                      labelsOverlap
                                        ? "-translate-x-full"
                                        : endPercent > 90
                                          ? "-translate-x-full"
                                          : endPercent < 10
                                            ? "translate-x-0"
                                            : "-translate-x-1/2"
                                    }`}
                                    style={{
                                      left: labelsOverlap
                                        ? "100%"
                                        : `${endPercent}%`,
                                    }}
                                  >
                                    {formatTime(config.end)}
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                          <Slider
                            value={[config.start, config.end]}
                            onValueChange={(value) => {
                              setSchedule((prev) =>
                                prev.map((dayConfig) =>
                                  dayConfig.day === config.day
                                    ? {
                                        ...dayConfig,
                                        start: value[0],
                                        end: value[1],
                                      }
                                    : dayConfig,
                                ),
                              );
                            }}
                            max={1440}
                            step={15}
                            minStepsBetweenThumbs={1}
                            className="[&_[role=slider]]:bg-white [&_[role=slider]]:h-5 [&_[role=slider]]:w-5  [&>span>span]:bg-[#76C796]"
                            disabled={useTeamSettings}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Proxy Edit Modal */}
      <Dialog open={proxyModalOpen} onOpenChange={setProxyModalOpen}>
        <DialogContent className="bg-[#14182A] border-[#2A3142] max-w-md">
          <DialogTitle className="text-white text-lg font-semibold">
            Edit Proxy Configuration
          </DialogTitle>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Proxy URL
              </label>
              <Input
                value={tempProxyUrl}
                onChange={(e) => setTempProxyUrl(e.target.value)}
                placeholder="http://proxy.example.com:8080"
                className="bg-[#0F1423] border-[#2A3142] text-white placeholder:text-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Format: http://username:password@proxy.example.com:8080
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setProxyModalOpen(false)}
                className="border-[#2A3142] text-white hover:bg-[#1E2433] bg-transparent hover:text-white hover:border-none"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setProxyUrl(tempProxyUrl);
                  setProxyModalOpen(false);
                }}
                className="bg-white text-black hover:bg-gray-200/40 hover:text-white hover:border-none"
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Max Connection Requests Edit Modal */}
      <Dialog
        open={maxConnectionsModalOpen}
        onOpenChange={setMaxConnectionsModalOpen}
      >
        <DialogContent className="bg-[#14182A] border-[#2A3142] max-w-md">
          <DialogTitle className="text-white text-lg font-semibold">
            Edit Max Connection Requests
          </DialogTitle>
          <div className="space-y-4 mt-4">
            {/* <div className="flex items-center gap-3">
              <Checkbox
                id="tempUseSystemDefaultMaxConnections"
                checked={tempUseSystemDefaultMaxConnections}
                onCheckedChange={(checked) => {
                  setTempUseSystemDefaultMaxConnections(checked === true);
                  if (checked) {
                    setTempMaxConnections(SYSTEM_DEFAULT_MAX_CONNECTIONS);
                  }
                }}
                className="border-gray-400 data-[state=checked]:bg-white data-[state=checked]:border-white data-[state=checked]:text-black"
              />
              <label
                htmlFor="tempUseSystemDefaultMaxConnections"
                className="text-sm text-white cursor-pointer"
              >
                Use System Defaults
              </label>
            </div> */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Max Connection Requests
              </label>
              <Input
                type="number"
                value={tempMaxConnections}
                onChange={(e) => {
                  const val = sanitizeNumberInput(e.target.value, 1);
                  if (val !== null) setTempMaxConnections(val);
                }}
                min={1}
                disabled={tempUseSystemDefaultMaxConnections}
                className={`bg-[#0F1423] border-[#2A3142] text-white w-24 ${tempUseSystemDefaultMaxConnections ? "opacity-50" : ""}`}
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setMaxConnectionsModalOpen(false)}
                className="border-[#2A3142] text-white hover:bg-[#1E2433] bg-transparent hover:text-white hover:border-none"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setUseSystemDefaultMaxConnections(
                    tempUseSystemDefaultMaxConnections,
                  );
                  if (!tempUseSystemDefaultMaxConnections) {
                    setTodayMaxConnections(tempMaxConnections);
                  } else {
                    setTodayMaxConnections(SYSTEM_DEFAULT_MAX_CONNECTIONS);
                  }
                  setMaxConnectionsModalOpen(false);
                }}
                className="bg-white text-black hover:bg-gray-200/40 hover:text-white hover:border-none"
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Max Allowed Errors Edit Modal */}
      <Dialog open={maxErrorsModalOpen} onOpenChange={setMaxErrorsModalOpen}>
        <DialogContent className="bg-[#14182A] border-[#2A3142] max-w-md">
          <DialogTitle className="text-white text-lg font-semibold">
            Edit Max Allowed Errors
          </DialogTitle>
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <Checkbox
                id="tempUseSystemDefaultMaxErrors"
                checked={tempUseSystemDefaultMaxErrors}
                onCheckedChange={(checked) => {
                  setTempUseSystemDefaultMaxErrors(checked === true);
                  if (checked) {
                    setTempMaxErrors(SYSTEM_DEFAULT_MAX_ERRORS);
                  }
                }}
                className="border-gray-400 data-[state=checked]:bg-white data-[state=checked]:border-white data-[state=checked]:text-black"
              />
              <label
                htmlFor="tempUseSystemDefaultMaxErrors"
                className="text-sm text-white cursor-pointer"
              >
                Use System Defaults
              </label>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Max Allowed Errors
              </label>
              <Input
                type="number"
                value={tempMaxErrors}
                onChange={(e) => {
                  const val = sanitizeNumberInput(e.target.value, 1);
                  if (val !== null) setTempMaxErrors(val);
                }}
                min={1}
                disabled={tempUseSystemDefaultMaxErrors}
                className={`bg-[#0F1423] border-[#2A3142] text-white w-24 ${tempUseSystemDefaultMaxErrors ? "opacity-50" : ""}`}
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setMaxErrorsModalOpen(false)}
                className="border-[#2A3142] text-white hover:bg-[#1E2433] bg-transparent hover:text-white hover:border-none"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setUseSystemDefaultMaxErrors(tempUseSystemDefaultMaxErrors);
                  if (!tempUseSystemDefaultMaxErrors) {
                    setMaxConsecutiveErrors(tempMaxErrors);
                  } else {
                    setMaxConsecutiveErrors(SYSTEM_DEFAULT_MAX_ERRORS);
                  }
                  setMaxErrorsModalOpen(false);
                }}
                className="bg-white text-black hover:bg-gray-200/40 hover:text-white hover:border-none"
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Today's Window Edit Modal */}
      <Dialog
        open={todayWindowModalOpen}
        onOpenChange={setTodayWindowModalOpen}
      >
        <DialogContent className="bg-[#14182A] border-[#2A3142] max-w-md">
          <DialogTitle className="text-white text-lg font-semibold">
            Edit Today&apos;s Executable Window
          </DialogTitle>
          <div className="space-y-4 mt-4">
            {/* Start Time */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Start Time
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={startHours}
                  onChange={(e) => {
                    const sanitized = e.target.value.replace(/^0+/, "") || "";
                    if (sanitized === "") {
                      setStartHours("");
                      return;
                    }
                    const num = parseInt(sanitized, 10);
                    if (!isNaN(num) && num >= 1 && num <= 12) {
                      setStartHours(num.toString());
                    }
                  }}
                  min={1}
                  max={12}
                  placeholder="12"
                  className="bg-[#0F1423] border-[#2A3142] text-white w-16 text-center"
                />
                <span className="text-white">:</span>
                <Input
                  type="number"
                  value={startMinutes}
                  onChange={(e) => {
                    const sanitized = e.target.value.replace(/^0+/, "") || "0";
                    const num = parseInt(sanitized, 10);
                    if (!isNaN(num) && num >= 0 && num <= 59) {
                      setStartMinutes(num.toString().padStart(2, "0"));
                    }
                  }}
                  min={0}
                  max={59}
                  placeholder="00"
                  className="bg-[#0F1423] border-[#2A3142] text-white w-16 text-center"
                />
                <Select
                  value={startPeriod}
                  onValueChange={(v) => setStartPeriod(v as "am" | "pm")}
                >
                  <SelectTrigger className="bg-[#0F1423] border-[#2A3142] text-white w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#14182A] border-[#2A3142]">
                    <SelectItem value="am" className="text-white">
                      am
                    </SelectItem>
                    <SelectItem value="pm" className="text-white">
                      pm
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* End Time */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                End Time
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={endHours}
                  onChange={(e) => {
                    const sanitized = e.target.value.replace(/^0+/, "") || "";
                    if (sanitized === "") {
                      setEndHours("");
                      return;
                    }
                    const num = parseInt(sanitized, 10);
                    if (!isNaN(num) && num >= 1 && num <= 12) {
                      setEndHours(num.toString());
                    }
                  }}
                  min={1}
                  max={12}
                  placeholder="12"
                  className="bg-[#0F1423] border-[#2A3142] text-white w-16 text-center"
                />
                <span className="text-white">:</span>
                <Input
                  type="number"
                  value={endMinutes}
                  onChange={(e) => {
                    const sanitized = e.target.value.replace(/^0+/, "") || "0";
                    const num = parseInt(sanitized, 10);
                    if (!isNaN(num) && num >= 0 && num <= 59) {
                      setEndMinutes(num.toString().padStart(2, "0"));
                    }
                  }}
                  min={0}
                  max={59}
                  placeholder="00"
                  className="bg-[#0F1423] border-[#2A3142] text-white w-16 text-center"
                />
                <Select
                  value={endPeriod}
                  onValueChange={(v) => setEndPeriod(v as "am" | "pm")}
                >
                  <SelectTrigger className="bg-[#0F1423] border-[#2A3142] text-white w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#14182A] border-[#2A3142]">
                    <SelectItem value="am" className="text-white">
                      am
                    </SelectItem>
                    <SelectItem value="pm" className="text-white">
                      pm
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setTodayWindowModalOpen(false)}
                className="border-[#2A3142] text-white hover:bg-gray-200/40 hover:text-white hover:border-none bg-transparent"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clean Container Confirmation Modal */}
      <Dialog open={cleanContainerOpen} onOpenChange={setCleanContainerOpen}>
        <DialogContent className="bg-[#14182A] border-[#2A3142] max-w-md">
          <DialogTitle className="text-white text-lg font-semibold flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-400" />
            Clean Container
          </DialogTitle>
          <div className="space-y-4 mt-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm text-red-200">
                This will delete all the cached browser data and clean the
                container for <strong>{account?.fullName}</strong>.
              </p>
              <p className="text-sm text-red-200 mt-2">
                This action cannot be undone.
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Type <strong>{account?.fullName}</strong> to confirm
              </label>
              <Input
                value={cleanContainerConfirmName}
                onChange={(e) => setCleanContainerConfirmName(e.target.value)}
                placeholder={`Type "${account?.fullName}" to confirm`}
                className="bg-[#0F1423] border-[#2A3142] text-white placeholder:text-gray-500"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setCleanContainerOpen(false)}
                className="border-[#2A3142] text-white hover:bg-gray-200/40 hover:text-white hover:border-none bg-transparent"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCleanContainer}
                disabled={
                  cleanContainerConfirmName !== account?.fullName ||
                  isCleaningContainer
                }
                className="bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCleaningContainer ? "Cleaning..." : "Clean Container"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
