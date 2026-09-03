function escapeForAirtableFormula(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function lookupPastMember(
  firstName: string,
  lastName: string
): Promise<boolean> {
  const tableName =
    process.env.AIRTABLE_PAST_MEMBERS_TABLE_NAME ?? "Past Members";
  const baseUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`;

  const first = firstName.trim().toLowerCase();
  const last = lastName.trim().toLowerCase();
  if (!first || !last) return false;

  const formula = `AND(LOWER(TRIM({First Name})) = '${escapeForAirtableFormula(first)}', LOWER(TRIM({Last Name})) = '${escapeForAirtableFormula(last)}')`;

  const res = await fetch(
    `${baseUrl}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`,
    {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    console.error(
      `Past Members lookup failed: ${res.status} ${await res.text()}`
    );
    // Fail open so a transient Airtable outage doesn't block all returning
    // member signups. Verification is a price-tier check, not a security
    // gate — payment still requires a valid card.
    return true;
  }

  const data = (await res.json()) as { records?: unknown[] };
  return !!(data.records && data.records.length > 0);
}

export interface CurrentMemberInfo {
  isMember: boolean;
  /** The Members table's "Year" field for this person, or null if absent/not a member. */
  year: string | null;
}

// Every row in the "Members" table is treated as a currently valid member —
// no term/year scoping. Unlike lookupPastMember (a low-stakes discount check
// that fails open), this decides an actual charge amount, so a lookup
// failure falls back to non-member pricing rather than a free discount.
export async function lookupCurrentMember(psuEmail: string): Promise<CurrentMemberInfo> {
  const tableName = process.env.AIRTABLE_TABLE_NAME ?? "Members";
  const baseUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`;

  const email = psuEmail.trim().toLowerCase();
  if (!email) return { isMember: false, year: null };

  const formula = `LOWER(TRIM({PSU Email})) = '${escapeForAirtableFormula(email)}'`;

  let res: Response;
  try {
    res = await fetch(
      `${baseUrl}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`,
      {
        headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
        cache: "no-store",
      }
    );
  } catch (err) {
    console.error("Members lookup request failed:", err);
    return { isMember: false, year: null };
  }

  if (!res.ok) {
    console.error(
      `Members lookup failed: ${res.status} ${await res.text()}`
    );
    return { isMember: false, year: null };
  }

  const data = (await res.json()) as {
    records?: Array<{ fields?: Record<string, unknown> }>;
  };
  const record = data.records?.[0];
  if (!record) return { isMember: false, year: null };

  const year = record.fields?.["Year"];
  return { isMember: true, year: typeof year === "string" && year ? year : null };
}

// The webhook and the /join/return page both call this for the same
// signup, fired independently within moments of each other. A separate
// "look up, then insert if missing" pair of requests is not atomic and
// lets both calls pass the check before either insert lands — Airtable's
// upsert does the match-or-create as one atomic server-side operation,
// so no duplicate row can be created no matter how the two calls overlap.
export async function appendMemberToAirtable(
  metadata: Record<string, string>,
  paymentIntentId: string
) {
  const tableName = process.env.AIRTABLE_TABLE_NAME ?? "Members";
  const baseUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`;

  const amountPaidCents = Number(metadata.amountPaidCents);
  const amountPaidDollars = Number.isFinite(amountPaidCents)
    ? amountPaidCents / 100
    : null;

  const res = await fetch(baseUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      performUpsert: { fieldsToMergeOn: ["Stripe Payment Intent ID"] },
      records: [
        {
          fields: {
            Timestamp: new Date().toISOString(),
            "First Name": metadata.firstName,
            "Last Name": metadata.lastName,
            "PSU Email": metadata.psuEmail,
            Phone: metadata.phone,
            Year: metadata.year,
            "Membership Type": metadata.membershipTier ?? metadata.membershipType,
            "Amount Paid": amountPaidDollars,
            Major: metadata.major,
            Hometown: metadata.hometown,
            Gender: metadata.gender,
            Religion: metadata.religion,
            Identity: metadata.identity,
            Generation: metadata.generation,
            Instagram: metadata.instagram,
            "Stripe Payment Intent ID": paymentIntentId,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable error: ${res.status} ${body}`);
  }

  console.log(`Member ${metadata.psuEmail} upserted in Airtable`);
}

