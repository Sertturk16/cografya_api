export default {
  // For staged TS files: auto-fix with ESLint, then run a single project-wide
  // typecheck. The function form returns a bare command, so tsc reads tsconfig
  // and checks the whole program instead of the (ignored) staged file list.
  '*.ts': ['eslint --fix', () => 'tsc --noEmit'],
};
