import {
  BulkUpdateStepsInput,
  CreateCampaignStep,
  CreateCampaignStepLink,
} from "@/types/campaignStep";
import { createDefaultStepInput } from "./campaignStep.utils";
import { v4 as uuidv4 } from "uuid";

/**
 * Creates a basic follow-up campaign pattern with the specified number of steps
 * Uses bulk update to create all steps and links at once
 *
 * @param numSteps Number of email steps to create
 * @param delayDays Number of days between emails (default: 2)
 * @returns A bulk update input with steps and links
 */
export const createFollowUpCampaignTemplate = (
  numSteps: number = 3,
  delayDays: number = 2
): BulkUpdateStepsInput => {
  if (numSteps < 1) {
    throw new Error("Number of steps must be at least 1");
  }

  // Generate temporary IDs for the new steps
  // The actual IDs will be assigned by the server
  const tempIds = Array.from({ length: numSteps }, () => uuidv4());

  // Create step inputs
  const stepCreations: CreateCampaignStep[] = tempIds.map((id, index) => {
    const step = createDefaultStepInput("email", index + 1);

    // Customize the step based on its position
    const stepNumber = index + 1;

    // Add email data with a default template
    step.stepData.sendEmail = {
      subject: `Email #${stepNumber}: Follow Up`,
      body: `This is the content for follow-up email #${stepNumber}`,
      from: [],
      replyToPrevious: index > 0, // Reply to previous except for first email
    };

    // Adjust UI position
    if (step.ui && step.ui.box) {
      step.ui.box.xmin = 200 * index;
      step.ui.box.xmax = 200 * index + 180;
      step.ui.box.ymin = 100;
      step.ui.box.ymax = 200;
    }

    return step;
  });

  // Create links between steps
  const linkCreations: CreateCampaignStepLink[] = [];

  for (let i = 0; i < tempIds.length - 1; i++) {
    linkCreations.push({
      prev: { uuid: tempIds[i] },
      next: { uuid: tempIds[i + 1] },
      delay: {
        days: delayDays,
      },
    });
  }

  // Return bulk update input
  return {
    stepCreations,
    linkCreations,
  };
};

/**
 * Creates an A/B test campaign pattern
 * Uses bulk update to create all steps and links at once
 *
 * @returns A bulk update input with steps and links
 */
export const createABTestCampaignTemplate = (): BulkUpdateStepsInput => {
  // Generate temporary IDs for the new steps
  const ids = {
    start: uuidv4(),
    pathA: uuidv4(),
    pathB: uuidv4(),
    final: uuidv4(),
  };

  // Create steps
  const stepCreations: CreateCampaignStep[] = [
    // Initial email
    {
      ...createDefaultStepInput("email", 1),
      stepData: {
        sendEmail: {
          subject: "Initial Email",
          body: "This is the starting email for the A/B test",
          from: [],
          replyToPrevious: false,
        },
      },
      ui: {
        box: { xmin: 0, xmax: 180, ymin: 100, ymax: 200 },
      },
    },
    // Path A
    {
      ...createDefaultStepInput("email", 2),
      stepData: {
        sendEmail: {
          subject: "Path A: First Follow-up",
          body: "This is the first follow-up for Path A",
          from: [],
          replyToPrevious: true,
        },
      },
      ui: {
        box: { xmin: 250, xmax: 430, ymin: 0, ymax: 100 },
      },
    },
    // Path B
    {
      ...createDefaultStepInput("email", 2),
      stepData: {
        sendEmail: {
          subject: "Path B: Alternative Approach",
          body: "This is the alternative follow-up for Path B",
          from: [],
          replyToPrevious: true,
        },
      },
      ui: {
        box: { xmin: 250, xmax: 430, ymin: 200, ymax: 300 },
      },
    },
    // Final step
    {
      ...createDefaultStepInput("email", 3),
      stepData: {
        sendEmail: {
          subject: "Final Follow-up",
          body: "This is the final follow-up email after the A/B paths converge",
          from: [],
          replyToPrevious: true,
        },
      },
      ui: {
        box: { xmin: 500, xmax: 680, ymin: 100, ymax: 200 },
      },
    },
  ];

  // Create links between steps
  const linkCreations: CreateCampaignStepLink[] = [
    // Start to Path A
    {
      prev: { uuid: ids.start },
      next: { uuid: ids.pathA },
      delay: { days: 2 },
      filter: {
        const: { pass: true }, // Default path
      },
    },
    // Start to Path B
    {
      prev: { uuid: ids.start },
      next: { uuid: ids.pathB },
      delay: { days: 2 },
      filter: {
        const: { pass: false }, // Alternative path
      },
    },
    // Path A to Final
    {
      prev: { uuid: ids.pathA },
      next: { uuid: ids.final },
      delay: { days: 3 },
    },
    // Path B to Final
    {
      prev: { uuid: ids.pathB },
      next: { uuid: ids.final },
      delay: { days: 3 },
    },
  ];

  return {
    stepCreations,
    linkCreations,
  };
};
