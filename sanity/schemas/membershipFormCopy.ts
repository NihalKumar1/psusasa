import { defineField, defineType } from "sanity";

const FALLBACK_INTRO_BLOCKS = [
  {
    _type: "block",
    _key: "intro-1",
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
  },
  {
    _type: "block",
    _key: "intro-2",
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
  },
  {
    _type: "block",
    _key: "intro-3",
    style: "normal",
    listItem: "bullet",
    level: 1,
    children: [
      {
        _type: "span",
        _key: "s3",
        text: "Free & discounted cultural & social events",
        marks: [],
      },
    ],
    markDefs: [],
  },
  {
    _type: "block",
    _key: "intro-4",
    style: "normal",
    listItem: "bullet",
    level: 1,
    children: [
      {
        _type: "span",
        _key: "s4",
        text: "Free food & perks (Holi t-shirt, goodie bags, etc.) at specific events",
        marks: [],
      },
    ],
    markDefs: [],
  },
  {
    _type: "block",
    _key: "intro-5",
    style: "normal",
    listItem: "bullet",
    level: 1,
    children: [
      {
        _type: "span",
        _key: "s5",
        text: "Priority tickets to social events & partner org events",
        marks: [],
      },
    ],
    markDefs: [],
  },
  {
    _type: "block",
    _key: "intro-6",
    style: "normal",
    listItem: "bullet",
    level: 1,
    children: [
      {
        _type: "span",
        _key: "s6",
        text: "Access to GroupMe to get latest news/connect with others",
        marks: [],
      },
    ],
    markDefs: [],
  },
  {
    _type: "block",
    _key: "intro-7",
    style: "normal",
    listItem: "bullet",
    level: 1,
    children: [
      {
        _type: "span",
        _key: "s7",
        text: "Eligible to apply for freshman liaison/vacant admin board positions",
        marks: [],
      },
    ],
    markDefs: [],
  },
  {
    _type: "block",
    _key: "intro-8",
    style: "normal",
    children: [
      {
        _type: "span",
        _key: "s8",
        text: "We are so excited to meet and get to know each and everyone of you this year!",
        marks: [],
      },
    ],
    markDefs: [],
  },
];

