import { create } from "zustand";
import { StepUIData } from "@/types/campaignStepUI";
import {
  INTERNAL_STEP_TYPES,
  DisplayStepType,
  DISPLAY_STEP_TYPES,
} from "@/components/Campaign/constants";
import { WeeklyRestrictionsInput } from "@/types/campaignStep";
import { AllowedMessagingDayTimes } from "@/types/campaign.types";

// Helper to parse time value (handles both string "HH:MM:SS" and number formats)
const parseTimeValue = (timeValue: any): number => {
  if (typeof timeValue === "string") {
    const [hours] = timeValue.split(":");
    return parseInt(hours, 10);
  } else if (typeof timeValue === "number") {
    return timeValue;
  }
  return 0;
};

/**
 * Parses campaign settings and returns a state object for the store.
 * This function is centralized here to be reused by reset and init functions.
 * @param campaignSettings - The allowedMessagingDayTimes from the campaign.
 * @returns A partial StepStoreState with scheduling info.
 */
export const parseCampaignSettings = (
  campaignSettings: AllowedMessagingDayTimes,
) => {
  const selectedDays = { ...initialState.selectedDays };
  const dayTimeWindows = { ...initialState.dayTimeWindows };
  const weeklyRestrictions: WeeklyRestrictionsInput = {};

  // Day mapping for converting full day names to short keys
  const dayMapping: Record<string, keyof typeof selectedDays> = {
    monday: "mon",
    tuesday: "tue",
    wednesday: "wed",
    thursday: "thu",
    friday: "fri",
    saturday: "sat",
    sunday: "sun",
  };

  // Reset all days to false initially to ensure a clean slate
  Object.keys(selectedDays).forEach((day) => {
    selectedDays[day as keyof typeof selectedDays] = false;
  });

  // Parse campaign settings and apply them
  Object.entries(campaignSettings).forEach(
    ([dayKey, dayData]: [string, any]) => {
      const shortDay = dayMapping[dayKey.toLowerCase()];
      if (!shortDay || !dayData) return;

      let startHour: number, endHour: number;

      // Handle different formats
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

      // Set the day as selected
      selectedDays[shortDay] = true;

      // Set the time window
      dayTimeWindows[shortDay] = [startHour, endHour];

      // Create weekly restriction for this day
      weeklyRestrictions[dayKey as keyof WeeklyRestrictionsInput] = {
        startTime: `${String(startHour).padStart(2, "0")}:00:00`,
        endTime: `${String(endHour).padStart(2, "0")}:00:00`,
      };
    },
  );

  return {
    selectedDays,
    dayTimeWindows,
    weeklyRestrictions,
  };
};

// Interface for temporary content storage when switching step types
interface TempContentState {
  email: {
    subject: string;
    email_body: string;
    replyInThread: boolean;
    from: string[];
    testRecipientEmail: string;
    emailSender: string;
  };
  linkedin: {
    linkedinMessage: string;
    testRecipientLinkedin: string;
    linkedinAccount: string;
  };
  linkedin_connection: {
    connectionRequestMessage: string;
    testRecipientLinkedin: string;
    linkedinAccount: string;
  };
}

/**
 * Unified store interface for all step configuration, content and scheduling
 * This is a merged version of the previous useStepConfigStore and useContentStore
 */
interface StepStoreState {
  // Step configuration
  stepType: string;
  previousStepType: string; // Track previous step type for content restoration
  timeWindow: [number, number];
  delay: number;
  daysToWait: number;
  status: string;
  conditions: string[];
  defaultPath: boolean;
  weeklyRestrictions: WeeklyRestrictionsInput | null;

  // Temporary content storage for step type switching
  tempContent: TempContentState;

