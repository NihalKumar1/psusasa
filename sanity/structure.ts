import type { StructureBuilder } from "sanity/structure";

const SINGLETONS: ReadonlyArray<readonly [schemaType: string, title: string]> = [
  ["siteSettings", "Site Settings"],
  ["homePage", "Home Page"],
  ["aboutPage", "About Page"],
  ["joinPage", "Join Page"],
  ["eventsPage", "Events Page"],
  ["membershipFormCopy", "Membership Form"],
  ["membershipConfirmation", "Membership Confirmation"],
  ["notFoundPage", "404 Page"],
];

export const SINGLETON_TYPES = new Set(SINGLETONS.map(([type]) => type));

export const structure = (S: StructureBuilder) =>
  S.list()
    .title("Content")
    .items([
      ...SINGLETONS.map(([schemaType, title]) =>
        S.listItem()
          .title(title)
          .id(schemaType)
          .child(
            S.document().schemaType(schemaType).documentId(schemaType)
          )
      ),
      S.divider(),
      S.documentTypeListItem("event").title("Events"),
      S.documentTypeListItem("eventCategory").title("Event Categories"),
      S.documentTypeListItem("officer").title("Officers"),
      S.documentTypeListItem("galleryAlbum").title("Gallery"),
      S.documentTypeListItem("announcement").title("Announcements"),
    ]);
