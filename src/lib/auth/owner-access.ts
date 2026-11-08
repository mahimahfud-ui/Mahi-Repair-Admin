import { isValidOwnerAuthEmail } from './owner-pin';

export type OwnerAccessProfile = {
  role?: string | null;
  status?: string | null;
} | null | undefined;

export function isActiveOwnerProfile(profile: OwnerAccessProfile): boolean {
  return profile?.role === 'owner' && profile.status === 'active';
}

/**
 * The sole production Owner must match the server-configured Auth identity as
 * well as an active owner profile. A role flag by itself is never sufficient.
 */
export function isConfiguredActiveOwner(
  userEmail: unknown,
  configuredOwnerEmail: unknown,
  profile: OwnerAccessProfile,
): boolean {
  if (!isActiveOwnerProfile(profile)) return false;
  if (!isValidOwnerAuthEmail(userEmail) || !isValidOwnerAuthEmail(configuredOwnerEmail)) {
    return false;
  }

  return userEmail.trim().toLowerCase() === configuredOwnerEmail.trim().toLowerCase();
}
