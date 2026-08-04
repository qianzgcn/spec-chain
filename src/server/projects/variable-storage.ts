import { encryptAesGcm } from "@/lib/security/aes-gcm";

export function encodeVariableValue(input: {
  value: string;
  encrypted: boolean;
  encryptionKey: Buffer;
}) {
  return input.encrypted
    ? encryptAesGcm(input.value, input.encryptionKey)
    : input.value;
}
