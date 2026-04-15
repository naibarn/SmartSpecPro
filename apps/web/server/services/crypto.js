"use strict";
/**
 * Shared encryption utilities for API key storage
 * Uses AES-256-GCM (authenticated encryption) for integrity + confidentiality
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
var crypto_1 = require("crypto");
var ALGORITHM = "aes-256-gcm";
var IV_LENGTH = 12; // GCM recommended IV length
var AUTH_TAG_LENGTH = 16;
function getEncryptionKey(envVar) {
    var key = envVar || process.env.LLM_ENCRYPTION_KEY;
    if (!key) {
        throw new Error("CRITICAL: LLM_ENCRYPTION_KEY environment variable is not set. " +
            "Set a 32+ character random string in your .env file.");
    }
    // Derive a consistent 32-byte key using SHA-256
    return crypto_1.default.createHash("sha256").update(key).digest();
}
/**
 * Encrypt a string using AES-256-GCM (authenticated encryption)
 * Format: iv:authTag:ciphertext (all hex-encoded)
 */
function encrypt(text, envKeyOverride) {
    var key = getEncryptionKey(envKeyOverride);
    var iv = crypto_1.default.randomBytes(IV_LENGTH);
    var cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    var encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    var authTag = cipher.getAuthTag();
    return "".concat(iv.toString("hex"), ":").concat(authTag.toString("hex"), ":").concat(encrypted);
}
/**
 * Decrypt a string encrypted with encrypt()
 * Supports both new GCM format (iv:authTag:ciphertext) and legacy CBC format (iv:ciphertext)
 */
function decrypt(text, envKeyOverride) {
    try {
        var parts = text.split(":");
        if (parts.length === 3) {
            // New GCM format: iv:authTag:ciphertext
            var iv = Buffer.from(parts[0], "hex");
            var authTag = Buffer.from(parts[1], "hex");
            var encryptedText = Buffer.from(parts[2], "hex");
            var key = getEncryptionKey(envKeyOverride);
            var decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);
            var decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString("utf8");
        }
        if (parts.length === 2) {
            // DEPRECATED: Legacy CBC format — vulnerable to padding oracle attacks.
            // All legacy keys were migrated. Log and reject.
            console.warn("[Crypto] Rejecting legacy CBC-encrypted value. Re-save the key to upgrade to GCM.");
            return "";
        }
        return "";
    }
    catch (err) {
        console.warn("[Crypto] Decryption failed:", err.message);
        return "";
    }
}
