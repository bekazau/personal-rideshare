// Hand-written types for the Supabase schema in supabase/migrations/0001_init.sql.
// Once the Supabase CLI is installed and linked, regenerate with:
//   npx supabase gen types typescript --linked > src/lib/types/database.ts

export type RideStatus =
  | "pending"
  | "accepted"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "declined";

export type PaymentMethod =
  | "cashapp"
  | "venmo"
  | "paypal"
  | "zelle"
  | "applepay"
  | "cash"
  | "unpaid";

export type DriverStatus = "available" | "busy" | "offline";

export interface DriverRow {
  id: string;
  display_name: string;
  invite_code: string;
  status: DriverStatus;
  last_lat: number | null;
  last_lng: number | null;
  last_area_name: string | null;
  last_location_at: string | null;
  home_lat: number | null;
  home_lng: number | null;
  home_radius_meters: number | null;
  base_fare_cents: number;
  first_ride_free_on: boolean;
  first_ride_discount_pct: number;
  pay_cashapp: string | null;
  pay_venmo: string | null;
  pay_paypal: string | null;
  pay_zelle: string | null;
  pay_applepay: string | null;
  pay_cash_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface RiderRow {
  id: string;
  display_name: string;
  phone: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface RideRow {
  id: string;
  driver_id: string;
  rider_id: string;
  status: RideStatus;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  rider_notes: string | null;
  base_fare_cents: number;
  discount_cents: number;
  tip_cents: number;
  total_cents: number;
  is_first_ride: boolean;
  payment_method: PaymentMethod;
  paid_at: string | null;
  requested_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
}

export interface SavedAddressRow {
  id: string;
  rider_id: string;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface DriverRiderLinkRow {
  driver_id: string;
  rider_id: string;
  invited_at: string;
}

export interface MessageRow {
  id: string;
  driver_id: string;
  rider_id: string;
  sender_role: "driver" | "rider";
  body: string;
  created_at: string;
  read_at: string | null;
}

type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      drivers: TableShape<DriverRow>;
      riders: TableShape<RiderRow>;
      rides: TableShape<RideRow>;
      push_subscriptions: TableShape<PushSubscriptionRow>;
      saved_addresses: TableShape<SavedAddressRow>;
      driver_rider_links: TableShape<DriverRiderLinkRow>;
      messages: TableShape<MessageRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      ride_status: RideStatus;
      payment_method: PaymentMethod;
    };
    CompositeTypes: Record<string, never>;
  };
}
