"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  isValidPhoneNumber,
  getCountryCallingCode,
  getCountries,
  type Country,
} from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import en from "react-phone-number-input/locale/en.json";
import { AsYouType } from "libphonenumber-js";
import { PortableText } from "@portabletext/react";
import type { PortableTextBlock } from "@portabletext/types";
import type { MembershipFormCopy } from "../../../sanity/lib/types";
import { computeCardFee } from "@/lib/fees";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

type Step = 1 | 2 | 3;

interface Step1 {
  firstName: string;
  lastName: string;
  psuEmail: string;
  phone: string;
  year: string;
}

interface OtherableSingle {
  selected: string;
  otherText: string;
}

interface OtherableMulti {
  selected: string[];
  otherText: string;
}

interface Step2 {
  major: string;
  hometown: string;
  gender: OtherableSingle;
  religion: OtherableMulti;
  identity: OtherableMulti;
  generation: OtherableSingle;
  instagram: string;
}

const IDENTITY_FALLBACK = [
  "Assamese",
  "Bengali",
  "Bihari",
  "Gujarati",
  "Kashmiri",
  "Kannadiga",
  "Konkani",
  "Malayali",
  "Marathi",
  "Odia",
  "Nepali",
  "North India / Hindi Belt",
  "North East (Seven Sisters)",
  "Pashtun",
  "Punjabi",
  "Rajasthani",
  "Santhali",
  "Sindhi",
  "Sinhalese",
  "Tamil",
  "Telugu",
];

const RELIGION_FALLBACK = [
  "Hindu",
  "Muslim",
  "Christian",
  "Buddhist",
  "Jain",
  "Sikh",
  "Parsi",
  "Not Religious",
];

const GENERATION_FALLBACK = [
  "1st generation (born outside the US)",
  "1.5 generation (born abroad, moved to US as a young child)",
  "2nd generation (born in the US)",
  "3rd generation+ (parents born in the US)",
];

const GENDER_FALLBACK = ["Male", "Female"];

const YEAR_FALLBACK = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Grad Student",
];

const YEAR_ORDER: Record<string, number> = {
  Freshman: 0,
  Sophomore: 1,
  Junior: 2,
  Senior: 3,
  "Grad Student": 4,
};

const FALLBACK_INTRO_BLOCKS: PortableTextBlock[] = [
  {
    _type: "block",
    _key: "fb-1",
    style: "normal",
    children: [
      {
        _type: "span",
        _key: "s1",
        text: "Thank you for your interest in joining our community of Desi students here at Penn State. 😊",
        marks: [],
      },
    ],
    markDefs: [],
  } as unknown as PortableTextBlock,
  {
    _type: "block",
    _key: "fb-2",
    style: "normal",
    children: [
      {
        _type: "span",
        _key: "s2",
        text: "Benefits of membership include:",
        marks: ["strong"],
      },
    ],
    markDefs: [],
  } as unknown as PortableTextBlock,
  ...[
    "Free & discounted cultural & social events",
    "Free food & perks (Holi t-shirt, goodie bags, etc.) at specific events",
    "Priority tickets to social events & partner org events",
    "Access to GroupMe to get latest news/connect with others",
    "Eligible to apply for freshman liaison/vacant admin board positions",
  ].map(
    (text, i) =>
      ({
        _type: "block",
        _key: `fb-li-${i}`,
        style: "normal",
        listItem: "bullet",
        level: 1,
        children: [
          { _type: "span", _key: `s-li-${i}`, text, marks: [] },
        ],
        markDefs: [],
      }) as unknown as PortableTextBlock
  ),
  {
    _type: "block",
    _key: "fb-end",
    style: "normal",
    children: [
      {
        _type: "span",
        _key: "send",
        text: "We are so excited to meet and get to know each and everyone of you this year!",
        marks: [],
      },
    ],
    markDefs: [],
  } as unknown as PortableTextBlock,
];

const PT_COMPONENTS = {
  block: {
    normal: ({ children }: { children?: React.ReactNode }) => (
      <p className="leading-relaxed">{children}</p>
    ),
  },
  list: {
    bullet: ({ children }: { children?: React.ReactNode }) => (
      <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>
    ),
  },
  listItem: {
    bullet: ({ children }: { children?: React.ReactNode }) => (
      <li>{children}</li>
    ),
  },
  marks: {
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-sasa-red-900">{children}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
  },
};

function resolveMulti(f: OtherableMulti): string {
  const vals = [...f.selected];
  if (vals.includes("Other") && f.otherText.trim()) {
    const idx = vals.indexOf("Other");
    vals[idx] = f.otherText.trim();
  } else {
    const idx = vals.indexOf("Other");
    if (idx !== -1) vals.splice(idx, 1);
  }
  return vals.join(", ").slice(0, 500);
}

