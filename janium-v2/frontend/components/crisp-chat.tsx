"use client";

import { useEffect } from "react";
import { Crisp } from "crisp-sdk-web";

export const CrispChat = () => {
  useEffect(() => {
    Crisp.configure("d183b953-d276-4396-b18e-a03e9bc81bb1");
  }, []);

  return null;
};
