import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useCampaignStepStore } from "@/store/useCampaignStepStore";
import { useTeamStore } from "@/store/useTeamStore";
import { useTeamData } from "@/hooks/useTeamData";

// Mock types for demonstration
interface WeeklyRestrictionsInput {
  [key: string]: any;
}

interface DailyRestrictionInput {
  startTime: string;
  endTime: string;
}

interface AllowedMessagingDayTimes {
  [key: string]: any;
}

interface DaySelection {
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
  sun: boolean;
}

interface DayTimeWindow {
  mon: [number, number];
  tue: [number, number];
  wed: [number, number];
  thu: [number, number];
  fri: [number, number];
  sat: [number, number];
  sun: [number, number];
}

interface SchedulePickerProps {
  timeWindow: [number, number];
  selectedDays: DaySelection;
  onTimeWindowChange: (value: [number, number], day: string) => void;
  onDaySelectionChange: (days: DaySelection) => void;
  isReadOnly?: boolean;
  weeklyRestrictions?: WeeklyRestrictionsInput | AllowedMessagingDayTimes;
  onWeeklyRestrictionsChange?: (
    restrictions: WeeklyRestrictionsInput | null,
  ) => void;
  campaignSettings?: AllowedMessagingDayTimes;
  teamSettings?: AllowedMessagingDayTimes; // Team settings for fallback when campaign settings are null
  onUseCampaignSettingsChange?: (useCampaignSettings: boolean) => void;
  // New props for auto-save functionality
  stepId?: string;
  teamId?: string;
  campaignId?: string;

  mode?: "add" | "edit"; // Add mode prop to know when we're adding a new node

  // Indicates if the step's actual weeklyRestrictions is null (using parent settings)
  isUsingParentSettings?: boolean;

  // Callbacks for parent component integration
  onSaveComplete?: () => void; // Called when save completes successfully
  onUnsavedChangesChange?: (hasUnsaved: boolean) => void; // Called when unsaved changes state changes
  onSaveStart?: () => void; // Called when save starts
  // Register methods for parent to control save behavior
  onRegisterMethods?: (methods: {
    cancelSave: () => void;
    forceSave: () => Promise<void>;
    hasUnsavedChanges: () => boolean;
    discardChanges: () => void;
  }) => void;
}

// Map between short day keys (UI) and full day keys (API)
const DAY_KEYS_MAP = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
} as const;

const DAY_LABELS = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
} as const;

