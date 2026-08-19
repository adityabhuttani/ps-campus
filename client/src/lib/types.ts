export type UserRole = "SUPER_ADMIN" | "ADMIN" | "CAPTAIN" | "PANELIST" | "VIEWER";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export type StaffDesignation =
  | "CONSULTANT"
  | "SENIOR_CONSULTANT"
  | "PRINCIPAL_CONSULTANT"
  | "SENIOR_PRINCIPAL"
  | "ASSOCIATE_DIRECTOR"
  | "MANAGING_DIRECTOR";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  department?: { id: string; name: string } | null;
  designation?: StaffDesignation | null;
  // Computed from the active cycle's teams — not stored directly on the
  // user, since team membership is assigned per-cycle on the Teams page.
  panel?: { teamName: string; captainName: string } | null;
}

export interface Department {
  id: string;
  name: string;
}

export interface Designation {
  id: string;
  name: string;
  // Only populated when a Designation is nested under a Drive — its one
  // evaluation-criteria rubric, looked up via the designation rather than
  // stored on the drive itself.
  scoringTemplate?: ScoringTemplate;
}

export interface College {
  id: string;
  name: string;
}

export interface HiringCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface HiringTarget {
  id: string;
  cycleId: string;
  departmentId: string;
  designationId: string;
  targetCount: number;
  department: Department;
  designation: Designation;
}

export interface ScoringCriterion {
  id: string;
  label: string;
  weight: number;
  sortOrder: number;
}

export interface ScoringTemplate {
  id: string;
  name: string;
  designationId: string;
  criteria: ScoringCriterion[];
  designation?: Designation;
}

export interface TeamMemberRef {
  id: string;
  userId: string;
  user: AppUser;
}

export interface Team {
  id: string;
  cycleId: string;
  name: string;
  captainId: string;
  captain: AppUser;
  members: TeamMemberRef[];
  isComplete: boolean;
  // Total headcount including the captain (3, 4, or 5).
  size: number;
}

export type DriveStatus = "PLANNED" | "PPT_DONE" | "OA_DONE" | "PI_IN_PROGRESS" | "ROUND_TABLE" | "FINALIZED";

// The team as it arrives nested under a Drive. List endpoints omit the panel
// roster (nothing in a list view renders it, and each extra nested relation
// costs a round trip), so `members` is only populated when a single drive is
// fetched by id.
export type DriveTeam = Omit<Team, "members"> & { members?: TeamMemberRef[] };

export interface Drive {
  id: string;
  cycleId: string;
  collegeId: string;
  college: College;
  departmentId: string;
  department: Department;
  designationId: string;
  designation: Designation;
  teamId: string;
  team: DriveTeam;
  pptAt?: string | null;
  oaAt?: string | null;
  piAt?: string | null;
  targetCount?: number | null;
  status: DriveStatus;
  // Computed server-side from what's actually happened on the drive (dates,
  // imported scores, final statuses) — the stored `status` above only ever
  // holds PLANNED or FINALIZED. Always show this, not `status`.
  displayStatus: DriveStatus;
  // Funnel stats for reporting. Applicants/Round 1 are manually entered (the
  // app has no visibility into either stage); Round 2/Selections are
  // computed from actual candidate records, not stored.
  applicantCount?: number | null;
  round1Count?: number | null;
  round2Count: number;
  selectionsCount: number;
}

export type FinalStatus = "TBD" | "SELECTED" | "REJECTED";

export interface CandidateStatus {
  id: string;
  candidateId: string;
  status: FinalStatus;
  roundTableNotes?: string | null;
  finalizedById?: string | null;
  finalizedAt?: string | null;
  // Set when the assigned panelist explicitly submits a completed evaluation
  // — scores autosave regardless, so this marks "done", not "saved".
  submittedAt?: string | null;
}

export interface Candidate {
  id: string;
  driveId: string;
  rollNumber: string;
  name: string;
  gender?: string | null;
  course?: string | null;
  cgpa?: number | null;
  oaScore?: number | null;
  // Paths under the server's /uploads static route.
  cvUrl?: string | null;
  assessmentReportUrl?: string | null;
  // Filled in by the assigned panelist during/after the interview, not by
  // whoever entered the candidate's core profile.
  hometown?: string | null;
  parentsOccupation?: string | null;
  higherEducationPlans?: string | null;
  holdingOffer?: string | null;
  assignedPanelistId?: string | null;
  assignedPanelist?: { id: string; name: string } | null;
  status?: CandidateStatus | null;
}

// A candidate as returned by GET /candidates/mine — carries its own drive
// (and that drive's criteria) so a cross-drive summary can render college,
// designation, and per-criterion scores without extra lookups.
export interface MyCandidate extends Candidate {
  drive: Drive;
  interviewScores: { criterionId: string; score: number; remarks?: string | null }[];
  finalScore: number;
}

export interface InterviewScore {
  id: string;
  candidateId: string;
  panelistId: string;
  panelist: { id: string; name: string };
  criterionId: string;
  criterion: ScoringCriterion;
  score: number;
  remarks?: string | null;
  updatedAt: string;
}

export interface DriveBoard {
  drive: Drive;
  candidates: Candidate[];
  scores: InterviewScore[];
  consolidated: Record<string, number>;
}
