import type { PortableTextBlock } from "@portabletext/types";

export interface SanityImageSource {
  _type: "image";
  asset: {
    _ref: string;
    _type: "reference";
  };
  hotspot?: {
    x: number;
    y: number;
    height: number;
    width: number;
  };
}

export interface SanityEventCategory {
  _id: string;
  name: string;
  color: string;
}

export interface TicketType {
  _key: string;
  name: string;
  memberPriceCents: number;
  nonMemberPriceCents: number;
  capacity?: number;
  salesOpen: boolean;
}

export interface SanityEvent {
  _id: string;
  _updatedAt?: string;
  title: string;
  slug: { current: string };
  date: string;
  endDate?: string;
  hideEndTime?: boolean;
  location?: string;
  hideLocation?: boolean;
  description: string;
  coverImage: SanityImageSource;
  category: SanityEventCategory | null;
  isFeatured: boolean;
  ticketingEnabled?: boolean;
  cashPaymentEnabled?: boolean;
  boardPlusOneEnabled?: boolean;
  ticketTypes?: TicketType[];
}

export interface BoardMemberPickerEntry {
  _key: string;
  firstName: string;
  lastName: string;
}

export interface BoardMemberEntry extends BoardMemberPickerEntry {
  psuEmail: string;
}

export interface Officer {
  _id: string;
  name: string;
  role: string;
  headshot: SanityImageSource;
  bio: string;
  order: number;
}

export interface GalleryImage {
  _id: string;
  image: SanityImageSource;
  caption?: string;
  eventTitle?: string;
  semester?: string;
}

export interface GalleryAlbumPhoto {
  _key: string;
  image: SanityImageSource;
  caption?: string;
}

export interface GalleryAlbum {
  _id: string;
  title?: string;
  eventTitle?: string;
  semester: string;
  date?: string;
  images: GalleryAlbumPhoto[];
}

export interface Announcement {
  _id: string;
  title: string;
  body: PortableTextBlock[];
  publishedAt: string;
}
