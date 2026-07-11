# Wallet Exchange V2 mobile storage boundary

The mobile Wallet Exchange V2 adapter stores exchange state, credentials,
opaque cursors, pending acknowledgements, credential-request links, and
submission links in a dedicated SQLCipher database. A random 256-bit database
key is held by `expo-secure-store` with device-only accessibility. Every row is
partitioned by the normalized Portal origin and the holder `did:key`. The
adapter has no import or fallback path to the legacy Wallet database.

Production native builds must retain the `expo-sqlite` plugin option
`useSQLCipher: true`. The adapter checks `PRAGMA cipher_version` and fails
closed when the app was built without SQLCipher; Expo Go is therefore not a
production Wallet Exchange runtime.

## Holder private key is intentionally blocked

`expo-secure-store` persists strings, not a non-exportable signing-key handle.
Serializing the holder private key as JWK or PKCS8 would violate the Wallet
security model. `SqliteWalletExchangePersistence.saveHolderIdentity()` and
`loadHolderIdentity()` therefore throw and never return a missing-key result
that could silently rotate the holder DID.

Before Wallet Exchange session or VP signing is enabled on mobile, add and
security-review a native adapter that:

- generates P-256 or Ed25519 keys inside Apple Secure Enclave/Keychain or
  Android Keystore where the platform supports the chosen algorithm;
- returns an opaque signing handle and public JWK only;
- signs exact JWS signing input without exporting private key bytes;
- binds the handle to the Portal-origin + holder-DID partition; and
- fails closed on key loss, device migration, or biometric/key invalidation.

Until that dependency exists, Mobile may render already available local UI but
must not start Wallet Exchange V2 session, sync, request, or VP submission
flows. Credentials must be reissued from the live Portal issuer after the
holder binding is provisioned; legacy issuer credentials are never migrated.
