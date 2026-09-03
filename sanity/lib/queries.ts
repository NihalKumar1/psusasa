export const upcomingEventsQuery = `*[_type == "event" && coalesce(endDate, date) >= now()] | order(date asc) {
  _id, title, slug, date, endDate, hideEndTime, location, hideLocation, description, coverImage, isFeatured,
  "category": category->{ _id, name, color }
}`;

export const pastEventsQuery = `*[_type == "event" && coalesce(endDate, date) < now()] | order(date desc) {
  _id, title, slug, date, endDate, hideEndTime, location, hideLocation, description, coverImage, isFeatured,
  "category": category->{ _id, name, color }
}`;

export const featuredEventsQuery = `*[_type == "event" && isFeatured == true && coalesce(endDate, date) >= now()] | order(date asc)[0...3] {
  _id, title, slug, date, endDate, hideEndTime, location, hideLocation, description, coverImage,
  "category": category->{ _id, name, color }
}`;

export const allEventsQuery = `*[_type == "event"] | order(date desc) {
  _id, _updatedAt, title, slug, date, endDate, hideEndTime, location, hideLocation, description, coverImage, isFeatured,
  "category": category->{ _id, name, color }
}`;

export const eventBySlugQuery = `*[_type == "event" && slug.current == $slug][0] {
  _id, title, slug, date, endDate, hideEndTime, location, hideLocation, description, coverImage, isFeatured,
  ticketingEnabled, cashPaymentEnabled, ticketTypes[]{ _key, name, memberPriceCents, nonMemberPriceCents, capacity, salesOpen },
  "category": category->{ _id, name, color }
}`;

// Looked up by Sanity _id rather than slug — Airtable ticket rows reference
// the event by _id, so purchase/capacity checks need an _id-keyed lookup.
// Deliberately excludes checkinPassword; this query's results can reach the browser.
export const eventByIdQuery = `*[_type == "event" && _id == $id][0] {
  _id, title, slug, date, endDate, hideEndTime, location, hideLocation, description, coverImage, isFeatured,
  ticketingEnabled, cashPaymentEnabled, boardPlusOneEnabled, ticketTypes[]{ _key, name, memberPriceCents, nonMemberPriceCents, capacity, salesOpen },
  "category": category->{ _id, name, color }
}`;

export const ticketedEventsQuery = `*[_type == "event" && ticketingEnabled == true] | order(date desc) {
  _id, title, date
}`;

// Server-only: used exclusively by the check-in login route. Kept separate
// from eventByIdQuery so checkinPassword never ends up in a client-facing response.
export const eventCheckinAuthQuery = `*[_type == "event" && _id == $id][0] {
  _id, checkinPassword
}`;

// Client-safe: no email. Used to populate the "Add +1" board-member picker
// on the check-in board.
export const boardMembersPickerQuery = `*[_id == "boardMembers"][0] {
  members[]{ _key, firstName, lastName }
}`;

// Server-only: used exclusively by the board-plus-one route to resolve a
// selected _key back to a real person. Kept separate from the picker query
// so psuEmail never ends up in a client-facing response.
export const boardMembersAuthQuery = `*[_id == "boardMembers"][0] {
  members[]{ _key, firstName, lastName, psuEmail }
}`;

export const categoriesQuery = `*[_type == "eventCategory"] | order(name asc) {
  _id, name, color
}`;

export const officersQuery = `*[_type == "officer"] | order(order asc) {
  _id, name, role, headshot, bio, order
}`;

export const galleryQuery = `*[_type == "galleryImage"] | order(semester desc, _createdAt desc) {
  _id, image, caption, semester,
  "eventTitle": event->title
}`;

export const galleryAlbumsQuery = `*[_type == "galleryAlbum" && count(images) > 0] | order(semester desc, coalesce(date, "1970-01-01") desc, _createdAt desc) {
  _id, title, semester, date,
  "eventTitle": event->title,
  images[]{ _key, image, caption }
}`;

export const announcementsQuery = `*[_type == "announcement"] | order(publishedAt desc)[0...5] {
  _id, title, body, publishedAt
}`;

export const membershipFormCopyQuery = `*[_id == "membershipFormCopy"][0] {
  priceCents,
  stepLabels{ step1, step2, step3 },
  step1{
    intro,
    labels{ firstName, lastName, psuEmail, phone, year },
    yearOptions,
    errors{
      firstNameRequired, lastNameRequired,
      psuEmailRequired, psuEmailDomain,
      phoneRequired, phoneInvalid, yearRequired
    },
    nextLabel
  },
  step2{
    heading, intro,
    labels{ major, hometown, gender, religion, identity, generation, instagram },
    placeholders{ otherSpecify, instagram },
    otherLabel,
    genderOptions, religionOptions, identityOptions, generationOptions,
    errors{ genderOther, religionOther, identityOther, generationOther },
    backLabel, nextLabel
  },
  step3{
    summaryHeading, productName,
    loadingPaymentText, submitLabel, processingLabel,
    incompletePaymentHint,
    genericError, backLabel
  }
}`;

export const joinPageQuery = `*[_id == "joinPage"][0] {
  hero{ title, subtitle },
  whyJoin{
    heading,
    items[]{ title, description }
  },
  formSection{ heading, subtitle, helpText },
  contact{
    heading,
    cards[]{ label, value, href }
  },
  social{
    heading,
    buttons[]{ label, href }
  }
}`;

export const eventsPageQuery = `*[_id == "eventsPage"][0] {
  heroSubtitle
}`;

export const aboutPageQuery = `*[_id == "aboutPage"][0] {
  hero{ title, subtitle },
  history{ heading, body },
  mission{ heading, quote, body },
  countries{
    heading, subtitle,
    items[]{ name, abbr, countryCode }
  },
  values{
    heading,
    items[]{ title, description }
  }
}`;

export const homePageQuery = `*[_id == "homePage"][0] {
  hero{
    title, tagline,
    primaryCtaLabel, primaryCtaHref,
    secondaryCtaLabel, secondaryCtaHref
  },
  mission{
    eyebrow, heading, body,
    valueCards[]{ title, description }
  },
  upcomingEvents{ heading, subtitle, emptyMessage, viewAllLabel },
  joinCta{
    heading, description,
    primaryCtaLabel, primaryCtaHref,
    secondaryCtaLabel, secondaryCtaHref
  }
}`;

export const membershipConfirmationQuery = `*[_id == "membershipConfirmation"][0] {
  successState{
    heroTitle, cardTitle, body, nextStepsHeading,
    nextSteps[]{ text, linkLabel, linkHref },
    ctas[]{ label, href }
  },
  pendingState{ heroTitle, message, retryLabel, retryHref },
  errorState{ heroTitle, message }
}`;

export const notFoundPageQuery = `*[_id == "notFoundPage"][0] {
  hero{ title, subtitle },
  body,
  primaryCta{ label, href },
  secondaryCta{ label, href }
}`;

export const siteSettingsQuery = `*[_id == "siteSettings"][0] {
  navItems[]{ label, href },
  footer{
    tagline,
    quickLinksHeading,
    contactHeading,
    socialHeading,
    copyright
  },
  contact{
    email,
    instagramHandle,
    instagramUrl,
    tiktokHandle,
    tiktokUrl,
    linkedinUrl,
    officeAddress
  }
}`;
