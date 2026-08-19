import { StaffDesignation } from "./types";

// Labels for the firm's staff seniority ladder (distinct from the campus-hire
// Designation lookup table, which only covers junior entry levels).
export const STAFF_DESIGNATIONS: { value: StaffDesignation; label: string }[] = [
  { value: "CONSULTANT", label: "Consultant" },
  { value: "SENIOR_CONSULTANT", label: "Senior Consultant" },
  { value: "PRINCIPAL_CONSULTANT", label: "Principal Consultant" },
  { value: "SENIOR_PRINCIPAL", label: "Senior Principal" },
  { value: "ASSOCIATE_DIRECTOR", label: "Associate Director" },
  { value: "MANAGING_DIRECTOR", label: "Managing Director" },
];
