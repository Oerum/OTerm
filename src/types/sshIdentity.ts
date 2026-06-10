export type SshIdentityKind = "privateKey" | "certificate" | "fido2";

export interface SshIdentity {
  id: string;
  label: string;
  kind: SshIdentityKind;
  path: string;
  hasPassphrase: boolean;
}
