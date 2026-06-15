import { invoke } from "@tauri-apps/api/core";
import type { GitHubUserProfile } from "../types/githubProfile";

export function getGitHubUserProfile(): Promise<GitHubUserProfile | null> {
  return invoke<GitHubUserProfile | null>("github_user_profile");
}