  // Scheduling - selected days configuration
  selectedDays: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
    sun: boolean;
  };

  // Scheduling - day time windows
  dayTimeWindows: {
    mon: [number, number];
    tue: [number, number];
    wed: [number, number];
    thu: [number, number];
    fri: [number, number];
    sat: [number, number];
    sun: [number, number];
  };

  // Email content
  subject: string;
  email_body: string;
  replyInThread: boolean;
  from: string[];

  // LinkedIn content
  linkedinMessage: string;
  connectionRequestMessage: string;

  // Test settings
  testRecipientEmail: string;
  testRecipientLinkedin: string;
  emailSender: string;
  linkedinAccount: string;

  // Step configuration actions
  setStepType: (stepType: string) => void;
  setTimeWindow: (timeWindow: [number, number]) => void;
  setDelay: (delay: number) => void;
  setDaysToWait: (daysToWait: number) => void;
  setStatus: (status: string) => void;
  setSelectedDays: (days: Partial<StepStoreState["selectedDays"]>) => void;
  setDayTimeWindows: (
    windows: Partial<StepStoreState["dayTimeWindows"]>,
  ) => void;
  setConditions: (conditions: string[]) => void;
  setDefaultPath: (defaultPath: boolean) => void;
  setWeeklyRestrictions: (restrictions: WeeklyRestrictionsInput | null) => void;

  // Email content actions
  setSubject: (subject: string) => void;
  setEmailBody: (body: string) => void;
  setLinkedinMessage: (message: string) => void;
  setConnectionRequestMessage: (message: string) => void;
  setReplyInThread: (value: boolean) => void;
  setFrom: (from: string[]) => void;
  addFromEmail: (email: string) => void;
  removeFromEmail: (index: number) => void;
  updateFromEmail: (index: number, email: string) => void;

  // Test settings actions
  setTestRecipientEmail: (email: string) => void;
  setTestRecipientLinkedin: (handle: string) => void;
  setEmailSender: (sender: string) => void;
  setLinkedinAccount: (account: string) => void;

  // Temporary content management actions
  saveCurrentContentToTemp: (stepType: string) => void;
  restoreContentFromTemp: (stepType: string) => void;
  clearTempContent: (stepType?: string) => void;
  hasTempContent: (stepType: string) => boolean;

  // Utilities
  reset: (campaignSettings?: any) => void;
  initFromStepData: (stepData: StepUIData) => void;
  initFromSelectedNodeData: (selectedNodeData: any) => void;
  getStepData: () => Partial<StepUIData>;
}

const initialState: Omit<
  StepStoreState,
  // Exclude all action methods from initial state
  | "setStepType"
  | "setTimeWindow"
  | "setDelay"
  | "setDaysToWait"
  | "setStatus"
  | "setSelectedDays"
  | "setDayTimeWindows"
  | "setConditions"
  | "setDefaultPath"
  | "setWeeklyRestrictions"
  | "setSubject"
  | "setEmailBody"
  | "setLinkedinMessage"
  | "setConnectionRequestMessage"
  | "setReplyInThread"
  | "setFrom"
  | "addFromEmail"
  | "removeFromEmail"
  | "updateFromEmail"
  | "setTestRecipientEmail"
  | "setTestRecipientLinkedin"
  | "setEmailSender"
  | "setLinkedinAccount"
  | "reset"
  | "initFromStepData"
  | "initFromSelectedNodeData"
  | "getStepData"
  | "saveCurrentContentToTemp"
  | "restoreContentFromTemp"
  | "clearTempContent"
  | "hasTempContent"