function resolveSingle(f: OtherableSingle): string {
  return (f.selected === "Other" ? f.otherText.trim() : f.selected).slice(
    0,
    500
  );
}

const STORAGE_KEY = "sasa-membership-form-v1";

interface PersistedForm {
  step: 1 | 2;
  phoneCountry: Country;
  step1: Step1;
  step2: Step2;
}

function loadPersisted(): PersistedForm | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedForm;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.step1 ||
      !parsed.step2
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

interface ResolvedOptions {
  year: string[];
  gender: string[];
  religion: string[];
  identity: string[];
  generation: string[];
}

function reconcileSingle(
  f: OtherableSingle,
  validValues: string[]
): OtherableSingle {
  if (f.selected === "" || f.selected === "Other") return f;
  return validValues.includes(f.selected)
    ? f
    : { selected: "", otherText: "" };
}

function reconcileMulti(
  f: OtherableMulti,
  validValues: string[]
): OtherableMulti {
  const filtered = f.selected.filter(
    (v) => v === "Other" || validValues.includes(v)
  );
  return { selected: filtered, otherText: f.otherText };
}

function reconcilePersisted(
  p: PersistedForm,
  opts: ResolvedOptions
): PersistedForm {
  return {
    ...p,
    step1: {
      ...p.step1,
      year: opts.year.includes(p.step1.year) ? p.step1.year : "",
    },
    step2: {
      ...p.step2,
      gender: reconcileSingle(p.step2.gender, opts.gender),
      religion: reconcileMulti(p.step2.religion, opts.religion),
      identity: reconcileMulti(p.step2.identity, opts.identity),
      generation: reconcileSingle(p.step2.generation, opts.generation),
    },
  };
}

const NANP_COUNTRIES = new Set<Country>([
  "US",
  "CA",
  "AG",
  "AI",
  "AS",
  "BB",
  "BM",
  "BS",
  "DM",
  "DO",
  "GD",
  "GU",
  "JM",
  "KN",
  "KY",
  "LC",
  "MP",
  "MS",
  "PR",
  "SX",
  "TC",
  "TT",
  "VC",
  "VG",
  "VI",
]);

