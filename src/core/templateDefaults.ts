/**
 * Single source of truth for the fcpp template origin (maintainer-locked, D-8).
 * Only this file is allowed to know the concrete template location — do not
 * hardcode the ref anywhere else. TEMPLATE_REF accepts a tag or a commit hash.
 */
export const TEMPLATE_REPO = 'https://github.com/HeT-FTI/fcpp';

/**
 * Development-time pin: equivalent to the local reference copy
 * (main @ 4e7b2855506b4f9ca2f501e7d4019c99619e8ad0).
 * TODO(fcpp 固化): once upstream is frozen + released, replace with the official tag.
 */
export const TEMPLATE_REF = '4e7b2855506b4f9ca2f501e7d4019c99619e8ad0';

/**
 * Maintainer-only dev/offline override: absolute path to a local fcpp checkout.
 * Empty string = use the GitHub upstream. Never shipped as a user default.
 */
export const TEMPLATE_LOCAL_PATH = '';
