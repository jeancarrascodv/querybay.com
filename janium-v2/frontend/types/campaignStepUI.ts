import {
  InternalStepType,
  DisplayStepType,
} from "../components/Campaign/constants";
import {
  CampaignStep,
  CampaignStepData,
  CreateCampaignStep,
  MutateCampaignStep,
  WeeklyRestrictionsInput,
  DailyRestrictionInput,
} from "./campaignStep";
import {
  UiBox,
  AllowedMessagingDayTimes,
  DayTime,
} from "./campaign.types";

// UI-specific types for the StepSidePanel and related components
export interface StepUIData {
  __typename: any;
  // Base campaign step properties
  id?: string;
  campaignId?: string;

  // UI-specific properties
  stepType?: InternalStepType; // The internal step type
  tempId?: string; // Temporary ID for unsaved steps
  isFirstNode?: boolean; // Whether this is the first node in a campaign

  // Path condition specific properties
  acceptedStepType?: string;
  notAcceptedStepType?: string;
  timeWindow?: [number, number];

  // Schedule and delay related properties
  allowedExecutingDays?: string[];
  dailyExecutingWindowMin?: number;
  dailyExecutingWindowMax?: number;
  delay?: number;
  daysToWait?: number;

  // Day and time windows
  dayTimeWindows?: {
    mon: [number, number];
    tue: [number, number];
    wed: [number, number];
    thu: [number, number];
    fri: [number, number];
    sat: [number, number];
    sun: [number, number];
  };

  selectedDays?: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
    sun: boolean;
  };

  // UI box properties
  ui?: {
    box?: {
      xmin: number;
      xmax: number;
      ymin: number;
      ymax: number;
    };
  };

  // Weekly restrictions for API
  weeklyRestrictions?: AllowedMessagingDayTimes | WeeklyRestrictionsInput;

  // Additional properties used by the UI
  extraData?: Record<string, any>; // For storing additional data used by the UI
  conditions?: string[]; // For conditional steps
  defaultPath?: boolean;
  schedule?: Record<string, any>;
  enabled?: boolean; // Whether the step is enabled/active

  // Email specific properties
  subject?: string;
  body?: string;
  from?: string[];
  replyToPrevious?: boolean;

  // Step data for API
  stepData?: {
    SendEmail?: {
      subject: string;
      body: string;
      from: string[];
      replyToPrevious: boolean;
    };
    SendLinkedInMessage?: {
      linkedinMessage: string;
    };
  };

  // LinkedIn specific properties
  linkedinMessage?: string;
  connectionRequestMessage?: string;
  connectionNote?: string;
}

// Using the proper DayTime interface from campaign.types.ts instead of our custom DailyRestriction

// Props for the StepSidePanel component
export interface StepSidePanelProps {
  isOpen: boolean;
  setSidePanelOpen: (isOpen: boolean) => void;
  onClose: () => void;
  onAdd: (
    stepData: StepUIData,
    continueEdit?: boolean,
    isTemporary?: boolean
  ) => void;
  selectedNode: string;
  editingStep?: StepUIData;
}

// Props for the SetupTab component
export interface SetupTabProps {
  onNext: (data: StepUIData) => void;
  onCancel: () => void;
  setSidePanelOpen: (isOpen: boolean) => void;
  initialData?: StepUIData;
  selectedNode: string | null;
  isReadOnly?: boolean;
  mode?: "add" | "view" | "edit";
  onComplete?: (data: StepUIData, continueEdit: boolean) => void;
  isFirstNode?: boolean;
  onModeChange?: (mode: "add" | "view" | "edit") => void;
}

// Props for the ConfigureTab component
export interface ConfigureTabProps {
  onNext: (data: StepUIData) => void;
  onBack: () => void;
  onCancel: () => void;
  onCompleted: (data: StepUIData, continueEdit?: boolean) => void;
  initialData: StepUIData;
  selectedNode: string;
  continueEdit?: boolean;
  isReadOnly?: boolean;
}

// Props for the TestTab component
export interface TestTabProps {
  onComplete: (data: StepUIData, continueEdit?: boolean) => void;
  onBack: () => void;
  onCancel: () => void;
  initialData: StepUIData;
  selectedNode: string;
  setSidePanelOpen: (isOpen: boolean) => void;
  continueEdit?: boolean;
}

/**
 * Converts UI step data to API CreateCampaignStep format
 * @param uiData UI step data
 * @returns API-compatible step data
 */
export function convertToApiStep(uiData: StepUIData): CreateCampaignStep {
  // Prepare the email data correctly
  const emailData = uiData.stepType?.includes("email")
    ? {
        subject: uiData.subject || "",
        body: uiData.body || "",
        // Array of strings is expected for from
        from: Array.isArray(uiData.from)
          ? uiData.from
          : uiData.from
            ? [uiData.from]
            : [],
        replyToPrevious: uiData.replyToPrevious || false,
      }
    : undefined;

  const step: CreateCampaignStep = {
    id: uiData.id || "",
    stepData: {
      sendEmail: emailData,
    },
  };

  // Add UI box information if present
  if (uiData.ui?.box) {
    step.ui = {
      box: {
        xmin: uiData.ui.box.xmin,
        xmax: uiData.ui.box.xmax,
        ymin: uiData.ui.box.ymin,
        ymax: uiData.ui.box.ymax,
      },
    };
  }

  // Convert weekly restrictions
  if (uiData.selectedDays && uiData.dayTimeWindows) {
    const weeklyRestrictions: any = {};

    // For each day, add restrictions if the day is selected
    if (uiData.selectedDays.mon) {
      weeklyRestrictions.monday = createDailyRestriction(
        uiData.dayTimeWindows.mon
      );
    }
    if (uiData.selectedDays.tue) {
      weeklyRestrictions.tuesday = createDailyRestriction(
        uiData.dayTimeWindows.tue
      );
    }
    if (uiData.selectedDays.wed) {
      weeklyRestrictions.wednesday = createDailyRestriction(
        uiData.dayTimeWindows.wed
      );
    }
    if (uiData.selectedDays.thu) {
      weeklyRestrictions.thursday = createDailyRestriction(
        uiData.dayTimeWindows.thu
      );
    }
    if (uiData.selectedDays.fri) {
      weeklyRestrictions.friday = createDailyRestriction(
        uiData.dayTimeWindows.fri
      );
    }
    if (uiData.selectedDays.sat) {
      weeklyRestrictions.saturday = createDailyRestriction(
        uiData.dayTimeWindows.sat
      );
    }
    if (uiData.selectedDays.sun) {
      weeklyRestrictions.sunday = createDailyRestriction(
        uiData.dayTimeWindows.sun
      );
    }

    step.weeklyRestrictions = weeklyRestrictions;
  }

  return step;
}

/**
 * Helper function to create a daily restriction object from a time window
 */
function createDailyRestriction(
  timeWindow: [number, number]
): DailyRestrictionInput {
  const [start, end] = timeWindow;
  return {
    startTime: `${String(start).padStart(2, "0")}:00:00`,
    endTime: `${String(end).padStart(2, "0")}:00:00`,
  };
}

/**
 * Helper function to extract time window from a day time
 */
function extractTimeWindow(restriction: DayTime): [number, number] {
  return [restriction.startTime, restriction.endTime];
}
