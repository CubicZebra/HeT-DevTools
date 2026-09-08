/**
 * Single source of truth for the fcpp template origin (maintainer-locked, D-8).
 * Only this file is allowed to know the concrete template location — do not
 * hardcode the ref anywhere else. TEMPLATE_REF accepts a tag or a commit hash.
 */
export const TEMPLATE_REPO = 'https://github.com/HeT-FTI/fcpp';

/**
 * D-E3 canonical release tag — preferred anchor when upstream fcpp has an
 * official release. Empty string today (upstream not yet tagged): the default
 * bootstrap chain falls back to TEMPLATE_REF (fixed hash), then to the bundled
 * asset template when neither is reachable. Set this once upstream tags a
 * release (e.g. 'v0.1.0').
 */
export const TEMPLATE_TAG = '';

/**
 * Fixed-hash pin (main @ f2eaa88f24da26de47a66eb0cb51445be3b28e96). Serves as
 * the D-E3 second anchor when no TEMPLATE_TAG is set (or its clone fails):
 * deterministic, CI-identical.
 */
export const TEMPLATE_REF = 'f2eaa88f24da26de47a66eb0cb51445be3b28e96';

/**
 * Maintainer-only dev/offline override: absolute path to a local fcpp checkout.
 * Empty string = use the GitHub upstream. Never shipped as a user default.
 */
export const TEMPLATE_LOCAL_PATH = '';
