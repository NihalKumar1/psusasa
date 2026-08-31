import type { PortableTextBlock } from "@portabletext/types";

export type { PortableTextBlock };

export interface NavItem {
  label?: string;
  href?: string;
}

export interface FooterCopy {
  tagline?: string;
  quickLinksHeading?: string;
  contactHeading?: string;
  socialHeading?: string;
  copyright?: string;
}

export interface ContactCopy {
  email?: string;
  instagramHandle?: string;
  instagramUrl?: string;
  tiktokHandle?: string;
  tiktokUrl?: string;
  linkedinUrl?: string;
  officeAddress?: string;
}

export interface SiteSettings {
  navItems?: NavItem[];
  footer?: FooterCopy;
  contact?: ContactCopy;
}

export interface CtaPair {
  title?: string;
  tagline?: string;
  primaryCtaLabel?: string;
  primaryCtaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
}

export interface ValueCard {
  title?: string;
  description?: string;
}

export interface MissionCopy {
  eyebrow?: string;
  heading?: string;
  body?: PortableTextBlock[];
  valueCards?: ValueCard[];
}

export interface UpcomingEventsCopy {
  heading?: string;
  subtitle?: string;
  emptyMessage?: string;
  viewAllLabel?: string;
}

export interface JoinCtaCopy {
  heading?: string;
  description?: string;
  primaryCtaLabel?: string;
  primaryCtaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
}

export interface HomePageCopy {
  hero?: CtaPair;
  mission?: MissionCopy;
  upcomingEvents?: UpcomingEventsCopy;
  joinCta?: JoinCtaCopy;
}

export interface SimpleHero {
  title?: string;
  subtitle?: string;
}

export interface CountryItem {
  name?: string;
  abbr?: string;
  countryCode?: string;
}

export interface EventsPageCopy {
  heroSubtitle?: string;
}

export interface AboutPageCopy {
  hero?: SimpleHero;
  history?: { heading?: string; body?: PortableTextBlock[] };
  mission?: { heading?: string; quote?: string; body?: PortableTextBlock[] };
  countries?: { heading?: string; subtitle?: string; items?: CountryItem[] };
  values?: { heading?: string; items?: ValueCard[] };
}

export interface ContactCard {
  label?: string;
  value?: string;
  href?: string;
}

export interface SocialButton {
  label?: string;
  href?: string;
}

export interface JoinPageCopy {
  hero?: SimpleHero;
  whyJoin?: { heading?: string; items?: ValueCard[] };
  formSection?: {
    heading?: string;
    subtitle?: string;
    helpText?: PortableTextBlock[];
  };
  contact?: { heading?: string; cards?: ContactCard[] };
  social?: { heading?: string; buttons?: SocialButton[] };
}

export interface CtaButton {
  label?: string;
  href?: string;
}

export interface NotFoundPageCopy {
  hero?: SimpleHero;
  body?: PortableTextBlock[];
  primaryCta?: CtaButton;
  secondaryCta?: CtaButton;
}

export interface ConfirmationNextStep {
  text?: string;
  linkLabel?: string;
  linkHref?: string;
}

export interface MembershipConfirmationCopy {
  successState?: {
    heroTitle?: string;
    cardTitle?: string;
    body?: PortableTextBlock[];
    nextStepsHeading?: string;
    nextSteps?: ConfirmationNextStep[];
    ctas?: CtaButton[];
  };
  pendingState?: {
    heroTitle?: string;
    message?: string;
    retryLabel?: string;
    retryHref?: string;
  };
  errorState?: {
    heroTitle?: string;
    message?: PortableTextBlock[];
  };
}

export interface MembershipTiersCopy {
  heading?: string;
  returningLabel?: string;
  returningPriceCents?: number;
  transferLabel?: string;
  transferPriceCents?: number;
  transferPendingTitle?: string;
  transferPendingMessage?: string;
  transferPendingEmail?: string;
  newMemberLabel?: string;
  newMemberPriceCents?: number;
  requiredError?: string;
}

export interface MembershipFormCopy {
  priceCents?: number;
  tiers?: MembershipTiersCopy;
  stepLabels?: { step1?: string; step2?: string; step3?: string };
  step1?: {
    intro?: PortableTextBlock[];
    labels?: {
      firstName?: string;
      lastName?: string;
      psuEmail?: string;
      phone?: string;
      year?: string;
    };
    yearOptions?: string[];
    errors?: {
      firstNameRequired?: string;
      lastNameRequired?: string;
      psuEmailRequired?: string;
      psuEmailDomain?: string;
      phoneRequired?: string;
      phoneInvalid?: string;
      yearRequired?: string;
    };
    nextLabel?: string;
  };
  step2?: {
    heading?: string;
    intro?: string;
    labels?: {
      major?: string;
      hometown?: string;
      gender?: string;
      religion?: string;
      identity?: string;
      generation?: string;
      instagram?: string;
    };
    placeholders?: { otherSpecify?: string; instagram?: string };
    otherLabel?: string;
    genderOptions?: string[];
    religionOptions?: string[];
    identityOptions?: string[];
    generationOptions?: string[];
    errors?: {
      genderOther?: string;
      religionOther?: string;
      identityOther?: string;
      generationOther?: string;
    };
    backLabel?: string;
    nextLabel?: string;
  };
  step3?: {
    summaryHeading?: string;
    productName?: string;
    loadingPaymentText?: string;
    submitLabel?: string;
    processingLabel?: string;
    incompletePaymentHint?: string;
    genericError?: string;
    backLabel?: string;
  };
}
