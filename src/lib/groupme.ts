import { Resend } from "resend";
import { MEMBERSHIP_FROM } from "@/lib/emailSender";

interface GroupMeAddResponse {
  response?: {
    results_id?: string;
  };
  meta?: {
    code?: number;
    errors?: string[];
  };
}

interface GroupMeResultsResponse {
  response?: {
    members?: Array<{
      user_id?: string;
      nickname?: string;
      muted?: boolean;
      guid?: string;
    }>;
  };
  meta?: {
    code?: number;
    errors?: string[];
  };
}

// GroupMe's add endpoint is async: it returns a results_id, and we poll
// /results/:id to find out whether the user was actually added. If they
// don't have a GroupMe account tied to that phone/email, the results
// payload comes back with no member entries.
async function pollAddResult(
  groupId: string,
  resultsId: string,
  accessToken: string
): Promise<{ added: boolean; raw: GroupMeResultsResponse | null }> {
  const url = `https://api.groupme.com/v3/groups/${encodeURIComponent(groupId)}/members/results/${encodeURIComponent(resultsId)}?token=${encodeURIComponent(accessToken)}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 503) continue; // still processing
    if (!res.ok) {
      return { added: false, raw: null };
    }
    const data = (await res.json()) as GroupMeResultsResponse;
    const members = data.response?.members ?? [];
    return { added: members.length > 0, raw: data };
  }

  return { added: false, raw: null };
}

async function emailAdminFailure(
  metadata: Record<string, string>,
  paymentIntentId: string,
  reason: string
) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;

  if (!apiKey || !to) {
    console.error(
      "Cannot send GroupMe failure email — RESEND_API_KEY or ADMIN_NOTIFICATION_EMAIL not set."
    );
    return;
  }

  const resend = new Resend(apiKey);
  const name = `${metadata.firstName ?? ""} ${metadata.lastName ?? ""}`.trim();

  try {
    // As in ticketEmail.ts: the SDK reports API errors through `error`, not
    // by throwing, so this has to be checked or a rejected send is silent.
    const { error } = await resend.emails.send({
      from: MEMBERSHIP_FROM,
      to,
      subject: `Manual GroupMe invite needed: ${name || metadata.psuEmail}`,
      text: [
        `A new SASA member paid but could not be auto-added to the GroupMe.`,
        ``,
        `Reason: ${reason}`,
        ``,
        `Name: ${name}`,
        `PSU Email: ${metadata.psuEmail}`,
        `Phone: ${metadata.phone}`,
        `Stripe Payment Intent: ${paymentIntentId}`,
        ``,
        `They are recorded in Airtable. Please invite them manually from the GroupMe app.`,
      ].join("\n"),
    });

    if (error) {
      console.error(
        `Admin GroupMe failure email NOT sent to ${to} — ${error.name}: ${error.message}`
      );
    }
  } catch (err) {
    console.error("Failed to send admin failure email:", err);
  }
}

export async function addMemberToGroupMe(
  metadata: Record<string, string>,
  paymentIntentId: string
) {
  const accessToken = process.env.GROUPME_ACCESS_TOKEN;
  const groupId = process.env.GROUPME_GROUP_ID;

  if (!accessToken || !groupId) {
    console.error("GroupMe env vars missing — skipping add.");
    await emailAdminFailure(
      metadata,
      paymentIntentId,
      "Server misconfigured: GROUPME_ACCESS_TOKEN or GROUPME_GROUP_ID not set."
    );
    return;
  }

  const phone = metadata.phone;
  const email = metadata.psuEmail;
  const nickname =
    `${metadata.firstName ?? ""} ${metadata.lastName ?? ""}`.trim() ||
    email ||
    "New Member";

  // GroupMe accepts either phone_number or email per member; we send phone
  // (E.164 from our form) and fall back to email if phone is missing.
  const member: Record<string, string> = { nickname };
  if (phone) member.phone_number = phone;
  else if (email) member.email = email;
  else {
    await emailAdminFailure(
      metadata,
      paymentIntentId,
      "Member has no phone or email to send to GroupMe."
    );
    return;
  }

  const addUrl = `https://api.groupme.com/v3/groups/${encodeURIComponent(groupId)}/members/add?token=${encodeURIComponent(accessToken)}`;

  let addRes: Response;
  try {
    addRes = await fetch(addUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ members: [member] }),
      cache: "no-store",
    });
  } catch (err) {
    await emailAdminFailure(
      metadata,
      paymentIntentId,
      `Network error calling GroupMe: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  if (!addRes.ok) {
    const body = await addRes.text();
    await emailAdminFailure(
      metadata,
      paymentIntentId,
      `GroupMe add returned ${addRes.status}: ${body.slice(0, 500)}`
    );
    return;
  }

  const addData = (await addRes.json()) as GroupMeAddResponse;
  const resultsId = addData.response?.results_id;

  if (!resultsId) {
    await emailAdminFailure(
      metadata,
      paymentIntentId,
      "GroupMe add succeeded but returned no results_id to poll."
    );
    return;
  }

  const { added } = await pollAddResult(groupId, resultsId, accessToken);

  if (!added) {
    await emailAdminFailure(
      metadata,
      paymentIntentId,
      `GroupMe add did not attach the user — they likely don't have a GroupMe account for ${phone || email}.`
    );
    return;
  }

  console.log(`Member ${email} added to GroupMe (${paymentIntentId})`);
}
