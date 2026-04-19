export const NODE_DIMENSIONS = {
  width: 220,
  height: 44,
} as const;

// Define the internal step types (used in API and backend)
export const INTERNAL_STEP_TYPES = {
  LINKEDIN_CONNECTION_REQUEST: "SendLinkedInConnectionRequest",
  LINKEDIN_MESSAGE: "SendLinkedInMessage",
  EMAIL: "SendEmail",
} as const;

// Define the display step types (shown in UI)
export const DISPLAY_STEP_TYPES = {
  LINKEDIN_CONNECTION_REQUEST: "Send Connection Request",
  LINKEDIN_MESSAGE: "Send Message",
  EMAIL: "Send Email",
} as const;

// Type definitions
export type InternalStepType =
  (typeof INTERNAL_STEP_TYPES)[keyof typeof INTERNAL_STEP_TYPES];
export type DisplayStepType =
  (typeof DISPLAY_STEP_TYPES)[keyof typeof DISPLAY_STEP_TYPES];
/**
 * Maps a display step type to its corresponding internal step type.
 * @param displayType The display step type to convert
 * @returns The corresponding internal step type
 */
export function mapDisplayToInternalType(
  displayType: DisplayStepType
): InternalStepType {
  return DISPLAY_TO_INTERNAL_MAPPING[displayType];
}

/**
 * Maps an internal step type to its corresponding display step type.
 * @param internalType The internal step type to convert
 * @returns The corresponding display step type
 */
export function mapInternalToDisplayType(
  internalType: InternalStepType
): DisplayStepType {
  return INTERNAL_TO_DISPLAY_MAPPING[internalType];
}
// Mapping from internal to display types
export const INTERNAL_TO_DISPLAY_MAPPING: Record<
  InternalStepType,
  DisplayStepType
> = {
  [INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST]:
    DISPLAY_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST,
  [INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE]: DISPLAY_STEP_TYPES.LINKEDIN_MESSAGE,
  [INTERNAL_STEP_TYPES.EMAIL]: DISPLAY_STEP_TYPES.EMAIL,
};

// Mapping from display to internal types
export const DISPLAY_TO_INTERNAL_MAPPING: Record<
  DisplayStepType,
  InternalStepType
> = {
  [DISPLAY_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST]:
    INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST,
  [DISPLAY_STEP_TYPES.LINKEDIN_MESSAGE]: INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE,
  [DISPLAY_STEP_TYPES.EMAIL]: INTERNAL_STEP_TYPES.EMAIL,
};
