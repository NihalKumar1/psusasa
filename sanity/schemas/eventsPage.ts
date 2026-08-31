import { defineField, defineType } from "sanity";

export default defineType({
  name: "eventsPage",
  title: "Events Page",
  type: "document",
  fields: [
    defineField({
      name: "heroSubtitle",
      title: "Hero Subheading",
      description: "Shown under the \"Our Events\" heading at the top of the events page.",
      type: "string",
      initialValue:
        "From cultural shows to community service — there's always something happening at SASA.",
    }),
  ],
  preview: {
    prepare: () => ({ title: "Events Page" }),
  },
});
