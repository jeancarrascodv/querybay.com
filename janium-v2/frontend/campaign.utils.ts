import { Campaign, AllowedMessagingDayTimes } from "@/types/campaign.types";

export const formatExecutingWindow = (min: number, max: number): string => {
  return `${min}:00 - ${max}:00`;
};

export const formatExecutingDays = (days: string[] | undefined): string => {
  if (!days) return "";
  return days.map((day) => day.slice(0, 3)).join(", ");
};

export const getCampaignMetrics = (campaign: Campaign, type = "default") => {
  // Basic metrics for all campaigns
  const metrics = {
    totalContacts: Array.isArray(campaign.contacts)
      ? campaign.contacts.length
      : 0,
    activeHours: formatExecutingWindow(
      campaign.dailyExecutingWindowMin ||
        getWindowMinFromAllowedMessagingDayTimes(
          campaign.allowedMessagingDayTimes
        ) ||
        9,
      campaign.dailyExecutingWindowMax ||
        getWindowMaxFromAllowedMessagingDayTimes(
          campaign.allowedMessagingDayTimes
        ) ||
        17
    ),
    workingDays: Array.isArray(campaign.allowedExecutingDays)
      ? formatExecutingDays(campaign.allowedExecutingDays)
      : campaign.allowedExecutingDays
        ? formatAllowedDaysObject(campaign.allowedExecutingDays)
        : formatAllowedMessagingDayTimes(campaign.allowedMessagingDayTimes),
  };

  // Add engagement metrics when showing campaign cards/tables
  if (type === "campaign") {
    // In a real implementation, these would be computed from campaign data
    // For now, we'll use placeholder values
    return {
      ...metrics,
      replyRate: Math.floor(Math.random() * 100),
      openRate: Math.floor(Math.random() * 100),
      clickRate: Math.floor(Math.random() * 100),
    };
  }

  return metrics;
};

// Helper function to get dailyExecutingWindowMin from allowedMessagingDayTimes
const getWindowMinFromAllowedMessagingDayTimes = (
  allowedTimes?: AllowedMessagingDayTimes
): number | undefined => {
  if (!allowedTimes) return undefined;

  // Get the first day that has time specified
  const days = Object.values(allowedTimes).filter(Boolean);
  return days.length > 0 ? days[0]?.startTime : undefined;
};

// Helper function to get dailyExecutingWindowMax from allowedMessagingDayTimes
const getWindowMaxFromAllowedMessagingDayTimes = (
  allowedTimes?: AllowedMessagingDayTimes
): number | undefined => {
  if (!allowedTimes) return undefined;

  // Get the first day that has time specified
  const days = Object.values(allowedTimes).filter(Boolean);
  return days.length > 0 ? days[0]?.endTime : undefined;
};

// Helper function to format the allowedMessagingDayTimes object
export const formatAllowedMessagingDayTimes = (
  dayTimes?: AllowedMessagingDayTimes
): string => {
  if (!dayTimes) return "";

  // Map full day names to short versions
  const dayMap: Record<string, string> = {
    sunday: "Sun",
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
  };

  return Object.entries(dayTimes)
    .filter(([_, value]) => value) // Only include days that have values
    .map(([day]) => dayMap[day] || day)
    .join(", ");
};

// Helper function to format the allowedExecutingDays object
export const formatAllowedDaysObject = (days: any): string => {
  if (!days) return "";

  const dayMap: Record<string, string> = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };

  return Object.entries(days)
    .filter(([_, value]) => value) // Only include days that are true
    .map(([day]) => dayMap[day] || day)
    .join(", ");
};
