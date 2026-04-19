import {
  CampaignStepInput,
  CampaignStepUpdateInput,
} from "@/types/campaignStep";

/**
 * Creates a campaign step input object with default values
 */
export const createDefaultStepInput = (
  type: "email" | "linkedin" | "delay" | string,
  priority: number = 1
): CampaignStepInput => {
  const baseStep: CampaignStepInput = {
    id: crypto.randomUUID(), // Generate a unique ID for the step
    priority,
    stepData: {},
    ui: {
      box: { xmin: 0, xmax: 200, ymin: 0, ymax: 100 },
    },
    // Set to null to indicate "use campaign settings" by default
    // When null, the step inherits scheduling from campaign-level settings
    weeklyRestrictions: null,
  };

  if (type === "email") {
    baseStep.stepData.sendEmail = {
      subject: "",
      body: "",
      from: [],
      replyToPrevious: false,
    };
  }

  // Add other step type initializations as needed

  return baseStep;
};

/**
 * Converts legacy campaign step format to new format
 */
export const convertLegacyStep = (legacyStep: any): CampaignStepInput => {
  const newStep: CampaignStepInput = createDefaultStepInput(
    legacyStep.contentType || "email",
    legacyStep.priority || 1
  );

  // Map specific properties from UI to the new structure
  if (legacyStep.stepData?.sendEmail) {
    newStep.stepData.sendEmail = {
      subject: legacyStep.stepData.sendEmail.subject || "",
      body: legacyStep.stepData.sendEmail.body || "",
      from: legacyStep.stepData.sendEmail.from || [],
      replyToPrevious: legacyStep.stepData.sendEmail.replyToPrevious || false,
    };
  }

  if (legacyStep.extraData) {
    // Convert extraData to stepData based on contentType
    if (
      legacyStep.contentType === "send_email" &&
      legacyStep.extraData.email_subject
    ) {
      newStep.stepData.sendEmail = {
        subject: legacyStep.extraData.email_subject || "",
        body: legacyStep.extraData.email_body || "",
        from: legacyStep.extraData.emailFromId || "",
        replyToPrevious: false,
      };
    }

    // Add more conversions as needed
  }

  // Convert position to UI box
  if (legacyStep.position) {
    newStep.ui = {
      box: {
        xmin: legacyStep.position.x,
        xmax: legacyStep.position.x + 200,
        ymin: legacyStep.position.y,
        ymax: legacyStep.position.y + 100,
      },
    };
  }

  return newStep;
};