export const SchedulePicker = ({
  timeWindow,
  selectedDays,
  onTimeWindowChange,
  onDaySelectionChange,
  isReadOnly = false,
  weeklyRestrictions,
  onWeeklyRestrictionsChange,
  campaignSettings,
  teamSettings,
  onUseCampaignSettingsChange,
  stepId,
  teamId,
  campaignId,
  mode = "edit", // Default to edit mode for backward compatibility
  isUsingParentSettings,
  onSaveComplete,
  onUnsavedChangesChange,
  onSaveStart,
  onRegisterMethods,
}: SchedulePickerProps) => {
  // Determine the effective parent settings (campaign settings if available, otherwise team settings)
  const effectiveParentSettings = useMemo(() => {
    // Check if campaign settings are valid (not null and has actual day data)
    const hasCampaignSettings = campaignSettings;

    if (hasCampaignSettings) {
      return campaignSettings;
    }
    // Fall back to team settings if campaign settings are null/empty
    return teamSettings || null;
  }, [campaignSettings, teamSettings]);
  // Initialize useCampaignSettings:
  // - For add mode: default to true (use parent settings)
  // - For edit mode: true only if isUsingParentSettings is true (weeklyRestrictions is null)
  const [useCampaignSettings, setUseCampaignSettings] = useState(
    mode === "add" ? !!effectiveParentSettings : !!isUsingParentSettings,
  );
  const { bulkUpdateSteps } = useCampaignStepStore();
  // Ensure we have valid timeWindow values (default to 9-17 if undefined)
  const validTimeWindow: [number, number] =
    Array.isArray(timeWindow) &&
    typeof timeWindow[0] === "number" &&
    typeof timeWindow[1] === "number"
      ? timeWindow
      : [9, 17];

  const [individualTimeWindows, setIndividualTimeWindows] =
    useState<DayTimeWindow>({
      mon: validTimeWindow,
      tue: validTimeWindow,
      wed: validTimeWindow,
      thu: validTimeWindow,
      fri: validTimeWindow,
      sat: validTimeWindow,
      sun: validTimeWindow,
    });

  // State for tracking unsaved changes and saving status
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const { allTeams } = useTeamData({
    includeAllTeams: true,
  });
  // Notify parent when unsaved changes state changes
  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  // Ref for debouncing saves (2 second buffer)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const SAVE_DEBOUNCE_MS = 1000; // 2 second buffer

  // Ref to track if changes were discarded (prevents unmount save)
  const discardedRef = useRef(false);

  // Ref to track if initial load is complete
  const isInitialLoadRef = useRef<boolean>(true);
  const lastWeeklyRestrictionsRef = useRef<string>("");

  // Refs to capture current state for save operation (avoiding dependency issues)
  const selectedDaysRef = useRef(selectedDays);
  const individualTimeWindowsRef = useRef(individualTimeWindows);
  const useCampaignSettingsRef = useRef(useCampaignSettings);

  // Keep refs in sync with state
  useEffect(() => {
    selectedDaysRef.current = selectedDays;
  }, [selectedDays]);

  useEffect(() => {
    individualTimeWindowsRef.current = individualTimeWindows;
  }, [individualTimeWindows]);

  useEffect(() => {
    useCampaignSettingsRef.current = useCampaignSettings;
  }, [useCampaignSettings]);

  // Helper function to parse time data (handles both string and number formats)
  const parseTimeValue = (timeValue: any): number => {
    if (typeof timeValue === "string") {
      // Handle "HH:MM:SS" format
      const [hours] = timeValue.split(":");
      return parseInt(hours, 10);
    } else if (typeof timeValue === "number") {
      return timeValue;
    }
    return 0; // fallback
  };

  // Parse parent settings (campaign or team) into display format
  const parsedCampaignSettings = useMemo(() => {
    if (!effectiveParentSettings) {
      return {
        days: {
          mon: false,
          tue: false,
          wed: false,
          thu: false,
          fri: false,
          sat: false,
          sun: false,
        } as DaySelection,
        timeWindows: {
          mon: [9, 17],
          tue: [9, 17],
          wed: [9, 17],
          thu: [9, 17],
          fri: [9, 17],
          sat: [9, 17],
          sun: [9, 17],
        } as DayTimeWindow,
      };
    }

    const campaignDays: DaySelection = {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    };

    const campaignTimeWindows: DayTimeWindow = {
      mon: [9, 17],
      tue: [9, 17],
      wed: [9, 17],
      thu: [9, 17],
      fri: [9, 17],
      sat: [9, 17],
      sun: [9, 17],
    };

    const dayMapping: Record<string, keyof DayTimeWindow> = {
      monday: "mon",
      tuesday: "tue",
      wednesday: "wed",
      thursday: "thu",
      friday: "fri",
      saturday: "sat",
      sunday: "sun",
    };

    Object.entries(effectiveParentSettings).forEach(([dayKey, dayData]) => {
      const shortDay = dayMapping[dayKey.toLowerCase()];
      if (!shortDay) return;

      if (Array.isArray(dayData) && dayData.length === 2) {
        const startHour = parseTimeValue(dayData[0]);
        const endHour = parseTimeValue(dayData[1]);
        campaignDays[shortDay] = true;
        campaignTimeWindows[shortDay] = [startHour, endHour];
      } else if (
        dayData &&
        dayData.startTime !== undefined &&
        dayData.endTime !== undefined
      ) {
        const startHour = parseTimeValue(dayData.startTime);
        const endHour = parseTimeValue(dayData.endTime);
        campaignDays[shortDay] = true;
        campaignTimeWindows[shortDay] = [startHour, endHour];
      }
    });

    return { days: campaignDays, timeWindows: campaignTimeWindows };
  }, [effectiveParentSettings]);

  // Compute display values: use campaign settings when useCampaignSettings is true
  const displaySelectedDays = useCampaignSettings
    ? parsedCampaignSettings.days
    : selectedDays;
  const displayTimeWindows = useCampaignSettings
    ? parsedCampaignSettings.timeWindows
    : individualTimeWindows;

  // Apply parent settings (campaign or team) to node settings when user checks the box
  const applyCampaignSettings = () => {
    if (!effectiveParentSettings) return;

    const newTimeWindows = { ...individualTimeWindows };
    const newSelectedDays = { ...selectedDays };

    // Reset all days first
    Object.keys(newSelectedDays).forEach((day) => {
      newSelectedDays[day as keyof DaySelection] = false;
    });

    // Apply parent settings
    Object.entries(effectiveParentSettings).forEach(([dayKey, dayData]) => {
      if (Array.isArray(dayData) && dayData.length === 2) {
        // Handle array format [startTime, endTime]
        const dayMapping: Record<string, keyof DayTimeWindow> = {
          monday: "mon",
          tuesday: "tue",
          wednesday: "wed",
          thursday: "thu",
          friday: "fri",
          saturday: "sat",
          sunday: "sun",
        };

        const shortDay = dayMapping[dayKey.toLowerCase()];
        if (shortDay) {
          const startHour = parseTimeValue(dayData[0]);
          const endHour = parseTimeValue(dayData[1]);

          newSelectedDays[shortDay] = true;
          newTimeWindows[shortDay] = [startHour, endHour];
        }
      } else if (
        dayData &&
        dayData.startTime !== undefined &&
        dayData.endTime !== undefined
      ) {
        // Handle object format with startTime/endTime properties
        const dayMapping: Record<string, keyof DayTimeWindow> = {
          monday: "mon",
          tuesday: "tue",
          wednesday: "wed",
          thursday: "thu",
          friday: "fri",
          saturday: "sat",
          sunday: "sun",
        };

        const shortDay = dayMapping[dayKey.toLowerCase()];
        if (shortDay) {
          const startHour = parseTimeValue(dayData.startTime);
          const endHour = parseTimeValue(dayData.endTime);

          newSelectedDays[shortDay] = true;
          newTimeWindows[shortDay] = [startHour, endHour];
        }
      }
    });

    setIndividualTimeWindows(newTimeWindows);
    onDaySelectionChange(newSelectedDays);

    // Apply parent settings to weekly restrictions
    if (onWeeklyRestrictionsChange) {
      const newRestrictions: WeeklyRestrictionsInput = {};

      Object.entries(effectiveParentSettings).forEach(([dayKey, dayData]) => {
        let startHour: number, endHour: number;

        if (Array.isArray(dayData) && dayData.length === 2) {
          startHour = parseTimeValue(dayData[0]);
          endHour = parseTimeValue(dayData[1]);
        } else if (
          dayData &&
          dayData.startTime !== undefined &&
          dayData.endTime !== undefined
        ) {
          startHour = parseTimeValue(dayData.startTime);
          endHour = parseTimeValue(dayData.endTime);
        } else {
          return; // Skip invalid entries
        }

        // Convert 24 to 00 for end-of-day when sending to backend API
        const endTimeHour = endHour === 24 ? 0 : endHour;

        newRestrictions[dayKey as keyof WeeklyRestrictionsInput] = {
          startTime: `${String(startHour).padStart(2, "0")}:00:00`,
          endTime: `${String(endTimeHour).padStart(2, "0")}:00:00`,
        };
      });

      onWeeklyRestrictionsChange(newRestrictions);
    }
  };

  // Reset individual time windows when timeWindow prop changes (node switch)
  useEffect(() => {
    // Ensure we have valid values when resetting
    const resetTimeWindow: [number, number] =
      Array.isArray(timeWindow) &&
      typeof timeWindow[0] === "number" &&
      typeof timeWindow[1] === "number"
        ? timeWindow
        : [9, 17];

    setIndividualTimeWindows({
      mon: resetTimeWindow,
      tue: resetTimeWindow,
      wed: resetTimeWindow,
      thu: resetTimeWindow,
      fri: resetTimeWindow,
      sat: resetTimeWindow,
      sun: resetTimeWindow,
    });
    // Mark that we need to reload from weeklyRestrictions
    isInitialLoadRef.current = true;
  }, [mode, timeWindow]);

  // Auto-apply parent settings when in add mode
  useEffect(() => {
    if (mode === "add" && effectiveParentSettings && !weeklyRestrictions) {
      applyCampaignSettings();
      setUseCampaignSettings(true);
      // Set weeklyRestrictions to null to indicate "use campaign settings"
      // This ensures new steps inherit from campaign rather than having explicit values
      if (onWeeklyRestrictionsChange) {
        onWeeklyRestrictionsChange(null);
      }
      if (onUseCampaignSettingsChange) {
        onUseCampaignSettingsChange(true);
      }
    }
  }, [mode, effectiveParentSettings]); // Only run when mode or effectiveParentSettings change

  // Set useCampaignSettings based on whether step's weeklyRestrictions is null
  // Only check the checkbox if the step is actually using parent settings (null weeklyRestrictions)
  useEffect(() => {
    if (mode === "add") {
      // In add mode, default to using parent settings
      setUseCampaignSettings(!!effectiveParentSettings);
    } else {
      // In edit mode, only check the box if weeklyRestrictions is actually null
      setUseCampaignSettings(!!isUsingParentSettings);
    }
  }, [mode, isUsingParentSettings, effectiveParentSettings]);

  // Initialize individual time windows from weeklyRestrictions when they change
  useEffect(() => {
    const weeklyRestrictionsStr = JSON.stringify(weeklyRestrictions);

    // Only load from weeklyRestrictions if:
    // 1. This is initial load, OR
    // 2. weeklyRestrictions actually changed (node switch)
    const shouldLoad =
      isInitialLoadRef.current ||
      weeklyRestrictionsStr !== lastWeeklyRestrictionsRef.current;

    if (
      weeklyRestrictions &&
      Object.keys(weeklyRestrictions).length > 0 &&
      shouldLoad
    ) {
      const newTimeWindows = { ...individualTimeWindows };

      // Helper function to convert time string to hour number
      const timeStringToHour = (timeString: string): number => {
        const [hours] = timeString.split(":");
        return parseInt(hours, 10);
      };

      // Update time windows for each day that has restrictions
      Object.entries(weeklyRestrictions).forEach(([dayKey, restriction]) => {
        if (restriction) {
          // Map full day names to short day keys
          const dayMapping: Record<string, keyof DayTimeWindow> = {
            monday: "mon",
            tuesday: "tue",
            wednesday: "wed",
            thursday: "thu",
            friday: "fri",
            saturday: "sat",
            sunday: "sun",
          };

          const shortDay = dayMapping[dayKey.toLowerCase()];
          if (shortDay && restriction.startTime && restriction.endTime) {
            const startHour = timeStringToHour(restriction.startTime);
            let endHour = timeStringToHour(restriction.endTime);
            // If endTime is 00:00:00 (from API), treat it as hour 24 (end of day)
            if (endHour === 0 && restriction.endTime.startsWith("00:")) {
              endHour = 24;
            }
            newTimeWindows[shortDay] = [startHour, endHour];
          }
        }
      });

      setIndividualTimeWindows(newTimeWindows);
      lastWeeklyRestrictionsRef.current = weeklyRestrictionsStr;
      isInitialLoadRef.current = false;
    }
  }, [JSON.stringify(weeklyRestrictions)]); // Use JSON.stringify for deep comparison

  // Note: The useCampaignSettings state is now controlled by isUsingParentSettings prop
  // which indicates if the step's actual weeklyRestrictions is null (using parent settings)
  // The checkbox is only checked when isUsingParentSettings is true, not based on matching values

  // Save schedule updates to backend using bulkUpdateSteps
  const saveScheduleUpdates = useCallback(async () => {
    // In add mode, don't save - the step doesn't exist yet
    if (mode === "add") {
      return;
    }

    if (
      !stepId ||
      !teamId ||
      !campaignId ||
      !bulkUpdateSteps ||
      isSaving ||
      isReadOnly
    ) {
      return;
    }

    // Prevent rapid consecutive saves
    if (lastSavedAt && new Date().getTime() - lastSavedAt.getTime() < 1000) {
      return;
    }

    try {
      setIsSaving(true);
      onSaveStart?.();

      // Use refs to get current state values (avoids dependency issues)
      const currentSelectedDays = selectedDaysRef.current;
      const currentIndividualTimeWindows = individualTimeWindowsRef.current;
      const currentUseCampaignSettings = useCampaignSettingsRef.current;

      // Determine weeklyRestrictions to save
      // If using campaign settings, save null to indicate "use campaign settings"
      let weeklyRestrictionsToSave: Record<string, any> | null = null;

      if (!currentUseCampaignSettings) {
        // Create weekly restrictions from current state
        const dayMapping: Record<string, string> = {
          mon: "monday",
          tue: "tuesday",
          wed: "wednesday",
          thu: "thursday",
          fri: "friday",
          sat: "saturday",
          sun: "sunday",
        };

        weeklyRestrictionsToSave = {};
        Object.entries(currentSelectedDays).forEach(
          ([uiDayKey, isSelected]) => {
            if (isSelected) {
              const apiDayKey = dayMapping[uiDayKey];
              const timeWindowForDay =
                currentIndividualTimeWindows[
                  uiDayKey as keyof typeof currentIndividualTimeWindows
                ];
              weeklyRestrictionsToSave![apiDayKey] = {
                startTime: `${String(timeWindowForDay[0]).padStart(2, "0")}:00:00`,
                // Convert 24 to 00 for end-of-day when saving to API
                endTime: `${String(timeWindowForDay[1] === 24 ? 0 : timeWindowForDay[1]).padStart(2, "0")}:00:00`,
              };
            }
          },
        );
      }

      // Create step mutation
      const stepMutation = {
        id: stepId,
        weeklyRestrictions: weeklyRestrictionsToSave,
      };
      const bulkUpdateInput = {
        stepCreations: [],
        stepMutations: [stepMutation],
        linkCreations: [],
        linkMutations: [],
      };

      const campaignIdStr =
        typeof campaignId === "string" ? campaignId : campaignId[0];
      if (bulkUpdateInput.stepMutations.length === 0) {
        return;
      }
      await bulkUpdateSteps(campaignIdStr, bulkUpdateInput);

      setLastSavedAt(new Date());
      setHasUnsavedChanges(false);
      onSaveComplete?.();
    } catch (error) {
      console.error("❌ Failed to save schedule updates:", error);
    } finally {
      setIsSaving(false);
    }
  }, [
    stepId,
    teamId,
    campaignId,
    bulkUpdateSteps,
    isSaving,
    isReadOnly,
    lastSavedAt,
    mode,
    // Removed selectedDays and individualTimeWindows from dependencies
    // Now using refs to access current values
  ]);

  // Debounced save trigger
  const triggerSave = useCallback(() => {
    if (isReadOnly) return;

    // In add mode, don't auto-save and don't track unsaved changes
    // The step doesn't exist yet - data will be included when step is created
    if (mode === "add") {
      return;
    }

    setHasUnsavedChanges(true);

    // Clear existing timeout - this resets the 2-second countdown
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for 2 seconds
    saveTimeoutRef.current = setTimeout(() => {
      saveScheduleUpdates();
    }, SAVE_DEBOUNCE_MS);
  }, [isReadOnly, mode, saveScheduleUpdates, SAVE_DEBOUNCE_MS]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save on unmount if there are unsaved changes (but not if discarded or in add mode)
  useEffect(() => {
    return () => {
      // Don't save on unmount in add mode - the step doesn't exist yet
      if (
        hasUnsavedChanges &&
        !isSaving &&
        !discardedRef.current &&
        mode !== "add"
      ) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveScheduleUpdates();
      }
    };
  }, [hasUnsavedChanges, isSaving, saveScheduleUpdates, mode]);

  // Register methods for parent component to control save behavior
  useEffect(() => {
    if (onRegisterMethods) {
      onRegisterMethods({
        cancelSave: () => {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
          }
        },
        forceSave: async () => {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
          }
          await saveScheduleUpdates();
        },
        hasUnsavedChanges: () => hasUnsavedChanges,
        discardChanges: () => {
          discardedRef.current = true;
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
          }
          setHasUnsavedChanges(false);
        },
      });
    }
  }, [onRegisterMethods, saveScheduleUpdates, hasUnsavedChanges]);

  const formatTime = (hour: number) => {
    const period = hour >= 12 ? "pm" : "am";
    const displayHour = hour % 12 || 12;
    return `${displayHour} ${period}`;
  };
  // Convert numeric hour to HH:MM:SS format required by the API
  const hourToTimeString = (hour: number): string => {
    return `${String(hour).padStart(2, "0")}:00:00`;
  };

  // Helper function to create a daily restriction input
  const createDailyRestrictionInput = (startHour: number, endHour: number) => {
    return {
      startTime: hourToTimeString(startHour),
      // Convert 24 to 00 for end-of-day when sending to backend API
      endTime: hourToTimeString(endHour === 24 ? 0 : endHour),
    };
  };

  const handleUseCampaignSettingsChange = (checked: boolean) => {
    setUseCampaignSettings(checked);

    // When using campaign settings, set weeklyRestrictions to null
    // This signals that the step should inherit from campaign settings
    if (checked) {
      applyCampaignSettings();
      // Set weeklyRestrictions to null to indicate using campaign settings
      if (onWeeklyRestrictionsChange) {
        onWeeklyRestrictionsChange(null);
      }
      // Trigger save after applying campaign settings
      triggerSave();
    } else {
      // When unchecking campaign settings, save the current time windows as custom settings
      // Build the weeklyRestrictions from current state
      const dayMapping: Record<string, string> = {
        mon: "monday",
        tue: "tuesday",
        wed: "wednesday",
        thu: "thursday",
        fri: "friday",
        sat: "saturday",
        sun: "sunday",
      };

      const newRestrictions: WeeklyRestrictionsInput = {};
      Object.entries(selectedDays).forEach(([uiDayKey, isSelected]) => {
        if (isSelected) {
          const apiDayKey = dayMapping[uiDayKey];
          const timeWindowForDay =
            individualTimeWindows[uiDayKey as keyof DayTimeWindow];
          newRestrictions[apiDayKey] = createDailyRestrictionInput(
            timeWindowForDay[0],
            timeWindowForDay[1],
          );
        }
      });

      if (onWeeklyRestrictionsChange) {
        onWeeklyRestrictionsChange(newRestrictions);
      }
      // Trigger save with the new custom restrictions
      triggerSave();
    }

    if (onUseCampaignSettingsChange) {
      onUseCampaignSettingsChange(checked);
    }
  };

  const handleDayChange = (day: keyof DaySelection, checked: boolean) => {
    // Don't allow changes if using campaign settings
    if (useCampaignSettings) return;

    // Update UI state
    onDaySelectionChange({
      ...selectedDays,
      [day]: checked,
    });

    // If we have direct API update handler, use it
    if (onWeeklyRestrictionsChange) {
      const apiDayKey = DAY_KEYS_MAP[day];
      const newRestrictions: WeeklyRestrictionsInput = {};

      // First convert existing restrictions if any
      if (weeklyRestrictions) {
        const converted = convertToWeeklyRestrictionsInput(weeklyRestrictions);
        Object.assign(newRestrictions, converted);
      }

      if (checked) {
        const dayWindow = individualTimeWindows[day];
        newRestrictions[apiDayKey] = createDailyRestrictionInput(
          dayWindow[0],
          dayWindow[1],
        );
      } else {
        if (newRestrictions[apiDayKey]) {
          delete newRestrictions[apiDayKey];
        }
      }

      onWeeklyRestrictionsChange(newRestrictions);
    }

    // Trigger debounced save
    triggerSave();
  };

  const handleIndividualTimeWindowChange = (
    day: keyof DaySelection,
    value: [number, number],
  ) => {
    // Don't allow changes if using campaign settings
    if (useCampaignSettings) return;

    // Update individual time window
    setIndividualTimeWindows((prev) => {
      const updated = {
        ...prev,
        [day]: value,
      };
      return updated;
    });

    // Don't update the global timeWindow - keep each day independent
    // Only update weekly restrictions if we have the handler and day is selected
    if (onWeeklyRestrictionsChange && selectedDays[day]) {
      const apiDayKey = DAY_KEYS_MAP[day];
      const newRestrictions: WeeklyRestrictionsInput = {};

      // First convert existing restrictions if any
      if (weeklyRestrictions) {
        const converted = convertToWeeklyRestrictionsInput(weeklyRestrictions);
        Object.assign(newRestrictions, converted);
      }

      newRestrictions[apiDayKey] = createDailyRestrictionInput(
        value[0],
        value[1],
      );

      console.log("Updating weeklyRestrictions:", newRestrictions);
      onWeeklyRestrictionsChange(newRestrictions);
    }

    // Trigger debounced save
    triggerSave();
  };

  // Convert from AllowedMessagingDayTimes to WeeklyRestrictionsInput if needed
  const convertToWeeklyRestrictionsInput = (
    restrictions:
      | AllowedMessagingDayTimes
      | WeeklyRestrictionsInput
      | undefined,
  ): WeeklyRestrictionsInput => {
    if (!restrictions) return {};

    const convertedRestrictions: WeeklyRestrictionsInput = {};

    const isAllowedMessagingDayTimes = (
      value: any,
    ): value is AllowedMessagingDayTimes => {
      return (
        value &&
        (typeof (value as any).sunday?.startTime === "number" ||
          typeof (value as any).monday?.startTime === "number")
      );
    };

    if (isAllowedMessagingDayTimes(restrictions)) {
      Object.entries(restrictions).forEach(([key, value]) => {
        if (!value) return;

        // Convert 24 to 00 for end-of-day when sending to backend API
        const endTimeHour = value.endTime === 24 ? 0 : value.endTime;

        convertedRestrictions[key as keyof WeeklyRestrictionsInput] = {
          startTime: `${String(value.startTime).padStart(2, "0")}:00:00`,
          endTime: `${String(endTimeHour).padStart(2, "0")}:00:00`,
        };
      });
    } else {
      // Restrictions are already in string format, but still need to convert 24:00:00 to 00:00:00
      const stringRestrictions = restrictions as WeeklyRestrictionsInput;
      Object.entries(stringRestrictions).forEach(([key, value]) => {
        if (!value) return;

        // Convert 24:00:00 to 00:00:00 for backend API
        let endTime = value.endTime;
        if (endTime === "24:00:00") {
          endTime = "00:00:00";
        }

        convertedRestrictions[key as keyof WeeklyRestrictionsInput] = {
          startTime: value.startTime,
          endTime: endTime,
        };
      });
    }

    return convertedRestrictions;
  };
  const { currentTeamId } = useTeamStore();
  const currentTeamData = useMemo(() => {
    const currentTeam = allTeams.find((team) => team.id === currentTeamId);
    return currentTeam || null;
  }, [allTeams, currentTeamId]);

  return (
    <div className=" rounded-lg  space-y-2">
      {effectiveParentSettings && (
        <div className="flex  items-center gap-2 py-3 relative">
          <Checkbox
            id="useCampaignSettings"
            checked={useCampaignSettings}
            onCheckedChange={(checked) =>
              handleUseCampaignSettingsChange(checked === true)
            }
            disabled={isReadOnly}
          />
          <Label htmlFor="useCampaignSettings">Use Campaign Settings</Label>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Timezone : {currentTeamData?.timeZone}
      </p>

      {(Object.entries(DAY_LABELS) as [keyof DaySelection, string][]).map(
        ([key, label]) => (
          <div
            key={key}
            className={
              "flex items-center gap-2 py-3 relative" +
              individualTimeWindows[key]
            }
          >
            {/* Checkbox and Day Label */}
            <div className="flex items-center gap-1 ">
              <Checkbox
                id={key}
                checked={displaySelectedDays[key]}
                onCheckedChange={(checked) =>
                  handleDayChange(key, checked === true)
                }
                disabled={isReadOnly || useCampaignSettings}
              />
            </div>

            <div
              className={`text-sm font-medium w-8 ${
                useCampaignSettings ? "text-slate-500" : "text-slate-300"
              }`}
            >
              {label}
            </div>

            {/* Time Display and Slider */}
            {displaySelectedDays[key] && (
              <div
                className={`flex-1 w-full flex items-center gap-1 ${
                  useCampaignSettings ? "opacity-50" : ""
                }`}
              >
                <div className="flex-1 relative w-full">
                  {/* Time labels above slider thumbs */}
                  <div className="absolute -top-6 left-0 right-0 pointer-events-none">
                    {(() => {
                      const startHour = displayTimeWindows[key][0];
                      const endHour = displayTimeWindows[key][1];
                      const hourDifference = endHour - startHour;

                      // Check if labels would overlap (less than 3 hours apart)
                      const labelsOverlap = hourDifference < 3;

                      return (
                        <>
                          <div
                            className={`absolute text-xs font-medium whitespace-nowrap ${
                              labelsOverlap
                                ? "translate-x-0" // Align to left
                                : startHour / 24 > 0.85
                                  ? "-translate-x-full"
                                  : startHour / 24 < 0.15
                                    ? "translate-x-0"
                                    : "-translate-x-1/2"
                            } ${
                              useCampaignSettings
                                ? "text-slate-500"
                                : "text-slate-300"
                            }`}
                            style={{
                              left: labelsOverlap
                                ? "0%"
                                : `${(startHour / 24) * 100}%`,
                            }}
                          >
                            {formatTime(startHour)}
                          </div>
                          <div
                            className={`absolute text-xs font-medium whitespace-nowrap ${
                              labelsOverlap
                                ? "-translate-x-full" // Align to right
                                : endHour / 24 > 0.85
                                  ? "-translate-x-full"
                                  : endHour / 24 < 0.15
                                    ? "translate-x-0"
                                    : "-translate-x-1/2"
                            } ${
                              useCampaignSettings
                                ? "text-slate-500"
                                : "text-slate-300"
                            }`}
                            style={{
                              left: labelsOverlap
                                ? "100%"
                                : `${(endHour / 24) * 100}%`,
                            }}
                          >
                            {formatTime(endHour)}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="relative">
                    {/* Custom slider track */}
                    <div className="relative h-2 w-full bg-slate-600 rounded-full">
                      <div
                        className="absolute h-2 bg-slate-400 rounded-full"
                        style={{
                          left: `${(displayTimeWindows[key][0] / 24) * 100}%`,
                          width: `${((displayTimeWindows[key][1] - displayTimeWindows[key][0]) / 24) * 100}%`,
                        }}
                      />
                    </div>

                    {/* Custom slider thumbs */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-slate-800 border-2 border-slate-300 rounded-full shadow-md ${
                        isReadOnly || useCampaignSettings
                          ? "cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                      style={{
                        left: `calc(${(displayTimeWindows[key][0] / 24) * 100}% - 8px)`,
                      }}
                      draggable="false"
                      onMouseDown={(e) => {
                        if (isReadOnly || useCampaignSettings) return;
                        const rect =
                          e.currentTarget.parentElement?.getBoundingClientRect();
                        if (!rect) return;

                        const handleMouseMove = (e: MouseEvent) => {
                          const x = e.clientX - rect.left;
                          const percentage = Math.max(
                            0,
                            Math.min(1, x / rect.width),
                          );
                          const newHour = Math.round(percentage * 24);
                          const currentWindow = individualTimeWindows[key];
                          if (newHour < currentWindow[1]) {
                            handleIndividualTimeWindowChange(key, [
                              newHour,
                              currentWindow[1],
                            ]);
                          }
                        };

                        const handleMouseUp = () => {
                          document.removeEventListener(
                            "mousemove",
                            handleMouseMove,
                          );
                          document.removeEventListener(
                            "mouseup",
                            handleMouseUp,
                          );
                        };

                        document.addEventListener("mousemove", handleMouseMove);
                        document.addEventListener("mouseup", handleMouseUp);
                      }}
                    />
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-slate-800 border-2 border-slate-300 rounded-full shadow-md ${
                        isReadOnly || useCampaignSettings
                          ? "cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                      style={{
                        left: `calc(${(displayTimeWindows[key][1] / 24) * 100}% - 8px)`,
                      }}
                      draggable="false"
                      onMouseDown={(e) => {
                        if (isReadOnly || useCampaignSettings) return;
                        const rect =
                          e.currentTarget.parentElement?.getBoundingClientRect();
                        if (!rect) return;

                        const handleMouseMove = (e: MouseEvent) => {
                          const x = e.clientX - rect.left;
                          const percentage = Math.max(
                            0,
                            Math.min(1, x / rect.width),
                          );
                          const newHour = Math.round(percentage * 24);
                          const currentWindow = individualTimeWindows[key];
                          if (newHour > currentWindow[0]) {
                            handleIndividualTimeWindowChange(key, [
                              currentWindow[0],
                              newHour,
                            ]);
                          }
                        };

                        const handleMouseUp = () => {
                          document.removeEventListener(
                            "mousemove",
                            handleMouseMove,
                          );
                          document.removeEventListener(
                            "mouseup",
                            handleMouseUp,
                          );
                        };

                        document.addEventListener("mousemove", handleMouseMove);
                        document.addEventListener("mouseup", handleMouseUp);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
};