> = {
  // Step configuration
  stepType: "", // Empty by default for new nodes
  previousStepType: "",
  timeWindow: [9, 17],
  delay: 0,
  daysToWait: 0,
  status: "Active",
  conditions: ["Accepted", "Not Accepted"],
  defaultPath: true,
  // Weekly restrictions - null means "use campaign settings"
  // By default, new steps should inherit from campaign settings
  weeklyRestrictions: null,

  // Temporary content storage
  tempContent: {
    email: {
      subject: "",
      email_body: "",
      replyInThread: false,
      from: [""],
      testRecipientEmail: "",
      emailSender: "",
    },
    linkedin: {
      linkedinMessage: "",
      testRecipientLinkedin: "",
      linkedinAccount: "",
    },
    linkedin_connection: {
      connectionRequestMessage: "",
      testRecipientLinkedin: "",
      linkedinAccount: "",
    },
  },

  // Selected days configuration
  selectedDays: {
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
    sun: false,
  },

  // Day time windows
  dayTimeWindows: {
    mon: [9, 17],
    tue: [9, 17],
    wed: [9, 17],
    thu: [9, 17],
    fri: [9, 17],
    sat: [9, 17],
    sun: [9, 17],
  },

  // Email content
  subject: "",
  email_body: "",
  replyInThread: false,
  from: [""],

  // LinkedIn content
  linkedinMessage: "",
  connectionRequestMessage: "",

  // Test settings
  testRecipientEmail: "",
  testRecipientLinkedin: "",
  emailSender: "",
  linkedinAccount: "",
};

