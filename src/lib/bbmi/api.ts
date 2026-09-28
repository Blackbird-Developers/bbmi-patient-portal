import "server-only";
import { bbmi } from "./client";

/**
 * Typed calls to the Beyond BMI backend (origin/qa, verified 2026-09-28).
 * Every call takes the patient's Cognito access token; the backend scopes
 * everything to the token's sub, so no patient id is ever sent from here.
 */

export type TierStage = "none" | "consult_paid" | "consult_booked" | "consult_done" | "ninety_day_active" | "ninety_day_overdue" | "ninety_day_completed" | "legacy_member" | "legacy_lapsed";

export interface TierStatus {
  stage: TierStage;
  canPurchaseConsult: boolean;
  canUpgrade: boolean;
  canChooseOngoing?: boolean;
  hasAddress?: boolean;
  consult?: { purchasedAt: string; appointmentStart?: string; appointmentStatus?: string };
  ninetyDay?: { variant: "installments_450" | "upfront_399"; activeUntil: string; daysRemaining: number; programmeStart: string; programmeBegins: string };
  ninetyDayCompleted?: { variant: "installments_450" | "upfront_399"; programmeStart: string; completedAt: string };
  billingIssue?: { status: "past_due" | "unpaid" | "incomplete" | "payment_paused"; amountDueCents?: number; currency?: string; hostedInvoiceUrl?: string };
  lapsed?: { status: string; endedAt: string };
  /** Present for every legacy member while DOCTOR_REVIEW_MONTHS is set — prompt only when reviewDue. */
  doctorReview?: { reviewDue: boolean; lastDoctorAppointmentAt: string | null; hasUpcomingDoctorEvent: boolean; monthsWindow: number };
}

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mobile?: string;
  gender?: string | null;
  created: string;
  settings?: { acceptTerms?: boolean; weightTracker?: boolean; unitPreference?: "kg" | "lbs" };
}

export interface PersonalInformation {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string; // 'Phone number not available' when missing
  gender?: string | null;
  dob?: string; // 'Date of birth not available' when missing
  address?: string; // formatted; 'Address not available' when missing
  gp?: { name?: string; email?: string } | null;
  subscription?: { stripePlanId?: string; status?: string; statusName?: string; currentPeriodEnd?: string; plan?: { name?: string; currentPrice?: number; interval?: string } } | null;
}

export interface WeightRow {
  id: string;
  weight: string; // decimal — comes back as a string
  unit: string;
  unitPreference?: string;
  measurementDate?: string | null; // YYYY-MM-DD
  doctorId?: string | null;
  created: string;
}

export const getTierStatus = (t: string) => bbmi<TierStatus>(t, "/user/tier-journey/status");
export const getMe = (t: string) => bbmi<Me>(t, "/user/");
export const getPersonalInformation = (t: string) => bbmi<PersonalInformation>(t, "/user/personal-information");
export const getWeightHistory = (t: string) => bbmi<{ weights: WeightRow[]; percentageLoss?: { total: string | number; percent: string | number } }>(t, "/user/measurements/history");
export const getLastWeight = (t: string) => bbmi<{ weight: WeightRow | null; lessWeek: boolean; dateAvailable: string | null }>(t, "/user/measurements/weights/last");
export const addWeight = (t: string, kg: number, measurementDate?: string) => bbmi<WeightRow>(t, "/user/measurements/weights", { method: "POST", body: { weight: kg, unitPreference: "kg", ...(measurementDate ? { measurementDate } : {}) } });
export const getSurveyDone = (t: string) => bbmi<boolean>(t, "/user/survey-info");
export const getSurveyGate = (t: string) => bbmi<{ submitted: boolean; required: boolean }>(t, "/user/survey-gate");
export const getEssDue = (t: string) => bbmi<boolean>(t, "/user/survey/ess-eq5d");
export const getHealthCoachSurvey = (t: string) => bbmi<{ show: boolean; survey: string }>(t, "/user/survey/health-coach-survey");
export const addAddress = (t: string, a: { addressLine1: string; addressLine2?: string; city: string; state: string; postalCode: string; country: string }) =>
  bbmi<{ id: string }>(t, "/user/address", { method: "POST", body: a });
/** Stripe Billing Portal (update card, invoices, cancel). Return URL is set by the backend. */
export const createBillingPortalSession = (t: string) => bbmi<string>(t, "/user/customer-portal-session", { method: "POST", body: {} });
/** Hosted Stripe Checkout for a tier; the backend re-checks the stage. */
export const createTierCheckout = (t: string, tier: "e89" | "ninety_450" | "ninety_399" | "ongoing_150" | "ongoing_75") =>
  bbmi<{ url?: string; comp?: boolean }>(t, "/user/tier-journey/checkout", { method: "POST", body: { tier } });
