/**
 * Single source of truth for the fcpp template origin (maintainer-locked, D-8).
 * Only this file is allowed to know the concrete template location — do not
 * hardcode the ref anywhere else. TEMPLATE_REF accepts a tag or a commit hash.
 */
export const TEMPLATE_REPO = 'https://github.com/HeT-FTI/fcpp';

/**
 * Development-time pin: equivalent to the local reference copy
 * (main @ f2eaa88f24da26de47a66eb0cb51445be3b28e96).
 * TODO(fcpp 固化): once upstream is frozen + released, replace with the official tag.
 */
export const TEMPLATE_REF = 'f2eaa88f24da26de47a66eb0cb51445be3b28e96';

/**
 * Maintainer-only dev/offline override: absolute path to a local fcpp checkout.
 * Empty string = use the GitHub upstream. Never shipped as a user default.
 */
export const TEMPLATE_LOCAL_PATH = '';
