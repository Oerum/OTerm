export type LmTask = "commitMessage";

export interface LmSettings {
  endpoint: string;
  model: string;
  prompts: Record<LmTask, string>;
}

export interface LmModelInfo {
  id: string;
}

export const DEFAULT_COMMIT_MESSAGE_PROMPT = `## Commit Messages

- Use [Conventional Commits](https://www.conventionalcommits.org/) format: \`<type>(<scope>): <description>\`
- Valid types: \`feat\`, \`fix\`, \`refactor\`, \`test\`, \`docs\`, \`chore\`, \`ci\`, \`perf\`
- Use scope to indicate the area of the codebase (e.g., \`calc\`, \`tests\`, \`ci\`)
- Write the subject line in imperative mood, lowercase, and keep it under 72 characters
- Do not end the subject line with a period
- Reference related GitHub issues in the footer when applicable (e.g., \`Closes #42\`)
- If a commit introduces a breaking change, include \`BREAKING CHANGE:\` in the footer

### Examples

\`\`\`
feat(calc): add modulo operation support

fix(tests): correct expected value in division-by-zero test

refactor(calc): extract validation into separate method

chore: update NuGet package dependencies
\`\`\``;

export const DEFAULT_LM_SETTINGS: LmSettings = {
  endpoint: "http://localhost:1234/v1",
  model: "",
  prompts: {
    commitMessage: DEFAULT_COMMIT_MESSAGE_PROMPT,
  },
};
