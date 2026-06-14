export const DEFAULT_SFTP_PARALLEL_FILES = 15;
export const MAX_SFTP_PARALLEL_FILES = 1000;
export const MIN_SFTP_PARALLEL_FILES = 1;
export const DEFAULT_SFTP_MAX_FILE_BYTES = 500 * 1024 * 1024;

export interface SftpTransferSettings {
  parallelFiles: number;
  maxFileSizeBytes: number;
}

export const DEFAULT_SFTP_TRANSFER_SETTINGS: SftpTransferSettings = {
  parallelFiles: DEFAULT_SFTP_PARALLEL_FILES,
  maxFileSizeBytes: DEFAULT_SFTP_MAX_FILE_BYTES,
};
