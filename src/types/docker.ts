export interface DockerInfo {
  available: boolean;
  version: string | null;
  message: string | null;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  createdSince: string;
  inUse: boolean;
}

export interface DockerVolume {
  name: string;
  driver: string;
  scope: string;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
}

export interface DockerSummary {
  info: DockerInfo;
  containers: DockerContainer[];
  images: DockerImage[];
  volumes: DockerVolume[];
  networks: DockerNetwork[];
}

export type DockerContainerAction =
  | "start"
  | "stop"
  | "restart"
  | "pause"
  | "unpause"
  | "remove";
