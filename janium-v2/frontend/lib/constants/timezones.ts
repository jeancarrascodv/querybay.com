export const TIMEZONES = [
  {
    value: "America/New_York",
    label: "America/New York (EST/EDT)",
  },
  {
    value: "America/Chicago",
    label: "America/Chicago (CST/CDT)",
  },
  {
    value: "America/Denver",
    label: "America/Denver (MST/MDT)",
  },
  {
    value: "America/Los_Angeles",
    label: "America/Los Angeles (PST/PDT)",
  },
  {
    value: "America/Belize",
    label: "America/Belize (CST)",
  },
  {
    value: "Europe/London",
    label: "Europe/London (GMT/BST)",
  },
  {
    value: "Europe/Paris",
    label: "Europe/Paris (CET/CEST)",
  },
  {
    value: "Asia/Tokyo",
    label: "Asia/Tokyo (JST)",
  },
  {
    value: "Asia/Singapore",
    label: "Asia/Singapore (SGT)",
  },
  {
    value: "Australia/Sydney",
    label: "Australia/Sydney (AEST/AEDT)",
  },
  {
    value: "UTC",
    label: "UTC (Universal Time)",
  },
] as const;

export const DEFAULT_TIMEZONE = "America/New_York";
