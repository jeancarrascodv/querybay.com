"use client";

import Script from "next/script";

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  "https://calendly.com/querybay/30min";

declare global {
  interface Window {
    Calendly?: {
      initBadgeWidget: (options: {
        url: string;
        text: string;
        color: string;
        textColor: string;
        branding: boolean;
      }) => void;
    };
  }
}

const CalendlyBadge = () => {
  return (
    <>
      <link
        href="https://assets.calendly.com/assets/external/widget.css"
        rel="stylesheet"
      />
      <Script
        src="https://assets.calendly.com/assets/external/widget.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.Calendly?.initBadgeWidget({
            url: CALENDLY_URL,
            text: "Schedule time with me",
            color: "#b210e5",
            textColor: "#ffffff",
            branding: true,
          });
        }}
      />
    </>
  );
};

export default CalendlyBadge;
