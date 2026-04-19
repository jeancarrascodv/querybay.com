import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLazyQuery } from "@apollo/client";
import { useParams } from "next/navigation";
import { useCampaignStepStore } from "@/store/useCampaignStepStore";
import { useStepStore } from "@/store/useStepStore";
import { useCampaignStore } from "@/store/useCampaignStore";
import { useContactsStore } from "@/store/useContactsStore";
import { useTeam } from "@/hooks/useTeam";
import { useLinkedInIntegrations } from "@/hooks/useLinkedInIntegrations";
import { INTERNAL_STEP_TYPES } from "../../constants";
import { FloatingFormatMenu } from "../FloatingFormatMenu";
import { Switch } from "@/components/ui/switch";
import { CircleArrow } from "@/public/icons/CircleArrow";
import { Mutations } from "@/graphql/campaignStep";
import { useToast } from "@/components/ui/use-toast";

interface ConfigureTabProps {
  onNext: (data: any) => void;
  onBack: () => void;
  onCancel: () => void;
  onCompleted: (data: any, continueEdit?: boolean) => void;
  onSaveComplete?: () => void; // Callback when autosave completes
  onUnsavedChangesChange?: (hasUnsaved: boolean) => void; // Callback when unsaved state changes
  onRegisterMethods?: (methods: {
    cancelSave: () => void;
    forceSave: () => Promise<void>;
    hasUnsavedChanges: () => boolean;
    discardChanges: () => void;
  }) => void; // Callback to register methods for parent control
  initialData: any;
  selectedNodeData?: any; // Data for the currently selected node, if available
  selectedNode: string | null;
  continueEdit?: boolean;
  mode?: "add" | "edit"; // Add mode prop
}

const DYNAMIC_FIELDS = [
  { label: "First Name", value: "{first_name}" },
  { label: "Title", value: "{title}" },
  { label: "Primary Email", value: "{email}" },
  { label: "Primary Phone", value: "{phone}" },
  { label: "Company", value: "{company}" },
  { label: "Location", value: "{location}" },
  { label: "Day of Week", value: "{day_of_week}" },
  { label: "Custom Message 1", value: "{custom_message_1}" },
  { label: "Custom Message 2", value: "{custom_message_2}" },
  { label: "RSVP Code", value: "{rsvp_code}" },
  { label: "Email Forwarding Key", value: "{forwarding_key}" },
] as const;

