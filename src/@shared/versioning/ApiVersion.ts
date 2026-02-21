export enum ApiVersion {
  V1 = 'v1',
  V2 = 'v2',
}

export const CURRENT_API_VERSION = ApiVersion.V1;
export const SUPPORTED_API_VERSIONS = [ApiVersion.V1, ApiVersion.V2];
