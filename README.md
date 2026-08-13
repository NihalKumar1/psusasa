# SASA — Penn State South Asian Student Association

The official website for Penn State's South Asian Student Association (SASA), founded September 30, 1960. Built with Next.js, Tailwind CSS, and Sanity CMS.

**Live site:** [psusasa.com](https://psusasa.com)

## Tech Stack

- **Framework:** Next.js 14 (App Router, Server Components)
- **Styling:** Tailwind CSS with custom `sasa-*` color palette
- **CMS:** Sanity (headless, hosted at `/studio`)
- **Deployment:** Vercel
- **Fonts:** Playfair Display (headings) + Inter (body)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create `.env.local` with the following. Vercel's project settings page is the source of truth — copy from there if you have access.

```env
# Sanity (CMS)
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_API_VERSION=2024-01-01
SANITY_REVALIDATE_SECRET=your_webhook_secret

# Stripe (membership payments)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_or_live_...
STRIPE_SECRET_KEY=sk_test_or_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Airtable (member roster + ticketing)
AIRTABLE_API_KEY=pat...
AIRTABLE_BASE_ID=app...
AIRTABLE_TABLE_NAME=Members  # optional, defaults to "Members"
AIRTABLE_TICKETS_TABLE_NAME=Tickets  # optional, defaults to "Tickets"

# GroupMe (auto-add new members to the group chat)
GROUPME_ACCESS_TOKEN=...
GROUPME_GROUP_ID=...

# Resend (admin notification email when GroupMe auto-add falls through)
RESEND_API_KEY=re_...
ADMIN_NOTIFICATION_EMAIL=exec.psusasa@gmail.com

# Door check-in tool (/checkin) — signs session cookies; each event's actual
# door password is set per-event in Studio, not here
CHECKIN_SESSION_SECRET=a_long_random_string
```

To get your Sanity project ID:
1. Go to [sanity.io/manage](https://www.sanity.io/manage)
2. Create a new project (or use an existing one)
3. Copy the Project ID from the project settings

> **Note:** Sanity, Stripe webhook secret, and Resend can be skipped for read-only local browsing of pre-existing content, but anything involving the `/join` flow (membership form, payment, post-payment redirect) requires the full Stripe + Airtable + GroupMe stack to work end-to-end. Same goes for the ticketing flow (`/events/[slug]/tickets`) and the `/checkin` door tool — both need Stripe + Airtable configured, and `/checkin` additionally needs `CHECKIN_SESSION_SECRET` set.

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the website and [http://localhost:3000/studio](http://localhost:3000/studio) for the Sanity CMS.

## Project Structure

```
src/
  app/
    page.tsx                          # Home page
    layout.tsx                        # Root layout (fonts, metadata)
    not-found.tsx                     # CMS-driven 404 page
    (site)/                           # Route group for public pages (Navbar + Footer)
      layout.tsx
      about/page.tsx
      events/page.tsx
      events/[slug]/page.tsx
      events/[slug]/tickets/page.tsx        # Ticket purchase form
      events/[slug]/tickets/return/page.tsx # Post-payment success / pending / error (card orders)
      eboard/page.tsx
      gallery/page.tsx
      join/page.tsx
      join/return/page.tsx            # Post-payment success / pending / error
    checkin/                          # Staff-only door check-in tool (no public chrome)
      layout.tsx
      page.tsx                        # Event picker (unauthenticated)
      [eventId]/login/page.tsx        # Per-event password login
      [eventId]/page.tsx              # Searchable check-in board
    studio/[[...tool]]/page.tsx       # Embedded Sanity Studio
    api/
      revalidate/route.ts                    # Sanity webhook -> revalidatePath
      create-payment-intent/route.ts         # Stripe PaymentIntent for membership
      create-ticket-payment-intent/route.ts  # Stripe PaymentIntent for tickets (card)
      create-cash-ticket-order/route.ts      # Ticket order paid cash at the door
      stripe-webhook/route.ts                # Stripe webhook -> Airtable (+ GroupMe for memberships)
      checkin-login/route.ts                 # Door tool: verify per-event password, set session
      checkin-logout/route.ts
      checkin/[eventId]/tickets/route.ts     # Door tool: list orders for an event
      checkin/[eventId]/mark/route.ts        # Door tool: toggle checked-in / paid
  components/
    layout/     # Navbar, Footer
    shared/     # SectionHeading, Button, EventCard
    sanity/     # SanityImage, PortableTextRenderer
    home/       # Hero, MissionSection, UpcomingEvents, JoinCTA
    events/     # EventGrid, CategoryFilter
    eboard/     # OfficerCard
    gallery/    # GalleryGrid, ImageLightbox
    join/       # MembershipForm, ClearSavedForm
    tickets/    # TicketPurchaseForm
    checkin/    # CheckinBoard, CheckinLoginForm, LogoutButton
  lib/
    types.ts       # TypeScript interfaces
    airtable.ts    # Members + Tickets tables (Airtable REST API)
    ticketing.ts   # Shared ticket-order validation/pricing (used by both purchase routes)
    checkinAuth.ts # Door tool session signing (Web Crypto — Edge + Node compatible)
    groupme.ts     # Auto-add member to GroupMe (+ admin email fallback)
middleware.ts # Gates /checkin/[eventId] + /api/checkin/[eventId]/* per-event
sanity/
  lib/
    client.ts   # Sanity client
    image.ts    # Image URL builder
    queries.ts  # All GROQ queries
    types.ts    # TypeScript interfaces for Sanity content
  schemas/      # event (incl. ticketTypes[] + checkinPassword), eventCategory,
                # officer, galleryImage, announcement, siteSettings, homePage,
                # aboutPage, joinPage, membershipFormCopy,
                # membershipConfirmation, notFoundPage
  structure.ts  # Studio sidebar layout (singletons vs collections)
sanity.config.ts
```

## Managing Content via Sanity Studio

Navigate to `/studio` (e.g., `localhost:3000/studio` or `psusasa.com/studio`) to access the CMS. The sidebar is split into two sections: **singletons** (one-and-only-one page-content docs at the top) and **collections** (lists of items below the divider).

### Editing page content (singletons)

These docs control text, hero copy, CTAs, and form labels across the site. Each one is unique — you edit it, you don't create more. Click into one, change fields, click **Publish** (the **Publish** button matters — autosaves only save drafts and aren't read by the live site).

| Singleton | What it controls |
|-----------|------------------|
| **Site Settings** | Navbar links, footer copy, contact info, social handles |
| **Home Page** | Hero, mission section, upcoming-events module copy, join CTA block |
| **About Page** | Hero, history, mission, countries-we-represent list, values |
| **Join Page** | Hero, "Why Join SASA" reasons, form section heading/subtitle/help text, contact cards, social buttons |
| **Membership Form** | Field labels, year/gender/religion/identity/generation options, error messages, button labels, the membership price (in cents) |
| **Membership Confirmation** | The `/join/return` page after successful payment — title, body (`{{price}}` token auto-fills from Membership Form), Next Steps bullets, CTA buttons, plus pending and direct-visit error states |
| **404 Page** | Title, subtitle, body, primary + optional secondary CTA buttons |

> **Caching note:** most pages have ISR with `revalidate = 60`, so published changes appear on the live site within ~60 seconds. The `/join/return` and `/not-found` pages render on every request, so their edits show immediately.

### Adding Events

1. Go to **Studio > Event**
2. Click **+ Create**
3. Fill in:
   - **Title** — event name
   - **Slug** — click "Generate" to auto-create from title
   - **Date** — date and time of the event
   - **Description** — details about the event
   - **Cover Image** — upload a photo (recommended: 1200x750px)
   - **Category** — select one: Cultural Show, Festival, Social, THON, or Community Service
   - **Featured** — toggle on to show on the home page (up to 3 featured events display)
   - **Ticketing Enabled** — toggle on to sell tickets for this event (see below)
4. Click **Publish**

### Selling Tickets & Door Check-In

Replaces Doorlist. Current SASA members automatically get a cheaper (or free) price, verified by PSU email against the Members Airtable table at checkout.

**Setting up ticket sales for an event:**

1. Open the event in **Studio > Event** and toggle **Ticketing Enabled**
2. Under **Ticket Types**, add one entry per tier (e.g. "General Admission", "VIP"), each with its own **Member Price** and **Non-Member Price** (in cents), an optional **Capacity**, and **Sales Open**
3. Set a **Door Check-In Password** for this event — staff use it at `/checkin` on the night of the event. Studio will warn (but not block) if this is left blank while ticketing is on
4. Click **Publish** — a "Buy Tickets" button now appears on the event's page, linking to `/events/[slug]/tickets`

Buyers can pay by card (Stripe, same-session) or choose "pay cash at the door," which reserves their spot and shows as due on the check-in board.

**Running the door on event night:**

1. Go to `psusasa.com/checkin`, pick the event, and enter that event's check-in password (each event has its own — a password only unlocks its own event)
2. Search by name or email, tap an order to check it in — tap again to undo
3. Cash orders show a "Cash due" badge; tapping one prompts you to confirm you collected the cash before it checks them in
4. Multiple staff/devices can work the same board at once — check-ins sync across devices every ~10-15 seconds

### Updating Officers / E-Board

1. Go to **Studio > Officer**
2. Click **+ Create**
3. Fill in:
   - **Name** — officer's full name
   - **Role** — select from: President, Vice President, Treasurer, Secretary, Cultural Chair, Events Chair, PR Chair, THON Chair
   - **Headshot** — upload a photo (recommended: square, 400x400px)
   - **Bio** — optional short bio
   - **Display Order** — number for sorting (1 = first, 2 = second, etc.)
4. Click **Publish**

To update between semesters: unpublish or delete outgoing officers, create new ones.

### Adding Gallery Images

1. Go to **Studio > Gallery Image**
2. Click **+ Create**
3. Fill in:
   - **Image** — upload the photo
   - **Caption** — optional description
   - **Event** — optionally link to an event
   - **Semester** — e.g., "Fall 2025", "Spring 2026" (used for grouping)
4. Click **Publish**

### Creating Announcements

1. Go to **Studio > Announcement**
2. Fill in title, body (rich text), and published date
3. Click **Publish**

## Deployment (Vercel)

### Initial Setup

1. Push the repo to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add environment variables in Vercel project settings (same as `.env.local`)
4. Deploy

### Setting Up Revalidation Webhook

To auto-update the site when CMS content changes:

1. In Vercel, note your deployed URL (e.g., `https://psusasa.com`)
2. In [sanity.io/manage](https://www.sanity.io/manage), go to your project > API > Webhooks
3. Create a new webhook:
   - **URL:** `https://psusasa.com/api/revalidate`
   - **Trigger on:** Create, Update, Delete
   - **Secret:** same value as `SANITY_REVALIDATE_SECRET` in your env vars
4. Save

Now publishing content in Sanity will automatically refresh the live site.

## Color Palette

All brand colors are available as Tailwind classes under the `sasa-*` namespace:

| Color | Tailwind Class | Hex |
|-------|---------------|-----|
| Deep Red (darkest) | `sasa-red-900` | `#590404` |
| Red | `sasa-red-700` | `#a10000` |
| Bright Red | `sasa-red-500` | `#e30000` |
| Crimson | `sasa-red-600` | `#810220` |
| Gold (dark) | `sasa-gold-600` | `#cda563` |
| Gold (light) | `sasa-gold-400` | `#ffd37e` |
| Sage | `sasa-sage` | `#d9dfa5` |
| Forest Green | `sasa-forest` | `#0f5444` |
| Neutral (light) | `sasa-neutral-400` | `#a2aaad` |
| Neutral (dark) | `sasa-neutral-500` | `#7b7171` |

## Contact & Socials

- **Instagram:** [@psusasa](https://instagram.com/psusasa)
- **TikTok:** [@sasapsu](https://tiktok.com/@sasapsu)
- **Email:** exec.psusasa@gmail.com
- **Office:** 204 HUB, Penn State University Park
