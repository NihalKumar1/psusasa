import { defineField, defineType } from "sanity";

export default defineType({
  name: "event",
  title: "Event",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "date",
      title: "Start Date & Time",
      type: "datetime",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "endDate",
      title: "End Date & Time",
      type: "datetime",
      description:
        "When the event ends. The event will disappear from the site after this time. If left blank, the start time is used.",
      validation: (Rule) =>
        Rule.min(Rule.valueOfField("date")).warning(
          "End time should be after the start time."
        ),
    }),
    defineField({
      name: "hideEndTime",
      title: "Hide end time from site",
      type: "boolean",
      description:
        "If checked, the end time will not be shown to site visitors. The event will still automatically disappear after the end time passes.",
      initialValue: false,
    }),
    defineField({
      name: "location",
      title: "Location",
      type: "string",
      description:
        'Where the event takes place, e.g. "HUB Flex Theatre". Shown beside the date and time.',
    }),
    defineField({
      name: "hideLocation",
      title: "Hide location from site",
      type: "boolean",
      description:
        "If checked, the location will not be shown to site visitors.",
      initialValue: false,
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 4,
    }),
    defineField({
      name: "coverImage",
      title: "Cover Image",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "category",
      title: "Category",
      type: "reference",
      to: [{ type: "eventCategory" }],
    }),
    defineField({
      name: "isFeatured",
      title: "Featured?",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "ticketingEnabled",
      title: "Ticketing Enabled",
      type: "boolean",
      description:
        "Turn on to sell tickets for this event. Adds a \"Buy Tickets\" button to the event page and unlocks ticket types + the door check-in password below.",
      initialValue: false,
    }),
    defineField({
      name: "ticketTypes",
      title: "Ticket Types",
      type: "array",
      description:
        "One entry per ticket tier (e.g. General Admission, VIP). Each has its own member and non-member price.",
      hidden: ({ parent }) => !parent?.ticketingEnabled,
      of: [
        {
          type: "object",
          name: "ticketType",
          title: "Ticket Type",
          fields: [
            {
              name: "name",
              title: "Name",
              type: "string",
              validation: (Rule) => Rule.required(),
            },
            {
              name: "memberPriceCents",
              title: "Member Price (in cents)",
              description: "e.g. 500 = $5.00. Use 0 for free.",
              type: "number",
              validation: (Rule) => Rule.required().integer().min(0),
            },
            {
              name: "nonMemberPriceCents",
              title: "Non-Member Price (in cents)",
              description: "e.g. 1000 = $10.00. Use 0 for free.",
              type: "number",
              validation: (Rule) => Rule.required().integer().min(0),
            },
            {
              name: "capacity",
              title: "Capacity",
              description: "Max tickets of this type. Leave blank for unlimited.",
              type: "number",
              validation: (Rule) => Rule.integer().min(1),
            },
            {
              name: "salesOpen",
              title: "Sales Open",
              description:
                "Turn off to pause sales for this ticket type without deleting it.",
              type: "boolean",
              initialValue: true,
            },
          ],
          preview: {
            select: {
              title: "name",
              memberPriceCents: "memberPriceCents",
              nonMemberPriceCents: "nonMemberPriceCents",
            },
            prepare({ title, memberPriceCents, nonMemberPriceCents }) {
              const fmt = (c: number) =>
                typeof c === "number" ? `$${(c / 100).toFixed(2)}` : "—";
              return {
                title: title || "Ticket Type",
                subtitle: `Member ${fmt(memberPriceCents)} / Non-member ${fmt(nonMemberPriceCents)}`,
              };
            },
          },
        },
      ],
    }),
    defineField({
      name: "cashPaymentEnabled",
      title: "Allow Cash at the Door",
      type: "boolean",
      description:
        'Turn off to require card payment only — hides the "Pay cash at the door" option on the ticket purchase form.',
      hidden: ({ parent }) => !parent?.ticketingEnabled,
      initialValue: true,
    }),
    defineField({
      name: "checkinPassword",
      title: "Door Check-In Password",
      type: "string",
      description:
        "Staff enter this at /checkin to access this event's door check-in list. Set it before the event — without it, no one can check guests in.",
      hidden: ({ parent }) => !parent?.ticketingEnabled,
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const parent = context.parent as { ticketingEnabled?: boolean } | undefined;
          if (parent?.ticketingEnabled && !value) {
            return "Set a check-in password before the event, or staff won't be able to check guests in at the door.";
          }
          return true;
        }).warning(),
    }),
  ],
  preview: {
    select: { title: "title", date: "date" },
    prepare({ title, date }) {
      return {
        title,
        subtitle: date
          ? new Date(date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : "No date set",
      };
    },
  },
});
