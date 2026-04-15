/** Auth & user types */

export type UserRole = 'admin' | 'user';
export type AccessTier = 'tier_1' | 'tier_2' | 'tier_3';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  accessTier: AccessTier;
  organizationName?: string;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPersonalActor {
  id: string;
  userId: string;
  actorId: string;
  notes?: string;
  tags: string[];
  status: 'personal' | 'suggested' | 'merged';
  suggestedAt?: string;
  mergedActorId?: string;
  createdAt: string;
}

export interface ActorValidationEntry {
  id: string;
  userPersonalActorId: string;
  suggestedBy: string;
  status: 'pending' | 'approved' | 'rejected' | 'merged';
  duplicateCheckResult?: Record<string, unknown>;
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface SearchAnalytics {
  id: string;
  sessionId: string;
  userId?: string;
  userTier: string;
  isAnonymous: boolean;
  searchedCapabilities: string[];
  searchedCompetences: string[];
  searchedDomains: string[];
  searchedProductTypes: string[];
  searchedServiceTypes: string[];
  constraintsUsed?: Record<string, unknown>;
  rolesCreated: number;
  actorsFound: number;
  actorsIncluded: number;
  createdAt: string;
}
