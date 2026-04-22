import { NextRequest, NextResponse } from "next/server";

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

  const { name, email } = body;
  if (!name || !email) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 },
    );
  }

  console.log("[contact] new lead", {
    ...body,
    receivedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
