// fcpp commit conventions — single source of truth for CI commit gates.
// MUST stay in sync with `.github/misc/.releaserc.json` parserOpts (semantic-release
// commit-analyzer AND release-notes-generator); keep the headerPattern identical.
// both files use the same headerPattern, keep them identical when editing.
//
// Canonical form: <type>(<emoji|scope>)?!?: <description>
//   feat(:fire:): cross-compile support
//   fix: null check
//   chore(release): 1.0.0 [skip ci]
//   feat!: breaking change
//
// Emoji semantics (CI triggers): see .github/skills/_shared/gitmoji.md
module.exports = {
  parserPreset: {
    parserOpts: {
      headerPattern: /^(\w*)(?:\(([^)]*)\))?!?: (.*)$/,
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'docs', 'test', 'build', 'ci', 'refactor', 'style', 'chore'],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'subject-max-length': [2, 'always', 100],
    'header-max-length': [2, 'always', 120],
  },
};
