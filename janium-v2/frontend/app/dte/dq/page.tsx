"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Image from "next/image";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function DQPageContent() {
  const searchParams = useSearchParams();

  const contactId = searchParams.get("contact_id") || "";
  const redirectUrl = searchParams.get("redirect_url") || "";
  const isNew = searchParams.get("is_new") || "";
  const contactFirstName = searchParams.get("contact_first_name") || "";
  const contactLastName = searchParams.get("contact_last_name") || "";

  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [responseMessage, setResponseMessage] = useState("");

  const handleConfirmDQ = async () => {
    setStatus("loading");
    try {
      const confirmUrl = `${redirectUrl}?is_new=${isNew}&contact_id=${contactId}&contact_first_name=${encodeURIComponent(contactFirstName)}&contact_last_name=${encodeURIComponent(contactLastName)}`;
      const response = await fetch(confirmUrl);
      const data = await response.text();
      setResponseMessage(data);
      setStatus("success");
    } catch {
      setResponseMessage("An error occurred. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen flex justify-center items-start pt-20 bg-[#020817] px-5">
      <Card className="w-full max-w-[620px] bg-[#192339] border-[#1e3a5f]/30 text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <CardHeader className="items-center pb-2">
          <Image
            src="/Janium.png"
            alt="Janium Logo"
            width={200}
            height={60}
            priority
          />
        </CardHeader>

        <CardContent className="text-center space-y-4">
          <h3 className="text-lg font-semibold tracking-wide">
            First Name:{" "}
            <span className="text-zinc-400">{contactFirstName}</span>
          </h3>

          {contactLastName && (
            <h3 className="text-lg font-semibold tracking-wide">
              Last Name:{" "}
              <span className="text-zinc-400">{contactLastName}</span>
            </h3>
          )}

          <p className="text-zinc-400 text-sm leading-relaxed pt-2">
            Click the button below to disqualify (DQ) the contact
          </p>
        </CardContent>

        <CardFooter className="flex flex-col items-center gap-4">
          <Button
            id="action-btn"
            onClick={handleConfirmDQ}
            disabled={status === "loading" || status === "success"}
            variant={status === "success" ? "default" : "premium"}
            className="rounded-full px-8 py-3 text-base font-semibold"
          >
            {status === "loading"
              ? "Processing..."
              : status === "success"
                ? "✓ Confirmed"
                : "Confirm DQ"}
          </Button>

          {responseMessage && (
            <div
              className={`w-full p-4 rounded-lg text-sm leading-relaxed border ${
                status === "success"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}
              dangerouslySetInnerHTML={{ __html: responseMessage }}
            />
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

export default function DQPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex justify-center items-center bg-[#020817]">
          <div className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-cyan-500 text-lg font-medium">
            Loading...
          </div>
        </div>
      }
    >
      <DQPageContent />
    </Suspense>
  );
}
