// Pages for school WCMs and the District Web Team only (Sean, 2026-10-08:
// Proud Points "should be assigned to school WCMs and District Web Team
// members"). In acl_objects these are 'restricted' with a view grant to the
// District Web Team group. School WCMs are not an acl group (they are
// recognized by bcps_schools.wcm_email), so /api/bcps/my-access adds these
// pages for them, and the API routes check the same rule
// (lib/proudPointsApi.ts requireProudPointsAccess).
export const SCHOOL_WCM_PAGES = ['proud-points', 'my-submissions'] as const
