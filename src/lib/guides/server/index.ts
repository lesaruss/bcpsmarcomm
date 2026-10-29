import 'server-only'
import type { GuideDef } from '../types'
import { WEBSITE_PLATFORM_GUIDE } from './website-platform'

// Restricted guides' content, by slug. Server only: importing this from a
// browser component fails the build, so the content cannot leak into the
// page code. Each slug also needs an entry in ../restricted.ts.
export const SERVER_GUIDES: Record<string, GuideDef> = {
  [WEBSITE_PLATFORM_GUIDE.slug]: WEBSITE_PLATFORM_GUIDE,
}
