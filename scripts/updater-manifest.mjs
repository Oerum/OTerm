/** Shared updater manifest URLs for OTerm release channels. */
export const UPDATER_MANIFEST_DEFAULT = "latest.json";
export const UPDATER_MANIFEST_CUDA = "latest-cuda.json";
export const UPDATER_MANIFEST_OPENBLAS = "latest-openblas.json";

export const UPDATER_ENDPOINT_DEFAULT =
  "https://github.com/Oerum/OTerm/releases/latest/download/latest.json";
export const UPDATER_ENDPOINT_CUDA =
  "https://github.com/Oerum/OTerm/releases/latest/download/latest-cuda.json";
export const UPDATER_ENDPOINT_OPENBLAS =
  "https://github.com/Oerum/OTerm/releases/latest/download/latest-openblas.json";

const MANIFEST_ENDPOINTS = {
  [UPDATER_MANIFEST_CUDA]: UPDATER_ENDPOINT_CUDA,
  [UPDATER_MANIFEST_OPENBLAS]: UPDATER_ENDPOINT_OPENBLAS,
};

const BACKEND_ENDPOINTS = {
  cuda: UPDATER_ENDPOINT_CUDA,
  openblas: UPDATER_ENDPOINT_OPENBLAS,
};

export function updaterEndpointForManifest(manifest) {
  return MANIFEST_ENDPOINTS[manifest] ?? UPDATER_ENDPOINT_DEFAULT;
}

export function updaterEndpointForBackend(backend) {
  return BACKEND_ENDPOINTS[backend] ?? UPDATER_ENDPOINT_DEFAULT;
}

export function usesAlternateUpdaterChannel(backend) {
  return backend in BACKEND_ENDPOINTS;
}