export default defineType({
  name: "membershipFormCopy",
  title: "Membership Form",
  type: "document",
  fields: [
    defineField({
      name: "priceCents",
      title: "Membership Price (in cents)",
      type: "number",
      description: "Flat price for all memberships. Example: 3500 = $35.00.",
      initialValue: 3500,
      validation: (Rule) => Rule.required().integer().min(50),
    }),
    defineField({
      name: "stepLabels",
      title: "Step Indicator Labels",
      type: "object",
      fields: [
        { name: "step1", title: "Step 1", type: "string", initialValue: "Personal Info" },
        { name: "step2", title: "Step 2", type: "string", initialValue: "Demographics" },
        { name: "step3", title: "Step 3", type: "string", initialValue: "Payment" },
      ],
    }),
    defineField({
      name: "step1",
      title: "Step 1 — Personal Info",
      type: "object",
      fields: [
        {
          name: "intro",
          title: "Intro Message",
          type: "array",
          of: [{ type: "block" }],
          initialValue: FALLBACK_INTRO_BLOCKS,
        },
        {
          name: "labels",
          title: "Field Labels",
          type: "object",
          fields: [
            { name: "firstName", type: "string", initialValue: "First Name" },
            { name: "lastName", type: "string", initialValue: "Last Name" },
            { name: "psuEmail", type: "string", initialValue: "PSU Email" },
            { name: "phone", type: "string", initialValue: "Phone Number" },
            { name: "year", type: "string", initialValue: "Year" },
          ],
        },
        {
          name: "yearOptions",
          title: "Year Options",
          type: "array",
          of: [{ type: "string" }],
          initialValue: [
            "Freshman",
            "Sophomore",
            "Junior",
            "Senior",
            "Grad Student",
          ],
        },
        {
          name: "errors",
          title: "Validation Errors",
          type: "object",
          fields: [
            { name: "firstNameRequired", type: "string", initialValue: "First name is required." },
            { name: "lastNameRequired", type: "string", initialValue: "Last name is required." },
            { name: "psuEmailRequired", type: "string", initialValue: "PSU email is required." },
            { name: "psuEmailDomain", type: "string", initialValue: "Email must end in @psu.edu." },
            { name: "phoneRequired", type: "string", initialValue: "Phone number is required." },
            { name: "phoneInvalid", type: "string", initialValue: "Please enter a valid phone number." },
            { name: "yearRequired", type: "string", initialValue: "Please select your year." },
          ],
        },
        { name: "nextLabel", type: "string", initialValue: "Next →" },
      ],
    }),
    defineField({
      name: "step2",
      title: "Step 2 — Demographics",
      type: "object",
      fields: [
        { name: "heading", type: "string", initialValue: "Demographic Information" },
        {
          name: "intro",
          type: "text",
          rows: 3,
          initialValue:
            "These questions are optional but we recommend you fill out so we are able to get to know you and have information about our membership when planning events",
        },
        {
          name: "labels",
          title: "Field Labels",
          type: "object",
          fields: [
            { name: "major", type: "string", initialValue: "What are you studying/what is your major?" },
            { name: "hometown", type: "string", initialValue: "Where is your hometown?" },
            { name: "gender", type: "string", initialValue: "Gender" },
            { name: "religion", type: "string", initialValue: "What religion do you identify with?" },
            { name: "identity", type: "string", initialValue: "Which of the following identities do you identify with?" },
            { name: "generation", type: "string", initialValue: "Which generation do you identify with?" },
            { name: "instagram", type: "string", initialValue: "What is your Instagram handle?" },
          ],
        },
        {
          name: "placeholders",
          type: "object",
          fields: [
            { name: "otherSpecify", type: "string", initialValue: "Please specify" },
            { name: "instagram", type: "string", initialValue: "@yourhandle" },
          ],
        },
        {
          name: "otherLabel",
          title: "'Other' Display Label",
          description:
            "Displayed text for the 'Other' option. The underlying selected value is always the literal 'Other' — this only changes what users see.",
          type: "string",
          initialValue: "Other",
        },
        {
          name: "genderOptions",
          title: "Gender Options (do not include 'Other')",
          type: "array",
          of: [{ type: "string" }],
          initialValue: ["Male", "Female"],
        },
        {
          name: "religionOptions",
          title: "Religion Options (do not include 'Other')",
          type: "array",
          of: [{ type: "string" }],
          initialValue: [
            "Hindu",
            "Muslim",
            "Christian",
            "Buddhist",
            "Jain",
            "Sikh",
            "Parsi",
            "Not Religious",
          ],
        },
        {
          name: "identityOptions",
          title: "Identity Options (do not include 'Other')",
          type: "array",
          of: [{ type: "string" }],
          initialValue: [
            "Assamese", "Bengali", "Bihari", "Gujarati", "Kashmiri",
            "Kannadiga", "Konkani", "Malayali", "Marathi", "Odia", "Nepali",
            "North India / Hindi Belt", "North East (Seven Sisters)",
            "Pashtun", "Punjabi", "Rajasthani", "Santhali", "Sindhi",
            "Sinhalese", "Tamil", "Telugu",
          ],
        },
        {
          name: "generationOptions",
          title: "Generation Options (do not include 'Other')",
          type: "array",
          of: [{ type: "string" }],
          initialValue: [
            "1st generation (born outside the US)",
            "1.5 generation (born abroad, moved to US as a young child)",
            "2nd generation (born in the US)",
            "3rd generation+ (parents born in the US)",
          ],
        },
        {
          name: "errors",
          title: "Validation Errors",
          type: "object",
          fields: [
            { name: "genderOther", type: "string", initialValue: "Please specify your gender." },
            { name: "religionOther", type: "string", initialValue: "Please specify your religion." },
            { name: "identityOther", type: "string", initialValue: "Please specify your identity." },
            { name: "generationOther", type: "string", initialValue: "Please specify your generation." },
          ],
        },
        { name: "backLabel", type: "string", initialValue: "← Back" },
        { name: "nextLabel", type: "string", initialValue: "Next →" },
      ],
    }),
    defineField({
      name: "step3",
      title: "Step 3 — Payment",
      type: "object",
      fields: [
        { name: "summaryHeading", type: "string", initialValue: "Order Summary" },
        { name: "productName", type: "string", initialValue: "SASA Membership" },
        { name: "loadingPaymentText", type: "string", initialValue: "Loading payment form..." },
        { name: "submitLabel", type: "string", initialValue: "Become a Member!" },
        { name: "processingLabel", type: "string", initialValue: "Processing..." },
        {
          name: "incompletePaymentHint",
          title: "Hint shown while payment fields are incomplete",
          type: "string",
          initialValue: "Please complete your payment details to continue.",
        },
        {
          name: "genericError",
          type: "string",
          initialValue: "Failed to initialize payment. Please try again.",
        },
        { name: "backLabel", type: "string", initialValue: "← Back" },
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Membership Form" }),
  },
});
