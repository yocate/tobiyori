export type Role = "STUDENT" | "ORG_ADMIN" | "OPERATOR";
export type VerifiedStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ParticipationType = "VISIT" | "ONE_TIME" | "ONGOING";
export type ApplicationStatus = "APPLIED" | "APPROVED" | "DECLINED" | "CANCELLED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type ReportStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
export type ReportTargetType = "ACTIVITY" | "ORGANIZATION" | "USER" | "COMMUNITY";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type TrustRank = "白だるま" | "片目だるま" | "両目だるま";

export interface TrustInfo {
  rank: TrustRank;
  score: number;
  activityCount: number;
  avgRating: number | null;
  orientationRate: number | null;
  followUpRate: number | null;
  openReportCount: number;
  insuranceRecentlyUpdated: boolean;
  specialBadges: string[];
}

export interface OrgHealth {
  daysSinceLastActivityPosted: number | null;
  staleApplicationCount: number;
  signOfStrain: boolean;
}

export interface Organization {
  id: string;
  name: string;
  category: string;
  description: string;
  verifiedStatus: VerifiedStatus;
  insuranceInfo: string;
  insuranceUpdatedAt: string;
  representativeUserId: string;
  createdAt: string;
  trust?: TrustInfo;
  health?: OrgHealth;
}

export interface Activity {
  id: string;
  orgId: string;
  organization: Organization;
  title: string;
  description: string;
  genre: string;
  city: string;
  lat: number;
  lng: number;
  dateTime: string;
  participationTypes: string; // comma separated ParticipationType
  beginnerFriendly: boolean;
  riskLevel: RiskLevel;
  insuranceCovered: boolean;
  capacity: number;
  transportNote?: string | null;
  emergencyContact?: string | null;
  incidentProcedure?: string | null;
  durationMinutes?: number | null;
  parkingAvailable: boolean;
  transportCost?: string | null;
  contactPerson?: string | null;
  itemsToBring?: string | null;
  photoPolicy?: string | null;
  prohibitedNotes?: string | null;
  isHelpRequest: boolean;
  createdAt: string;
}

export interface Recommendation {
  activity: Activity;
  score: number;
  reasons: string[];
}

export interface StudentProfileData {
  university?: string | null;
  interests?: string | null;
  bio?: string | null;
  availableDays?: string | null;
  transportMethod?: string | null;
  preferredCity?: string | null;
}

export interface ActivityRecord {
  id: string;
  applicationId: string;
  attended: boolean;
  review?: string | null;
  rating?: number | null;
  certificateIssued: boolean;
  orientationGiven: boolean;
  followUpSent: boolean;
  createdAt: string;
}

export interface StudentStats {
  points: number;
  attendedCount: number;
  reviewCount: number;
  levelBadge: string;
  levelIcon: string;
  nextLevel: { label: string; pointsToGo: number } | null;
  cityBadges: string[];
  genreBadges: string[];
}

export interface Application {
  id: string;
  activityId: string;
  activity?: Activity;
  studentId: string;
  student?: { id: string; name: string; email: string };
  participationType: ParticipationType;
  message?: string | null;
  status: ApplicationStatus;
  createdAt: string;
  record?: ActivityRecord | null;
}

export interface CommunityMember {
  id: string;
  role: "OWNER" | "MEMBER";
  joinedAt: string;
  user: { id: string; name: string };
}

export interface CommunityPost {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
}

export interface Community {
  id: string;
  name: string;
  description: string;
  interestTag: string;
  university?: string | null;
  city?: string | null;
  suspended: boolean;
  createdAt: string;
  createdBy: { id: string; name: string };
  _count?: { memberships: number; posts?: number };
  memberships?: CommunityMember[];
  posts?: CommunityPost[];
}

export interface Report {
  id: string;
  targetType: ReportTargetType;
  targetId?: string | null;
  targetLabel: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  reporter?: { name: string; email: string } | null;
}

export const GENRES = [
  "祭り・イベント運営",
  "子どもの学習支援",
  "商店街SNS・動画制作",
  "高齢者との交流",
  "農業・環境保全",
  "スポーツ・文化活動",
  "留学生との国際交流",
  "空き店舗・地域資源の活用",
] as const;

export const GUNMA_CITIES = [
  "前橋市",
  "高崎市",
  "桐生市",
  "伊勢崎市",
  "太田市",
  "沼田市",
  "館林市",
  "渋川市",
  "藤岡市",
  "富岡市",
  "安中市",
  "みどり市",
] as const;

export const GUNMA_UNIVERSITIES = [
  "群馬大学",
  "高崎経済大学",
  "高崎健康福祉大学",
  "群馬県立女子大学",
  "前橋工科大学",
  "上武大学",
  "高崎商科大学",
  "関東学園大学",
  "育英大学",
  "桐生大学",
  "群馬パース大学",
  "群馬医療福祉大学",
  "その他",
] as const;

export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;

export const TRANSPORT_METHODS = ["徒歩", "自転車", "車", "電車・バス"] as const;

export const PARTICIPATION_LABELS: Record<ParticipationType, string> = {
  VISIT: "見学",
  ONE_TIME: "単発体験",
  ONGOING: "継続参加",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: "低リスク",
  MEDIUM: "中リスク(屋外活動など)",
  HIGH: "高リスク",
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: "申込中",
  APPROVED: "承認済み",
  DECLINED: "見送り",
  CANCELLED: "キャンセル済み",
};

// Takasaki daruma motif: a daruma's eyes are painted in one at a time as a wish
// is pursued — white (blank) → one eye → both eyes, mirroring the org's track record.
export const TRUST_RANK_STYLE: Record<TrustRank, { bg: string; fg: string; emoji: string }> = {
  白だるま: { bg: "#f3f4f6", fg: "#6b7280", emoji: "⚪" },
  片目だるま: { bg: "#fdeaea", fg: "#b3392f", emoji: "👁️" },
  両目だるま: { bg: "#fdeaea", fg: "#b3392f", emoji: "👀" },
};