// --- Tickets table -----------------------------------------------------------

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

// Airtable's list API caps each page at 100 records. Ticket counts/lists
// must walk the `offset` cursor until exhausted, or they'll silently
// under-report once an event passes 100 orders.
async function fetchAllAirtableRecords(
  baseUrl: string,
  formula: string
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({ filterByFormula: formula, pageSize: "100" });
    if (offset) params.set("offset", offset);

    const res = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Airtable list error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      records?: AirtableRecord[];
      offset?: string;
    };
    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return records;
}

function ticketsBaseUrl(): string {
  const tableName = process.env.AIRTABLE_TICKETS_TABLE_NAME ?? "Tickets";
  return `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`;
}

export interface TicketOrderMetadata {
  firstName: string;
  lastName: string;
  contactEmail: string;
  psuEmail: string;
  isMember: boolean;
  /** The buyer's Members-table "Year", when this order got member pricing — null otherwise. */
  memberYear: string | null;
  eventId: string;
  eventName: string;
  ticketTypeKey: string;
  ticketTypeName: string;
  quantity: number;
  amountPaidCents: number;
  paymentMethod: "Card" | "Cash";
  paid: boolean;
}

// Used by both the webhook (card orders) and the cash-order route. Card
// orders pass their Stripe Payment Intent ID; the webhook and the /return
// page both call this for the same card order, fired independently within
// moments of each other, so dedupe must be atomic — Airtable's upsert does
// the match-or-create as one server-side operation, unlike a separate
// look-up-then-insert pair of requests, which lets both calls pass the
// check before either insert lands. Cash orders have no PaymentIntent —
// each cash API call is a single synchronous write with no retry/webhook
// redelivery to dedupe against, so it always plainly inserts.
// Returns whether this call actually created a new row (vs. merging into
// an existing one) — callers use `inserted` to make sure a confirmation
// email only goes out once, from whichever of the two wins the race.
export async function appendTicketToAirtable(
  order: TicketOrderMetadata,
  paymentIntentId: string | null
): Promise<{ inserted: boolean }> {
  const baseUrl = ticketsBaseUrl();

  const fields = {
    Timestamp: new Date().toISOString(),
    "First Name": order.firstName,
    "Last Name": order.lastName,
    "Contact Email": order.contactEmail,
    "PSU Email": order.psuEmail,
    "Is Member": order.isMember,
    "Member Year": order.memberYear ?? "",
    "Event ID": order.eventId,
    "Event Name": order.eventName,
    "Ticket Type Key": order.ticketTypeKey,
    "Ticket Type Name": order.ticketTypeName,
    Quantity: order.quantity,
    "Amount Paid": order.amountPaidCents / 100,
    "Payment Method": order.paymentMethod,
    Paid: order.paid,
    "Stripe Payment Intent ID": paymentIntentId ?? "",
    "Checked In Count": 0,
  };

  if (paymentIntentId) {
    const res = await fetch(baseUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: ["Stripe Payment Intent ID"] },
        records: [{ fields }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable error: ${res.status} ${body}`);
    }

    const data = (await res.json()) as { createdRecords?: string[] };
    const inserted = (data.createdRecords?.length ?? 0) > 0;
    console.log(
      inserted
        ? `Ticket order for ${order.contactEmail} added to Airtable`
        : `Ticket order already in Airtable (${paymentIntentId})`
    );
    return { inserted };
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable error: ${res.status} ${body}`);
  }

  console.log(`Ticket order for ${order.contactEmail} added to Airtable`);
  return { inserted: true };
}

