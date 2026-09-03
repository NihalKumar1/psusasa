import { defineField, defineType } from "sanity";

export default defineType({
  name: "boardMembers",
  title: "Board Members (Door +1 List)",
  type: "document",
  fields: [
    defineField({
      name: "members",
      title: "Current Board Members",
      type: "array",
      description:
        "Board members eligible for the free door +1 on events where it's enabled. Keep this current as the board changes.",
      of: [
        {
          type: "object",
          name: "boardMember",
          fields: [
            {
              name: "firstName",
              title: "First Name",
              type: "string",
              validation: (Rule) => Rule.required(),
            },
            {
              name: "lastName",
              title: "Last Name",
              type: "string",
              validation: (Rule) => Rule.required(),
            },
            {
              name: "psuEmail",
              title: "PSU Email",
              type: "string",
              validation: (Rule) => Rule.required(),
            },
          ],
          preview: {
            select: {
              firstName: "firstName",
              lastName: "lastName",
              psuEmail: "psuEmail",
            },
            prepare({ firstName, lastName, psuEmail }) {
              return {
                title: [firstName, lastName].filter(Boolean).join(" ") || "Board Member",
                subtitle: psuEmail,
              };
            },
          },
        },
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Board Members (Door +1 List)" }),
  },
});
