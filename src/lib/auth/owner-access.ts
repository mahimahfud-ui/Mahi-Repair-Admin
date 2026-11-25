export type OwnerAccessProfile = {
  role?: string | null;
  status?: string | null;
} | null | undefined;

export function isActiveOwnerProfile(profile: OwnerAccessProfile): boolean {
  return profile?.role === 'owner' && profile.status === 'active';
}