async function sumTicketQuantity(formula: string): Promise<number> {
  const records = await fetchAllAirtableRecords(ticketsBaseUrl(), formula);
  return records.reduce((sum, r) => {
    const qty = Number(r.fields["Quantity"]);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);
}

// Counts every order for this ticket type regardless of Paid status — an
// unpaid cash order still reserves a capacity slot the moment it's placed.
export async function sumSoldTicketQuantity(
  eventId: string,
  ticketTypeKey: string
): Promise<number> {
  const formula = `AND({Event ID} = '${escapeForAirtableFormula(eventId)}', {Ticket Type Key} = '${escapeForAirtableFormula(ticketTypeKey)}')`;
  return sumTicketQuantity(formula);
}

// A person gets member pricing on at most 1 ticket per event, ever —
// checked across ALL their past orders for this event (any ticket type),
// so they can't dodge the cap by checking out multiple times or mixing
// ticket types. Existence check, not a sum: appendTicketToAirtable never
// writes more than 1 member-priced unit into a single row (see
// resolveTicketOrder), so any matching row means the allowance is used.
export async function hasUsedMemberPricing(
  eventId: string,
  psuEmail: string
): Promise<boolean> {
  const email = psuEmail.trim().toLowerCase();
  if (!email) return false;
  const formula = `AND({Event ID} = '${escapeForAirtableFormula(eventId)}', LOWER(TRIM({PSU Email})) = '${escapeForAirtableFormula(email)}', {Is Member} = TRUE())`;
  const records = await fetchAllAirtableRecords(ticketsBaseUrl(), formula);
  return records.length > 0;
}

export interface TicketRecord {
  id: string;
  firstName: string;
  lastName: string;
  contactEmail: string;
  psuEmail: string;
  isMember: boolean;
  memberYear: string | null;
  ticketTypeKey: string;
  ticketTypeName: string;
  quantity: number;
  amountPaidCents: number;
  paymentMethod: "Card" | "Cash";
  paid: boolean;
  /** How many of this order's `quantity` seats have been checked in — 0 to quantity. */
  checkedInCount: number;
  checkedInAt: string | null;
}

export async function listTicketsForEvent(
  eventId: string
): Promise<TicketRecord[]> {
  const formula = `{Event ID} = '${escapeForAirtableFormula(eventId)}'`;
  const records = await fetchAllAirtableRecords(ticketsBaseUrl(), formula);

  return records.map((r): TicketRecord => {
    const f = r.fields;
    const paymentMethod: "Card" | "Cash" =
      f["Payment Method"] === "Cash" ? "Cash" : "Card";
    return {
      id: r.id,
      firstName: String(f["First Name"] ?? ""),
      lastName: String(f["Last Name"] ?? ""),
      contactEmail: String(f["Contact Email"] ?? ""),
      psuEmail: String(f["PSU Email"] ?? ""),
      isMember: Boolean(f["Is Member"]),
      memberYear: f["Member Year"] ? String(f["Member Year"]) : null,
      ticketTypeKey: String(f["Ticket Type Key"] ?? ""),
      ticketTypeName: String(f["Ticket Type Name"] ?? ""),
      quantity: Number(f["Quantity"]) || 0,
      amountPaidCents: Math.round((Number(f["Amount Paid"]) || 0) * 100),
      paymentMethod,
      paid: Boolean(f["Paid"]),
      checkedInCount: Number(f["Checked In Count"]) || 0,
      checkedInAt: f["Checked In At"] ? String(f["Checked In At"]) : null,
    };
  });
}

export interface TicketRecordInfo {
  eventId: string;
  quantity: number;
}

// Used by the check-in mark route to confirm a record actually belongs to
// the event the caller is authorized for (before allowing any update to
// it) and to clamp checkedInCount to a valid range for that order.
export async function getTicketRecordInfo(
  recordId: string
): Promise<TicketRecordInfo | null> {
  const res = await fetch(`${ticketsBaseUrl()}/${recordId}`, {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { fields?: Record<string, unknown> };
  const eventId = data.fields?.["Event ID"];
  if (typeof eventId !== "string") return null;
  const quantity = Number(data.fields?.["Quantity"]);
  return { eventId, quantity: Number.isFinite(quantity) ? quantity : 0 };
}

// Single PATCH for the door check-in board: a normal tap only ever sends
// `checkedInCount`, but collecting cash at the door sends both `paid` and
// `checkedInCount` together so the two facts land in one atomic update.
export async function updateTicketCheckinState(
  recordId: string,
  updates: { checkedInCount?: number; paid?: boolean }
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (updates.checkedInCount !== undefined) {
    fields["Checked In Count"] = updates.checkedInCount;
    fields["Checked In At"] =
      updates.checkedInCount > 0 ? new Date().toISOString() : null;
  }
  if (updates.paid !== undefined) {
    fields["Paid"] = updates.paid;
  }

  const res = await fetch(`${ticketsBaseUrl()}/${recordId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable update error: ${res.status} ${body}`);
  }
}
