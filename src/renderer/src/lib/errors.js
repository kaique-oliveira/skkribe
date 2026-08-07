/** A failure the user can fix by supplying a different HuggingFace token.
 *
 *  Covers both shapes the backend produces: the friendly message from
 *  runtime-setup.js ("Sem acesso ao modelo de vozes…") and a raw pyannote /
 *  huggingface_hub error leaking through the diarization subprocess.
 *
 *  Why this matters: a token can be present but unusable (revoked, wrong
 *  account, or fine-grained without "read access to public gated repos"), and
 *  checkSetup only asks "is a token saved?". Without an explicit way to replace
 *  it, every retry reuses the bad token and fails identically, forever. */
export function isAuthError(message) {
  return /token|sem acesso|gated|unauthorized|authenticat|\b40[13]\b/i.test(String(message || ''))
}
