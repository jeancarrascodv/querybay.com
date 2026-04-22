import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;

function verifySignature(
  signatureHeader: string | null,
  rawBody: string,
): boolean {
  if (!SIGNING_KEY || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => kv.split("=")),
  );
  const timestamp = parts["t"];
  const received = parts["v1"];
  if (!timestamp || !received) return false;

  const expected = crypto
    .createHmac("sha256", SIGNING_KEY)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex"),
  );
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("calendly-webhook-signature");

  if (SIGNING_KEY && !verifySignature(signature, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const eventType: string = payload.event;

  if (eventType === "invitee.created") {
    const invitee = payload.payload;
    console.log("[calendly] booking confirmed", {
      name: invitee?.name,
      email: invitee?.email,
      eventStart: invitee?.scheduled_event?.start_time,
      questions: invitee?.questions_and_answers,
    });
  }

  if (eventType === "invitee.canceled") {
    const invitee = payload.payload;
    console.log("[calendly] booking canceled", {
      email: invitee?.email,
      reason: invitee?.cancellation?.reason,
    });
  }

  return NextResponse.json({ ok: true });
}
