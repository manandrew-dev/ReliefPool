// Fake devnet addresses shared by the oracle fixtures and the mock program
// client, so wallet labels from GET /pool line up with mock chain data.

export const mockWallets = {
  pool: "Ffi5FcaNXHaLwsfkg9tus3xnyscnKe28b1D6oRyFepu2",
  vault: "E8reKrZaBAeGBEcW8Un1SfxWSf2SRRf3DiApjhFTHLoQ",
  admin: "8R2EcPNyr3Le4iv8brQSRtAzUXCUr8kfttF9seXqoTfG",
  oracle: "8GfJBwVDqJX5XXGPsk3kV8kkJLs7ahXy2gkCQ6YLrzLP",
  responderA: "7fYBLiYemKUSSNQiJd1TCxuqk3uFbmewgkKWrDrashYu",
  responderB: "DnsaxoiPwwbwjFJ2jYXrPuHTyVKFTd3vGn8duQ58WbP3",
  contributorA: "vqvwxwKB6SupbfWzXR8aWZr8h1Tj7SEwrDQS5jswAUh",
  contributorB: "CCj9HAVGM5bvE8Y8Y29XhZDKBSvEzDxTmcFceii94YjQ",
} as const;
