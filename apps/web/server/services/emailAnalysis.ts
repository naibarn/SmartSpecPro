/**
 * Email Analysis Service
 * Normalizes emails and detects disposable/suspicious patterns
 */

// Gmail domain aliases
const GMAIL_ALIASES = new Set(["gmail.com", "googlemail.com"]);

// Common disposable email domains (curated subset)
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "guerrillamail.com", "guerrillamail.info", "grr.la",
  "guerrillamail.net", "guerrillamail.org", "mailinator.com", "maildrop.cc",
  "tempmail.com", "temp-mail.org", "throwaway.email", "yopmail.com",
  "yopmail.fr", "sharklasers.com", "guerrillamailblock.com", "pokemail.net",
  "spam4.me", "trashmail.com", "trashmail.me", "trashmail.net",
  "dispostable.com", "mailnesia.com", "mailexpire.com", "tempinbox.com",
  "fakeinbox.com", "mailcatch.com", "mintemail.com", "tempr.email",
  "discard.email", "discardmail.com", "discardmail.de", "mohmal.com",
  "burner.kiwi", "mailsac.com", "harakirimail.com", "33mail.com",
  "maildrop.cc", "getairmail.com", "meltmail.com", "mytemp.email",
  "binkmail.com", "bobmail.info", "chammy.info", "devnullmail.com",
  "emailondeck.com", "filzmail.com", "getnada.com", "mailnull.com",
  "nomail.xl.cx", "spambox.us", "tempmailaddress.com", "tmpmail.net",
  "tmpmail.org", "wegwerfmail.de", "wegwerfmail.net", "mailtemp.info",
  "tempail.com", "tempomail.fr", "throwam.com", "tmail.ws",
  "tmpbox.net", "trash-mail.at", "trashmail.ws", "uglymail.net",
  "mailhazard.com", "mailhazard.us", "ownmail.net", "crapmail.org",
  "mailmetrash.com", "thankyou2010.com", "mailblocks.com", "spamgourmet.com",
  "sneakemail.com", "mailexpire.com", "tempinbox.com", "anonbox.net",
  "mailforspam.com", "safetymail.info", "trashymail.com", "trashymail.net",
  "antichef.com", "antichef.net", "tempmail.net", "tempmailo.com",
  "emailfake.com", "generator.email", "guerrillamail.de", "email-fake.com",
  "crazymailing.com", "mailnator.com", "inboxkitten.com", "mailsac.com",
]);

export interface EmailAnalysis {
  original: string;
  normalized: string;
  domain: string;
  isDisposable: boolean;
  isPlusAlias: boolean;
  isDotVariant: boolean;
  flags: string[];
}

/**
 * Normalize an email address for duplicate detection.
 * - Lowercase everything
 * - Gmail: remove dots, strip +alias, normalize domain
 * - Others: strip +alias only
 */
export function normalizeEmail(email: string): string {
  if (!email) return "";
  const lower = email.toLowerCase().trim();
  const atIndex = lower.lastIndexOf("@");
  if (atIndex === -1) return lower;

  let local = lower.slice(0, atIndex);
  let domain = lower.slice(atIndex + 1);

  // Normalize Gmail aliases
  if (GMAIL_ALIASES.has(domain)) {
    domain = "gmail.com";
    // Remove dots from local part (Gmail ignores them)
    local = local.replace(/\./g, "");
  }

  // Strip +alias (all providers)
  const plusIndex = local.indexOf("+");
  if (plusIndex !== -1) {
    local = local.slice(0, plusIndex);
  }

  return `${local}@${domain}`;
}

/**
 * Check if an email uses a disposable/temporary domain.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email) return false;
  const domain = email.toLowerCase().split("@").pop() || "";
  return DISPOSABLE_DOMAINS.has(domain);
}

/**
 * Full analysis of an email address.
 */
export function analyzeEmail(email: string): EmailAnalysis {
  if (!email) {
    return {
      original: "",
      normalized: "",
      domain: "",
      isDisposable: false,
      isPlusAlias: false,
      isDotVariant: false,
      flags: [],
    };
  }

  const lower = email.toLowerCase().trim();
  const normalized = normalizeEmail(lower);
  const domain = lower.split("@").pop() || "";
  const localPart = lower.split("@")[0] || "";

  const isPlusAlias = localPart.includes("+");
  const isGmail = GMAIL_ALIASES.has(domain);
  const isDotVariant = isGmail && localPart.replace(/\./g, "") !== localPart;
  const isDisposable = isDisposableEmail(lower);

  const flags: string[] = [];
  if (isDisposable) flags.push("disposable");
  if (isPlusAlias) flags.push("plus_alias");
  if (isDotVariant) flags.push("dot_variant");

  return {
    original: lower,
    normalized,
    domain,
    isDisposable,
    isPlusAlias,
    isDotVariant,
    flags,
  };
}
