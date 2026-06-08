import { invoke } from "@tauri-apps/api/core";
import type { DockerContainerAction, DockerSummary } from "../types/docker";

export function getDockerSummary(): Promise<DockerSummary> {
  return invoke<DockerSummary>("docker_summary");
}

export function runDockerContainerAction(
  id: string,
  action: DockerContainerAction,
): Promise<void> {
  return invoke("docker_container_action", { id, action });
}

export function removeDockerImage(id: string, force = false): Promise<void> {
  return invoke("docker_remove_image", { id, force });
}

export function removeDockerVolume(name: string, force = false): Promise<void> {
  return invoke("docker_remove_volume", { name, force });
}

export function removeDockerNetwork(id: string): Promise<void> {
  return invoke("docker_remove_network", { id });
}

export type DockerPruneKind =
  | "containers"
  | "images"
  | "volumes"
  | "networks"
  | "all";

export function pruneDockerUnused(kind: DockerPruneKind): Promise<void> {
  return invoke("docker_prune_unused", { kind });
}

export function fetchDockerContainerLogs(
  id: string,
  tail = 200,
): Promise<string> {
  return invoke<string>("docker_container_logs", { id, tail });
}
