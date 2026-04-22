import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type ContactLead = {
  name?: string;
  company?: string;
  email?: string;
  interest?: string;
  message?: string;
};

export async function POST(req: NextRequest) {
  let body: ContactLead;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, company, email, interest, message } = body;
  if (!name || !email) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 },
    );
  }

  if (!supabaseAdmin) {
    console.warn(
      "[contact] Supabase not configured, skipping insert. Lead:",
      body,
    );
    return NextResponse.json({ ok: true, persisted: false });
  }

  const { error } = await supabaseAdmin.from("leads").insert({
    name,
    company: company || null,
    email,
    interest: interest || null,
    message: message || null,
  });

  if (error) {
    console.error("[contact] supabase insert error", error);
    return NextResponse.json(
      { error: "Failed to save lead" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, persisted: true });
}
