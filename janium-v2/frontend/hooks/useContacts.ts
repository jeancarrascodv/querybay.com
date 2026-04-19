import { useCallback } from "react";
import { useContactsStore } from "../store/useContactsStore";
import { ContactFilter } from "@/types/contact";

export const useContacts = () => {
  const store = useContactsStore();

  const getContacts = useCallback(
    (customerId: string, filter?: ContactFilter) => {
      return store.getContacts(customerId, filter);
    },
    []
  );

  return {
    // State
    contacts: store.contacts,
    loading: store.loading,
    error: store.error,

    // Actions
    getContacts,
  };
};
