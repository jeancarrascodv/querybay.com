import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect } from "react";

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

interface CampaignSchedulePickerProps {
  timeWindow: [number, number];
  selectedDays: DaySelection;
  onTimeWindowChange: (value: [number, number], day: string) => void;
  onDaySelectionChange: (days: DaySelection) => void;
  isReadOnly?: boolean;
  weeklyRestrictions?: WeeklyRestrictionsInput | AllowedMessagingDayTimes;
  onWeeklyRestrictionsChange?: (restrictions: WeeklyRestrictionsInput) => void;
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

export const CampaignSchedulePicker = ({
  timeWindow,
  selectedDays,
  onTimeWindowChange,
  onDaySelectionChange,
  isReadOnly = false,
  weeklyRestrictions,
  onWeeklyRestrictionsChange,
}: CampaignSchedulePickerProps) => {

  const [individualTimeWindows, setIndividualTimeWindows] =
    useState<DayTimeWindow>({
      mon: timeWindow,
      tue: timeWindow,
      wed: timeWindow,
      thu: timeWindow,
      fri: timeWindow,
      sat: timeWindow,
      sun: timeWindow,
    });

  // Sync individual time windows with timeWindow prop - only for days without existing restrictions
  useEffect(() => {
    setIndividualTimeWindows((prev) => {
      const newWindows = { ...prev };
      // Only update days that don't have existing restrictions
      const daysToCheck = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
      const dayMapping: Record<string, string> = {
        mon: 'monday',
        tue: 'tuesday', 
        wed: 'wednesday',
        thu: 'thursday',
        fri: 'friday',
        sat: 'saturday',
        sun: 'sunday',
      };
      
      daysToCheck.forEach((day) => {
        const apiDayKey = dayMapping[day];
        // Only use the default timeWindow for days that don't have existing restrictions
        if (!weeklyRestrictions || !weeklyRestrictions[apiDayKey]) {
          newWindows[day] = timeWindow;
        }
      });
      
      return newWindows;
    });
  }, [timeWindow, weeklyRestrictions]);

  // Initialize individual time windows from weeklyRestrictions when they change
  useEffect(() => {
    if (weeklyRestrictions) {
      const newTimeWindows = { ...individualTimeWindows };

      // Helper function to convert time string or number to hour number
      const timeStringToHour = (timeValue: string | number): number => {
        if (typeof timeValue === "number") {
          return timeValue;
        }
        if (typeof timeValue === "string") {
          const [hours] = timeValue.split(":");
          return parseInt(hours, 10);
        }
        return 0; // fallback
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
          if (
            shortDay &&
            restriction.startTime !== undefined &&
            restriction.endTime !== undefined
          ) {
            const startHour = timeStringToHour(restriction.startTime);
            let endHour = timeStringToHour(restriction.endTime);
            // If endTime is 00:00 (from API), treat it as hour 24 (end of day)
            if (endHour === 0 && typeof restriction.endTime === "string" && restriction.endTime.startsWith("00:")) {
              endHour = 24;
            }
            
            // If both start and end are 0, this is invalid data - use default timeWindow (9-17)
            if (startHour === 0 && endHour === 0) {
              newTimeWindows[shortDay] = timeWindow;
            } else {
              newTimeWindows[shortDay] = [startHour, endHour];
            }
          }
        }
      });

      setIndividualTimeWindows(newTimeWindows);
    }
  }, [weeklyRestrictions]);

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

  const handleDayChange = (day: keyof DaySelection, checked: boolean) => {
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
        // For newly selected days, use the default timeWindow (9-17)
        // Don't use individualTimeWindows[day] as it may have stale/wrong values (like 0,0)
        console.log("timeWindow", timeWindow);
        const dayWindow = timeWindow;

        // Update the individual time window for this day
        setIndividualTimeWindows((prev) => ({
          ...prev,
          [day]: dayWindow,
        }));

        newRestrictions[apiDayKey] = createDailyRestrictionInput(
          dayWindow[0],
          dayWindow[1]
        );
      } else {
        if (newRestrictions[apiDayKey]) {
          delete newRestrictions[apiDayKey];
        }
      }

      onWeeklyRestrictionsChange(newRestrictions);
    }
  };

  const handleIndividualTimeWindowChange = (
    day: keyof DaySelection,
    value: [number, number]
  ) => {
    // Update individual time window
    setIndividualTimeWindows((prev) => ({
      ...prev,
      [day]: value,
    }));

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
        value[1]
      );

      onWeeklyRestrictionsChange(newRestrictions);
    }

    // Also call the parent callback for time window changes
    onTimeWindowChange(value, day);
  };

  // Convert from AllowedMessagingDayTimes to WeeklyRestrictionsInput if needed
  const convertToWeeklyRestrictionsInput = (
    restrictions: AllowedMessagingDayTimes | WeeklyRestrictionsInput | undefined
  ): WeeklyRestrictionsInput => {
    if (!restrictions) return {};

    const convertedRestrictions: WeeklyRestrictionsInput = {};

    const isAllowedMessagingDayTimes = (
      value: any
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

  return (
    <div className="rounded-lg space-y-2">
      {(Object.entries(DAY_LABELS) as [keyof DaySelection, string][]).map(
        ([key, label]) => (
          <div key={key} className="flex items-center gap-4 py-3 relative">
            {/* Checkbox and Day Label */}
            <div className="flex items-center gap-3">
              <Checkbox
                id={key}
                checked={selectedDays[key]}
                onCheckedChange={(checked) =>
                  handleDayChange(key, checked === true)
                }
                disabled={isReadOnly}
              />
            </div>

            <div className="text-sm font-medium w-8 text-slate-300">
              {label}
            </div>

            {/* Time Display and Slider */}
            {selectedDays[key] && (
              <div className="flex-1 w-full flex items-center gap-4">
                <div className="flex-1 relative w-full">
                  {/* Time labels above slider thumbs */}
                  <div className="absolute -top-6 left-0 right-0 pointer-events-none">
                    {(() => {
                      const startHour = individualTimeWindows[key][0];
                      const endHour = individualTimeWindows[key][1];
                      const hourDifference = endHour - startHour;

                      // Check if labels would overlap (less than 3 hours apart)
                      const labelsOverlap = hourDifference < 3;

                      return (
                        <>
                          <div
                            className={`absolute text-xs font-medium whitespace-nowrap text-slate-300 ${
                              labelsOverlap
                                ? "translate-x-0" // Align to left
                                : startHour / 24 > 0.85
                                  ? "-translate-x-full"
                                  : startHour / 24 < 0.15
                                    ? "translate-x-0"
                                    : "-translate-x-1/2"
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
                            className={`absolute text-xs font-medium whitespace-nowrap text-slate-300 ${
                              labelsOverlap
                                ? "-translate-x-full" // Align to right
                                : endHour / 24 > 0.85
                                  ? "-translate-x-full"
                                  : endHour / 24 < 0.15
                                    ? "translate-x-0"
                                    : "-translate-x-1/2"
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
                          left: `${(individualTimeWindows[key][0] / 24) * 100}%`,
                          width: `${((individualTimeWindows[key][1] - individualTimeWindows[key][0]) / 24) * 100}%`,
                        }}
                      />
                    </div>

                    {/* Custom slider thumbs */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-slate-800 border-2 border-slate-300 rounded-full shadow-md ${
                        isReadOnly ? "cursor-not-allowed" : "cursor-pointer"
                      }`}
                      style={{
                        left: `calc(${(individualTimeWindows[key][0] / 24) * 100}% - 8px)`,
                      }}
                      draggable="false"
                      onMouseDown={(e) => {
                        if (isReadOnly) return;
                        const rect =
                          e.currentTarget.parentElement?.getBoundingClientRect();
                        if (!rect) return;

                        const handleMouseMove = (e: MouseEvent) => {
                          const x = e.clientX - rect.left;
                          const percentage = Math.max(
                            0,
                            Math.min(1, x / rect.width)
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
                            handleMouseMove
                          );
                          document.removeEventListener(
                            "mouseup",
                            handleMouseUp
                          );
                        };

                        document.addEventListener("mousemove", handleMouseMove);
                        document.addEventListener("mouseup", handleMouseUp);
                      }}
                    />
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-slate-800 border-2 border-slate-300 rounded-full shadow-md ${
                        isReadOnly ? "cursor-not-allowed" : "cursor-pointer"
                      }`}
                      style={{
                        left: `calc(${(individualTimeWindows[key][1] / 24) * 100}% - 8px)`,
                      }}
                      draggable="false"
                      onMouseDown={(e) => {
                        if (isReadOnly) return;
                        const rect =
                          e.currentTarget.parentElement?.getBoundingClientRect();
                        if (!rect) return;

                        const handleMouseMove = (e: MouseEvent) => {
                          const x = e.clientX - rect.left;
                          const percentage = Math.max(
                            0,
                            Math.min(1, x / rect.width)
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
                            handleMouseMove
                          );
                          document.removeEventListener(
                            "mouseup",
                            handleMouseUp
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
        )
      )}
    </div>
  );
};