export const ContentTab = ({
  onNext,
  onBack,
  onCancel,
  onCompleted,
  onSaveComplete,
  onUnsavedChangesChange,
  onRegisterMethods,
  initialData,
  selectedNode,
  selectedNodeData,
  continueEdit = false,
  mode = "edit", // Default to edit for backward compatibility
}: ConfigureTabProps) => {
  const params = useParams();
  const urlCampaignId = params.campaignId as string;

  // Keep only UI-specific state like panel visibility in local component state
  const { stepData, steps } = useCampaignStepStore();
  const { selectedCampaign } = useCampaignStore();
  const { campaignContacts, getCampaignContacts } = useContactsStore();
  const { currentTeamId } = useTeam();
  const { integrations: linkedInIntegrations, loading: linkedInLoading } =
    useLinkedInIntegrations(true); // Skip query, only used when user opens LinkedIn step
  const [selectedContactForPreview, setSelectedContactForPreview] = useState<
    string | null
  >(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);
  const discardedRef = useRef(false); // Ref to track if changes were discarded (prevents unmount save)
  const isSavingRef = useRef(false); // Ref to track if save is in progress (for unmount check)
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { toast } = useToast();
  const { bulkUpdateSteps } = useCampaignStepStore();

  // Compute effective step ID - use selectedNodeData.id first, fallback to initialData.id
  // This handles the case when a step was just created and selectedNode hasn't been updated yet

  // Track previous values to detect actual changes
  const prevSubjectRef = useRef<string>("");
  const prevEmailBodyRef = useRef<string>("");
  const prevLinkedinMessageRef = useRef<string>("");
  const prevConnectionRequestMessageRef = useRef<string>("");

  // Track current step/campaign to detect changes
  const currentStepIdRef = useRef<string | null>(null);
  const currentCampaignIdRef = useRef<string | null>(null);

  // Fetch campaign contacts when component mounts
  useEffect(() => {
    if (selectedCampaign?.id && currentTeamId) {
      getCampaignContacts(currentTeamId, selectedCampaign.id);
    }
  }, [selectedCampaign?.id, currentTeamId, getCampaignContacts]);

  // Select first contact by default
  useEffect(() => {
    if (campaignContacts.length > 0 && !selectedContactForPreview) {
      setSelectedContactForPreview(campaignContacts[0].id);
    }
  }, [campaignContacts, selectedContactForPreview]);

  // Generate dynamic fields from selected contact's templateData
  const dynamicFieldsWithValues = useMemo(() => {
    // Standard fields that should always be shown
    const standardFields = [
      "first_name",
      "middle_name",
      "last_name",
      "full_name",
      "preferred_name",
      "title",
      "department",
      "seniority",
      "li_profile_url",
      "city",
      "state",
      "location",
      "country_full",
      "email",
      "phone",
      "company_name",
      "company_website",
      "company_city",
      "company_industry",
      "day_of_week",
      "custom_message_1",
      "custom_message_2",
      "rsvp_code",
      "forwarding_key",
    ];

    const selectedContact = campaignContacts.find(
      (c) => c.id === selectedContactForPreview,
    );

    const templateData = selectedContact?.templateData || {};

    // Combine standard fields with any additional fields from templateData
    const allFieldKeys = new Set([
      ...standardFields,
      ...Object.keys(templateData),
    ]);

    // Convert to field format with actual values or empty
    const fields = Array.from(allFieldKeys).map((key) => {
      const value = templateData[key];
      const label = key
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      return {
        label: value ? `${label}: ${value}` : label,
        value: `{{ ${key} }}`,
        hasValue: !!value,
      };
    });

    // Sort: fields with values first (alphabetically), then fields without values (alphabetically)
    return fields.sort((a, b) => {
      if (a.hasValue && !b.hasValue) return -1;
      if (!a.hasValue && b.hasValue) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [campaignContacts, selectedContactForPreview]);

  // Use the step store with Zustand's hooks pattern for better performance
  // This will only re-render when the subscribed values change
  const {
    stepType,
    subject,
    email_body,
    linkedinMessage,
    connectionRequestMessage,
    replyInThread,
    from,
    setSubject,
    setEmailBody,
    setLinkedinMessage,
    setConnectionRequestMessage,
    setReplyInThread,
    setFrom,
    addFromEmail,
    removeFromEmail,
    updateFromEmail,
    testRecipientEmail,
    testRecipientLinkedin,
    initFromSelectedNodeData,
    emailSender,
    linkedinAccount,
    setTestRecipientEmail,
    setTestRecipientLinkedin,
    setEmailSender,
    setLinkedinAccount,
    getStepData,
    reset: resetStepStore,
  } = useStepStore();

  // Reset all refs and store when step or campaign changes to prevent data mixing
  // This effect handles the transition BEFORE the new step data is initialized
  useEffect(() => {
    const newStepId = selectedNodeData?.id || initialData?.id || null;
    const newCampaignId = selectedCampaign?.id || null;

    const stepChanged =
      currentStepIdRef.current !== null &&
      currentStepIdRef.current !== newStepId;
    const campaignChanged =
      currentCampaignIdRef.current !== null &&
      currentCampaignIdRef.current !== newCampaignId;

    if (stepChanged || campaignChanged) {
      console.log("🔄 Step/Campaign changed, resetting store and refs", {
        prevStep: currentStepIdRef.current,
        newStep: newStepId,
        prevCampaign: currentCampaignIdRef.current,
        newCampaign: newCampaignId,
      });

      // Clear any pending save timeout first
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      // Reset all tracking refs BEFORE resetting the store
      // This prevents the old refs from being used for comparison
      prevSubjectRef.current = "";
      prevEmailBodyRef.current = "";
      prevLinkedinMessageRef.current = "";
      prevConnectionRequestMessageRef.current = "";
      hasInitializedRef.current = false;
      discardedRef.current = true; // Mark as discarded to prevent unmount save with old data
      setHasUnsavedChanges(false);
      setLastSavedAt(null);

      // Reset the Zustand store to clear all previous step data
      resetStepStore();
    }

    // Update current refs AFTER processing
    currentStepIdRef.current = newStepId;
    currentCampaignIdRef.current = newCampaignId;
  }, [
    selectedNodeData?.id,
    initialData?.id,
    selectedCampaign?.id,
    resetStepStore,
  ]);

  // Use useState to store step type flags
  const [stepTypeFlags, setStepTypeFlags] = useState({
    isLinkedIn: false,
    isEmail: false,
    isConnectionRequest: false,
    isLinkedInMessage: false,
  });

  // Initialize from selectedNodeData when in edit mode, or from initialData when step was just created
  useEffect(() => {
    const dataToInit =
      selectedNodeData || (initialData?.id ? initialData : null);

    if (dataToInit && mode === "edit" && !hasInitializedRef.current) {
      initFromSelectedNodeData(dataToInit);

      // Extract initial values directly from the node data to set refs
      const stepDataContent = dataToInit?.stepData || {};
      const emailData =
        stepDataContent?.SendEmail || stepDataContent?.sendEmail || {};
      const linkedInMessageData =
        stepDataContent?.SendLinkedInMessage ||
        stepDataContent?.sendLinkedInMessage ||
        {};
      const connectionRequestData =
        stepDataContent?.SendLinkedInConnectionRequest ||
        stepDataContent?.sendLinkedInConnectionRequest ||
        {};

      // Set refs with values from the actual node data (not from store which might be stale)
      prevSubjectRef.current = emailData.subject || "";
      prevEmailBodyRef.current = emailData.body || "";
      prevLinkedinMessageRef.current =
        linkedInMessageData.message ||
        linkedInMessageData.linkedinMessage ||
        "";
      prevConnectionRequestMessageRef.current =
        connectionRequestData.connectionRequestMessage ||
        connectionRequestData.message ||
        "";

      // Mark as initialized after a short delay to allow state to settle
      setTimeout(() => {
        hasInitializedRef.current = true;
      }, 100);
    }
  }, [selectedNodeData, initialData?.id, mode, initFromSelectedNodeData]);

  // Save content updates directly to API
  const saveContentUpdates = useCallback(async () => {
    // Use effectiveStepId which falls back to initialData.id when selectedNodeData is null
    const stepIdToSave = selectedNodeData?.id || initialData?.id;
    if (!selectedCampaign?.id || !stepIdToSave || isSaving) {
      return;
    }

    // Safeguard: Ensure we're saving to the step we're currently tracking
    // This prevents saving data to the wrong step when switching quickly
    if (currentStepIdRef.current !== stepIdToSave) {
      console.log(
        "⚠️ Step ID mismatch, skipping save to prevent data corruption",
        {
          tracked: currentStepIdRef.current,
          attempted: stepIdToSave,
        },
      );
      return;
    }

    const currentData = getStepData() as any;

    // Get step type from multiple sources - currentData may be empty for first step
    const effectiveStepType =
      currentData.stepType ||
      currentData.__typename ||
      selectedNodeData?.stepType ||
      initialData?.stepType ||
      stepType; // from useStepStore
    // Prioritize component state (from useStepStore) over getStepData() for current values
    // This ensures we save the latest typed value, not stale data
    const currentSubject = subject || currentData.subject || "";
    const currentEmailBody = email_body || currentData.body || "";

    // For LinkedIn steps, determine which message field to check based on step type
    // Use effectiveStepType which checks all possible sources
    const isConnectionRequestStep =
      effectiveStepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST ||
      effectiveStepType === "SendLinkedInConnectionRequest";

    // Get current message values - prioritize component state over store data
    const currentConnectionRequestMessage =
      connectionRequestMessage || currentData.connectionRequestMessage || "";
    const currentLinkedinMessage = isConnectionRequestStep
      ? currentConnectionRequestMessage
      : linkedinMessage || currentData.linkedinMessage || "";

    // Check if content has actually changed compared to previous saved values
    const hasChanged =
      currentSubject !== prevSubjectRef.current ||
      currentEmailBody !== prevEmailBodyRef.current ||
      (isConnectionRequestStep
        ? currentConnectionRequestMessage !==
          prevConnectionRequestMessageRef.current
        : currentLinkedinMessage !== prevLinkedinMessageRef.current);

    console.log("Checking for content changes...", {
      effectiveStepType,
      isConnectionRequestStep,
      currentSubject,
      prevSubject: prevSubjectRef.current,
      currentEmailBody,
      prevEmailBody: prevEmailBodyRef.current,
      currentConnectionRequestMessage,
      prevConnectionRequestMessage: prevConnectionRequestMessageRef.current,
      currentLinkedinMessage,
      prevLinkedinMessage: prevLinkedinMessageRef.current,
      hasChanged,
    });
    if (!hasChanged) {
      console.log("⏭️ No changes detected, skipping save");
      return;
    }

    // Prevent duplicate saves within 1 second
    if (lastSavedAt && new Date().getTime() - lastSavedAt.getTime() < 1000) {
      return;
    }

    try {
      setIsSaving(true);
      isSavingRef.current = true;

      console.log("Preparing to save content updates...", {
        effectiveStepType,
        currentConnectionRequestMessage,
        currentLinkedinMessage,
        currentSubject,
        currentEmailBody,
      });

      // Build step mutation based on step type
      const stepMutation: any = {
        id: stepIdToSave,
      };

      // Determine step type and structure data accordingly using effectiveStepType
      if (
        effectiveStepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST ||
        effectiveStepType === "SendLinkedInConnectionRequest"
      ) {
        // LinkedIn connection request
        stepMutation.stepData = {
          sendLinkedInConnectionRequest: {
            connectionRequestMessage: currentConnectionRequestMessage,
          },
        };
      } else if (
        effectiveStepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE ||
        effectiveStepType === "SendLinkedInMessage"
      ) {
        // LinkedIn message
        stepMutation.stepData = {
          sendLinkedInMessage: {
            linkedinMessage: currentLinkedinMessage,
          },
        };
      } else if (
        effectiveStepType === INTERNAL_STEP_TYPES.EMAIL ||
        effectiveStepType === "SendEmail"
      ) {
        // Email step
        // Extract the first sender UUID from the array (schema expects single UUID, not array)
        const currentData = getStepData() as any;
        let fromSender = null;
        if (Array.isArray(currentData.from) && currentData.from.length > 0) {
          const firstSender = currentData.from[0];
          // If sender is already a string UUID, use it
          if (typeof firstSender === "string") {
            fromSender = firstSender;
          }
          // If sender is an object with uuid or id property
          else if (firstSender?.uuid) {
            fromSender = firstSender.uuid;
          } else if (firstSender?.id) {
            fromSender = firstSender.id;
          }
        }

        stepMutation.stepData = {
          sendEmail: {
            subject: currentSubject,
            body: currentEmailBody,
            from: fromSender,
            replyToPrevious:
              currentData.replyInThread || replyInThread || false,
          },
        };
      }

      const bulkUpdateInput = {
        stepCreations: [],
        stepMutations: [stepMutation],
        linkCreations: [],
        linkMutations: [],
      };

      await bulkUpdateSteps(selectedCampaign.id, bulkUpdateInput);

      setLastSavedAt(new Date());

      // Notify parent that save completed
      onSaveComplete?.();

      // Update previous values after successful save with the actual values we saved
      prevSubjectRef.current = currentSubject;
      prevEmailBodyRef.current = currentEmailBody;

      // Update the appropriate message ref based on step type
      if (isConnectionRequestStep) {
        prevConnectionRequestMessageRef.current =
          currentConnectionRequestMessage;
      } else {
        prevLinkedinMessageRef.current = currentLinkedinMessage;
      }

      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("❌ Error saving content:", error);
      toast({
        title: "Error saving content",
        description:
          "There was a problem saving your changes. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }, [
    selectedCampaign?.id,
    selectedNodeData?.id,
    selectedNodeData?.stepType,
    initialData?.id,
    initialData?.stepType,
    stepType,
    subject,
    email_body,
    connectionRequestMessage,
    linkedinMessage,
    replyInThread,
    isSaving,
    lastSavedAt,
    getStepData,
    bulkUpdateSteps,
    toast,
  ]);

  // Helper function to check if content has actually changed
  const hasActualContentChanges = useCallback(() => {
    const currentData = getStepData() as any;

    // Get step type from multiple sources - currentData may be empty for first step
    const effectiveStepTypeForCheck =
      currentData.stepType ||
      currentData.__typename ||
      selectedNodeData?.stepType ||
      initialData?.stepType ||
      stepType;

    // Prioritize component state over getStepData() for current values
    const currentSubject = subject || currentData.subject || "";
    const currentEmailBody = email_body || currentData.body || "";

    // Use effectiveStepType which checks all possible sources
    const isConnectionRequestStep =
      effectiveStepTypeForCheck ===
        INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST ||
      effectiveStepTypeForCheck === "SendLinkedInConnectionRequest";

    const currentConnectionRequestMessage =
      connectionRequestMessage || currentData.connectionRequestMessage || "";
    const currentLinkedinMessage = isConnectionRequestStep
      ? currentConnectionRequestMessage
      : linkedinMessage || currentData.linkedinMessage || "";

    return (
      currentSubject !== prevSubjectRef.current ||
      currentEmailBody !== prevEmailBodyRef.current ||
      (isConnectionRequestStep
        ? currentConnectionRequestMessage !==
          prevConnectionRequestMessageRef.current
        : currentLinkedinMessage !== prevLinkedinMessageRef.current)
    );
  }, [
    getStepData,
    selectedNodeData?.stepType,
    initialData?.stepType,
    stepType,
    subject,
    email_body,
    connectionRequestMessage,
    linkedinMessage,
  ]);

  // Track unsaved changes when content changes
  useEffect(() => {
    const currentStepId = selectedNodeData?.id || initialData?.id;
    if (hasInitializedRef.current && mode === "edit" && currentStepId) {
      const hasChanges = hasActualContentChanges();
      setHasUnsavedChanges(hasChanges);
    }
  }, [
    mode,
    selectedNodeData?.id,
    initialData?.id,
    subject,
    email_body,
    linkedinMessage,
    connectionRequestMessage,
    hasActualContentChanges,
  ]);

  // Notify parent when unsaved changes state changes
  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  // Register methods for parent component to control save behavior
  useEffect(() => {
    onRegisterMethods?.({
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
        if (hasUnsavedChanges && hasActualContentChanges()) {
          await saveContentUpdates();
        }
      },
      hasUnsavedChanges: () => hasUnsavedChanges && hasActualContentChanges(),
      discardChanges: () => {
        discardedRef.current = true;
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        setHasUnsavedChanges(false);
      },
    });
  }, [
    onRegisterMethods,
    hasUnsavedChanges,
    hasActualContentChanges,
    saveContentUpdates,
  ]);

  // Debounced auto-save when content changes
  useEffect(() => {
    // Skip auto-save if not initialized yet
    if (!hasInitializedRef.current) {
      return;
    }

    const currentStepId = selectedNodeData?.id || initialData?.id;
    if (mode === "edit" && currentStepId && !isSaving) {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Capture the step ID at the time of scheduling
      const stepIdAtSchedule = currentStepId;

      // Set new timeout for auto-save
      saveTimeoutRef.current = setTimeout(() => {
        // Verify step ID hasn't changed before saving
        if (currentStepIdRef.current === stepIdAtSchedule) {
          console.log("💾 Auto-saving content changes...");
          saveContentUpdates();
        } else {
          console.log("⏭️ Skipping auto-save, step has changed");
        }
      }, 2000); // Wait 2 seconds of inactivity before saving

      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
      };
    }
  }, [
    mode,
    selectedNodeData?.id,
    initialData?.id,
    subject,
    email_body,
    linkedinMessage,
    connectionRequestMessage,
    isSaving,
    saveContentUpdates,
  ]);

  // Save pending changes when component unmounts (tab closes)
  // Using a ref to capture latest values for the cleanup function
  const saveOnUnmountRef = useRef<() => void>(() => {});

  useEffect(() => {
    // Capture the current step ID for comparison
    const currentStepId = selectedNodeData?.id || initialData?.id;

    // Update the ref with the latest save function that has access to current state
    saveOnUnmountRef.current = () => {
      if (
        hasInitializedRef.current &&
        mode === "edit" &&
        currentStepId &&
        currentStepIdRef.current === currentStepId && // Verify step hasn't changed
        !discardedRef.current &&
        !isSavingRef.current
      ) {
        // Check for actual changes using current values
        const currentSubject = subject || "";
        const currentEmailBody = email_body || "";
        const currentLinkedinMsg = linkedinMessage || "";
        const currentConnectionMsg = connectionRequestMessage || "";

        const hasChanges =
          currentSubject !== prevSubjectRef.current ||
          currentEmailBody !== prevEmailBodyRef.current ||
          currentLinkedinMsg !== prevLinkedinMessageRef.current ||
          currentConnectionMsg !== prevConnectionRequestMessageRef.current;

        if (hasChanges) {
          console.log("🔄 Component unmounting, saving pending changes...");
          saveContentUpdates();
        }
      }
    };
  }, [
    mode,
    selectedNodeData?.id,
    initialData?.id,
    subject,
    email_body,
    linkedinMessage,
    connectionRequestMessage,
    saveContentUpdates,
  ]);

  useEffect(() => {
    return () => {
      // Clear any pending timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      // Call the save function from ref (has access to latest state)
      saveOnUnmountRef.current();

      // Reset the store when component unmounts to prevent stale data
      resetStepStore();
    };
  }, [resetStepStore]);
  // Update the step type flags whenever stepData, stepType, or selectedNodeData changes
  useEffect(() => {
    console.log("Updating step type flags based on stepData and stepType");
    const currentStepType =
      selectedNodeData?.stepType || stepType || stepData?.stepType;

    setStepTypeFlags({
      isLinkedIn:
        currentStepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST ||
        currentStepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE,
      isEmail: currentStepType === INTERNAL_STEP_TYPES.EMAIL,
      isConnectionRequest:
        currentStepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST ||
        stepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST,
      isLinkedInMessage:
        currentStepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE ||
        stepType === INTERNAL_STEP_TYPES.LINKEDIN_MESSAGE,
    });
  }, [stepData.stepType, stepType, selectedNodeData?.stepType]);

  // Destructure for easier access in the component
  const { isLinkedIn, isEmail, isConnectionRequest, isLinkedInMessage } =
    stepTypeFlags;

  // Check for multiple email steps and set reply flag if needed
  useEffect(() => {
    if (steps && steps.length > 0) {
      // Count email steps
      const emailSteps = steps.filter((step) => step?.stepData?.sendEmail);

      // Set replyInThread directly in the store if we have multiple email steps
      if (emailSteps.length > 1 && !replyInThread) {
        setReplyInThread(true);
      }
    }
  }, [steps, replyInThread, setReplyInThread]);

  // LinkedIn Message Content

  // Email Content

  // Path Condition Content (keeping original design as no image provided)

  // Main content selection
  const activeTabContent = isEmail ? (
    <EmailContent
      selectedNodeData={selectedNodeData}
      dynamicFields={dynamicFieldsWithValues}
      contacts={campaignContacts}
      selectedContactForPreview={selectedContactForPreview}
      setSelectedContactForPreview={setSelectedContactForPreview}
    />
  ) : (
    <LinkedInMessageContent
      selectedNodeData={selectedNodeData}
      dynamicFields={dynamicFieldsWithValues}
      contacts={campaignContacts}
      selectedContactForPreview={selectedContactForPreview}
      setSelectedContactForPreview={setSelectedContactForPreview}
    />
  );

  return activeTabContent;
};

const LinkedInMessageContent = ({
  selectedNodeData,
  dynamicFields = [],
  contacts = [],
  selectedContactForPreview,
  setSelectedContactForPreview,
}: {
  selectedNodeData: any;
  dynamicFields?: Array<{ label: string; value: string }>;
  contacts?: any[];
  selectedContactForPreview?: string | null;
  setSelectedContactForPreview?: (id: string) => void;
}) => {
  const { campaignId: urlCampaignId } = useParams() as { campaignId: string };
  // Use the step store with direct access to prevent re-rendering
  const {
    stepType,
    linkedinMessage,
    connectionRequestMessage,
    linkedinAccount,
    testRecipientLinkedin,
    setLinkedinMessage,
    setConnectionRequestMessage,
    setLinkedinAccount,
    setTestRecipientLinkedin,
  } = useStepStore();

  // Get LinkedIn integrations for test step selector
  const { integrations: linkedInIntegrations, loading: linkedInLoading } =
    useLinkedInIntegrations();

  // Determine if this is a connection request based on step type
  // Check all possible sources: stepType from store and selectedNodeData
  const isConnectionRequest =
    selectedNodeData?.stepData?.__typename ===
      "SendLinkedInConnectionRequest" ||
    stepType === INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST ||
    selectedNodeData?.stepType ===
      INTERNAL_STEP_TYPES.LINKEDIN_CONNECTION_REQUEST ||
    selectedNodeData?.stepType === "SendLinkedInConnectionRequest";
  // selectedNodeData?.id is already defined at the top of the component with proper fallback
  // Keep only UI-specific state in local component state
  const [isFloatingPanel, setIsFloatingPanel] = useState(false);
  const [showDynamicFields, setShowDynamicFields] = useState(false);
  const [formatMenuPosition, setFormatMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [renderedOutputs, setRenderedOutputs] = useState<{
    [key: string]: string;
  }>({});
  const [isRendering, setIsRendering] = useState(false);
  const [failedContacts, setFailedContacts] = useState<
    Array<{ index: number; contact: any }>
  >([]);
  const [selectedRenderContact, setSelectedRenderContact] = useState<
    string | null
  >(null);
  const [singleContactError, setSingleContactError] = useState<string | null>(
    null,
  );
  const [isRenderingSingleContact, setIsRenderingSingleContact] =
    useState(false);

  // Create ref for the LinkedIn textarea
  const linkedInTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { selectedCampaign } = useCampaignStore();
  const [, setDebounceTrigger] = useState(0); // Trigger for parent's debounced save

  // Render template query
  const [renderTemplate] = useLazyQuery(Mutations.RENDER_TEMPLATE);
  // Handle render button click
  const handleRender = async () => {
    const firstContactId = contacts[0]?.id;
    const contactIds = contacts.map((c) => c.id);
    const messageToRender = isConnectionRequest
      ? connectionRequestMessage
      : linkedinMessage;

    if (
      !selectedNodeData?.id ||
      !firstContactId ||
      !messageToRender ||
      !selectedCampaign?.id
    ) {
      return;
    }

    setIsRendering(true);
    try {
      const { data } = await renderTemplate({
        variables: {
          campaignId: urlCampaignId,
          campaignContactIds: contactIds,
          template: messageToRender,
        },
      });

      // Find the matching step and get its rendered output
      const steps = data?.team?.campaign?.steps || [];
      const matchingStep = steps.find(
        (s: any) => s.id === selectedNodeData?.id,
      );
      const renderResults = matchingStep?.render || [];

      // Store all rendered outputs by contact ID
      const outputs: { [key: string]: string } = {};
      const failed: Array<{ index: number; contact: any }> = [];

      renderResults.forEach((result: string | null, index: number) => {
        if (contacts[index]) {
          if (result === null) {
            failed.push({
              index: contacts[index].name,
              contact: contacts[index],
            });
          } else {
            outputs[contacts[index].id] = result;
          }
        }
      });

      setRenderedOutputs(outputs);
      setFailedContacts(failed);

      // Auto-select first contact if none selected
      if (!selectedRenderContact && contacts[0]) {
        setSelectedRenderContact(contacts[0].id);
      }
    } catch (error) {
      console.error("Error rendering template:", error);
      setRenderedOutputs({});
    } finally {
      setIsRendering(false);
    }
  };

  // Handle render for a single failed contact to get specific error
  const handleRenderSingleContact = async (contactId: string) => {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact || !selectedNodeData?.id || !selectedCampaign?.id) {
      return;
    }

    const messageToRender = isConnectionRequest
      ? connectionRequestMessage
      : linkedinMessage;

    if (!messageToRender) return;

    setIsRenderingSingleContact(true);
    setSingleContactError(null);

    try {
      const { data, error } = await renderTemplate({
        variables: {
          campaignId: urlCampaignId,
          campaignContactIds: [contactId],
          template: messageToRender,
        },
      });

      // Check for GraphQL errors
      if (error) {
        setSingleContactError(error.message || "Failed to render template");
        return;
      }

      // Find the matching step and get its rendered output
      const steps = data?.team?.campaign?.steps || [];
      const matchingStep = steps.find((s: any) => s.id === selectedNodeData.id);
      const renderResults = matchingStep?.render || [];

      if (renderResults.length === 0) {
        setSingleContactError("No render results returned from server");
        return;
      }

      const result = renderResults[0];
      if (result === null) {
        // If still null, show generic message about missing fields
        setSingleContactError(
          "Template rendering failed. This contact is missing required template fields. Check the available data below to see which fields are empty or missing.",
        );
      } else {
        // It succeeded on retry - update the rendered outputs
        setRenderedOutputs((prev) => ({ ...prev, [contactId]: result }));
        setFailedContacts((prev) =>
          prev.filter((f) => f.contact.id !== contactId),
        );
        setSingleContactError(null);
      }
    } catch (err: any) {
      setSingleContactError(
        err?.message || "An unexpected error occurred while rendering",
      );
    } finally {
      setIsRenderingSingleContact(false);
    }
  };

  // Character count for LinkedIn connection request
  const connectionRequestLength = linkedinMessage?.length || 0;
  const maxConnectionRequestLength = 290;

  // Insert field handler - uses the store directly
  const insertField = (field: string): void => {
    if (linkedInTextareaRef.current) {
      const start = linkedInTextareaRef.current.selectionStart;
      const end = linkedInTextareaRef.current.selectionEnd;
      const text = isConnectionRequest
        ? connectionRequestMessage || ""
        : linkedinMessage || "";
      const before = text.substring(0, start);
      const after = text.substring(end);

      const newMessage = before + field + after;
      // Use step store setter directly based on message type
      if (isConnectionRequest) {
        setConnectionRequestMessage(newMessage);
      } else {
        setLinkedinMessage(newMessage);
      }

      // Set cursor position after inserted field and maintain focus
      setTimeout(() => {
        if (linkedInTextareaRef.current) {
          linkedInTextareaRef.current.selectionStart =
            linkedInTextareaRef.current.selectionEnd = start + field.length;
          linkedInTextareaRef.current.focus();
        }
      }, 0);

      // Close popover after insertion
      setShowDynamicFields(false);
    }
  };

  // Format text handler - uses the store directly
  const handleFormatText = (format: string) => {
    if (!linkedInTextareaRef.current) return;

    const start = linkedInTextareaRef.current.selectionStart;
    const end = linkedInTextareaRef.current.selectionEnd;
    const text = isConnectionRequest
      ? connectionRequestMessage || ""
      : linkedinMessage || "";
    const selectedText = text.substring(start, end);
    let formattedText = "";

    switch (format) {
      case "bold":
        formattedText = `<b>${selectedText}</b>`;
        break;
      case "italic":
        formattedText = `<i>${selectedText}</i>`;
        break;
      case "link":
        formattedText = `<a href="#">${selectedText}</a>`;
        break;
      case "list":
        formattedText = `\n<ul>\n  <li>${selectedText}</li>\n</ul>`;
        break;
    }

    const before = text.substring(0, start);
    const after = text.substring(end);
    const newValue = before + formattedText + after;

    // Use step store setter directly based on message type
    if (isConnectionRequest) {
      setConnectionRequestMessage(newValue);
    } else {
      setLinkedinMessage(newValue);
    }
    setFormatMenuPosition(null);

    // Focus back on textarea and position cursor at the end of the formatted text
    setTimeout(() => {
      if (linkedInTextareaRef.current) {
        linkedInTextareaRef.current.focus();
        linkedInTextareaRef.current.selectionStart =
          linkedInTextareaRef.current.selectionEnd =
            start + formattedText.length;
      }
    }, 0);
  };

  // Text selection handler for format menu
  const handleTextSelection = () => {
    if (!linkedInTextareaRef.current) return;

    setTimeout(() => {
      const textarea = linkedInTextareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Check if there's actually selected text
      if (start !== end && end > start) {
        // Use a simpler positioning approach for LinkedIn
        const rect = textarea.getBoundingClientRect();
        const scrollTop = textarea.scrollTop;

        // Calculate approximate position based on character count
        const textBeforeSelection = textarea.value.substring(0, start);
        const lines = textBeforeSelection.split("\n");
        const currentLineIndex = lines.length - 1;
        const currentLineText = lines[currentLineIndex] || "";

        // Use approximate character measurements
        const charWidth = 8; // Slightly larger for better positioning
        const lineHeight = 28; // Account for line height in LinkedIn textarea

        // Position relative to textarea
        const x =
          rect.left +
          Math.min(currentLineText.length * charWidth, rect.width - 100);
        const y = rect.top + currentLineIndex * lineHeight - scrollTop - 60;

        setFormatMenuPosition({
          x: Math.min(Math.max(x, 10), window.innerWidth - 200),
          y: Math.max(y, 10),
        });
      } else {
        setFormatMenuPosition(null);
      }
    }, 10); // Small delay to ensure selection is registered
  };
  return (
    <div
      className={
        isFloatingPanel
          ? "fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          : "bg-slate-950 text-white min-h-screen "
      }
    >
      <div
        className={
          isFloatingPanel
            ? "bg-slate-950 text-white rounded-lg shadow-2xl w-[900px] max-w-[95vw] max-h-[90vh] overflow-auto p-10 relative"
            : "max-w-4xl mx-auto space-y-6"
        }
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white">
            {isConnectionRequest
              ? "Connection Request Message"
              : "LinkedIn Message"}
          </h2>
          {isFloatingPanel ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white"
              onClick={() => setIsFloatingPanel(false)}
              aria-label="Close floating panel"
            >
              <span className="text-xl">×</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white"
              onClick={() => setIsFloatingPanel(true)}
              aria-label="Float panel"
            >
              <CircleArrow className="h-5 w-5" />
            </Button>
          )}
        </div>

        <div className="space-y-6">
          <div className="relative">
            <Textarea
              ref={linkedInTextareaRef}
              placeholder={
                isConnectionRequest
                  ? "Enter LinkedIn connection request (max 290 characters)"
                  : "Enter LinkedIn message"
              }
              className="bg-slate-800 border-slate-700 text-white min-h-[200px] text-sm placeholder:text-gray-400 resize-none"
              value={
                isConnectionRequest
                  ? connectionRequestMessage || ""
                  : linkedinMessage || ""
              }
              onChange={(e) => {
                // Use step store setter directly
                if (isConnectionRequest) {
                  setConnectionRequestMessage(e.target.value);
                } else {
                  setLinkedinMessage(e.target.value);
                }
                // Trigger debounced auto-save
                setDebounceTrigger((prev) => prev + 1);
              }}
              onMouseUp={handleTextSelection}
              onKeyUp={handleTextSelection}
              onSelect={handleTextSelection}
              onFocus={() => {
                // Focus is on the linkedin textarea
              }}
            />
            <Popover
              open={showDynamicFields}
              onOpenChange={setShowDynamicFields}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-6 w-6 p-0 text-gray-400  hover:bg-slate-200"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 bg-slate-800 border-slate-700 text-white p-0 max-h-96 overflow-y-auto">
                <div className="py-2">
                  {dynamicFields.length > 0 ? (
                    dynamicFields.map((field) => (
                      <button
                        key={field.value}
                        className="w-full text-left px-4 py-2 hover:bg-slate-700 text-sm"
                        onClick={() => insertField(field.value)}
                      >
                        {field.label}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-sm text-gray-400">
                      No contacts available
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {isConnectionRequest && (
            <div className="text-right text-sm text-gray-400">
              {(connectionRequestMessage || "").length}/290
              {(connectionRequestMessage || "").length > 290 && (
                <span className="text-red-400 ml-2">
                  Character limit exceeded
                </span>
              )}
            </div>
          )}

          {/* Render Preview Section */}
          {contacts.length > 0 && (
            <div className="border-t border-slate-700 pt-4 mt-4">
              <h3 className="text-md font-medium text-white mb-3">
                Render Preview
              </h3>
              <div className="space-y-3">
                <Button
                  variant="default"
                  className=" px-4 py-2 text-sm"
                  onClick={handleRender}
                  disabled={
                    isRendering ||
                    !selectedContactForPreview ||
                    !(isConnectionRequest
                      ? connectionRequestMessage
                      : linkedinMessage)
                  }
                >
                  {isRendering ? "Rendering..." : "Render Template"}
                </Button>
                {/* Rendered Output */}
                {selectedRenderContact &&
                  renderedOutputs[selectedRenderContact] && (
                    <div>
                      <Label className="text-white text-sm font-medium mb-2 block">
                        Rendered Output
                      </Label>
                      <Textarea
                        value={renderedOutputs[selectedRenderContact] || ""}
                        readOnly
                        className="bg-slate-800 border-slate-700 text-white min-h-[100px] text-sm resize-none"
                        placeholder="Click 'Render Template' to see the output"
                        style={{ minHeight: "200px" }}
                      />
                    </div>
                  )}
                {/* Show failed contacts if any */}
                {failedContacts.length > 0 && (
                  <div className="mt-3 p-3 bg-red-900/20 border border-red-700 rounded-md">
                    <Label className="text-red-400 text-sm font-medium block mb-2">
                      Failed to Render ({failedContacts.length} contacts)
                    </Label>
                    <div className="text-xs text-red-300 space-y-1 max-h-32 overflow-y-auto">
                      {failedContacts.map((failed) => (
                        <div
                          key={failed.index}
                          className="flex items-start gap-2"
                        >
                          <span className="font-mono">#{failed.index}:</span>
                          <span>
                            {failed.contact.contact.firstName || ""}{" "}
                            {failed.contact.contact.lastName || ""}
                            {failed.contact.contact.email
                              ? ` (${failed.contact.contact.email})`
                              : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Contact Selector */}
                {Object.keys(renderedOutputs).length > 0 ||
                failedContacts.length > 0 ? (
                  <div>
                    <Label className="text-white text-sm font-medium mb-2 block">
                      Select Contact to View the Template Data
                    </Label>
                    <Select
                      value={selectedRenderContact || ""}
                      onValueChange={(id) => {
                        setSelectedRenderContact(id);
                        setSingleContactError(null);
                        // If this is a failed contact, trigger single render to get error
                        if (!renderedOutputs[id]) {
                          handleRenderSingleContact(id);
                        }
                      }}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-10 text-sm">
                        <SelectValue placeholder="Select a contact" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                        {/* Sort contacts: failed first, then successful */}
                        {[...contacts]
                          .sort((a, b) => {
                            const aFailed = !renderedOutputs[a.id];
                            const bFailed = !renderedOutputs[b.id];
                            if (aFailed && !bFailed) return -1;
                            if (!aFailed && bFailed) return 1;
                            return 0;
                          })
                          .map((contact: any) => {
                            const displayName =
                              contact.contact?.fullName || "Unknown Contact";
                            const failed = !renderedOutputs[contact.id];
                            return (
                              <SelectItem
                                key={contact.id}
                                value={contact.id}
                                className={`text-sm ${failed ? "text-red-400" : "text-white"}`}
                              >
                                {failed ? "⚠️ " : "✓ "}
                                {displayName}
                                {failed ? " (Failed)" : ""}
                              </SelectItem>
                            );
                          })}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {/* Contact Template Data or Error Details */}
                {selectedRenderContact &&
                  (() => {
                    const selectedContact = contacts.find(
                      (c) => c.id === selectedRenderContact,
                    );
                    const hasFailed = !renderedOutputs[selectedRenderContact];
                    const templateData = selectedContact?.templateData || {};
                    const templateKeys = Object.keys(templateData);

                    // Find missing fields by parsing the template
                    const messageToCheck = isConnectionRequest
                      ? connectionRequestMessage
                      : linkedinMessage;
                    const fieldPattern = /\{\{?\s*(\w+)\s*\}?\}/g;
                    const usedFields: string[] = [];
                    let match;
                    while (
                      (match = fieldPattern.exec(messageToCheck || "")) !== null
                    ) {
                      usedFields.push(match[1]);
                    }

                    const missingFields = usedFields.filter(
                      (field) =>
                        !templateData[field] ||
                        templateData[field] === "" ||
                        templateData[field] === null,
                    );

                    if (templateKeys.length === 0 && !hasFailed) {
                      return null;
                    }

                    return (
                      <div
                        className={`p-3 ${hasFailed ? "bg-red-900/20 border-red-700" : "bg-slate-800/50 border-slate-700"} border rounded-md`}
                      >
                        {hasFailed && missingFields.length > 0 && (
                          <div className="mb-4">
                            <Label className="text-red-400 text-sm font-medium block mb-2">
                              ⚠️ Missing Required Fields
                            </Label>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {missingFields.map((field) => (
                                <span
                                  key={field}
                                  className="px-2 py-1 bg-red-900/40 border border-red-600 text-red-300 text-xs rounded font-mono"
                                >
                                  {`{{ ${field} }}`}
                                </span>
                              ))}
                            </div>
                            <p className="text-xs text-gray-400 mb-2">
                              To fix: Either add data for these fields for this
                              contact, or remove these placeholders from your
                              template.
                            </p>
                          </div>
                        )}

                        {/* Single Contact Render Error/Loading */}
                        {hasFailed && isRenderingSingleContact && (
                          <div className="mb-4 p-3 bg-slate-700/50 border border-slate-600 rounded-md flex items-center gap-2">
                            <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                            <span className="text-sm text-gray-300">
                              Re-rendering this contact...
                            </span>
                          </div>
                        )}

                        {hasFailed &&
                          singleContactError &&
                          !isRenderingSingleContact && (
                            <div className="mb-4 p-3 bg-red-900/30 border border-red-600 rounded-md">
                              <Label className="text-red-400 text-sm font-medium block mb-1">
                                ❌ Render Error
                              </Label>
                              <p className="text-red-300 text-xs">
                                {singleContactError}
                              </p>
                            </div>
                          )}

                        <Label className="text-white text-sm font-medium block mb-2">
                          {hasFailed
                            ? "Available Data for This Contact"
                            : "Available Template Data"}
                        </Label>
                        {templateKeys.length > 0 ? (
                          <div className="grid grid-cols-2 gap-2 text-xs max-h-40 overflow-y-auto">
                            {Object.entries(templateData)
                              .sort(([keyA], [keyB]) => {
                                // Sort missing fields first
                                const aMissing = missingFields.includes(keyA);
                                const bMissing = missingFields.includes(keyB);
                                if (aMissing && !bMissing) return -1;
                                if (!aMissing && bMissing) return 1;
                                return keyA.localeCompare(keyB);
                              })
                              .map(([key, value]) => {
                                const isMissing =
                                  !value || value === "" || value === null;
                                return (
                                  <div
                                    key={key}
                                    className={`flex flex-col gap-0.5 p-1.5 rounded ${isMissing ? "bg-red-900/30" : "bg-slate-700/30"}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span
                                        className={`font-mono text-[11px] ${isMissing ? "text-red-400" : "text-gray-400"}`}
                                      >{`{{ ${key} }}`}</span>
                                      {!isMissing && (
                                        <button
                                          className="text-[10px] text-blue-400 hover:text-blue-300 px-1"
                                          onClick={() => {
                                            navigator.clipboard.writeText(
                                              String(value),
                                            );
                                          }}
                                          title="Copy value"
                                        >
                                          Copy
                                        </button>
                                      )}
                                    </div>
                                    <span
                                      className={`break-words ${isMissing ? "text-red-300 italic" : "text-white"}`}
                                    >
                                      {isMissing
                                        ? "(empty/missing)"
                                        : String(value)}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        ) : (
                          <p className="text-gray-400 text-xs italic">
                            No template data available for this contact
                          </p>
                        )}
                      </div>
                    );
                  })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
const EmailContent = ({
  selectedNodeData,
  dynamicFields = [],
  contacts = [],
  selectedContactForPreview,
  setSelectedContactForPreview,
}: {
  selectedNodeData?: any;
  dynamicFields?: Array<{ label: string; value: string }>;
  contacts?: any[];
  selectedContactForPreview?: string | null;
  setSelectedContactForPreview?: (id: string) => void;
}) => {
  const { steps } = useCampaignStepStore();
  // Check if there are any email steps in the campaign
  // Memoize the check for email steps to prevent recalculation on every render
  const hasEmailSteps = useMemo(() => {
    return steps?.some(
      (step: any) =>
        step?.stepData?.__typename === INTERNAL_STEP_TYPES.EMAIL ||
        step?.stepData?.sendEmail,
    );
  }, [steps]);

  // Use the step store with direct access to prevent re-rendering
  const {
    subject,
    email_body,
    replyInThread,
    testRecipientEmail,
    emailSender,
    setSubject,
    setEmailBody,
    setReplyInThread,
    setTestRecipientEmail,
    setEmailSender,
  } = useStepStore();

  // Keep only UI-specific state in local component state
  const [isFloatingPanel, setIsFloatingPanel] = useState(false);
  const [formatMenuPosition, setFormatMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showDynamicFields, setShowDynamicFields] = useState(false);
  const [renderedOutputs, setRenderedOutputs] = useState<{
    [key: string]: string;
  }>({});
  const [isRendering, setIsRendering] = useState(false);
  const [failedContacts, setFailedContacts] = useState<
    Array<{ index: number; contact: any }>
  >([]);
  const [selectedRenderContact, setSelectedRenderContact] = useState<
    string | null
  >(null);
  const { campaignId: urlCampaignId } = useParams() as { campaignId: string };

  // Create ref for the email textarea
  const emailTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { selectedCampaign } = useCampaignStore();
  const [, setDebounceTrigger] = useState(0); // Trigger for parent's debounced save

  // Render template query
  const [renderTemplate] = useLazyQuery(Mutations.RENDER_TEMPLATE);

  // Handle render button click
  const handleRender = async () => {
    const contactIds = contacts.map((c) => c.id);
    if (
      !selectedNodeData?.id ||
      !contactIds.length ||
      !email_body ||
      !selectedCampaign?.id
    ) {
      console.log("Render blocked:", {
        hasStepId: !!selectedNodeData?.id,
        contactCount: contactIds.length,
        hasEmailBody: !!email_body,
        hasCampaignId: !!selectedCampaign?.id,
      });
      return;
    }

    setIsRendering(true);
    try {
      const { data } = await renderTemplate({
        variables: {
          campaignId: urlCampaignId,
          campaignContactIds: contactIds,
          template: email_body,
        },
      });

      // Find the matching step and get its rendered output
      const steps = data?.team?.campaign?.steps || [];
      const matchingStep = steps.find((s: any) => s.id === selectedNodeData.id);
      const renderResults = matchingStep?.render || [];

      // Store all rendered outputs by contact ID
      const outputs: { [key: string]: string } = {};
      const failed: Array<{ index: number; contact: any }> = [];

      renderResults.forEach((result: string | null, index: number) => {
        if (contacts[index]) {
          if (result === null) {
            failed.push({
              index: index + 1,
              contact: contacts[index],
            });
          } else {
            outputs[contacts[index].id] = result;
          }
        }
      });

      setRenderedOutputs(outputs);
      setFailedContacts(failed);

      // Auto-select first contact if none selected
      if (!selectedRenderContact && contacts[0]) {
        setSelectedRenderContact(contacts[0].id);
      }
    } catch (error) {
      console.error("Error rendering template:", error);
      setRenderedOutputs({});
    } finally {
      setIsRendering(false);
    }
  };

  // Insert field handler - uses the store directly
  const insertField = (field: string): void => {
    if (emailTextareaRef.current) {
      const start = emailTextareaRef.current.selectionStart;
      const end = emailTextareaRef.current.selectionEnd;
      const text = email_body || "";
      const before = text.substring(0, start);
      const after = text.substring(end);

      const newBody = before + field + after;
      // Use step store setter directly
      setEmailBody(newBody);

      // Set cursor position after inserted field and maintain focus
      setTimeout(() => {
        if (emailTextareaRef.current) {
          emailTextareaRef.current.selectionStart =
            emailTextareaRef.current.selectionEnd = start + field.length;
          emailTextareaRef.current.focus();
        }
      }, 0);

      // Close popover after insertion
      setShowDynamicFields(false);
    }
  };

  // Format text handler - uses the store directly
  const handleFormatText = (format: string) => {
    if (!emailTextareaRef.current) return;

    const start = emailTextareaRef.current.selectionStart;
    const end = emailTextareaRef.current.selectionEnd;
    const selectedText = (email_body || "").substring(start, end);
    let formattedText = "";

    switch (format) {
      case "bold":
        formattedText = `<b>${selectedText}</b>`;
        break;
      case "italic":
        formattedText = `<i>${selectedText}</i>`;
        break;
      case "link":
        formattedText = `<a href="#">${selectedText}</a>`;
        break;
      case "list":
        formattedText = `\n<ul>\n  <li>${selectedText}</li>\n</ul>`;
        break;
    }

    const before = (email_body || "").substring(0, start);
    const after = (email_body || "").substring(end);
    const newValue = before + formattedText + after;

    // Use step store setter directly
    setEmailBody(newValue);
    setFormatMenuPosition(null);

    // Focus back on textarea and position cursor at the end of the formatted text
    setTimeout(() => {
      if (emailTextareaRef.current) {
        emailTextareaRef.current.focus();
        emailTextareaRef.current.selectionStart =
          emailTextareaRef.current.selectionEnd = start + formattedText.length;
      }
    }, 0);
  };

  // Text selection handler for format menu
  const handleTextSelection = () => {
    if (!emailTextareaRef.current) return;

    setTimeout(() => {
      const textarea = emailTextareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Check if there's actually selected text
      if (start !== end && end > start) {
        console.log("Email text selected:", {
          start,
          end,
          selectedText: textarea.value.substring(start, end),
        });

        // Use a simpler positioning approach for Email
        const rect = textarea.getBoundingClientRect();
        const scrollTop = textarea.scrollTop;

        // Calculate approximate position based on character count
        const textBeforeSelection = textarea.value.substring(0, start);
        const lines = textBeforeSelection.split("\n");
        const currentLineIndex = lines.length - 1;
        const currentLineText = lines[currentLineIndex] || "";

        // Use approximate character measurements
        const charWidth = 8; // Slightly larger for better positioning
        const lineHeight = 28; // Account for line height in email textarea

        // Position relative to textarea
        const x =
          rect.left +
          Math.min(currentLineText.length * charWidth, rect.width - 100);
        const y = rect.top + currentLineIndex * lineHeight - scrollTop - 60;

        setFormatMenuPosition({
          x: Math.min(Math.max(x, 10), window.innerWidth - 200),
          y: Math.max(y, 10),
        });
      } else {
        setFormatMenuPosition(null);
      }
    }, 10); // Small delay to ensure selection is registered
  };
  return (
    <div
      className={
        isFloatingPanel
          ? "fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          : "bg-slate-950 text-white min-h-screen "
      }
    >
      <div
        className={
          isFloatingPanel
            ? "bg-slate-950 text-white rounded-lg shadow-2xl w-[900px] max-w-[95vw] max-h-[90vh] overflow-auto p-10 relative"
            : "max-w-4xl mx-auto space-y-4"
        }
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white">Email Subject</h2>
          {isFloatingPanel ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white"
              onClick={() => setIsFloatingPanel(false)}
              aria-label="Close floating panel"
            >
              <span className="text-xl">×</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white"
              onClick={() => setIsFloatingPanel(true)}
              aria-label="Float panel"
            >
              <CircleArrow className="h-5 w-5" />
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {/* Reply in thread toggle */}
          {hasEmailSteps && (
            <div className="flex items-center">
              <Switch
                id="reply-thread"
                checked={replyInThread || false}
                onCheckedChange={(checked) => {
                  // Use step store setter directly
                  setReplyInThread(checked);
                }}
                className="data-[state=checked]:bg-blue-600 scale-75"
              />
              <Label htmlFor="reply-thread" className="text-gray-300 text-sm">
                Reply in thread
              </Label>
            </div>
          )}

          {/* Subject Input */}
          <div className="relative">
            <Input
              placeholder="Enter email subject"
              className="bg-slate-800 border-slate-700 text-white h-10 text-sm placeholder:text-gray-400 pr-10"
              value={subject || ""}
              onChange={(e) => {
                // Use step store setter directly
                setSubject(e.target.value);
                e.target.focus();
              }}
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1/2 -translate-y-1/2 right-1 text-gray-400 hover:bg-slate-200 h-6 w-6 p-0"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 bg-slate-800 border-slate-700 text-white p-0 max-h-96 overflow-y-auto">
                <div className="py-2">
                  {dynamicFields.length > 0 ? (
                    dynamicFields.map((field) => (
                      <button
                        key={field.value}
                        className="w-full text-left px-4 py-2 hover:bg-slate-700 text-sm"
                        onClick={() => {
                          const subjectInput = document.querySelector(
                            'input[placeholder="Enter email subject"]',
                          ) as HTMLInputElement;
                          if (subjectInput) {
                            const start = subjectInput.selectionStart || 0;
                            const end = subjectInput.selectionEnd || 0;
                            const text = subject || "";
                            const before = text.substring(0, start);
                            const after = text.substring(end);
                            const newSubject = before + field.value + after;

                            // Use step store setter directly
                            setSubject(newSubject);

                            // Set cursor position after inserted field
                            setTimeout(() => {
                              subjectInput.selectionStart =
                                subjectInput.selectionEnd =
                                  start + field.value.length;
                              subjectInput.focus();
                            }, 0);
                          }
                        }}
                      >
                        {field.label}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-sm text-gray-400">
                      No contacts available
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Email Body Label */}
          <div className="mt-4">
            <h3 className="text-md font-medium text-white mb-3">Email Body</h3>
          </div>

          {/* Email Body Textarea */}
          <div className="relative">
            <Textarea
              ref={emailTextareaRef}
              placeholder="Enter email body"
              className="bg-white border-slate-300 text-gray-900 min-h-[200px] text-sm placeholder:text-gray-500 resize-none"
              value={email_body || ""}
              onChange={(e) => {
                // Use step store setter directly
                setEmailBody(e.target.value);
                // Trigger debounced auto-save
                setDebounceTrigger((prev) => prev + 1);
              }}
              onMouseUp={handleTextSelection}
              onKeyUp={handleTextSelection}
              onSelect={handleTextSelection}
              onFocus={() => {
                // Focus is on the email textarea
              }}
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 text-gray-600 hover:bg-slate-200 h-6 w-6 p-0"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 bg-slate-800 border-slate-700 text-white p-0 max-h-96 overflow-y-auto">
                <div className="py-2">
                  {dynamicFields.length > 0 ? (
                    dynamicFields.map((field) => (
                      <button
                        key={field.value}
                        className="w-full text-left px-4 py-2 hover:bg-slate-700 text-sm"
                        onClick={() => insertField(field.value)}
                      >
                        {field.label}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-sm text-gray-400">
                      No contacts available
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {formatMenuPosition && emailTextareaRef.current && (
            <FloatingFormatMenu
              position={formatMenuPosition}
              onFormat={handleFormatText}
            />
          )}

          {/* Render Preview Section */}
          {contacts.length > 0 && (
            <div className="border-t border-slate-700 pt-4 mt-4">
              <h3 className="text-md font-medium text-white mb-3">
                Render Preview
              </h3>
              <div className="space-y-3">
                <Button
                  className="bg-slate-700 text-white px-4 py-2 text-sm hover:bg-slate-600"
                  onClick={handleRender}
                  disabled={
                    isRendering ||
                    contacts.length === 0 ||
                    !email_body ||
                    !selectedNodeData?.id
                  }
                >
                  {isRendering ? "Rendering..." : "Render Template"}
                </Button>

                {/* Contact Selector */}
                {Object.keys(renderedOutputs).length > 0 && (
                  <div>
                    <Label className="text-white text-sm font-medium mb-2 block">
                      Select Contact to View
                    </Label>
                    <Select
                      value={selectedRenderContact || ""}
                      onValueChange={setSelectedRenderContact}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-10 text-sm">
                        <SelectValue placeholder="Select a contact" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                        {contacts.map((contact) => {
                          const displayName =
                            contact.contact?.fullName || "Unknown Contact";
                          const failed = !renderedOutputs[contact.id];
                          return (
                            <SelectItem
                              key={contact.id}
                              value={contact.id}
                              className="text-white text-sm"
                              disabled={failed}
                            >
                              {displayName}
                              {failed ? " (Failed)" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Contact Template Data */}
                {selectedRenderContact &&
                  (() => {
                    const selectedContact = contacts.find(
                      (c) => c.id === selectedRenderContact,
                    );
                    if (
                      !selectedContact?.templateData ||
                      Object.keys(selectedContact.templateData).length === 0
                    ) {
                      return null;
                    }
                    return (
                      <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-md">
                        <Label className="text-white text-sm font-medium block mb-2">
                          Available Template Data
                        </Label>
                        <div className="space-y-1 text-sm max-h-40 overflow-y-auto">
                          {Object.entries(selectedContact.templateData)
                            .sort(([keyA, valueA], [keyB, valueB]) => {
                              const hasValueA = !!valueA;
                              const hasValueB = !!valueB;

                              // Sort by value presence first, then alphabetically
                              if (hasValueA && !hasValueB) return -1;
                              if (!hasValueA && hasValueB) return 1;

                              const labelA = keyA
                                .split("_")
                                .map(
                                  (word) =>
                                    word.charAt(0).toUpperCase() +
                                    word.slice(1),
                                )
                                .join(" ");
                              const labelB = keyB
                                .split("_")
                                .map(
                                  (word) =>
                                    word.charAt(0).toUpperCase() +
                                    word.slice(1),
                                )
                                .join(" ");

                              return labelA.localeCompare(labelB);
                            })
                            .map(([key, value]) => {
                              const label = key
                                .split("_")
                                .map(
                                  (word) =>
                                    word.charAt(0).toUpperCase() +
                                    word.slice(1),
                                )
                                .join(" ");

                              return (
                                <div
                                  key={key}
                                  className="flex items-start gap-2 py-1 px-2 hover:bg-slate-700/50 rounded"
                                >
                                  <span
                                    className={`text-xs ${value ? "text-white" : "text-gray-400"}`}
                                  >
                                    {value ? `${label}: ${value}` : label}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    );
                  })()}

                {/* Rendered Output */}
                {selectedRenderContact &&
                  renderedOutputs[selectedRenderContact] && (
                    <div className="h-full">
                      <Label className="text-white text-sm font-medium mb-2 block h-full">
                        Rendered Output
                      </Label>
                      <Textarea
                        value={renderedOutputs[selectedRenderContact] || ""}
                        readOnly
                        className="bg-slate-800 border-slate-700 text-white text-sm resize-none w-full"
                        style={{ minHeight: "500px", height: "auto" }}
                        rows={25}
                        placeholder="Click 'Render Template' to see the output"
                      />
                    </div>
                  )}

                {/* Show failed contacts if any */}
                {failedContacts.length > 0 && (
                  <div className="mt-3 p-3 bg-red-900/20 border border-red-700 rounded-md">
                    <Label className="text-red-400 text-sm font-medium block mb-2">
                      ⚠️ Failed to Render ({failedContacts.length} contacts)
                    </Label>
                    <div className="text-xs text-red-300 space-y-1 max-h-32 overflow-y-auto">
                      {failedContacts.map((failed) => (
                        <div
                          key={failed.index}
                          className="flex items-start gap-2"
                        >
                          <span className="font-mono">#{failed.index}:</span>
                          <span>
                            {failed.contact.firstName || ""}{" "}
                            {failed.contact.lastName || ""}
                            {failed.contact.email
                              ? ` (${failed.contact.email})`
                              : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
