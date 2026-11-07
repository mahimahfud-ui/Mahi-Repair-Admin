# Android signature verification contract

`RecipeSignatureVerifier.kt` is an integration example for the separately built APK. Convert the PEM public key to X.509 DER and Base64-encode it for the `publicKeyDerBase64` argument. Verify the detached signature against the exact `signed_payload` string, before parsing. Do not normalize line endings, reorder JSON keys, trim whitespace or serialize the parsed object before verification.

This verifier checks the cryptographic signature, schema version, step count and action IDs. The APK must additionally validate every action's parameter schema, Android API support, permission declaration and runtime confirmation policy before executing a native Kotlin implementation. The APK should also check tool/app version compatibility and the member/device session state.
