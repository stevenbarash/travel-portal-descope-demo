import type {
  Booking,
  CreateBooking,
  PartyMember,
  UpdateBooking,
} from "@kit/contracts";

/** What the repo stores for a new booking: the holiday, plus who's coming once the API resolved it. */
export type NewBooking = Omit<CreateBooking, "partyIds"> & {
  party?: PartyMember[];
};

/**
 * Data layer for bookings. Swap the in-memory implementation for a database by implementing this
 * interface (see docs/recipes). Every method takes a scope so one customer's bookings can never leak.
 */
export interface BookingsRepo {
  /** Bookings in the scope, soonest arrival first. */
  list(scope: string): Promise<Booking[]>;
  /** `createdBy` is the booker's user ID, so a family can see which guardian made each booking. */
  create(scope: string, input: NewBooking, createdBy: string): Promise<Booking>;
  /** Undefined when the ID is unknown or belongs to another scope; callers answer 404 either way. */
  update(
    scope: string,
    id: string,
    patch: UpdateBooking,
  ): Promise<Booking | undefined>;
  /**
   * Give a returning customer their history, once per scope. No-op if already seeded. `parties`
   * names who was on each sample break (a family's members), in SAMPLES order.
   */
  ensureSamples(scope: string, parties?: PartyMember[][]): Promise<void>;
  /** Lets callers skip the family lookup that building `parties` costs once a scope is seeded. */
  hasSamples(scope: string): Promise<boolean>;
}

/** YYYY-MM-DD, `days` from today. */
function inDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A returning guest's history: one past break, two upcoming. */
const SAMPLES: NewBooking[] = [
  {
    destination: "lisbon",
    accommodation: "hotel",
    arrival: inDays(-180),
    nights: 4,
    guests: 4,
  },
  {
    destination: "santorini",
    accommodation: "apartment",
    arrival: inDays(45),
    nights: 7,
    guests: 4,
  },
  {
    destination: "kyoto",
    accommodation: "apartment",
    arrival: inDays(160),
    nights: 3,
    guests: 2,
  },
];

/** Process-local store: fine for a demo, lost on restart, and not shared across API instances. */
export class InMemoryBookingsRepo implements BookingsRepo {
  private bookings = new Map<string, Booking>();
  private seeded = new Set<string>();
  private seq = 0;

  /** Back to the boot state (POST /api/demo/reset). */
  reset() {
    this.bookings.clear();
    this.seeded.clear();
    this.seq = 0;
  }

  private insert(scope: string, input: NewBooking, createdBy: string): Booking {
    const n = ++this.seq;
    // Reference is derived from the sequence so it looks like a real booking number yet repeats
    // identically after a demo reset.
    const booking: Booking = {
      id: `bk_${n}`,
      reference: `TC${String(482_300 + n * 37).padStart(7, "0")}`,
      scope,
      ...input,
      status: "upcoming",
      createdBy,
      createdAt: new Date().toISOString(),
    };
    this.bookings.set(booking.id, booking);
    return booking;
  }

  async ensureSamples(scope: string, parties?: PartyMember[][]) {
    if (this.seeded.has(scope)) return;
    // Marked before inserting, so a cancelled sample is never re-created on the next read.
    this.seeded.add(scope);
    SAMPLES.forEach((s, i) => {
      const party = parties?.[i];
      this.insert(
        scope,
        party?.length ? { ...s, guests: party.length, party } : s,
        "seed",
      );
    });
  }
  async hasSamples(scope: string) {
    return this.seeded.has(scope);
  }

  async list(scope: string) {
    return [...this.bookings.values()]
      .filter((b) => b.scope === scope)
      .sort((a, b) => a.arrival.localeCompare(b.arrival));
  }
  async create(scope: string, input: NewBooking, createdBy: string) {
    return this.insert(scope, input, createdBy);
  }
  async update(scope: string, id: string, patch: UpdateBooking) {
    const cur = this.bookings.get(id);
    // IDs are guessable (bk_1, bk_2…), so the scope check is what keeps customers apart.
    if (!cur || cur.scope !== scope) return undefined;
    const next = { ...cur, ...patch };
    this.bookings.set(id, next);
    return next;
  }
}