export const useStepStore = create<StepStoreState>((set, get) => ({
  ...initialState,

  // Step configuration actions
  setStepType: (stepType) => {
    const currentState = get();
    const currentStepType = currentState.stepType;

    // Save current content to temporary storage if step type is changing
    if (currentStepType && currentStepType !== stepType) {
      // Save current content before switching
      get().saveCurrentContentToTemp(currentStepType);
    }

    // Automatically translate external step types to internal types
    const displayType = stepType as DisplayStepType;
    let internalType = stepType;

    // Check if this is a display type that needs translation
    if (Object.values(DISPLAY_STEP_TYPES).includes(displayType)) {
      // Map display step type to internal step type
      switch (displayType) {
        case DISPLAY_STEP_TYPES.EMAIL:
          internalType = INTERNAL_STEP_TYPES.EMAIL;
          break;
        case DISPLAY_STEP_TYPES.LINKEDIN_MESSAGE:
          internalType = INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE;
          break;
        case DISPLAY_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST:
          internalType = INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST;
          break;
        default:
          internalType = stepType;
      }
    }

    // Update step type and previous step type
    set({
      stepType: internalType,
      previousStepType: currentStepType,
    });

    // Try to restore content from temporary storage for the new step type
    setTimeout(() => {
      get().restoreContentFromTemp(internalType);
    }, 0);
  },

  setTimeWindow: (timeWindow) => set({ timeWindow }),
  setDelay: (delay) => set({ delay }),
  setDaysToWait: (daysToWait) => set({ daysToWait }),
  setStatus: (status) => set({ status }),
  setSelectedDays: (days) =>
    set((state) => ({
      selectedDays: { ...state.selectedDays, ...days },
    })),
  setDayTimeWindows: (windows) =>
    set((state) => ({
      dayTimeWindows: { ...state.dayTimeWindows, ...windows },
    })),
  setConditions: (conditions) => set({ conditions }),
  setDefaultPath: (defaultPath) => set({ defaultPath }),
  setWeeklyRestrictions: (weeklyRestrictions) => set({ weeklyRestrictions }),

  // Email content actions
  setSubject: (subject) => set({ subject }),
  setEmailBody: (email_body) => set({ email_body }),
  setLinkedinMessage: (linkedinMessage) => set({ linkedinMessage }),
  setConnectionRequestMessage: (connectionRequestMessage) =>
    set({ connectionRequestMessage }),
  setReplyInThread: (replyInThread) => set({ replyInThread }),
  setFrom: (from) => set({ from }),
  addFromEmail: (email) =>
    set((state) => {
      const fromArray = Array.isArray(state.from)
        ? state.from
        : [state.from || ""];
      return { from: [...fromArray, email] };
    }),
  removeFromEmail: (index) =>
    set((state) => {
      const fromArray = Array.isArray(state.from)
        ? state.from
        : [state.from || ""];
      return { from: fromArray.filter((_, i) => i !== index) };
    }),
  updateFromEmail: (index, email) =>
    set((state) => {
      const fromArray = Array.isArray(state.from)
        ? state.from
        : [state.from || ""];
      return { from: fromArray.map((item, i) => (i === index ? email : item)) };
    }),

  // Test settings actions
  setTestRecipientEmail: (testRecipientEmail) => set({ testRecipientEmail }),
  setTestRecipientLinkedin: (testRecipientLinkedin) =>
    set({ testRecipientLinkedin }),
  setEmailSender: (emailSender) => set({ emailSender }),
  setLinkedinAccount: (linkedinAccount) => set({ linkedinAccount }),

  // Temporary content management actions
  saveCurrentContentToTemp: (stepType) => {
    const state = get();
    const tempContent = { ...state.tempContent };

    if (stepType === INTERNAL_STEP_TYPES.EMAIL) {
      tempContent.email = {
        subject: state.subject,
        email_body: state.email_body,
        replyInThread: state.replyInThread,
        from: [...state.from],
        testRecipientEmail: state.testRecipientEmail,
        emailSender: state.emailSender,
      };
    } else if (stepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE) {
      tempContent.linkedin = {
        linkedinMessage: state.linkedinMessage,
        testRecipientLinkedin: state.testRecipientLinkedin,
        linkedinAccount: state.linkedinAccount,
      };
    } else if (stepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST) {
      tempContent.linkedin_connection = {
        connectionRequestMessage: state.connectionRequestMessage,
        testRecipientLinkedin: state.testRecipientLinkedin,
        linkedinAccount: state.linkedinAccount,
      };
    }

    set({ tempContent });
  },

  restoreContentFromTemp: (stepType) => {
    const state = get();
    const tempContent = state.tempContent;

    if (stepType === INTERNAL_STEP_TYPES.EMAIL && tempContent.email) {
      const emailContent = tempContent.email;
      // Only restore if there's actual content saved
      if (emailContent.subject || emailContent.email_body) {
        set({
          subject: emailContent.subject,
          email_body: emailContent.email_body,
          replyInThread: emailContent.replyInThread,
          from: [...emailContent.from],
          testRecipientEmail: emailContent.testRecipientEmail,
          emailSender: emailContent.emailSender,
        });
      }
    } else if (
      stepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE &&
      tempContent.linkedin
    ) {
      const linkedinContent = tempContent.linkedin;
      // Only restore if there's actual content saved
      if (linkedinContent.linkedinMessage) {
        set({
          linkedinMessage: linkedinContent.linkedinMessage,
          testRecipientLinkedin: linkedinContent.testRecipientLinkedin,
          linkedinAccount: linkedinContent.linkedinAccount,
        });
      }
    } else if (
      stepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST &&
      tempContent.linkedin_connection
    ) {
      const linkedinConnectionContent = tempContent.linkedin_connection;
      // Only restore if there's actual content saved
      if (linkedinConnectionContent.connectionRequestMessage) {
        set({
          connectionRequestMessage:
            linkedinConnectionContent.connectionRequestMessage,
          testRecipientLinkedin:
            linkedinConnectionContent.testRecipientLinkedin,
          linkedinAccount: linkedinConnectionContent.linkedinAccount,
        });
      }
    }
  },

  clearTempContent: (stepType) => {
    const state = get();
    const tempContent = { ...state.tempContent };

    if (!stepType) {
      // Clear all temporary content
      set({
        tempContent: {
          email: {
            subject: "",
            email_body: "",
            replyInThread: false,
            from: [""],
            testRecipientEmail: "",
            emailSender: "",
          },
          linkedin: {
            linkedinMessage: "",
            testRecipientLinkedin: "",
            linkedinAccount: "",
          },
          linkedin_connection: {
            connectionRequestMessage: "",
            testRecipientLinkedin: "",
            linkedinAccount: "",
          },
        },
      });
    } else {
      // Clear specific step type content
      if (stepType === INTERNAL_STEP_TYPES.EMAIL) {
        tempContent.email = {
          subject: "",
          email_body: "",
          replyInThread: false,
          from: [""],
          testRecipientEmail: "",
          emailSender: "",
        };
      } else if (stepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE) {
        tempContent.linkedin = {
          linkedinMessage: "",
          testRecipientLinkedin: "",
          linkedinAccount: "",
        };
      } else if (stepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST) {
        tempContent.linkedin_connection = {
          connectionRequestMessage: "",
          testRecipientLinkedin: "",
          linkedinAccount: "",
        };
      }
      set({ tempContent });
    }
  },

  hasTempContent: (stepType) => {
    const state = get();
    const tempContent = state.tempContent;

    if (stepType === INTERNAL_STEP_TYPES.EMAIL) {
      const emailContent = tempContent.email;
      return !!(emailContent.subject || emailContent.email_body);
    } else if (stepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE) {
      return !!tempContent.linkedin.linkedinMessage;
    } else if (stepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST) {
      return !!tempContent.linkedin_connection.connectionRequestMessage;
    }

    return false;
  },

  reset: (campaignSettings?: AllowedMessagingDayTimes) => {
    // Start with the initial state
    const resetState = { ...initialState };

    // If campaign settings are provided, parse them and apply to the reset state
    if (campaignSettings) {
      const parsedSettings = parseCampaignSettings(campaignSettings);
      // Apply the campaign settings to reset state
      resetState.selectedDays = parsedSettings.selectedDays;
      resetState.dayTimeWindows = parsedSettings.dayTimeWindows;
      resetState.weeklyRestrictions = parsedSettings.weeklyRestrictions;
    }

    set(resetState);
  },

  initFromStepData: (stepData) => {
    if (!stepData?.stepType && !stepData?.__typename) return;

    // Use a type assertion to handle dynamic properties not in the type
    const stepDataAny = stepData as any;

    // First, determine step type from __typename or stepType
    const stepType = stepDataAny.__typename || stepData.stepType;

    // Determine status from enabled field or extraData.status
    let status = "Active"; // Default
    if (stepDataAny.enabled !== undefined) {
      status = stepDataAny.enabled ? "Active" : "Inactive";
    } else if (stepDataAny.extraData?.status) {
      status = stepDataAny.extraData.status;
    }

    // Initialize step type and scheduling data regardless of step type
    set({
      stepType: stepType || "",
      timeWindow: stepDataAny.timeWindow || [9, 17],
      delay: stepDataAny.delay || 0,
      daysToWait: stepDataAny.daysToWait || 0,
      status: status,
    });

    // Initialize weekly restrictions if present
    if (stepDataAny.weeklyRestrictions) {
      const { weeklyRestrictions } = stepDataAny;
      const selectedDays = { ...initialState.selectedDays };
      const dayTimeWindows = { ...initialState.dayTimeWindows };

      // Map the weekly restrictions to our UI format
      Object.keys(weeklyRestrictions).forEach((day) => {
        const shortDay = day
          .slice(0, 3)
          .toLowerCase() as keyof typeof selectedDays;
        if (shortDay in selectedDays) {
          selectedDays[shortDay] = true;

          const restriction = weeklyRestrictions[day];
          if (restriction) {
            const startTime = new Date(
              `1970-01-01T${restriction.startTime}Z`,
            ).getUTCHours();
            const endTime = new Date(
              `1970-01-01T${restriction.endTime}Z`,
            ).getUTCHours();
            dayTimeWindows[shortDay] = [startTime, endTime];
          }
        }
      });

      set({ selectedDays, dayTimeWindows, weeklyRestrictions });
    }

    // Set conditional path configuration if available
    if (stepDataAny.conditions) {
      set({ conditions: stepDataAny.conditions });
    }

    if (stepDataAny.defaultPath !== undefined) {
      set({ defaultPath: stepDataAny.defaultPath });
    }

    // For email steps
    if (stepType === INTERNAL_STEP_TYPES.EMAIL) {
      // Ensure from is always an array
      const fromValue = stepDataAny.from;
      const fromArray = Array.isArray(fromValue)
        ? fromValue
        : [fromValue || ""];

      set({
        subject: stepDataAny.subject || "",
        email_body: stepDataAny.body || "",
        replyInThread: stepDataAny.replyToPrevious || false,
        from: fromArray,
        testRecipientEmail: stepDataAny.testRecipientEmail || "",
        emailSender: stepDataAny.emailSender || "",
      });
    }
    // For LinkedIn steps
    else if (
      stepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE ||
      stepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST
    ) {
      set({
        linkedinMessage: stepDataAny.linkedinMessage || "",
        testRecipientLinkedin: stepDataAny.testRecipientLinkedin || "",
        linkedinAccount: stepDataAny.linkedinAccount || "",
      });
    }
    // If there's stepData object, try that too (backwards compatibility)
    else if (stepData.stepData) {
      const emailData = stepData.stepData.SendEmail || {};
      const messageData = stepData.stepData.SendLinkedInMessage || {};

      // Ensure from is always an array
      const fromValue = (emailData as any).from;
      const fromArray = Array.isArray(fromValue)
        ? fromValue
        : [fromValue || ""];

      set({
        subject: (emailData as any).subject || "",
        email_body: (emailData as any).body || "",
        replyInThread: (emailData as any).replyToPrevious || false,
        from: fromArray,
        linkedinMessage: (messageData as any).linkedinMessage || "",
        testRecipientEmail: stepDataAny.testRecipientEmail || "",
        testRecipientLinkedin: stepDataAny.testRecipientLinkedin || "",
        emailSender: stepDataAny.emailSender || "",
        linkedinAccount: stepDataAny.linkedinAccount || "",
      });
    }
  },

  // Initialize from selected node data (for editing existing nodes)
  initFromSelectedNodeData: (selectedNodeData) => {
    if (!selectedNodeData) return;

    // Extract step type from stepData.__typename
    const stepType = selectedNodeData.stepData?.__typename;

    // IMPORTANT: First reset all content fields to prevent data mixing between steps/campaigns
    // This ensures old values don't persist when switching to a step with empty fields
    set({
      // Reset all content fields
      subject: "",
      email_body: "",
      linkedinMessage: "",
      connectionRequestMessage: "",
      replyInThread: false,
      from: [""],
      testRecipientEmail: "",
      testRecipientLinkedin: "",
      emailSender: "",
      linkedinAccount: "",
      // Then set basic step configuration
      stepType: stepType || "",
      status: selectedNodeData.enabled ? "Active" : "Inactive",
      delay: selectedNodeData.delay || 0,
      daysToWait: selectedNodeData.daysToWait || 0,
    });

    // Initialize weekly restrictions and scheduling
    if (selectedNodeData.weeklyRestrictions) {
      const { weeklyRestrictions } = selectedNodeData;
      const selectedDays = { ...initialState.selectedDays };
      const dayTimeWindows = { ...initialState.dayTimeWindows };

      // Reset all days to false first
      Object.keys(selectedDays).forEach((day) => {
        selectedDays[day as keyof typeof selectedDays] = false;
      });

      // Map the weekly restrictions to our UI format
      Object.keys(weeklyRestrictions).forEach((dayKey) => {
        const restriction = weeklyRestrictions[dayKey];
        if (restriction) {
          // Map full day names to short day keys
          const dayMapping: Record<string, keyof typeof selectedDays> = {
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
            selectedDays[shortDay] = true;

            // Parse time strings to hours
            if (restriction.startTime && restriction.endTime) {
              const startTime = new Date(
                `1970-01-01T${restriction.startTime}Z`,
              ).getUTCHours();
              const endTime = new Date(
                `1970-01-01T${restriction.endTime}Z`,
              ).getUTCHours();
              dayTimeWindows[shortDay] = [startTime, endTime];
            }
          }
        }
      });

      set({ selectedDays, dayTimeWindows, weeklyRestrictions });
    }

    // Initialize content based on step type
    if (stepType === INTERNAL_STEP_TYPES.EMAIL && selectedNodeData.stepData) {
      const emailData = selectedNodeData.stepData;
      set({
        subject: emailData.subject || "",
        email_body: emailData.body || "",
        replyInThread: emailData.replyToPrevious || false,
        from: emailData.from ? [emailData.from] : [""],
      });
    } else if (
      stepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE &&
      selectedNodeData.stepData
    ) {
      const linkedinData = selectedNodeData.stepData;
      set({
        linkedinMessage: linkedinData.linkedinMessage || "",
      });
    } else if (
      stepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST &&
      selectedNodeData.stepData
    ) {
      const linkedinData = selectedNodeData.stepData;
      set({
        connectionRequestMessage:
          linkedinData.connectionRequestMessage || linkedinData.message || "",
      });
    }
  },

  getStepData: () => {
    const state = get();
    const { stepType } = state;

    const isEmail = stepType === INTERNAL_STEP_TYPES.EMAIL;
    const isLinkedIn =
      stepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST ||
      stepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE;

    // Create the result object
    const result: Partial<StepUIData> = {
      stepType: stepType as any, // Cast to any then it will be inferred as InternalStepType
      timeWindow: state.timeWindow,
      delay: state.delay,
      daysToWait: state.daysToWait,
      enabled: state.status === "Active", // Include enabled status for bulk updates
      extraData: {
        status: state.status,
      },
    };

    // Add path condition data if applicable

    // Handle weekly restrictions
    // If weeklyRestrictions is null, pass null to indicate "use campaign settings"
    if (state.weeklyRestrictions === null) {
      (result as any).weeklyRestrictions = null;
    } else {
      // Add weekly restrictions from selected days
      const dayMapping: Record<string, string> = {
        mon: "monday",
        tue: "tuesday",
        wed: "wednesday",
        thu: "thursday",
        fri: "friday",
        sat: "saturday",
        sun: "sunday",
      };

      // Create weekly restrictions from selected days
      const weeklyRestrictions: Record<string, any> = {};
      Object.entries(state.selectedDays).forEach(([uiDayKey, isSelected]) => {
        if (isSelected) {
          const apiDayKey = dayMapping[uiDayKey];
          const timeWindow =
            state.dayTimeWindows[uiDayKey as keyof typeof state.dayTimeWindows];
          weeklyRestrictions[apiDayKey] = {
            startTime: `${String(timeWindow[0]).padStart(2, "0")}:00:00`,
            endTime: `${String(timeWindow[1]).padStart(2, "0")}:00:00`,
          };
        }
      });

      (result as any).weeklyRestrictions = weeklyRestrictions;
    }

    // Add direct properties based on step type
    if (isEmail) {
      // Ensure from is always an array
      const fromArray = Array.isArray(state.from)
        ? state.from
        : [state.from || ""];

      Object.assign(result, {
        __typename: INTERNAL_STEP_TYPES.EMAIL,
        subject: state.subject,
        body: state.email_body,
        from: fromArray.filter(Boolean),
        replyToPrevious: state.replyInThread,
        testRecipientEmail: state.testRecipientEmail,
        emailSender: state.emailSender,
        stepData: {
          SendEmail: {
            subject: state.subject,
            body: state.email_body,
            from: fromArray.filter(Boolean),
            replyToPrevious: state.replyInThread,
          },
        },
      });
    } else if (isLinkedIn) {
      // Determine specific LinkedIn step type
      const isConnectionRequest =
        stepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST;
      Object.assign(result, {
        __typename: isConnectionRequest
          ? INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST
          : INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE,
        linkedinMessage: state.linkedinMessage,
        connectionRequestMessage: state.connectionRequestMessage,
        testRecipientLinkedin: state.testRecipientLinkedin,
        linkedinAccount: state.linkedinAccount,
        stepData: isConnectionRequest
          ? {
              SendLinkedInConnectionRequest: {
                connectionRequestMessage: state.connectionRequestMessage,
              },
            }
          : {
              SendLinkedInMessage: {
                linkedinMessage: state.linkedinMessage,
              },
            },
      });
    }

    return result;
  },
}));