function formatNationalNumber(digits: string, country: Country): string {
  if (!digits) return "";
  if (NANP_COUNTRIES.has(country)) {
    const d = digits.slice(0, 10);
    if (d.length === 0) return "";
    if (d.length <= 3) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  const formatter = new AsYouType(country);
  return formatter.input(digits) || digits;
}

function nanpDigitLimit(country: Country): number | null {
  return NANP_COUNTRIES.has(country) ? 10 : null;
}

// Every country the phone library supports, sorted alphabetically by name.
const ALL_COUNTRIES: Country[] = getCountries()
  .slice()
  .sort((a, b) => (en[a] ?? a).localeCompare(en[b] ?? b));

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface MembershipFormProps {
  copy?: MembershipFormCopy | null;
}

export default function MembershipForm({ copy }: MembershipFormProps) {
  // Resolve options once per render — code appends "Other" itself; CMS list never includes it.
  const options = useMemo<ResolvedOptions>(() => {
    const yearList =
      copy?.step1?.yearOptions && copy.step1.yearOptions.length > 0
        ? copy.step1.yearOptions
        : YEAR_FALLBACK;
    const yearSorted = [...yearList].sort(
      (a, b) =>
        (YEAR_ORDER[a] ?? Number.MAX_SAFE_INTEGER) -
        (YEAR_ORDER[b] ?? Number.MAX_SAFE_INTEGER)
    );

    const sortAlpha = (xs: string[] | undefined, fallback: string[]) =>
      [...(xs && xs.length > 0 ? xs : fallback)].sort((a, b) =>
        a.localeCompare(b)
      );

    return {
      year: yearSorted,
      gender: sortAlpha(copy?.step2?.genderOptions, GENDER_FALLBACK),
      religion: sortAlpha(copy?.step2?.religionOptions, RELIGION_FALLBACK),
      identity: sortAlpha(copy?.step2?.identityOptions, IDENTITY_FALLBACK),
      generation: sortAlpha(copy?.step2?.generationOptions, GENERATION_FALLBACK),
    };
  }, [copy]);

  // Hydrate persisted state and reconcile against current options.
  const persisted = useRef<PersistedForm | null>(
    typeof window === "undefined" ? null : loadPersisted()
  ).current;
  const reconciled = persisted ? reconcilePersisted(persisted, options) : null;

  const [step, setStep] = useState<Step>(reconciled?.step ?? 1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [piLoading, setPiLoading] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState<Country>(
    reconciled?.phoneCountry ?? "US"
  );
  const [countryOpen, setCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const countryDropdownRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  useEffect(() => {
    if (!countryOpen) return;
    function onDown(e: MouseEvent) {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(e.target as Node)
      ) {
        setCountryOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [countryOpen]);

  useEffect(() => {
    if (!countryOpen) setCountrySearch("");
  }, [countryOpen]);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return ALL_COUNTRIES;
    return ALL_COUNTRIES.filter((c) => {
      const name = (en[c] ?? c).toLowerCase();
      const code = getCountryCallingCode(c);
      return (
        name.includes(q) ||
        c.toLowerCase().includes(q) ||
        code.includes(q.replace(/^\+/, ""))
      );
    });
  }, [countrySearch]);

  const [step1, setStep1] = useState<Step1>(
    reconciled?.step1 ?? {
      firstName: "",
      lastName: "",
      psuEmail: "",
      phone: "",
      year: "",
    }
  );

  const [step2, setStep2] = useState<Step2>(
    reconciled?.step2 ?? {
      major: "",
      hometown: "",
      gender: { selected: "", otherText: "" },
      religion: { selected: [], otherText: "" },
      identity: { selected: [], otherText: "" },
      generation: { selected: "", otherText: "" },
      instagram: "",
    }
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (step === 3) return;
    try {
      const data: PersistedForm = {
        step: step as 1 | 2,
        phoneCountry,
        step1,
        step2,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore quota / serialization errors
    }
  }, [step, phoneCountry, step1, step2]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Live-clear any existing error the moment the field becomes valid.
  // Only removes errors; never adds them — new errors still come from the
  // Next-button validators.
  useEffect(() => {
    setErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;

      if (next.firstName && step1.firstName.trim()) {
        delete next.firstName;
        changed = true;
      }
      if (next.lastName && step1.lastName.trim()) {
        delete next.lastName;
        changed = true;
      }
      if (
        next.psuEmail &&
        /^[^\s@]+@psu\.edu$/i.test(step1.psuEmail.trim())
      ) {
        delete next.psuEmail;
        changed = true;
      }
      if (
        next.phone &&
        step1.phone.trim() &&
        isValidPhoneNumber(
          `+${getCountryCallingCode(phoneCountry)}${step1.phone}`
        )
      ) {
        delete next.phone;
        changed = true;
      }
      if (next.year && step1.year) {
        delete next.year;
        changed = true;
      }

      if (
        next.gender &&
        !(step2.gender.selected === "Other" && !step2.gender.otherText.trim())
      ) {
        delete next.gender;
        changed = true;
      }
      if (
        next.religion &&
        !(
          step2.religion.selected.includes("Other") &&
          !step2.religion.otherText.trim()
        )
      ) {
        delete next.religion;
        changed = true;
      }
      if (
        next.identity &&
        !(
          step2.identity.selected.includes("Other") &&
          !step2.identity.otherText.trim()
        )
      ) {
        delete next.identity;
        changed = true;
      }
      if (
        next.generation &&
        !(
          step2.generation.selected === "Other" &&
          !step2.generation.otherText.trim()
        )
      ) {
        delete next.generation;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [step1, step2, phoneCountry]);

  // Resolved labels with fallbacks (memoized for clarity).
  const t = useMemo(() => {
    const stepLabels = copy?.stepLabels;
    const s1 = copy?.step1;
    const s2 = copy?.step2;
    const s3 = copy?.step3;
    return {
      stepIndicator: [
        stepLabels?.step1 ?? "Personal Info",
        stepLabels?.step2 ?? "Demographics",
        stepLabels?.step3 ?? "Payment",
      ],
      step1: {
        intro: s1?.intro,
        firstName: s1?.labels?.firstName ?? "First Name",
        lastName: s1?.labels?.lastName ?? "Last Name",
        psuEmail: s1?.labels?.psuEmail ?? "PSU Email",
        phone: s1?.labels?.phone ?? "Phone Number",
        year: s1?.labels?.year ?? "Year",
        firstNameRequired:
          s1?.errors?.firstNameRequired ?? "First name is required.",
        lastNameRequired:
          s1?.errors?.lastNameRequired ?? "Last name is required.",
        psuEmailRequired:
          s1?.errors?.psuEmailRequired ?? "PSU email is required.",
        psuEmailDomain:
          s1?.errors?.psuEmailDomain ?? "Email must end in @psu.edu.",
        phoneRequired:
          s1?.errors?.phoneRequired ?? "Phone number is required.",
        phoneInvalid:
          s1?.errors?.phoneInvalid ?? "Please enter a valid phone number.",
        yearRequired: s1?.errors?.yearRequired ?? "Please select your year.",
        nextLabel: s1?.nextLabel ?? "Next →",
      },
      step2: {
        heading: s2?.heading ?? "Demographic Information",
        intro:
          s2?.intro ??
          "These questions are optional but we recommend you fill out so we are able to get to know you and have information about our membership when planning events",
        major:
          s2?.labels?.major ?? "What are you studying/what is your major?",
        hometown: s2?.labels?.hometown ?? "Where is your hometown?",
        gender: s2?.labels?.gender ?? "Gender",
        religion:
          s2?.labels?.religion ?? "What religion do you identify with?",
        identity:
          s2?.labels?.identity ??
          "Which of the following identities do you identify with?",
        generation:
          s2?.labels?.generation ?? "Which generation do you identify with?",
        instagram: s2?.labels?.instagram ?? "What is your Instagram handle?",
        otherSpecify: s2?.placeholders?.otherSpecify ?? "Please specify",
        instagramPh: s2?.placeholders?.instagram ?? "@yourhandle",
        otherLabel: s2?.otherLabel ?? "Other",
        genderOther:
          s2?.errors?.genderOther ?? "Please specify your gender.",
        religionOther:
          s2?.errors?.religionOther ?? "Please specify your religion.",
        identityOther:
          s2?.errors?.identityOther ?? "Please specify your identity.",
        generationOther:
          s2?.errors?.generationOther ?? "Please specify your generation.",
        backLabel: s2?.backLabel ?? "← Back",
        nextLabel: s2?.nextLabel ?? "Next →",
      },
      step3: {
        summaryHeading: s3?.summaryHeading ?? "Order Summary",
        productName: s3?.productName ?? "SASA Membership",
        loadingPaymentText:
          s3?.loadingPaymentText ?? "Loading payment form...",
        submitLabel: s3?.submitLabel ?? "Become a Member!",
        processingLabel: s3?.processingLabel ?? "Processing...",
        incompletePaymentHint:
          s3?.incompletePaymentHint ??
          "Please complete your payment details to continue.",
        genericError:
          s3?.genericError ??
          "Failed to initialize payment. Please try again.",
        backLabel: s3?.backLabel ?? "← Back",
      },
    };
  }, [copy]);

  const baseCents = copy?.priceCents ?? 3500;
  const fee = computeCardFee(baseCents);
  const priceDisplay = formatPrice(baseCents);
  const feeDisplay = formatPrice(fee.feeCents);
  const totalDisplay = formatPrice(fee.totalCents);

  const isStep1Valid = useMemo(() => {
    if (!step1.firstName.trim()) return false;
    if (!step1.lastName.trim()) return false;
    if (!/^[^\s@]+@psu\.edu$/i.test(step1.psuEmail.trim())) return false;
    if (
      !step1.phone.trim() ||
      !isValidPhoneNumber(
        `+${getCountryCallingCode(phoneCountry)}${step1.phone}`
      )
    ) {
      return false;
    }
    if (!step1.year) return false;
    return true;
  }, [step1, phoneCountry]);

  function validateStep1(): boolean {
    const next: Record<string, string> = {};

    if (!step1.firstName.trim()) next.firstName = t.step1.firstNameRequired;

    if (!step1.lastName.trim()) next.lastName = t.step1.lastNameRequired;

    if (!step1.psuEmail.trim()) {
      next.psuEmail = t.step1.psuEmailRequired;
    } else if (!/^[^\s@]+@psu\.edu$/i.test(step1.psuEmail.trim())) {
      next.psuEmail = t.step1.psuEmailDomain;
    }

    if (!step1.phone.trim()) {
      next.phone = t.step1.phoneRequired;
    } else if (
      !isValidPhoneNumber(`+${getCountryCallingCode(phoneCountry)}${step1.phone}`)
    ) {
      next.phone = t.step1.phoneInvalid;
    }

    if (!step1.year) {
      next.year = t.step1.yearRequired;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateStep2(): boolean {
    const next: Record<string, string> = {};

    if (
      step2.gender.selected === "Other" &&
      !step2.gender.otherText.trim()
    ) {
      next.gender = t.step2.genderOther;
    }

    if (
      step2.religion.selected.includes("Other") &&
      !step2.religion.otherText.trim()
    ) {
      next.religion = t.step2.religionOther;
    }

    if (
      step2.identity.selected.includes("Other") &&
      !step2.identity.otherText.trim()
    ) {
      next.identity = t.step2.identityOther;
    }

    if (
      step2.generation.selected === "Other" &&
      !step2.generation.otherText.trim()
    ) {
      next.generation = t.step2.generationOther;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goToStep2() {
    if (validateStep1()) {
      setErrors({});
      setStep(2);
    }
  }

  function goToStep3() {
    if (validateStep2()) {
      setErrors({});
      setSubmitError(null);
      setClientSecret(null);
      setStep(3);
    }
  }

  function goBack() {
    setErrors({});
    setSubmitError(null);
    setStep((s) => (s === 1 ? 1 : (s - 1) as Step));
  }

  useEffect(() => {
    if (step !== 3 || clientSecret) return;

    setPiLoading(true);
    const payload = {
      firstName: step1.firstName,
      lastName: step1.lastName,
      psuEmail: step1.psuEmail,
      phone: `+${getCountryCallingCode(phoneCountry)}${step1.phone}`,
      year: step1.year,
      major: step2.major,
      hometown: step2.hometown,
      gender: resolveSingle(step2.gender),
      religion: resolveMulti(step2.religion),
      identity: resolveMulti(step2.identity),
      generation: resolveSingle(step2.generation),
      instagram: step2.instagram,
    };

    fetch("/api/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
        } else {
          setSubmitError(data.error ?? t.step3.genericError);
        }
      })
      .catch(() => setSubmitError(t.step3.genericError))
      .finally(() => setPiLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, clientSecret, step1, step2]);

  return (
    <div
      ref={formRef}
      className="scroll-mt-24 rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
    >
      {/* Step Indicator */}
      <div className="mb-8 flex items-center justify-between">
        {[1, 2, 3].map((s, idx) => (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  step > s
                    ? "bg-sasa-gold-600 text-sasa-red-900"
                    : step === s
                      ? "bg-sasa-red-900 text-white"
                      : "border-2 border-gray-300 text-gray-400"
                }`}
              >
                {step > s ? (
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.293 5.293a1 1 0 011.414 1.414l-10 10a1 1 0 01-1.414 0l-6-6a1 1 0 011.414-1.414L10 14.586l9.293-9.293z" />
                  </svg>
                ) : (
                  s
                )}
              </div>
              <span className="text-xs text-sasa-neutral-500">
                {t.stepIndicator[idx]}
              </span>
            </div>

            {idx < 2 && (
              <div
                className={`h-0.5 flex-1 mx-2 ${
                  step > s + 1 ? "bg-sasa-gold-600" : "bg-gray-200"
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div>
          <div className="mb-6 rounded-lg border border-sasa-gold-600/30 bg-sasa-gold-400/10 p-4 text-sm leading-relaxed text-sasa-neutral-500">
            <PortableText
              value={
                t.step1.intro && t.step1.intro.length > 0
                  ? (t.step1.intro as PortableTextBlock[])
                  : FALLBACK_INTRO_BLOCKS
              }
              components={PT_COMPONENTS}
            />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                {t.step1.firstName} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={step1.firstName}
                onChange={(e) =>
                  setStep1((p) => ({ ...p, firstName: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
              />
              {errors.firstName && (
                <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                {t.step1.lastName} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={step1.lastName}
                onChange={(e) =>
                  setStep1((p) => ({ ...p, lastName: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
              />
              {errors.lastName && (
                <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                {t.step1.psuEmail} <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={step1.psuEmail}
                onChange={(e) =>
                  setStep1((p) => ({ ...p, psuEmail: e.target.value }))
                }
                onBlur={() => {
                  const trimmed = step1.psuEmail.trim();
                  if (trimmed && !/^[^\s@]+@psu\.edu$/i.test(trimmed)) {
                    setErrors((prev) => ({
                      ...prev,
                      psuEmail: t.step1.psuEmailDomain,
                    }));
                  }
                }}
                className={`w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                  errors.psuEmail
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                    : "border-gray-300 focus:border-sasa-red-900 focus:ring-sasa-red-900"
                }`}
              />
              {errors.psuEmail && (
                <p className="mt-1 text-xs text-red-500">{errors.psuEmail}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                {t.step1.phone} <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <div className="relative" ref={countryDropdownRef}>
                  <button
                    type="button"
                    aria-label="Country"
                    aria-haspopup="listbox"
                    aria-expanded={countryOpen}
                    onClick={() => setCountryOpen((o) => !o)}
                    className="flex items-center gap-1.5 h-full rounded border border-gray-300 bg-white px-2 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
                  >
                    <span className="inline-block w-6 h-4 overflow-hidden">
                      {flags[phoneCountry]
                        ? React.createElement(flags[phoneCountry]!, {
                            title: en[phoneCountry] ?? phoneCountry,
                          })
                        : null}
                    </span>
                    <span className="text-gray-700">
                      +{getCountryCallingCode(phoneCountry)}
                    </span>
                    <span className="text-gray-400 text-xs">▾</span>
                  </button>
                  {countryOpen && (
                    <div className="absolute z-10 mt-1 w-72 rounded border border-gray-300 bg-white text-sm shadow-lg">
                      <div className="border-b border-gray-200 p-2">
                        <input
                          type="text"
                          autoFocus
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                          placeholder="Search countries…"
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
                        />
                      </div>
                      <ul role="listbox" className="max-h-64 overflow-auto py-1">
                        {filteredCountries.map((c) => {
                          const Flag = flags[c];
                          return (
                            <li
                              key={c}
                              role="option"
                              aria-selected={c === phoneCountry}
                              onClick={() => {
                                setPhoneCountry(c);
                                setStep1((p) => ({ ...p, phone: "" }));
                                setCountryOpen(false);
                              }}
                              className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-100 ${
                                c === phoneCountry ? "bg-gray-50" : ""
                              }`}
                            >
                              <span className="inline-block w-6 h-4 overflow-hidden flex-shrink-0">
                                {Flag
                                  ? React.createElement(Flag, {
                                      title: en[c] ?? c,
                                    })
                                  : null}
                              </span>
                              <span className="flex-1 truncate">
                                {en[c] ?? c}
                              </span>
                              <span className="text-gray-500">
                                +{getCountryCallingCode(c)}
                              </span>
                            </li>
                          );
                        })}
                        {filteredCountries.length === 0 && (
                          <li className="px-2 py-1.5 text-gray-400">
                            No matches
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
                {(() => {
                  const isNanp = NANP_COUNTRIES.has(phoneCountry);
                  const formatted = formatNationalNumber(
                    step1.phone,
                    phoneCountry
                  );
                  const mask = "(000) 000-0000";
                  const showOverlay =
                    isNanp && formatted.length < mask.length;
                  return (
                    <div className="relative flex-1">
                      {showOverlay && (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 px-3 py-2 text-sm font-mono flex items-center"
                        >
                          <span className="invisible">{formatted}</span>
                          <span className="text-gray-300">
                            {mask.slice(formatted.length)}
                          </span>
                        </div>
                      )}
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        value={formatted}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "");
                          const limit = nanpDigitLimit(phoneCountry);
                          const capped =
                            limit !== null ? digits.slice(0, limit) : digits;
                          setStep1((p) => ({ ...p, phone: capped }));
                        }}
                        className={`relative w-full rounded border border-gray-300 px-3 py-2 text-sm bg-transparent focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900 ${
                          isNanp ? "font-mono" : ""
                        }`}
                      />
                    </div>
                  );
                })()}
              </div>
              {errors.phone && (
                <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-2">
                {t.step1.year} <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {options.year.map((y) => (
                  <label
                    key={y}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="year"
                      value={y}
                      checked={step1.year === y}
                      onChange={(e) =>
                        setStep1((p) => ({
                          ...p,
                          year: e.target.value,
                        }))
                      }
                      className="accent-sasa-red-900"
                    />
                    <span className="text-sm">{y}</span>
                  </label>
                ))}
              </div>
              {errors.year && (
                <p className="mt-1 text-xs text-red-500">{errors.year}</p>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={goToStep2}
              disabled={!isStep1Valid}
              className="rounded bg-sasa-red-900 px-6 py-2 text-sm font-semibold text-white hover:bg-sasa-red-700 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-sasa-red-900 transition-colors"
            >
              {t.step1.nextLabel}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div>
          <div className="mb-6">
            <h2 className="font-heading text-lg font-semibold text-sasa-red-900 mb-2">
              {t.step2.heading}
            </h2>
            <p className="text-sm text-sasa-neutral-500">{t.step2.intro}</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                {t.step2.major}
              </label>
              <input
                type="text"
                value={step2.major}
                onChange={(e) =>
                  setStep2((p) => ({ ...p, major: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                {t.step2.hometown}
              </label>
              <input
                type="text"
                value={step2.hometown}
                onChange={(e) =>
                  setStep2((p) => ({ ...p, hometown: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-2">
                {t.step2.gender}
              </label>
              <div className="space-y-2">
                {options.gender.map((g) => (
                  <label key={g} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      value={g}
                      checked={step2.gender.selected === g}
                      onChange={() =>
                        setStep2((p) => ({
                          ...p,
                          gender: { selected: g, otherText: "" },
                        }))
                      }
                      className="accent-sasa-red-900"
                    />
                    <span className="text-sm">{g}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="Other"
                    checked={step2.gender.selected === "Other"}
                    onChange={() =>
                      setStep2((p) => ({
                        ...p,
                        gender: { selected: "Other", otherText: "" },
                      }))
                    }
                    className="accent-sasa-red-900"
                  />
                  <span className="text-sm">{t.step2.otherLabel}</span>
                  {step2.gender.selected === "Other" && (
                    <input
                      type="text"
                      value={step2.gender.otherText}
                      onChange={(e) =>
                        setStep2((p) => ({
                          ...p,
                          gender: { selected: "Other", otherText: e.target.value },
                        }))
                      }
                      placeholder={t.step2.otherSpecify}
                      className="ml-2 rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-sasa-red-900 focus:outline-none"
                      autoFocus
                    />
                  )}
                </label>
              </div>
              {errors.gender && (
                <p className="mt-1 text-xs text-red-500">{errors.gender}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-2">
                {t.step2.religion}
              </label>
              <div className="space-y-2">
                {options.religion.map((r) => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={step2.religion.selected.includes(r)}
                      onChange={(e) => {
                        setStep2((p) => ({
                          ...p,
                          religion: {
                            ...p.religion,
                            selected: e.target.checked
                              ? [...p.religion.selected, r]
                              : p.religion.selected.filter((x) => x !== r),
                          },
                        }));
                      }}
                      className="accent-sasa-red-900"
                    />
                    <span className="text-sm">{r}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={step2.religion.selected.includes("Other")}
                    onChange={(e) => {
                      setStep2((p) => ({
                        ...p,
                        religion: {
                          ...p.religion,
                          selected: e.target.checked
                            ? [...p.religion.selected, "Other"]
                            : p.religion.selected.filter((x) => x !== "Other"),
                          otherText: !e.target.checked ? "" : p.religion.otherText,
                        },
                      }));
                    }}
                    className="accent-sasa-red-900"
                  />
                  <span className="text-sm">{t.step2.otherLabel}:</span>
                  {step2.religion.selected.includes("Other") && (
                    <input
                      type="text"
                      value={step2.religion.otherText}
                      onChange={(e) =>
                        setStep2((p) => ({
                          ...p,
                          religion: { ...p.religion, otherText: e.target.value },
                        }))
                      }
                      placeholder={t.step2.otherSpecify}
                      className="ml-2 rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-sasa-red-900 focus:outline-none"
                      autoFocus
                    />
                  )}
                </label>
              </div>
              {errors.religion && (
                <p className="mt-1 text-xs text-red-500">{errors.religion}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-2">
                {t.step2.identity}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {options.identity.map((id) => (
                  <label key={id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={step2.identity.selected.includes(id)}
                      onChange={(e) => {
                        setStep2((p) => ({
                          ...p,
                          identity: {
                            ...p.identity,
                            selected: e.target.checked
                              ? [...p.identity.selected, id]
                              : p.identity.selected.filter((x) => x !== id),
                          },
                        }));
                      }}
                      className="accent-sasa-red-900"
                    />
                    <span className="text-sm">{id}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer col-span-2">
                  <input
                    type="checkbox"
                    checked={step2.identity.selected.includes("Other")}
                    onChange={(e) => {
                      setStep2((p) => ({
                        ...p,
                        identity: {
                          ...p.identity,
                          selected: e.target.checked
                            ? [...p.identity.selected, "Other"]
                            : p.identity.selected.filter((x) => x !== "Other"),
                          otherText: !e.target.checked ? "" : p.identity.otherText,
                        },
                      }));
                    }}
                    className="accent-sasa-red-900"
                  />
                  <span className="text-sm">{t.step2.otherLabel}:</span>
                  {step2.identity.selected.includes("Other") && (
                    <input
                      type="text"
                      value={step2.identity.otherText}
                      onChange={(e) =>
                        setStep2((p) => ({
                          ...p,
                          identity: { ...p.identity, otherText: e.target.value },
                        }))
                      }
                      placeholder={t.step2.otherSpecify}
                      className="ml-2 rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-sasa-red-900 focus:outline-none"
                      autoFocus
                    />
                  )}
                </label>
              </div>
              {errors.identity && (
                <p className="mt-1 text-xs text-red-500">{errors.identity}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-2">
                {t.step2.generation}
              </label>
              <div className="space-y-2">
                {options.generation.map((g) => (
                  <label key={g} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="generation"
                      value={g}
                      checked={step2.generation.selected === g}
                      onChange={() =>
                        setStep2((p) => ({
                          ...p,
                          generation: { selected: g, otherText: "" },
                        }))
                      }
                      className="accent-sasa-red-900"
                    />
                    <span className="text-sm">{g}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="generation"
                    value="Other"
                    checked={step2.generation.selected === "Other"}
                    onChange={() =>
                      setStep2((p) => ({
                        ...p,
                        generation: { selected: "Other", otherText: "" },
                      }))
                    }
                    className="accent-sasa-red-900"
                  />
                  <span className="text-sm">{t.step2.otherLabel}:</span>
                  {step2.generation.selected === "Other" && (
                    <input
                      type="text"
                      value={step2.generation.otherText}
                      onChange={(e) =>
                        setStep2((p) => ({
                          ...p,
                          generation: { selected: "Other", otherText: e.target.value },
                        }))
                      }
                      placeholder={t.step2.otherSpecify}
                      className="ml-2 rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-sasa-red-900 focus:outline-none"
                      autoFocus
                    />
                  )}
                </label>
              </div>
              {errors.generation && (
                <p className="mt-1 text-xs text-red-500">{errors.generation}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                {t.step2.instagram}
              </label>
              <input
                type="text"
                value={step2.instagram}
                onChange={(e) =>
                  setStep2((p) => ({ ...p, instagram: e.target.value }))
                }
                placeholder={t.step2.instagramPh}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-between gap-3">
            <button
              onClick={goBack}
              className="rounded border-2 border-sasa-gold-400 px-6 py-2 text-sm font-semibold text-sasa-gold-400 hover:bg-sasa-gold-400/10 transition-colors"
            >
              {t.step2.backLabel}
            </button>
            <button
              onClick={goToStep3}
              className="rounded bg-sasa-red-900 px-6 py-2 text-sm font-semibold text-white hover:bg-sasa-red-700 transition-colors"
            >
              {t.step2.nextLabel}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div>
          <div className="mb-6 rounded-lg bg-gray-50 border border-gray-200 p-4">
            <p className="text-sm text-sasa-neutral-500 mb-1">
              {t.step3.summaryHeading}
            </p>
            <div className="flex justify-between items-baseline">
              <span className="text-base font-semibold text-sasa-red-900">
                {t.step3.productName}
              </span>
              <span className="text-base font-semibold text-sasa-red-900">
                {priceDisplay}
              </span>
            </div>
            <div className="mt-1 flex justify-between items-baseline text-sm text-sasa-neutral-500">
              <span>Card processing fee</span>
              <span>{feeDisplay}</span>
            </div>
            <div className="mt-2 flex justify-between items-baseline border-t border-gray-200 pt-2">
              <span className="text-base font-semibold text-sasa-red-900">
                Total
              </span>
              <span className="text-2xl font-bold text-sasa-gold-600">
                {totalDisplay}
              </span>
            </div>
            <p className="mt-3 text-xs text-sasa-neutral-500">
              A {feeDisplay} card processing fee is added to your {priceDisplay}{" "}
              membership so the full amount goes to SASA. You&apos;ll be charged{" "}
              {totalDisplay} total.
            </p>
          </div>

          {submitError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {piLoading && (
            <p className="text-sm text-sasa-neutral-500 mb-4">
              {t.step3.loadingPaymentText}
            </p>
          )}

          {clientSecret && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: { theme: "stripe" },
              }}
            >
              <CheckoutForm
                submitLabel={t.step3.submitLabel}
                processingLabel={t.step3.processingLabel}
                incompletePaymentHint={t.step3.incompletePaymentHint}
              />
            </Elements>
          )}

          <div className="mt-6">
            <button
              onClick={goBack}
              disabled={piLoading}
              className="rounded border-2 border-sasa-gold-400 px-6 py-2 text-sm font-semibold text-sasa-gold-400 hover:bg-sasa-gold-400/10 disabled:opacity-60 transition-colors"
            >
              {t.step3.backLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface CheckoutFormProps {
  submitLabel: string;
  processingLabel: string;
  incompletePaymentHint: string;
}

function CheckoutForm({
  submitLabel,
  processingLabel,
  incompletePaymentHint,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [isPaymentComplete, setIsPaymentComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);
    setErrorMsg(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/join/return`,
      },
    });

    if (error) {
      setErrorMsg(error.message ?? "Payment failed. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement
        onChange={(event) => setIsPaymentComplete(event.complete)}
      />
      {!isPaymentComplete && (
        <p className="mt-3 text-sm text-sasa-neutral-500">
          {incompletePaymentHint}
        </p>
      )}
      {errorMsg && <p className="mt-3 text-sm text-red-600">{errorMsg}</p>}
      <button
        type="submit"
        disabled={!stripe || isLoading || !isPaymentComplete}
        className="mt-6 w-full rounded bg-sasa-red-900 px-6 py-3 text-sm font-semibold text-white hover:bg-sasa-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? processingLabel : submitLabel}
      </button>
    </form>
  );
}
