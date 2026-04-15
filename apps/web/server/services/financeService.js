"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDocumentOccurredAtIso = extractDocumentOccurredAtIso;
exports.buildFinanceStructuredDraftFromText = buildFinanceStructuredDraftFromText;
exports.extractFinanceStructuredDraftFromOcrText = extractFinanceStructuredDraftFromOcrText;
exports.listPaymentInstitutions = listPaymentInstitutions;
exports.listPaymentAccounts = listPaymentAccounts;
exports.upsertPaymentInstitution = upsertPaymentInstitution;
exports.upsertPaymentAccount = upsertPaymentAccount;
exports.archivePaymentAccount = archivePaymentAccount;
exports.listCounterparties = listCounterparties;
exports.parseTextToDraft = parseTextToDraft;
exports.parseDocumentToDraft = parseDocumentToDraft;
exports.updateDraft = updateDraft;
exports.confirmDraft = confirmDraft;
exports.voidTransaction = voidTransaction;
exports.listTransactions = listTransactions;
exports.listDrafts = listDrafts;
exports.listRecurringRules = listRecurringRules;
exports.getDailySummary = getDailySummary;
exports.getMonthlySummary = getMonthlySummary;
exports.createRecurringRule = createRecurringRule;
exports.pauseRecurringRule = pauseRecurringRule;
exports.resumeRecurringRule = resumeRecurringRule;
exports.listLinkedDocuments = listLinkedDocuments;
exports.runDueRecurringRules = runDueRecurringRules;
var node_crypto_1 = require("node:crypto");
var server_1 = require("@trpc/server");
var drizzle_orm_1 = require("drizzle-orm");
var zod_1 = require("zod");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var finance_1 = require("../../shared/finance");
var callLLMStructured_1 = require("./callLLMStructured");
var enabledLlmModels_1 = require("./enabledLlmModels");
var chatService_1 = require("./chatService");
var tenantContext_1 = require("./tenantContext");
var auditLogger_1 = require("./auditLogger");
var libraryService_1 = require("./libraryService");
var intelligentModelSelector_1 = require("./intelligentModelSelector");
var financeOcrDebug_1 = require("./financeOcrDebug");
var personalScopeToken = function (userId) { return "user:".concat(userId); };
var draftPatchSchema = finance_1.financeStructuredDraftSchema
    .partial()
    .omit({
    sourceMessageId: true,
    sourceLibraryItemId: true,
    recurringRuleId: true,
})
    .extend({
    clarificationPrompt: zod_1.z.string().nullable().optional(),
})
    .strict();
var recurringScheduleSchema = zod_1.z.object({
    frequency: zod_1.z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: zod_1.z.number().int().min(1).max(365).default(1),
    daysOfWeek: zod_1.z.array(zod_1.z.number().int().min(0).max(6)).max(7).optional(),
    dayOfMonth: zod_1.z.number().int().min(1).max(31).optional(),
    month: zod_1.z.number().int().min(1).max(12).optional(),
});
var transactionListFiltersSchema = zod_1.z.object({
    status: finance_1.financeTransactionStatusSchema.optional(),
    type: finance_1.financeTransactionTypeSchema.optional(),
    categoryCode: zod_1.z.string().min(1).max(64).optional(),
    counterparty: zod_1.z.string().min(1).max(255).optional(),
    merchant: zod_1.z.string().min(1).max(255).optional(),
    paymentMethodKind: finance_1.financePaymentInstrumentKindSchema.optional(),
    paymentDirection: finance_1.financePaymentDirectionSchema.optional(),
    paymentAccountId: zod_1.z.number().int().positive().optional(),
    paymentInstitutionId: zod_1.z.number().int().positive().optional(),
    fromDate: zod_1.z.coerce.date().optional(),
    toDate: zod_1.z.coerce.date().optional(),
    limit: zod_1.z.number().int().min(1).max(100).default(50),
    offset: zod_1.z.number().int().min(0).default(0),
});
function sha256(value) {
    return node_crypto_1.default.createHash("sha256").update(value).digest("hex");
}
function normalizeText(value) {
    return value.trim().replace(/\s+/g, " ");
}
function stripFinanceOcrNoise(text, sourceFileName) {
    let cleaned = normalizeText(text);
    const fileName = normalizeText(sourceFileName !== null && sourceFileName !== void 0 ? sourceFileName : "");
    if (fileName) {
        const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const fileNameStem = fileName.replace(/\.[^.]+$/, "");
        const escapedFileNameStem = fileNameStem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        cleaned = cleaned
            .replace(new RegExp(`\\b${escapedFileName}\\b`, "gi"), " ")
            .replace(new RegExp(`\\b${escapedFileNameStem}\\b`, "gi"), " ")
            .replace(new RegExp(`(?:ไฟล์|file(?:\\s*name)?|source file)\\s*[:#\\-]?\\s*${escapedFileName}`, "gi"), " ")
            .replace(new RegExp(`(?:ไฟล์|file(?:\\s*name)?|source file)\\s*[:#\\-]?\\s*${escapedFileNameStem}`, "gi"), " ");
    }
    cleaned = cleaned
        .replace(/\b(?:ไฟล์|file(?:\s*name)?|source file)\s*[:#\-]?\s*[^\n]+/gi, " ")
        .replace(/\b(?:โหมด|mode)\s*[:#\-]?\s*[^\n]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned;
}
function normalizeCounterpartyDisplayName(value) {
    return normalizeText(value)
        .replace(/^[\s.,;:|/\\-]+|[\s.,;:|/\\-]+$/g, "")
        .replace(/\s+/g, " ");
}
function normalizeCounterpartyKey(value) {
    var stripped = normalizeDigits(normalizeCounterpartyDisplayName(value))
        .toLowerCase()
        .replace(/[^0-9a-zก-๙]+/gi, " ")
        .replace(/\b(?:company|co|corp|corporation|inc|incorporated|ltd|limited|llc|plc|group|holdings?)\b/gi, " ")
        .replace(/\b(?:บริษัท|จำกัด|บจก\.?|บมจ\.?|มหาชน|หจก\.?|หจ\.?|คุณ|นาย|นางสาว|นาง|mr|mrs|ms|miss|dr|prof)\b/gi, " ");
    return stripped.replace(/\s+/g, " ").trim();
}
function buildCounterpartySearchKey(value) {
    return normalizeCounterpartyKey(value);
}
function normalizePaymentInstitutionDisplayName(value) {
    return normalizePaymentAccountNickname(value);
}
function normalizePaymentAccountNickname(value) {
    return normalizeText(value)
        .replace(/^[\s.,;:|/\\-]+|[\s.,;:|/\\-]+$/g, "")
        .replace(/\s+/g, " ");
}
function normalizePaymentAccountLast4(value) {
    if (!value) {
        return null;
    }
    var digits = normalizeDigits(String(value)).replace(/\D+/g, "");
    if (digits.length === 0) {
        return null;
    }
    return digits.slice(-4).padStart(Math.min(4, digits.length), "0");
}
function normalizePaymentMaskedIdentifier(value) {
    if (!value) {
        return null;
    }
    var trimmed = normalizeText(value);
    return trimmed.length > 0 ? trimmed : null;
}
function buildPaymentInstrumentSearchKey(value) {
    return normalizePaymentAccountNickname(value)
        .toLowerCase()
        .replace(/[^0-9a-zก-๙]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function buildPaymentInstrumentDisplayLabel(account) {
    var nickname = account.nickname.trim();
    var institution = account.institutionName.trim();
    var parts = [nickname];
    if (institution) {
        parts.push(institution);
    }
    if (account.last4) {
        parts.push("\u2022\u2022\u2022\u2022".concat(account.last4));
    }
    if (account.kind === "credit_card") {
        parts.push("card");
    }
    else if (account.kind === "bank_account") {
        parts.push("account");
    }
    return parts.join(" · ");
}
function inferCounterpartyCandidateFromText(text, type) {
    var normalizedText = normalizeText(text);
    var patterns = type === "income"
        ? [
            /(?:รับจาก|ได้เงินจาก|รับเงินจาก|received from|paid by|from)\s+(.+?)(?=(?:\s+(?:[0-9][0-9.,]*|บาท|thb|usd|eur|jpy|฿|\$|€|¥)|\s*(?:เมื่อ|on|at|for|since|until)|[.,;]|$))/i,
            /(?:salary from|income from)\s+(.+?)(?=(?:\s+(?:[0-9][0-9.,]*|บาท|thb|usd|eur|jpy|฿|\$|€|¥)|\s*(?:เมื่อ|on|at|for|since|until)|[.,;]|$))/i,
        ]
        : type === "transfer"
            ? [
                /(?:โอนให้|โอนไปให้|transfer to|sent to|paid to|to)\s+(.+?)(?=(?:\s+(?:[0-9][0-9.,]*|บาท|thb|usd|eur|jpy|฿|\$|€|¥)|\s*(?:เมื่อ|on|at|for|since|until)|[.,;]|$))/i,
                /(?:โอนจาก|received from|from)\s+(.+?)(?=(?:\s+(?:[0-9][0-9.,]*|บาท|thb|usd|eur|jpy|฿|\$|€|¥)|\s*(?:เมื่อ|on|at|for|since|until)|[.,;]|$))/i,
            ]
            : [
                /(?:จ่ายให้|จ่ายแก่|จ่าย|โอนให้|ซื้อจาก|paid to|pay to|spent at)\s+(.+?)(?=(?:\s+(?:[0-9][0-9.,]*|บาท|thb|usd|eur|jpy|฿|\$|€|¥)|\s*(?:เมื่อ|on|at|for|since|until)|[.,;]|$))/i,
                /(?:ร้าน|shop at|merchant|vendor)\s+(.+?)(?=(?:\s+(?:[0-9][0-9.,]*|บาท|thb|usd|eur|jpy|฿|\$|€|¥)|\s*(?:เมื่อ|on|at|for|since|until)|[.,;]|$))/i,
            ];
    for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
        var pattern = patterns_1[_i];
        var match = normalizedText.match(pattern);
        if (match === null || match === void 0 ? void 0 : match[1]) {
            var candidate = normalizeCounterpartyDisplayName(match[1]);
            if (candidate) {
                return candidate;
            }
        }
    }
    return null;
}
var THAI_DIGIT_MAP = {
    "๐": "0",
    "๑": "1",
    "๒": "2",
    "๓": "3",
    "๔": "4",
    "๕": "5",
    "๖": "6",
    "๗": "7",
    "๘": "8",
    "๙": "9",
};
function normalizeDigits(value) {
    return value.replace(/[๐-๙]/g, function (digit) { var _a; return (_a = THAI_DIGIT_MAP[digit]) !== null && _a !== void 0 ? _a : digit; });
}
function normalizeParsingText(value) {
    return normalizeDigits(normalizeText(value)).toLowerCase();
}
function stripFinanceIntentPrefix(value) {
    return normalizeText(normalizeDigits(value).replace(/^\s*(?:expense|income|transfer|รายจ่าย|รายรับ|โอนเงิน|โอน):\s*/i, ""));
}
function inferFinanceTypeFromText(text, typeHint) {
    if (typeHint) {
        return typeHint;
    }
    var normalized = normalizeParsingText(text);
    if (normalized.includes("โอน")
        || normalized.includes("transfer")
        || normalized.includes("ย้ายเงิน")
        || normalized.includes("ส่งเงิน")) {
        return "transfer";
    }
    if (normalized.includes("เงินเดือน")
        || normalized.includes("เงินเข้า")
        || normalized.includes("รับเงิน")
        || normalized.includes("รายรับ")
        || normalized.includes("income")
        || normalized.includes("salary")
        || normalized.includes("ได้เงิน")) {
        return "income";
    }
    if (normalized.includes("จ่าย")
        || normalized.includes("ค่า")
        || normalized.includes("ซื้อ")
        || normalized.includes("ชำระ")
        || normalized.includes("expense")
        || normalized.includes("spent")
        || normalized.includes("pay")
        || normalized.includes("paid")) {
        return "expense";
    }
    return "expense";
}
function inferCurrencyFromText(text) {
    var normalized = normalizeParsingText(text);
    if (normalized.includes("usd") || normalized.includes("$"))
        return "USD";
    if (normalized.includes("eur") || normalized.includes("€"))
        return "EUR";
    if (normalized.includes("jpy") || normalized.includes("¥"))
        return "JPY";
    if (normalized.includes("บาท") || normalized.includes("฿") || normalized.includes("thb"))
        return "THB";
    return "THB";
}
function inferPaymentDirectionFromType(type) {
    if (type === "income") {
        return "inbound";
    }
    if (type === "transfer") {
        return "both";
    }
    return "outbound";
}
function normalizeStructuredDraftMissingFields(draft) {
    const missing = new Set(((draft.missingFields !== null && draft.missingFields !== void 0 ? draft.missingFields : []).map((field) => String(field).trim()).filter(Boolean)));
    if (draft.paymentDirection && draft.paymentDirection !== "unknown") {
        missing.delete("paymentDirection");
    }
    if (draft.paymentMethodKind && draft.paymentMethodKind !== "unknown") {
        missing.delete("paymentMethodKind");
    }
    if (draft.paymentSourceName || draft.paymentSourceLabel || draft.paymentSourceInstitutionName || draft.paymentSourceAccountId) {
        missing.delete("paymentSourceName");
        missing.delete("paymentSourceLabel");
        missing.delete("paymentSourceInstitutionName");
        missing.delete("paymentSourceAccountId");
    }
    if (draft.paymentDestinationName || draft.paymentDestinationLabel || draft.paymentDestinationInstitutionName || draft.paymentDestinationAccountId) {
        missing.delete("paymentDestinationName");
        missing.delete("paymentDestinationLabel");
        missing.delete("paymentDestinationInstitutionName");
        missing.delete("paymentDestinationAccountId");
    }
    return Array.from(missing);
}
function inferPaymentMethodKindFromText(text) {
    var normalized = normalizeParsingText(text);
    if (normalized.includes("card")
        || normalized.includes("credit")
        || normalized.includes("debit")
        || normalized.includes("visa")
        || normalized.includes("mastercard")
        || normalized.includes("amex")
        || normalized.includes("เครดิต")) {
        return "credit_card";
    }
    if (normalized.includes("cash")
        || normalized.includes("เงินสด")) {
        return "cash";
    }
    if (normalized.includes("bank")
        || normalized.includes("บัญชี")
        || normalized.includes("โอน")
        || normalized.includes("promptpay")
        || normalized.includes("พร้อมเพย์")) {
        return "bank_account";
    }
    return "unknown";
}
var PAYMENT_INSTITUTION_PATTERNS = [
    {
        name: "Bangkok Bank",
        patterns: [/\bbbl\b/i, /bangkok bank/i, /ธนาคารกรุงเทพ/i, /กรุงเทพ/i, /bangkok\s*bank/i],
    },
    {
        name: "Siam Commercial Bank",
        patterns: [/\bscb\b/i, /siam commercial bank/i, /ธนาคารไทยพาณิชย์/i, /ไทยพาณิชย์/i, /สยามพาณิชย์/i, /scb\s*bank/i],
    },
    {
        name: "Kasikornbank",
        patterns: [/\bkbank\b/i, /kasikorn(?:bank)?/i, /ธนาคารกสิกรไทย/i, /กสิกร/i, /ธนาคารกสิกร/i],
    },
    {
        name: "Krungthai Bank",
        patterns: [/\bktb\b/i, /krungthai/i, /ธนาคารกรุงไทย/i, /กรุงไทย/i, /ktb\s*netbank/i],
    },
    {
        name: "Krungsri",
        patterns: [/krungsri/i, /bank of ayudhya/i, /bank of ayutthaya/i, /ธนาคารกรุงศรี/i, /กรุงศรี/i, /ธนาคารกรุงศรีอยุธยา/i, /อยุธยา/i],
    },
    {
        name: "TMBThanachart Bank",
        patterns: [/\bttb\b/i, /tmbthanachart/i, /thanachart/i, /ธนาคารทหารไทยธนชาต/i, /ทหารไทยธนชาต/i, /\btmb\b/i, /ธนาคารทหารไทย/i, /ธนชาต/i],
    },
    {
        name: "Government Savings Bank",
        patterns: [/\bgsb\b/i, /government savings bank/i, /ธนาคารออมสิน/i, /ออมสิน/i, /gsb\s*bank/i],
    },
    {
        name: "Bank for Agriculture and Agricultural Cooperatives",
        patterns: [/\bbaac\b/i, /bank for agriculture and agricultural cooperatives/i, /ธกส/i, /ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร/i, /ธนาคารเพื่อการเกษตร/i],
    },
    {
        name: "UOB",
        patterns: [/\buob\b/i, /united overseas bank/i, /ยูโอบี/i, /ธนาคารยูโอบี/i],
    },
    {
        name: "CIMB Thai Bank",
        patterns: [/\bcimb\b/i, /cimb thai/i, /ซีไอเอ็มบี/i, /ธนาคารซีไอเอ็มบี/i],
    },
    {
        name: "Kiatnakin Phatra Bank",
        patterns: [/\bkkp\b/i, /kiatnakin/i, /เกียรตินาคิน/i, /เกียรตินาคินภัทร/i],
    },
    {
        name: "Land and Houses Bank",
        patterns: [/\blhb\b/i, /land and houses/i, /land and house/i, /ธนาคารแลนด์แอนด์เฮ้าส์/i, /แลนด์แอนด์เฮ้าส์/i, /lh bank/i],
    },
    {
        name: "Standard Chartered Bank",
        patterns: [/standard chartered/i, /\bscbth\b/i, /สแตนดาร์ดชาร์เตอร์ด/i, /stan\s*chart/i, /stanchart/i],
    },
    {
        name: "Tisco Bank",
        patterns: [/\btisco\b/i, /ทิสโก้/i, /ธนาคารทิสโก้/i],
    },
];
function inferPaymentInstitutionNameFromText(text) {
    var normalized = normalizeParsingText(text);
    for (var _i = 0, PAYMENT_INSTITUTION_PATTERNS_1 = PAYMENT_INSTITUTION_PATTERNS; _i < PAYMENT_INSTITUTION_PATTERNS_1.length; _i++) {
        var entry = PAYMENT_INSTITUTION_PATTERNS_1[_i];
        if (entry.patterns.some(function (pattern) { return pattern.test(normalized); })) {
            return entry.name;
        }
    }
    return null;
}
function inferPaymentInstitutionNamesFromText(text) {
    var normalized = normalizeParsingText(text);
    var matches = new Set();
    for (var _i = 0, PAYMENT_INSTITUTION_PATTERNS_2 = PAYMENT_INSTITUTION_PATTERNS; _i < PAYMENT_INSTITUTION_PATTERNS_2.length; _i++) {
        var entry = PAYMENT_INSTITUTION_PATTERNS_2[_i];
        if (entry.patterns.some(function (pattern) { return pattern.test(normalized); })) {
            matches.add(entry.name);
        }
    }
    return Array.from(matches);
}
function buildPaymentAccountMaskedIdentifier(last4) {
    if (!last4) {
        return null;
    }
    return "\u2022\u2022\u2022\u2022".concat(last4);
}
function extractPaymentAccountLast4FromCandidate(value) {
    if (!value) {
        return null;
    }
    var normalized = normalizeDigits(value);
    var clusters = Array.from(normalized.matchAll(/\d{4,}/g), function (match) { return match[0].replace(/\D+/g, ""); });
    if (clusters.length === 0) {
        return null;
    }
    var candidate = clusters[0];
    if (!candidate) {
        return null;
    }
    return candidate.slice(-4).padStart(Math.min(4, candidate.length), "0");
}
function extractPaymentAccountCandidate(text, role) {
    var normalized = normalizeDigits(text).replace(/\s+/g, " ").trim();
    var markers = role === "source"
        ? [
            "โอนจาก",
            "จากบัญชี",
            "บัญชีต้นทาง",
            "บัญชีผู้โอน",
        "from",
        "paid from",
        "debit from",
        "withdrawn from",
        "source account",
        "account from",
        "source",
        "จ่ายจาก",
    ]
    : [
            "โอนไปยัง",
            "ไปบัญชี",
            "ไปยัง",
            "ไปยังบัญชี",
            "โอนเข้าบัญชี",
            "เข้าบัญชี",
            "รับเข้าบัญชี",
            "บัญชีปลายทาง",
            "บัญชีผู้รับ",
            "to",
            "paid to",
            "credited to",
            "received into",
            "destination account",
            "account to",
            "destination",
        ];
    var stopTokens = [
        "ค่าเช่าห้อง",
        "ค่าใช้จ่าย",
        "ค่าบริการ",
        "ค่า",
        "ยอดรวม",
        "ยอดเงิน",
        "จำนวน",
        "บาท",
        "thb",
        "usd",
        "eur",
        "jpy",
        "฿",
        "$",
        "€",
        "¥",
        " from ",
        " จาก ",
        " source ",
        " ต้นทาง ",
        " payer ",
        " sender ",
        " paid from ",
        " debit from ",
        " withdrawn from ",
        " to ",
        " ไปยัง ",
        " destination ",
        " received into ",
        " เข้าบัญชี ",
        " บัญชีปลายทาง ",
        " recipient ",
        " beneficiary ",
        " for ",
        " amount ",
        " ยอด ",
    ];
    for (var _i = 0, markers_1 = markers; _i < markers_1.length; _i++) {
        var marker = markers_1[_i];
        var index = normalized.toLowerCase().indexOf(marker.toLowerCase());
        if (index < 0) {
            continue;
        }
        var candidate = normalized.slice(index + marker.length).trim();
        candidate = candidate.replace(/^[:\-]+\s*/, "");
        for (var _a = 0, stopTokens_1 = stopTokens; _a < stopTokens_1.length; _a++) {
            var stopToken = stopTokens_1[_a];
            var stopIndex = candidate.toLowerCase().indexOf(stopToken.toLowerCase());
            if (stopIndex >= 0) {
                candidate = candidate.slice(0, stopIndex).trim();
            }
        }
        candidate = candidate.split(/[|;,.]/)[0].trim();
        candidate = normalizePaymentAccountNickname(candidate);
        if (candidate) {
            return candidate;
        }
    }
    return null;
}
function inferPaymentReferenceFromText(text, role) {
    var _a;
    var candidate = extractPaymentAccountCandidate(text, role);
    var institutionName = inferPaymentInstitutionNameFromText(candidate !== null && candidate !== void 0 ? candidate : text);
    var matchedInstitutions = inferPaymentInstitutionNamesFromText(candidate !== null && candidate !== void 0 ? candidate : text);
    var paymentMethodKind = inferPaymentMethodKindFromText(candidate !== null && candidate !== void 0 ? candidate : text);
    var last4 = (_a = extractPaymentAccountLast4FromCandidate(candidate)) !== null && _a !== void 0 ? _a : extractPaymentAccountLast4FromCandidate(text);
    var maskedIdentifier = buildPaymentAccountMaskedIdentifier(last4);
    var accountNickname = candidate
        ? normalizePaymentAccountNickname(candidate
            .replace(/\b(?:••••\d{1,4}|\d{4,})\b/g, " ")
            .replace(/\s+/g, " ")) || null
        : null;
    var labelParts = [];
    var labelSource = accountNickname || institutionName || null;
    if (labelSource) {
        labelParts.push(labelSource);
    }
    if (maskedIdentifier) {
        labelParts.push(maskedIdentifier);
    }
    else if (last4) {
        labelParts.push("\u2022\u2022\u2022\u2022".concat(last4));
    }
    return {
        label: labelParts.length > 0 ? Array.from(new Set(labelParts)).join(" · ") : null,
        institutionName: institutionName,
        matchedInstitutions: matchedInstitutions,
        accountNickname: accountNickname,
        last4: last4,
        maskedIdentifier: maskedIdentifier,
        paymentMethodKind: paymentMethodKind,
    };
}
function inferPaymentDetailsFromText(text, type, documentRole) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    var sourceReference = inferPaymentReferenceFromText(text, "source");
    var destinationReference = inferPaymentReferenceFromText(text, "destination");
    var primaryReference = type === "income"
        ? destinationReference !== null && destinationReference !== void 0 ? destinationReference : sourceReference
        : sourceReference !== null && sourceReference !== void 0 ? sourceReference : destinationReference;
    var fallbackPaymentMethodKind = inferPaymentMethodKindFromText(text);
    var paymentMethodKind = (primaryReference === null || primaryReference === void 0 ? void 0 : primaryReference.paymentMethodKind) && primaryReference.paymentMethodKind !== "unknown"
        ? primaryReference.paymentMethodKind
        : fallbackPaymentMethodKind;
    return {
        paymentMethodKind: paymentMethodKind,
        paymentSourceLabel: (_a = sourceReference === null || sourceReference === void 0 ? void 0 : sourceReference.label) !== null && _a !== void 0 ? _a : null,
        paymentDestinationLabel: (_b = destinationReference === null || destinationReference === void 0 ? void 0 : destinationReference.label) !== null && _b !== void 0 ? _b : null,
        paymentSourceInstitutionName: (_c = sourceReference === null || sourceReference === void 0 ? void 0 : sourceReference.institutionName) !== null && _c !== void 0 ? _c : null,
        paymentDestinationInstitutionName: (_d = destinationReference === null || destinationReference === void 0 ? void 0 : destinationReference.institutionName) !== null && _d !== void 0 ? _d : null,
        paymentInstitutionName: (_e = primaryReference === null || primaryReference === void 0 ? void 0 : primaryReference.institutionName) !== null && _e !== void 0 ? _e : null,
        paymentAccountNickname: (_f = primaryReference === null || primaryReference === void 0 ? void 0 : primaryReference.accountNickname) !== null && _f !== void 0 ? _f : null,
        paymentAccountLast4: (_g = primaryReference === null || primaryReference === void 0 ? void 0 : primaryReference.last4) !== null && _g !== void 0 ? _g : null,
        paymentAccountMaskedIdentifier: (_h = primaryReference === null || primaryReference === void 0 ? void 0 : primaryReference.maskedIdentifier) !== null && _h !== void 0 ? _h : null,
        paymentInstrumentConfidence: primaryReference
            ? 0.78
            : documentRole
                ? 0.42
                : 0.2,
    };
}
function inferDocumentRoleFromText(text) {
    var normalized = normalizeParsingText(text);
    if (normalized.includes("statement") || normalized.includes("ยอดคงเหลือ") || normalized.includes("ยอดบัญชี")) {
        return "statement";
    }
    if (normalized.includes("slip") || normalized.includes("สลิป") || normalized.includes("โอน")) {
        return "transfer_slip";
    }
    if (normalized.includes("receipt") || normalized.includes("ใบเสร็จ") || normalized.includes("bill")) {
        return "receipt";
    }
    return null;
}
function normalizeDocumentRole(value) {
    if (!value) {
        return null;
    }
    var parsed = finance_1.financeDocumentRoleSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
function lineContainsAmountHints(line) {
    var normalized = normalizeParsingText(line);
    return [
        "จำนวนเงิน",
        "amount",
        "ยอดเงิน",
        "ยอดชำระ",
        "ชำระเงิน",
        "total",
        "paid",
        "จ่าย",
        "โอน",
        "ค่าธรรมเนียม",
        "fee",
        "บาท",
        "thb",
        "฿",
        "usd",
        "eur",
        "jpy",
    ].some(function (token) { return normalized.includes(token); });
}
function lineLooksLikeAmountNoise(line) {
    var normalized = normalizeParsingText(line);
    return [
        "reference",
        "อ้างอิง",
        "หมายเลขอ้างอิง",
        "transaction id",
        "เลขอ้างอิง",
        "merchant",
        "รหัสร้านค้า",
        "account",
        "บัญชี",
        "เลขที่บัญชี",
        "filename",
        "file name",
        ".jpg",
        ".jpeg",
        ".png",
        ".pdf",
        "qr",
    ].some(function (token) { return normalized.includes(token); });
}
function parseAmountMinorFromLine(text, currency) {
    var normalized = normalizeDigits(text).replace(/,/g, "");
    var patterns = [
        /(?:จำนวนเงิน|ยอดเงิน|ยอดชำระ|ชำระเงิน|amount|total|paid)\s*[:#\-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
        /(?:฿|บาท|thb)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
        /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:฿|บาท|thb)/i,
        /(?:\$|usd)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
        /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:\$|usd)/i,
        /(?:€|eur)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
        /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:€|eur)/i,
        /(?:¥|jpy)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
        /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:¥|jpy)/i,
    ];
    for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
        var pattern = patterns_1[_i];
        var match = normalized.match(pattern);
        if (match === null || match === void 0 ? void 0 : match[1]) {
            var parsed = Number.parseFloat(match[1]);
            if (Number.isFinite(parsed)) {
                var multiplier_1 = currency === "JPY" ? 1 : 100;
                return Math.max(1, Math.round(parsed * multiplier_1));
            }
        }
    }
    return null;
}
function parseAmountMinorFromText(text, currency) {
    var normalized = normalizeDigits(text).replace(/,/g, "");
    var lines = normalized
        .split(/\r?\n+/)
        .map(function (line) { return line.trim(); })
        .filter(function (line) { return line.length > 0; });
    for (var index = 0; index < lines.length; index += 1) {
        var currentLine = lines[index];
        if (!lineContainsAmountHints(currentLine) || lineLooksLikeAmountNoise(currentLine)) {
            continue;
        }
        for (var offset = 0; offset <= 2; offset += 1) {
            var nextLine = lines[index + offset];
            if (!nextLine || lineLooksLikeAmountNoise(nextLine)) {
                continue;
            }
            var amount = parseAmountMinorFromLine(nextLine, currency);
            if (amount !== null) {
                return amount;
            }
        }
    }
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
        var line = lines_1[_i];
        if (lineLooksLikeAmountNoise(line) || /(?:\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/.test(line)) {
            continue;
        }
        var amount = parseAmountMinorFromLine(line, currency);
        if (amount !== null) {
            return amount;
        }
    }
    var amountWithContext = parseAmountMinorFromLine(normalized, currency);
    if (amountWithContext !== null) {
        return amountWithContext;
    }
    var candidates = Array.from(normalized.matchAll(/([0-9]+(?:\.[0-9]{1,2})?)/g), function (match) { return Number.parseFloat(match[1]); })
        .filter(function (value) { return Number.isFinite(value); });
    if (candidates.length === 0) {
        return null;
    }
    var preferredCandidates = candidates.filter(function (candidate) { return candidate <= MAX_BARE_AMOUNT_MAJOR; });
    var candidate = (preferredCandidates.length > 0 ? preferredCandidates : candidates)[0];
    if (!Number.isFinite(candidate)) {
        return null;
    }
    var multiplier = currency === "JPY" ? 1 : 100;
    return Math.max(1, Math.round(candidate * multiplier));
}
var FINANCE_DEFAULT_TIME_ZONE = "Asia/Bangkok";
var MONTH_TOKEN_MAP = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
    "ม.ค.": 1,
    "มค": 1,
    "มกราคม": 1,
    "ก.พ.": 2,
    "กพ": 2,
    "กุมภาพันธ์": 2,
    "มี.ค.": 3,
    "มีค": 3,
    "มีนาคม": 3,
    "เม.ย.": 4,
    "เมย": 4,
    "เมษายน": 4,
    "พ.ค.": 5,
    "พค": 5,
    "พฤษภาคม": 5,
    "มิ.ย.": 6,
    "มิย": 6,
    "มิถุนายน": 6,
    "ก.ค.": 7,
    "กค": 7,
    "กรกฎาคม": 7,
    "ส.ค.": 8,
    "สค": 8,
    "สิงหาคม": 8,
    "ก.ย.": 9,
    "กย": 9,
    "กันยายน": 9,
    "ต.ค.": 10,
    "ตค": 10,
    "ตุลาคม": 10,
    "พ.ย.": 11,
    "พย": 11,
    "พฤศจิกายน": 11,
    "ธ.ค.": 12,
    "ธค": 12,
    "ธันวาคม": 12,
};
function normalizeOccurrenceText(value) {
    return normalizeDigits(normalizeText(value)).replace(/\u200b/g, "").toLowerCase();
}
function compactOccurrenceText(value) {
    return normalizeOccurrenceText(value).replace(/[.\-_/]/g, "");
}
function normalizeOccurrenceYear(value) {
    if (value >= 2400) {
        return value - 543;
    }
    if (value < 100) {
        return 2000 + value;
    }
    return value;
}
function buildOccurredAtIsoFromParts(parts) {
    var _a, _b, _c;
    return timeZonePartsToUtc({
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: (_a = parts.hour) !== null && _a !== void 0 ? _a : 0,
        minute: (_b = parts.minute) !== null && _b !== void 0 ? _b : 0,
        second: (_c = parts.second) !== null && _c !== void 0 ? _c : 0,
    }, FINANCE_DEFAULT_TIME_ZONE).toISOString();
}
function parseExplicitTimeFromText(normalized) {
    var _a;
    var timeMatch = normalized.match(/\b(?:เวลา\s*)?(\d{1,2}):(\d{2})(?:\s*(am|pm))?\b/i);
    if (timeMatch) {
        var hour = Number(timeMatch[1]);
        var minute = Number(timeMatch[2]);
        var meridiem = (_a = timeMatch[3]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59 || hour > 23) {
            return null;
        }
        if (meridiem === "pm" && hour < 12) {
            hour += 12;
        }
        else if (meridiem === "am" && hour === 12) {
            hour = 0;
        }
        return { hour: hour, minute: minute, second: 0 };
    }
    var hourOnlyMatch = normalized.match(/\b(?:เวลา\s*)?(\d{1,2})\s*(?:นาฬิกา|โมง|hr|hrs|hour|hours)\b/i);
    if (hourOnlyMatch) {
        var hour = Number(hourOnlyMatch[1]);
        if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
            return { hour: hour, minute: 0, second: 0 };
        }
    }
    return null;
}
function parseExplicitDateFromText(normalized) {
    var candidates = [normalized, compactOccurrenceText(normalized)];
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var candidate = candidates_1[_i];
        var isoMatch = candidate.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
        if (isoMatch) {
            var year = normalizeOccurrenceYear(Number(isoMatch[1]));
            var month = Number(isoMatch[2]);
            var day = Number(isoMatch[3]);
            if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                return { year: year, month: month, day: day };
            }
        }
        var dmyMatch = candidate.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
        if (dmyMatch) {
            var day = Number(dmyMatch[1]);
            var month = Number(dmyMatch[2]);
            var year = normalizeOccurrenceYear(Number(dmyMatch[3]));
            if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                return { year: year, month: month, day: day };
            }
        }
        var monthPatterns = [
            /\b(\d{1,2})\s*([a-zก-๙.]+)\s*(\d{2,4})\b/i,
            /\b([a-zก-๙.]+)\s*(\d{1,2}),?\s*(\d{2,4})\b/i,
        ];
        for (var _a = 0, monthPatterns_1 = monthPatterns; _a < monthPatterns_1.length; _a++) {
            var pattern = monthPatterns_1[_a];
            var monthMatch = candidate.match(pattern);
            if (!monthMatch) {
                continue;
            }
            var firstToken = monthMatch[1];
            var secondToken = monthMatch[2];
            var thirdToken = monthMatch[3];
            var token = Number.isNaN(Number(firstToken)) ? firstToken : secondToken;
            var day = Number.isNaN(Number(firstToken)) ? Number(secondToken) : Number(firstToken);
            var tokenKey = token.toLowerCase();
            var normalizedToken = tokenKey.replace(/[.\-_/]/g, "");
            var month = MONTH_TOKEN_MAP[tokenKey] || MONTH_TOKEN_MAP[normalizedToken];
            var year = normalizeOccurrenceYear(Number(thirdToken));
            if (month && Number.isFinite(year) && Number.isFinite(day) && day >= 1 && day <= 31) {
                return { year: year, month: month, day: day };
            }
        }
    }
    return null;
}
function parseOccurredAtPartsFromText(text) {
    var _a, _b, _c;
    var normalized = normalizeOccurrenceText(text);
    var explicitDate = parseExplicitDateFromText(normalized);
    if (explicitDate) {
        var explicitTime = parseExplicitTimeFromText(normalized);
        return __assign(__assign({}, explicitDate), { hour: (_a = explicitTime === null || explicitTime === void 0 ? void 0 : explicitTime.hour) !== null && _a !== void 0 ? _a : 0, minute: (_b = explicitTime === null || explicitTime === void 0 ? void 0 : explicitTime.minute) !== null && _b !== void 0 ? _b : 0, second: (_c = explicitTime === null || explicitTime === void 0 ? void 0 : explicitTime.second) !== null && _c !== void 0 ? _c : 0 });
    }
    return null;
}
function extractDocumentOccurredAtIso(text) {
    var explicit = parseOccurredAtPartsFromText(text);
    if (!explicit) {
        return null;
    }
    return buildOccurredAtIsoFromParts(explicit);
}
function inferCategoryCodeFromText(text, categoryHint, type) {
    var hint = categoryHint ? normalizeText(categoryHint) : "";
    if (hint) {
        return hint.slice(0, 64);
    }
    var normalized = normalizeParsingText(text);
    var keywordRules = [
        { keywords: ["taxi", "grab", "bolt", "รถไฟฟ้า", "bts", "mrt", "เดินทาง", "transport", "ชาร์จรถ", "ชาร์จไฟรถ", "fuel", "gas"], code: "transport" },
        { keywords: ["coffee", "cafe", "restaurant", "food", "lunch", "dinner", "อาหาร", "กาแฟ", "ข้าว", "กิน"], code: "food" },
        { keywords: ["rent", "ค่าเช่า", "บ้าน", "หอ", "ที่พัก"], code: "housing.rent" },
        { keywords: ["electricity", "ไฟฟ้า", "utility", "น้ำ", "internet", "wifi"], code: "utilities" },
        { keywords: ["salary", "เงินเดือน", "โบนัส", "income"], code: "income.salary" },
        { keywords: ["health", "ยา", "หมอ", "clinic", "hospital"], code: "healthcare" },
        { keywords: ["education", "เรียน", "หนังสือ", "course"], code: "education" },
        { keywords: ["subscription", "netflix", "spotify", "prime"], code: "subscription" },
    ];
    for (var _i = 0, keywordRules_1 = keywordRules; _i < keywordRules_1.length; _i++) {
        var rule = keywordRules_1[_i];
        if (rule.keywords.some(function (keyword) { return normalized.includes(keyword); })) {
            return rule.code;
        }
    }
    return type === "income" ? "income.misc" : "other.misc";
}
function inferOccurredAtIso(text, fallback) {
    if (fallback === void 0) { fallback = new Date(); }
    var explicit = parseOccurredAtPartsFromText(text);
    if (explicit) {
        return buildOccurredAtIsoFromParts(explicit);
    }
    var normalized = normalizeOccurrenceText(text);
    var now = new Date(fallback);
    if (normalized.includes("เมื่อวาน") || normalized.includes("yesterday")) {
        return new Date(now.getTime() - 86400000).toISOString();
    }
    if (normalized.includes("พรุ่งนี้") || normalized.includes("tomorrow")) {
        return new Date(now.getTime() + 86400000).toISOString();
    }
    if (normalized.includes("วันนี้") || normalized.includes("today")) {
        return now.toISOString();
    }
    return now.toISOString();
}
function buildFinanceStructuredDraftFromText(params) {
    var _a, _b, _c, _d, _e, _f;
    var type = inferFinanceTypeFromText(params.text, (_a = params.typeHint) !== null && _a !== void 0 ? _a : null);
    var currency = inferCurrencyFromText(params.text);
    var amountMinor = parseAmountMinorFromText(params.text, currency);
    var categoryCode = inferCategoryCodeFromText(params.text, (_b = params.categoryHint) !== null && _b !== void 0 ? _b : null, type);
    var inferredCounterparty = ((_c = params.counterpartyHint) === null || _c === void 0 ? void 0 : _c.trim())
        ? normalizeCounterpartyDisplayName(params.counterpartyHint)
        : inferCounterpartyCandidateFromText(params.text, type);
    var paymentDirection = inferPaymentDirectionFromType(type);
    var documentRole = (_d = params.captureIntent) !== null && _d !== void 0 ? _d : inferDocumentRoleFromText(params.text);
    var paymentDetails = inferPaymentDetailsFromText(params.text, type, documentRole);
    var missingFields = [];
    if (amountMinor === null) {
        missingFields.push("amountMinor");
    }
    var needsClarification = missingFields.length > 0;
    return {
        type: type,
        amountMinor: amountMinor !== null && amountMinor !== void 0 ? amountMinor : 1,
        currency: currency,
        occurredAt: (_e = params.occurredAt) !== null && _e !== void 0 ? _e : inferOccurredAtIso(params.text),
        categoryCode: categoryCode,
        documentRole: documentRole,
        counterpartyName: inferredCounterparty !== null && inferredCounterparty !== void 0 ? inferredCounterparty : null,
        merchantName: null,
        paymentMethodKind: paymentDetails.paymentMethodKind,
        paymentDirection: paymentDirection,
        paymentSourceAccountId: null,
        paymentDestinationAccountId: null,
        paymentSourceLabel: paymentDetails.paymentSourceLabel,
        paymentDestinationLabel: paymentDetails.paymentDestinationLabel,
        paymentSourceInstitutionName: paymentDetails.paymentSourceInstitutionName,
        paymentDestinationInstitutionName: paymentDetails.paymentDestinationInstitutionName,
        paymentInstitutionName: paymentDetails.paymentInstitutionName,
        paymentAccountNickname: paymentDetails.paymentAccountNickname,
        paymentAccountLast4: paymentDetails.paymentAccountLast4,
        paymentAccountMaskedIdentifier: paymentDetails.paymentAccountMaskedIdentifier,
        sourceUrl: null,
        sourceFileName: null,
        paymentInstrumentConfidence: paymentDetails.paymentInstrumentConfidence,
        confidence: needsClarification
            ? 0.38
            : ((_f = params.categoryHint) === null || _f === void 0 ? void 0 : _f.trim())
                ? 0.84
                : 0.7,
        needsClarification: needsClarification,
        missingFields: missingFields,
        sourceMessageId: undefined,
        sourceLibraryItemId: undefined,
        recurringRuleId: undefined,
        note: stripFinanceIntentPrefix(params.text) || normalizeText(params.text),
    };
}
function ensureDb(db) {
    if (!db) {
        throw new Error("Database not available");
    }
}
function getTimeZoneParts(date, timeZone) {
    var _a;
    var formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "short",
        hourCycle: "h23",
    });
    var parts = {};
    for (var _i = 0, _b = formatter.formatToParts(date); _i < _b.length; _i++) {
        var part = _b[_i];
        if (part.type !== "literal") {
            parts[part.type] = part.value;
        }
    }
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second),
        weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf((_a = parts.weekday) !== null && _a !== void 0 ? _a : "Sun"),
    };
}
function getTimeZoneOffsetMs(date, timeZone) {
    var parts = getTimeZoneParts(date, timeZone);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}
function timeZonePartsToUtc(parts, timeZone) {
    var _a, _b, _c;
    var candidate = Date.UTC(parts.year, parts.month - 1, parts.day, (_a = parts.hour) !== null && _a !== void 0 ? _a : 0, (_b = parts.minute) !== null && _b !== void 0 ? _b : 0, (_c = parts.second) !== null && _c !== void 0 ? _c : 0, 0);
    var utc = candidate;
    for (var i = 0; i < 3; i += 1) {
        var offset = getTimeZoneOffsetMs(new Date(utc), timeZone);
        var next = candidate - offset;
        if (next === utc) {
            break;
        }
        utc = next;
    }
    return new Date(utc);
}
function startOfDayInTimeZone(date, timeZone) {
    var parts = getTimeZoneParts(date, timeZone);
    return timeZonePartsToUtc({ year: parts.year, month: parts.month, day: parts.day }, timeZone);
}
function startOfMonthInTimeZone(date, timeZone) {
    var parts = getTimeZoneParts(date, timeZone);
    return timeZonePartsToUtc({ year: parts.year, month: parts.month, day: 1 }, timeZone);
}
function startOfNextMonthInTimeZone(date, timeZone) {
    var parts = getTimeZoneParts(date, timeZone);
    var year = parts.year;
    var month = parts.month + 1;
    if (month > 12) {
        year += 1;
        month = 1;
    }
    return timeZonePartsToUtc({ year: year, month: month, day: 1 }, timeZone);
}
function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function buildClarificationPrompt(missingFields) {
    if (missingFields.length === 0) {
        return null;
    }
    return "Please confirm: ".concat(missingFields.join(", "), ".");
}
function buildFinanceOcrStructuredExtractionPrompt(params) {
    var instructions = [
        "You extract a structured finance transaction draft from OCR text.",
        "The OCR text may contain duplicate headers, broken line wraps, repeated lines, or mixed language snippets.",
        "Return a single JSON object that matches the schema exactly. Do not include markdown fences or prose.",
        "Use the OCR text as the primary source of truth. Do not invent values that are not visible or strongly implied.",
        "If a value is not visible, use null where the schema allows it and set needsClarification when needed.",
        "If the OCR text looks like a transfer slip, set type to transfer and documentRole to transfer_slip.",
        "Do not use digits from filenames, URLs, QR codes, account masks, reference numbers, or merchant codes as the transaction amount.",
        "When the slip shows sender and receiver banks or accounts, keep paymentSourceInstitutionName and paymentDestinationInstitutionName separate.",
        "If the slip is a transfer between the user's own accounts, keep both sides separate instead of collapsing them into one field.",
        "When account names, nicknames, last 4 digits, or masked identifiers are visible, populate the matching payment fields.",
        "Prefer the most likely transaction amount shown on the slip. If there is a fee and a total, use the main transfer or payment amount as amountMinor unless the text clearly indicates otherwise.",
        "Prefer THB when the slip is in Thai Baht unless another currency is clearly visible.",
        "Use a precise occurredAt if the OCR text includes a clear date or time. Otherwise infer the best timestamp from the selected context.",
        params.typeHint
            ? "The user provided a type hint. Prefer it when the OCR text is ambiguous: ".concat(params.typeHint, ".")
            : "Infer the transaction type from the OCR text.",
        params.categoryHint
            ? "A user-provided category hint is available. Prefer it when the OCR text is ambiguous: ".concat(params.categoryHint, ".")
            : "Use the most specific categoryCode that matches the OCR text.",
        params.counterpartyHint
            ? "A user-provided counterparty hint is available. Prefer it when the OCR text is ambiguous: ".concat(params.counterpartyHint, ".")
            : "If a merchant, person, or organization name is visible, use it as counterpartyName or merchantName when appropriate.",
        params.captureIntent
            ? "The capture intent is: ".concat(params.captureIntent, ".")
            : "",
        params.occurredAt
            ? "The user already has a selected timestamp: ".concat(params.occurredAt, ". Use it unless the OCR text clearly conflicts.")
            : "If the OCR text has a clear date or time, use it.",
        "Return only valid JSON matching the schema.",
        "Populate missingFields and needsClarification when the OCR text does not provide enough detail.",
    ];
    return instructions.filter(Boolean).join("\n");
}
function resolveFinanceOcrStructuredModelCandidates(input) {
    return __awaiter(this, void 0, void 0, function () {
        var orderedCandidates, preferredModel, enabledRows, capabilityCandidates, _i, capabilityCandidates_1, candidate, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    orderedCandidates = [];
                    preferredModel = ((_a = input.preferredModel) === null || _a === void 0 ? void 0 : _a.trim()) || "";
                    if (preferredModel) {
                        orderedCandidates.push(preferredModel);
                    }
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, enabledLlmModels_1.loadEnabledLlmModelRows)({ autoSelectionOnly: true })];
                case 2:
                    enabledRows = _c.sent();
                    capabilityCandidates = (0, intelligentModelSelector_1.selectLlmModelCandidates)({ supportsStructuredOutputs: true }, enabledRows, (_b = input.maxCandidates) !== null && _b !== void 0 ? _b : 4);
                    for (_i = 0, capabilityCandidates_1 = capabilityCandidates; _i < capabilityCandidates_1.length; _i++) {
                        candidate = capabilityCandidates_1[_i];
                        if (!orderedCandidates.includes(candidate)) {
                            orderedCandidates.push(candidate);
                        }
                    }
                    return [3 /*break*/, 4];
                case 3:
                    _c.sent();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, orderedCandidates];
            }
        });
    });
}
async function extractFinanceStructuredDraftFromOcrText(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3;
    const normalizedText = normalizeText(input.text);
    const sanitizedText = stripFinanceOcrNoise(normalizedText, (_a = input.sourceFileName) !== null && _a !== void 0 ? _a : null);
    if (!sanitizedText) {
        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Finance OCR text cannot be empty" });
    }
    if (!((_b = input.tenantId) === null || _b === void 0 ? void 0 : _b.trim())) {
        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required for OCR extraction" });
    }
    const parsedOccurredAt = input.occurredAt ? new Date(input.occurredAt) : null;
    const resolvedOccurredAt = parsedOccurredAt && Number.isFinite(parsedOccurredAt.getTime())
        ? parsedOccurredAt.toISOString()
        : null;
    const explicitModelCandidates = Array.isArray(input.modelCandidates)
        ? input.modelCandidates
            .map((candidate) => candidate === null || candidate === void 0 ? void 0 : candidate.trim())
            .filter((candidate) => Boolean(candidate))
        : [];
    const modelCandidates = explicitModelCandidates.length > 0
        ? Array.from(new Set(__spreadArray(__spreadArray([], ((input.model === null || input.model === void 0 ? void 0 : input.model.trim()) ? [input.model.trim()] : []), true), explicitModelCandidates, true)))
        : await resolveFinanceOcrStructuredModelCandidates({
            preferredModel: (_b = input.model) !== null && _b !== void 0 ? _b : null,
        });
    const modelQueue = modelCandidates.length > 0
        ? modelCandidates
        : [input.model === null || input.model === void 0 ? void 0 : input.model.trim()].filter((model) => Boolean(model));
    const attemptModels = modelQueue.length > 0 ? modelQueue : [undefined];
    let lastError = null;
    for (const model of attemptModels) {
        try {
            const structured = await (0, callLLMStructured_1.callLLMStructured)({
                systemPrompt: buildFinanceOcrStructuredExtractionPrompt({
                    occurredAt: resolvedOccurredAt,
                    typeHint: (_c = input.typeHint) !== null && _c !== void 0 ? _c : null,
                    categoryHint: (_d = input.categoryHint) !== null && _d !== void 0 ? _d : null,
                    counterpartyHint: (_e = input.counterpartyHint) !== null && _e !== void 0 ? _e : null,
                    captureIntent: (_f = input.captureIntent) !== null && _f !== void 0 ? _f : null,
                }),
                userMessage: JSON.stringify({
                    sourceKind: "ocr_document",
                    text: sanitizedText,
                    occurredAt: resolvedOccurredAt,
                    typeHint: (_g = input.typeHint) !== null && _g !== void 0 ? _g : null,
                    categoryHint: (_h = input.categoryHint) !== null && _h !== void 0 ? _h : null,
                    counterpartyHint: (_j = input.counterpartyHint) !== null && _j !== void 0 ? _j : null,
                    captureIntent: (_k = input.captureIntent) !== null && _k !== void 0 ? _k : null,
                    sourceMessageId: (_l = input.sourceMessageId) !== null && _l !== void 0 ? _l : null,
                    paymentMethodKind: (_m = input.paymentMethodKind) !== null && _m !== void 0 ? _m : null,
                    paymentDirection: (_o = input.paymentDirection) !== null && _o !== void 0 ? _o : null,
                    paymentSourceAccountId: (_p = input.paymentSourceAccountId) !== null && _p !== void 0 ? _p : null,
                    paymentDestinationAccountId: (_q = input.paymentDestinationAccountId) !== null && _q !== void 0 ? _q : null,
                    paymentSourceLabel: (_r = input.paymentSourceLabel) !== null && _r !== void 0 ? _r : null,
                    paymentDestinationLabel: (_s = input.paymentDestinationLabel) !== null && _s !== void 0 ? _s : null,
                    paymentSourceInstitutionName: (_t = input.paymentSourceInstitutionName) !== null && _t !== void 0 ? _t : null,
                    paymentDestinationInstitutionName: (_u = input.paymentDestinationInstitutionName) !== null && _u !== void 0 ? _u : null,
                    paymentInstitutionName: (_v = input.paymentInstitutionName) !== null && _v !== void 0 ? _v : null,
                    paymentAccountNickname: (_w = input.paymentAccountNickname) !== null && _w !== void 0 ? _w : null,
                    paymentAccountLast4: (_x = input.paymentAccountLast4) !== null && _x !== void 0 ? _x : null,
                    paymentAccountMaskedIdentifier: (_y = input.paymentAccountMaskedIdentifier) !== null && _y !== void 0 ? _y : null,
                    paymentInstrumentConfidence: (_z = input.paymentInstrumentConfidence) !== null && _z !== void 0 ? _z : null,
                }),
                zodSchema: finance_1.financeStructuredDraftSchema,
                userId: input.userId,
                tenantId: input.tenantId,
                maxRetries: 1,
                billingDescription: "finance_ocr_to_draft",
                billingMetadata: {
                    domain: "finance",
                    source: "ocr_document",
                    conversationId: input.conversationId,
                    captureIntent: input.captureIntent !== null && input.captureIntent !== void 0 ? input.captureIntent : null,
                },
                model,
            });
            const data = structured.data;
            const heuristicAmountMinor = parseAmountMinorFromText(sanitizedText, data.currency);
            const heuristicOccurredAt = extractDocumentOccurredAtIso(sanitizedText);
            const normalizedData = isSuspiciousAmountMinor(data.amountMinor) && heuristicAmountMinor !== null
                ? __assign(__assign({}, data), { amountMinor: heuristicAmountMinor }) : data;
            const merged = mergeInferredPaymentDetailsFromText(__assign(__assign({}, normalizedData), { occurredAt: heuristicOccurredAt || normalizedData.occurredAt || resolvedOccurredAt }), sanitizedText);
            const normalizedMerged = __assign(__assign({}, merged), { missingFields: normalizeStructuredDraftMissingFields(merged) });
            const finalOccurredAt = heuristicOccurredAt || normalizedMerged.occurredAt || resolvedOccurredAt || normalizedData.occurredAt;
            return __assign(__assign({}, normalizedMerged), { occurredAt: finalOccurredAt });
        }
        catch (error) {
            lastError = error;
        }
    }
    if (lastError instanceof Error) {
        throw lastError;
    }
    throw new Error("Finance OCR structured extraction failed");
}
function buildAllowedScopes(userId) {
    return [personalScopeToken(userId)];
}
function buildScopeFromConversation(conversation, userId, ctxTenantId) {
    var _a;
    var conversationTenantId = (_a = conversation.tenantId) !== null && _a !== void 0 ? _a : null;
    var resolvedTenantId = (0, tenantContext_1.resolveTenantIdVarchar)(ctxTenantId !== null && ctxTenantId !== void 0 ? ctxTenantId : conversationTenantId, conversationTenantId);
    if (!resolvedTenantId) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Tenant context is required for finance operations",
        });
    }
    if (conversationTenantId && resolvedTenantId !== String(conversationTenantId)) {
        throw new server_1.TRPCError({
            code: "FORBIDDEN",
            message: "Conversation tenant does not match finance request tenant",
        });
    }
    if (!conversation.projectId) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Finance operations require a conversation with a project scope",
        });
    }
    return {
        tenantId: resolvedTenantId,
        ownerUserId: userId,
        projectId: conversation.projectId,
        conversationId: conversation.id,
        personal: (0, chatService_1.isPersonalProjectId)(conversation.projectId),
        allowedScopes: buildAllowedScopes(userId),
    };
}
function resolveScopeFromConversation(params) {
    return __awaiter(this, void 0, void 0, function () {
        var conversation;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, chatService_1.getConversationById)(params.conversationId, params.userId)];
                case 1:
                    conversation = _a.sent();
                    if (!conversation) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Conversation not found",
                        });
                    }
                    return [2 /*return*/, buildScopeFromConversation(conversation, params.userId, params.tenantId)];
            }
        });
    });
}
function computeBaseSourceHash(parts) {
    return sha256(parts.map(function (part) { return String(part !== null && part !== void 0 ? part : ""); }).join("::"));
}
function normalizePayloadVersion(payloadJson) {
    var raw = payloadJson === null || payloadJson === void 0 ? void 0 : payloadJson.version;
    return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}
function toFinanceConfidenceValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value.toFixed(2);
    }
    if (typeof value === "string" && value.trim().length > 0) {
        return value;
    }
    return null;
}
function toFinanceConfidenceNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.round(value * 100) / 100;
    }
    if (typeof value === "string" && value.trim().length > 0) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
    }
    return null;
}
function readOptionalPositiveInt(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return null;
    }
    return Math.floor(value);
}
function readOptionalString(value) {
    if (typeof value !== "string") {
        return null;
    }
    var trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function readStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(function (entry) { return typeof entry === "string" && entry.trim().length > 0; });
}
function materializeDraftPayload(row) {
    var _a, _b, _c, _d, _e, _f, _g;
    var payloadJson = ((_a = row.payloadJson) !== null && _a !== void 0 ? _a : {});
    var amountMinor = (_b = readOptionalPositiveInt(payloadJson.amountMinor)) !== null && _b !== void 0 ? _b : 1;
    var currency = (_d = (_c = readOptionalString(payloadJson.currency)) === null || _c === void 0 ? void 0 : _c.toUpperCase()) !== null && _d !== void 0 ? _d : "THB";
    var occurredAt = (_e = readOptionalString(payloadJson.occurredAt)) !== null && _e !== void 0 ? _e : row.createdAt.toISOString();
    var categoryCode = (_f = readOptionalString(payloadJson.categoryCode)) !== null && _f !== void 0 ? _f : "uncategorized";
    var documentRole = normalizeDocumentRole(readOptionalString(payloadJson.documentRole));
    var counterpartyName = typeof payloadJson.counterpartyName === "string"
        ? payloadJson.counterpartyName
        : payloadJson.counterpartyName === null
            ? null
            : null;
    var counterpartyId = typeof payloadJson.counterpartyId === "number" && Number.isFinite(payloadJson.counterpartyId)
        ? payloadJson.counterpartyId
        : null;
    var merchantName = typeof payloadJson.merchantName === "string"
        ? payloadJson.merchantName
        : payloadJson.merchantName === null
            ? null
            : null;
    var note = typeof payloadJson.note === "string"
        ? payloadJson.note
        : payloadJson.note === null
            ? null
            : null;
    var paymentMethodKind = typeof payloadJson.paymentMethodKind === "string"
        ? finance_1.financePaymentInstrumentKindSchema.safeParse(payloadJson.paymentMethodKind).success
            ? payloadJson.paymentMethodKind
            : null
        : null;
    var paymentDirection = typeof payloadJson.paymentDirection === "string"
        ? finance_1.financePaymentDirectionSchema.safeParse(payloadJson.paymentDirection).success
            ? payloadJson.paymentDirection
            : null
        : null;
    var paymentSourceAccountId = typeof payloadJson.paymentSourceAccountId === "number" && Number.isFinite(payloadJson.paymentSourceAccountId)
        ? Math.floor(payloadJson.paymentSourceAccountId)
        : null;
    var paymentDestinationAccountId = typeof payloadJson.paymentDestinationAccountId === "number" && Number.isFinite(payloadJson.paymentDestinationAccountId)
        ? Math.floor(payloadJson.paymentDestinationAccountId)
        : null;
    var paymentSourceLabel = typeof payloadJson.paymentSourceLabel === "string"
        ? payloadJson.paymentSourceLabel
        : payloadJson.paymentSourceLabel === null
            ? null
            : null;
    var paymentDestinationLabel = typeof payloadJson.paymentDestinationLabel === "string"
        ? payloadJson.paymentDestinationLabel
        : payloadJson.paymentDestinationLabel === null
            ? null
            : null;
    var paymentSourceInstitutionName = typeof payloadJson.paymentSourceInstitutionName === "string"
        ? payloadJson.paymentSourceInstitutionName
        : payloadJson.paymentSourceInstitutionName === null
            ? null
            : null;
    var paymentDestinationInstitutionName = typeof payloadJson.paymentDestinationInstitutionName === "string"
        ? payloadJson.paymentDestinationInstitutionName
        : payloadJson.paymentDestinationInstitutionName === null
            ? null
            : null;
    var paymentInstitutionName = typeof payloadJson.paymentInstitutionName === "string"
        ? payloadJson.paymentInstitutionName
        : payloadJson.paymentInstitutionName === null
            ? null
            : null;
    var paymentAccountNickname = typeof payloadJson.paymentAccountNickname === "string"
        ? payloadJson.paymentAccountNickname
        : payloadJson.paymentAccountNickname === null
            ? null
            : null;
    var paymentAccountLast4 = typeof payloadJson.paymentAccountLast4 === "string"
        ? payloadJson.paymentAccountLast4
        : payloadJson.paymentAccountLast4 === null
            ? null
            : null;
    var paymentAccountMaskedIdentifier = typeof payloadJson.paymentAccountMaskedIdentifier === "string"
        ? payloadJson.paymentAccountMaskedIdentifier
        : payloadJson.paymentAccountMaskedIdentifier === null
            ? null
            : null;
    var sourceUrl = typeof payloadJson.sourceUrl === "string"
        ? payloadJson.sourceUrl
        : payloadJson.sourceUrl === null
            ? null
            : null;
    var sourceFileName = typeof payloadJson.sourceFileName === "string"
        ? payloadJson.sourceFileName
        : payloadJson.sourceFileName === null
            ? null
            : null;
    var paymentInstrumentConfidence = typeof payloadJson.paymentInstrumentConfidence === "number" && Number.isFinite(payloadJson.paymentInstrumentConfidence)
        ? payloadJson.paymentInstrumentConfidence
        : null;
    var confidence = typeof payloadJson.confidence === "number" && Number.isFinite(payloadJson.confidence)
        ? payloadJson.confidence
        : 0;
    var sourceMessageId = typeof payloadJson.sourceMessageId === "number" && Number.isFinite(payloadJson.sourceMessageId)
        ? payloadJson.sourceMessageId
        : null;
    var sourceLibraryItemId = typeof payloadJson.sourceLibraryItemId === "number" && Number.isFinite(payloadJson.sourceLibraryItemId)
        ? payloadJson.sourceLibraryItemId
        : null;
    var recurringRuleId = typeof payloadJson.recurringRuleId === "number" && Number.isFinite(payloadJson.recurringRuleId)
        ? payloadJson.recurringRuleId
        : null;
    var documentExtractionId = typeof payloadJson.documentExtractionId === "number" && Number.isFinite(payloadJson.documentExtractionId)
        ? payloadJson.documentExtractionId
        : null;
    return {
        type: row.type,
        amountMinor: amountMinor,
        currency: currency,
        occurredAt: occurredAt,
        categoryCode: categoryCode,
        documentRole: documentRole !== null && documentRole !== void 0 ? documentRole : null,
        counterpartyId: counterpartyId,
        counterpartyName: counterpartyName,
        merchantName: merchantName,
        note: note,
        paymentMethodKind: paymentMethodKind !== null && paymentMethodKind !== void 0 ? paymentMethodKind : null,
        paymentDirection: paymentDirection !== null && paymentDirection !== void 0 ? paymentDirection : null,
        paymentSourceAccountId: paymentSourceAccountId,
        paymentDestinationAccountId: paymentDestinationAccountId,
        paymentSourceLabel: paymentSourceLabel,
        paymentDestinationLabel: paymentDestinationLabel,
        paymentSourceInstitutionName: paymentSourceInstitutionName,
        paymentDestinationInstitutionName: paymentDestinationInstitutionName,
        paymentInstitutionName: paymentInstitutionName,
        paymentAccountNickname: paymentAccountNickname,
        paymentAccountLast4: paymentAccountLast4,
        paymentAccountMaskedIdentifier: paymentAccountMaskedIdentifier,
        sourceUrl: sourceUrl,
        sourceFileName: sourceFileName,
        paymentInstrumentConfidence: paymentInstrumentConfidence,
        confidence: confidence,
        needsClarification: Boolean(payloadJson.needsClarification),
        missingFields: normalizeStructuredDraftMissingFields({
            type: row.type,
            amountMinor: amountMinor,
            currency: currency,
            occurredAt: occurredAt,
            categoryCode: categoryCode,
            documentRole: documentRole !== null && documentRole !== void 0 ? documentRole : null,
            counterpartyId: counterpartyId,
            counterpartyName: counterpartyName,
            merchantName: merchantName,
            note: note,
            slipReference: slipReference,
            merchantId: merchantId,
            paymentFeeMinor: paymentFeeMinor,
            paymentMethodKind: paymentMethodKind !== null && paymentMethodKind !== void 0 ? paymentMethodKind : null,
            paymentDirection: paymentDirection !== null && paymentDirection !== void 0 ? paymentDirection : null,
            paymentSourceAccountId: paymentSourceAccountId,
            paymentDestinationAccountId: paymentDestinationAccountId,
            paymentSourceLabel: paymentSourceLabel,
            paymentDestinationLabel: paymentDestinationLabel,
            paymentSourceName: paymentSourceName,
            paymentDestinationName: paymentDestinationName,
            paymentSourceInstitutionName: paymentSourceInstitutionName,
            paymentDestinationInstitutionName: paymentDestinationInstitutionName,
            paymentInstitutionName: paymentInstitutionName,
            paymentAccountNickname: paymentAccountNickname,
            paymentAccountLast4: paymentAccountLast4,
            paymentAccountMaskedIdentifier: paymentAccountMaskedIdentifier,
            sourceUrl: sourceUrl,
            sourceFileName: sourceFileName,
            paymentInstrumentConfidence: paymentInstrumentConfidence,
            evidence: evidence,
            confidence: confidence,
            needsClarification: Boolean(payloadJson.needsClarification),
            missingFields: readStringArray(payloadJson.missingFields),
            sourceMessageId: sourceMessageId,
            sourceLibraryItemId: sourceLibraryItemId,
            recurringRuleId: recurringRuleId,
            version: normalizePayloadVersion(payloadJson),
            sourceKind: (_g = readOptionalString(payloadJson.sourceKind)) !== null && _g !== void 0 ? _g : undefined,
            documentExtractionId: documentExtractionId,
        }),
        sourceMessageId: sourceMessageId,
        sourceLibraryItemId: sourceLibraryItemId,
        recurringRuleId: recurringRuleId,
        version: normalizePayloadVersion(payloadJson),
        sourceKind: (_g = readOptionalString(payloadJson.sourceKind)) !== null && _g !== void 0 ? _g : undefined,
        documentExtractionId: documentExtractionId,
    };
}
function mapDraftRow(row) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
    var payloadJson = ((_a = row.payloadJson) !== null && _a !== void 0 ? _a : {});
    var version = normalizePayloadVersion(payloadJson);
    var materialized = materializeDraftPayload(row);
    return __assign(__assign({}, row), { amountMinor: materialized.amountMinor, currency: materialized.currency, occurredAt: materialized.occurredAt, categoryCode: materialized.categoryCode, documentRole: (_b = materialized.documentRole) !== null && _b !== void 0 ? _b : null, counterpartyId: (_c = materialized.counterpartyId) !== null && _c !== void 0 ? _c : null, counterpartyName: (_d = materialized.counterpartyName) !== null && _d !== void 0 ? _d : null, merchantName: (_e = materialized.merchantName) !== null && _e !== void 0 ? _e : null, note: (_f = materialized.note) !== null && _f !== void 0 ? _f : null, paymentMethodKind: (_g = materialized.paymentMethodKind) !== null && _g !== void 0 ? _g : null, paymentDirection: (_h = materialized.paymentDirection) !== null && _h !== void 0 ? _h : null, paymentSourceAccountId: (_j = materialized.paymentSourceAccountId) !== null && _j !== void 0 ? _j : null, paymentDestinationAccountId: (_k = materialized.paymentDestinationAccountId) !== null && _k !== void 0 ? _k : null, paymentSourceLabel: (_l = materialized.paymentSourceLabel) !== null && _l !== void 0 ? _l : null, paymentDestinationLabel: (_m = materialized.paymentDestinationLabel) !== null && _m !== void 0 ? _m : null, paymentSourceInstitutionName: (_o = materialized.paymentSourceInstitutionName) !== null && _o !== void 0 ? _o : null, paymentDestinationInstitutionName: (_p = materialized.paymentDestinationInstitutionName) !== null && _p !== void 0 ? _p : null, paymentInstitutionName: (_q = materialized.paymentInstitutionName) !== null && _q !== void 0 ? _q : null, paymentAccountNickname: (_r = materialized.paymentAccountNickname) !== null && _r !== void 0 ? _r : null, paymentAccountLast4: (_s = materialized.paymentAccountLast4) !== null && _s !== void 0 ? _s : null, paymentAccountMaskedIdentifier: (_t = materialized.paymentAccountMaskedIdentifier) !== null && _t !== void 0 ? _t : null, sourceUrl: (_u = materialized.sourceUrl) !== null && _u !== void 0 ? _u : null, sourceFileName: (_v = materialized.sourceFileName) !== null && _v !== void 0 ? _v : null, paymentInstrumentConfidence: (_w = materialized.paymentInstrumentConfidence) !== null && _w !== void 0 ? _w : null, payloadJson: payloadJson, allowedScopes: (_x = row.allowedScopes) !== null && _x !== void 0 ? _x : [], version: version });
}
function mapTransactionRow(row) {
    return row;
}
function toIdempotencyKey(defaultPrefix, parts) {
    return "".concat(defaultPrefix, ":").concat(sha256(parts.map(function (part) { return String(part !== null && part !== void 0 ? part : ""); }).join("::")));
}
function validateRecurringSchedule(input) {
    var parsed = recurringScheduleSchema.parse(input);
    if (parsed.frequency === "weekly" && parsed.daysOfWeek && parsed.daysOfWeek.length === 0) {
        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Weekly recurring rules must include at least one day of week" });
    }
    return parsed;
}
function normalizeRecurringSchedule(input) {
    if (typeof input === "string") {
        var trimmed = input.trim();
        if (!trimmed) {
            throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Recurring schedule cannot be empty" });
        }
        if (trimmed.startsWith("{")) {
            try {
                return validateRecurringSchedule(JSON.parse(trimmed));
            }
            catch (error) {
                throw new server_1.TRPCError({
                    code: "BAD_REQUEST",
                    message: error instanceof Error ? error.message : "Invalid recurring schedule JSON",
                });
            }
        }
        var upper = trimmed.toUpperCase();
        if (upper === "DAILY")
            return validateRecurringSchedule({ frequency: "daily", interval: 1 });
        if (upper === "WEEKLY")
            return validateRecurringSchedule({ frequency: "weekly", interval: 1 });
        if (upper === "MONTHLY")
            return validateRecurringSchedule({ frequency: "monthly", interval: 1 });
        if (upper === "YEARLY")
            return validateRecurringSchedule({ frequency: "yearly", interval: 1 });
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Unsupported recurring schedule format. Use JSON schedule or DAILY/WEEKLY/MONTHLY/YEARLY.",
        });
    }
    return validateRecurringSchedule(input);
}
function buildScheduleAnchor(startDate, timeZone) {
    var parts = getTimeZoneParts(startDate, timeZone);
    return {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
        second: parts.second,
        weekday: parts.weekday,
    };
}
function scheduleMatchesDate(candidate, schedule, anchor, timeZone) {
    var _a, _b, _c, _d;
    var candidateParts = getTimeZoneParts(candidate, timeZone);
    var daysSinceAnchor = Math.floor((Date.UTC(candidateParts.year, candidateParts.month - 1, candidateParts.day) - Date.UTC(anchor.year, anchor.month - 1, anchor.day))
        / 86400000);
    if (candidateParts.hour !== anchor.hour || candidateParts.minute !== anchor.minute || candidateParts.second !== anchor.second) {
        return false;
    }
    switch (schedule.frequency) {
        case "daily":
            return daysSinceAnchor >= 0 && daysSinceAnchor % schedule.interval === 0;
        case "weekly": {
            var weekdayOk = ((_a = schedule.daysOfWeek) === null || _a === void 0 ? void 0 : _a.length)
                ? schedule.daysOfWeek.includes(candidateParts.weekday)
                : candidateParts.weekday === anchor.weekday;
            var weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
            return daysSinceAnchor >= 0 && weekdayOk && weeksSinceAnchor >= 0 && weeksSinceAnchor % schedule.interval === 0;
        }
        case "monthly": {
            var monthsSinceAnchor = (candidateParts.year - anchor.year) * 12 + (candidateParts.month - anchor.month);
            var targetDay = (_b = schedule.dayOfMonth) !== null && _b !== void 0 ? _b : anchor.day;
            var expectedDay = Math.min(targetDay, daysInMonth(candidateParts.year, candidateParts.month));
            return monthsSinceAnchor >= 0
                && monthsSinceAnchor % schedule.interval === 0
                && candidateParts.day === expectedDay;
        }
        case "yearly": {
            var yearsSinceAnchor = candidateParts.year - anchor.year;
            var targetMonth = (_c = schedule.month) !== null && _c !== void 0 ? _c : anchor.month;
            var targetDay = (_d = schedule.dayOfMonth) !== null && _d !== void 0 ? _d : anchor.day;
            var expectedDay = Math.min(targetDay, daysInMonth(candidateParts.year, targetMonth));
            return yearsSinceAnchor >= 0
                && yearsSinceAnchor % schedule.interval === 0
                && candidateParts.month === targetMonth
                && candidateParts.day === expectedDay;
        }
        default:
            return false;
    }
}
function computeNextRecurringRunAt(schedule, startDate, timeZone, afterDate) {
    var anchor = buildScheduleAnchor(startDate, timeZone);
    var maxDays = 366 * 5;
    for (var offset = 0; offset <= maxDays; offset += 1) {
        var candidateLocal = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day + offset, anchor.hour, anchor.minute, anchor.second));
        var candidate = timeZonePartsToUtc({
            year: candidateLocal.getUTCFullYear(),
            month: candidateLocal.getUTCMonth() + 1,
            day: candidateLocal.getUTCDate(),
            hour: anchor.hour,
            minute: anchor.minute,
            second: anchor.second,
        }, timeZone);
        if (candidate.getTime() < startDate.getTime()) {
            continue;
        }
        if (candidate.getTime() < afterDate.getTime()) {
            continue;
        }
        if (scheduleMatchesDate(candidate, schedule, anchor, timeZone)) {
            return candidate;
        }
    }
    return null;
}
function selectExistingDraft(db, scope, identity) {
    return __awaiter(this, void 0, void 0, function () {
        var byId, byIdempotency, byHash;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!identity.draftId) return [3 /*break*/, 2];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.financeDrafts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeDrafts.id, identity.draftId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.ownerUserId, scope.ownerUserId)))
                            .limit(1)];
                case 1:
                    byId = (_a.sent())[0];
                    if (byId) {
                        return [2 /*return*/, mapDraftRow(byId)];
                    }
                    _a.label = 2;
                case 2: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.financeDrafts)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeDrafts.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.idempotencyKey, identity.idempotencyKey), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.ownerUserId, scope.ownerUserId)))
                        .limit(1)];
                case 3:
                    byIdempotency = (_a.sent())[0];
                    if (byIdempotency) {
                        return [2 /*return*/, mapDraftRow(byIdempotency)];
                    }
                    if (!identity.sourceHash) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.financeDrafts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeDrafts.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.sourceHash, identity.sourceHash), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.ownerUserId, scope.ownerUserId)))
                            .limit(1)];
                case 4:
                    byHash = (_a.sent())[0];
                    if (byHash) {
                        return [2 /*return*/, mapDraftRow(byHash)];
                    }
                    _a.label = 5;
                case 5: return [2 /*return*/, null];
            }
        });
    });
}
function selectExistingConfirmedTransaction(db, scope, draftId) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.financeTransactions)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeTransactions.confirmedFromDraftId, draftId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.ownerUserId, scope.ownerUserId)))
                        .limit(1)];
                case 1:
                    row = (_a.sent())[0];
                    return [2 /*return*/, row !== null && row !== void 0 ? row : null];
            }
        });
    });
}
function ensureDraftOwnership(db, scope, draftId) {
    return __awaiter(this, void 0, void 0, function () {
        var draft;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.financeDrafts)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeDrafts.id, draftId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.ownerUserId, scope.ownerUserId)))
                        .limit(1)];
                case 1:
                    draft = (_a.sent())[0];
                    if (!draft) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
                    }
                    return [2 /*return*/, mapDraftRow(draft)];
            }
        });
    });
}
function ensureTransactionOwnership(db, scope, transactionId) {
    return __awaiter(this, void 0, void 0, function () {
        var transaction;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.financeTransactions)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeTransactions.id, transactionId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.ownerUserId, scope.ownerUserId)))
                        .limit(1)];
                case 1:
                    transaction = (_a.sent())[0];
                    if (!transaction) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
                    }
                    return [2 /*return*/, transaction];
            }
        });
    });
}
function ensureRecurringRuleOwnership(db, scope, recurringRuleId) {
    return __awaiter(this, void 0, void 0, function () {
        var rule;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.financeRecurringRules)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.id, recurringRuleId), (0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.ownerUserId, scope.ownerUserId)))
                        .limit(1)];
                case 1:
                    rule = (_a.sent())[0];
                    if (!rule) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Recurring rule not found" });
                    }
                    return [2 /*return*/, rule];
            }
        });
    });
}
function buildDraftClarificationPayload(payload, source) {
    var _a;
    return __assign(__assign(__assign({}, payload), source), { version: (_a = payload.version) !== null && _a !== void 0 ? _a : 1 });
}
function buildSummaryRow(base, granularity) {
    var parsed = finance_1.financeMonthlySummarySchema.parse(base);
    return __assign(__assign({}, parsed), { granularity: granularity });
}
function mapCounterpartyRow(row, aliases) {
    var _a, _b;
    if (aliases === void 0) { aliases = []; }
    return {
        id: row.id,
        tenantId: row.tenantId,
        projectId: row.projectId,
        ownerUserId: row.ownerUserId,
        displayName: row.displayName,
        normalizedName: row.normalizedName,
        usageCount: row.usageCount,
        lastSeenAt: (_a = row.lastSeenAt) !== null && _a !== void 0 ? _a : null,
        aliases: aliases,
        allowedScopes: (_b = row.allowedScopes) !== null && _b !== void 0 ? _b : [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function mapCounterpartySuggestion(row, aliases) {
    if (aliases === void 0) { aliases = []; }
    return finance_1.financeCounterpartySuggestionSchema.parse({
        id: row.id,
        displayName: row.displayName,
        normalizedName: row.normalizedName,
        usageCount: row.usageCount,
        lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
        aliases: aliases,
    });
}
function loadCounterpartyAliases(db, counterpartyId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select({
                        aliasName: schema_1.financeCounterpartyAliases.aliasName,
                    })
                        .from(schema_1.financeCounterpartyAliases)
                        .where((0, drizzle_orm_1.eq)(schema_1.financeCounterpartyAliases.counterpartyId, counterpartyId))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.financeCounterpartyAliases.updatedAt), (0, drizzle_orm_1.desc)(schema_1.financeCounterpartyAliases.id))];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows
                            .map(function (row) { return row.aliasName; })
                            .filter(function (alias) { return typeof alias === "string" && alias.trim().length > 0; })];
            }
        });
    });
}
function loadCounterpartyAliasesForCounterparties(db, counterpartyIds) {
    return __awaiter(this, void 0, void 0, function () {
        var rows, aliasesByCounterparty, _i, rows_1, row, alias;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (counterpartyIds.length === 0) {
                        return [2 /*return*/, new Map()];
                    }
                    return [4 /*yield*/, db
                            .select({
                            counterpartyId: schema_1.financeCounterpartyAliases.counterpartyId,
                            aliasName: schema_1.financeCounterpartyAliases.aliasName,
                        })
                            .from(schema_1.financeCounterpartyAliases)
                            .where((0, drizzle_orm_1.inArray)(schema_1.financeCounterpartyAliases.counterpartyId, counterpartyIds))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.financeCounterpartyAliases.updatedAt), (0, drizzle_orm_1.desc)(schema_1.financeCounterpartyAliases.id))];
                case 1:
                    rows = _b.sent();
                    aliasesByCounterparty = new Map();
                    for (_i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                        row = rows_1[_i];
                        if (!aliasesByCounterparty.has(row.counterpartyId)) {
                            aliasesByCounterparty.set(row.counterpartyId, []);
                        }
                        alias = typeof row.aliasName === "string" ? row.aliasName.trim() : "";
                        if (alias) {
                            (_a = aliasesByCounterparty.get(row.counterpartyId)) === null || _a === void 0 ? void 0 : _a.push(alias);
                        }
                    }
                    return [2 /*return*/, aliasesByCounterparty];
            }
        });
    });
}
function selectCounterpartyByNormalizedName(db, scope, normalizedName) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.financeCounterparties)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeCounterparties.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeCounterparties.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeCounterparties.ownerUserId, scope.ownerUserId), (0, drizzle_orm_1.eq)(schema_1.financeCounterparties.normalizedName, normalizedName)))
                        .limit(1)];
                case 1:
                    row = (_a.sent())[0];
                    return [2 /*return*/, row !== null && row !== void 0 ? row : null];
            }
        });
    });
}
function selectCounterpartyByAlias(db, scope, normalizedAlias) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select({
                        id: schema_1.financeCounterparties.id,
                        tenantId: schema_1.financeCounterparties.tenantId,
                        projectId: schema_1.financeCounterparties.projectId,
                        ownerUserId: schema_1.financeCounterparties.ownerUserId,
                        displayName: schema_1.financeCounterparties.displayName,
                        normalizedName: schema_1.financeCounterparties.normalizedName,
                        usageCount: schema_1.financeCounterparties.usageCount,
                        lastSeenAt: schema_1.financeCounterparties.lastSeenAt,
                        allowedScopes: schema_1.financeCounterparties.allowedScopes,
                        createdAt: schema_1.financeCounterparties.createdAt,
                        updatedAt: schema_1.financeCounterparties.updatedAt,
                    })
                        .from(schema_1.financeCounterpartyAliases)
                        .innerJoin(schema_1.financeCounterparties, (0, drizzle_orm_1.eq)(schema_1.financeCounterpartyAliases.counterpartyId, schema_1.financeCounterparties.id))
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeCounterpartyAliases.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeCounterpartyAliases.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeCounterpartyAliases.ownerUserId, scope.ownerUserId), (0, drizzle_orm_1.eq)(schema_1.financeCounterpartyAliases.normalizedAlias, normalizedAlias)))
                        .limit(1)];
                case 1:
                    row = (_a.sent())[0];
                    return [2 /*return*/, row !== null && row !== void 0 ? row : null];
            }
        });
    });
}
function resolveCounterpartyRecord(db, scope, params) {
    return __awaiter(this, void 0, void 0, function () {
        var directCandidate, inferredCandidate, candidate, normalizedName, existing, _a, updated, aliasRows, resolved, inserted;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    directCandidate = ((_b = params.counterpartyName) === null || _b === void 0 ? void 0 : _b.trim())
                        ? normalizeCounterpartyDisplayName(params.counterpartyName)
                        : null;
                    inferredCandidate = params.allowInference !== false && !directCandidate && params.sourceText
                        ? inferCounterpartyCandidateFromText(params.sourceText, (_c = params.typeHint) !== null && _c !== void 0 ? _c : "expense")
                        : null;
                    candidate = directCandidate !== null && directCandidate !== void 0 ? directCandidate : inferredCandidate;
                    if (!candidate) {
                        return [2 /*return*/, null];
                    }
                    normalizedName = buildCounterpartySearchKey(candidate);
                    if (!normalizedName) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, selectCounterpartyByAlias(db, scope, normalizedName)];
                case 1:
                    if (!((_d = _e.sent()) !== null && _d !== void 0)) return [3 /*break*/, 2];
                    _a = _d;
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, selectCounterpartyByNormalizedName(db, scope, normalizedName)];
                case 3:
                    _a = _e.sent();
                    _e.label = 4;
                case 4:
                    existing = _a;
                    if (!existing) return [3 /*break*/, 7];
                    return [4 /*yield*/, db
                            .update(schema_1.financeCounterparties)
                            .set({
                            usageCount: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.financeCounterparties.usageCount),
                            lastSeenAt: new Date(),
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.financeCounterparties.id, existing.id))
                            .returning()];
                case 5:
                    updated = (_e.sent())[0];
                    return [4 /*yield*/, loadCounterpartyAliases(db, existing.id)];
                case 6:
                    aliasRows = _e.sent();
                    resolved = updated !== null && updated !== void 0 ? updated : existing;
                    return [2 /*return*/, mapCounterpartyRow(resolved, aliasRows)];
                case 7: return [4 /*yield*/, db
                        .insert(schema_1.financeCounterparties)
                        .values({
                        tenantId: scope.tenantId,
                        projectId: scope.projectId,
                        ownerUserId: scope.ownerUserId,
                        displayName: candidate,
                        normalizedName: normalizedName,
                        usageCount: 1,
                        lastSeenAt: new Date(),
                        allowedScopes: scope.allowedScopes,
                    })
                        .returning()];
                case 8:
                    inserted = (_e.sent())[0];
                    if (!inserted) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, db
                            .insert(schema_1.financeCounterpartyAliases)
                            .values({
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            counterpartyId: inserted.id,
                            aliasName: candidate,
                            normalizedAlias: normalizedName,
                            allowedScopes: scope.allowedScopes,
                        })
                            .onConflictDoNothing()];
                case 9:
                    _e.sent();
                    return [2 /*return*/, mapCounterpartyRow(inserted, [candidate])];
            }
        });
    });
}
function mapPaymentInstitutionRow(row, aliases) {
    var _a, _b;
    if (aliases === void 0) { aliases = []; }
    return {
        id: row.id,
        tenantId: row.tenantId,
        projectId: row.projectId,
        ownerUserId: row.ownerUserId,
        kind: row.kind,
        displayName: row.displayName,
        normalizedName: row.normalizedName,
        usageCount: row.usageCount,
        lastSeenAt: (_a = row.lastSeenAt) !== null && _a !== void 0 ? _a : null,
        aliases: aliases,
        allowedScopes: (_b = row.allowedScopes) !== null && _b !== void 0 ? _b : [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function mapPaymentAccountRow(row, aliases) {
    var _a, _b, _c, _d, _e;
    if (aliases === void 0) { aliases = []; }
    return {
        id: row.id,
        tenantId: row.tenantId,
        projectId: row.projectId,
        ownerUserId: row.ownerUserId,
        paymentInstitutionId: row.paymentInstitutionId,
        institutionName: row.institutionName,
        institutionKind: row.institutionKind,
        kind: row.kind,
        nickname: row.nickname,
        normalizedNickname: row.normalizedNickname,
        last4: (_a = row.last4) !== null && _a !== void 0 ? _a : null,
        maskedIdentifier: (_b = row.maskedIdentifier) !== null && _b !== void 0 ? _b : null,
        usageCount: row.usageCount,
        lastSeenAt: (_c = row.lastSeenAt) !== null && _c !== void 0 ? _c : null,
        isPrimary: row.isPrimary,
        archivedAt: (_d = row.archivedAt) !== null && _d !== void 0 ? _d : null,
        aliases: aliases,
        allowedScopes: (_e = row.allowedScopes) !== null && _e !== void 0 ? _e : [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function mapPaymentAccountSuggestion(row, aliases) {
    var _a, _b, _c;
    if (aliases === void 0) { aliases = []; }
    return {
        id: row.id,
        displayLabel: buildPaymentInstrumentDisplayLabel({
            nickname: row.nickname,
            last4: (_a = row.last4) !== null && _a !== void 0 ? _a : null,
            institutionName: row.institutionName,
            kind: row.kind,
        }),
        nickname: row.nickname,
        institutionName: row.institutionName,
        institutionKind: row.institutionKind,
        kind: row.kind,
        last4: (_b = row.last4) !== null && _b !== void 0 ? _b : null,
        maskedIdentifier: (_c = row.maskedIdentifier) !== null && _c !== void 0 ? _c : null,
        usageCount: row.usageCount,
        lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
        aliases: aliases,
        isPrimary: row.isPrimary,
    };
}
function loadPaymentInstitutionAliases(db, institutionId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select({
                        aliasName: schema_1.financePaymentInstitutionAliases.aliasName,
                    })
                        .from(schema_1.financePaymentInstitutionAliases)
                        .where((0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutionAliases.paymentInstitutionId, institutionId))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.financePaymentInstitutionAliases.updatedAt), (0, drizzle_orm_1.desc)(schema_1.financePaymentInstitutionAliases.id))];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows
                            .map(function (row) { return row.aliasName; })
                            .filter(function (alias) { return typeof alias === "string" && alias.trim().length > 0; })];
            }
        });
    });
}
function loadPaymentAccountAliases(db, paymentAccountId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select({
                        aliasName: schema_1.financePaymentAccountAliases.aliasName,
                    })
                        .from(schema_1.financePaymentAccountAliases)
                        .where((0, drizzle_orm_1.eq)(schema_1.financePaymentAccountAliases.paymentAccountId, paymentAccountId))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.financePaymentAccountAliases.updatedAt), (0, drizzle_orm_1.desc)(schema_1.financePaymentAccountAliases.id))];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows
                            .map(function (row) { return row.aliasName; })
                            .filter(function (alias) { return typeof alias === "string" && alias.trim().length > 0; })];
            }
        });
    });
}
function loadPaymentInstitutionAliasesForInstitutions(db, institutionIds) {
    return __awaiter(this, void 0, void 0, function () {
        var rows, aliasesByInstitution, _i, rows_2, row, alias;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (institutionIds.length === 0) {
                        return [2 /*return*/, new Map()];
                    }
                    return [4 /*yield*/, db
                            .select({
                            paymentInstitutionId: schema_1.financePaymentInstitutionAliases.paymentInstitutionId,
                            aliasName: schema_1.financePaymentInstitutionAliases.aliasName,
                        })
                            .from(schema_1.financePaymentInstitutionAliases)
                            .where((0, drizzle_orm_1.inArray)(schema_1.financePaymentInstitutionAliases.paymentInstitutionId, institutionIds))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.financePaymentInstitutionAliases.updatedAt), (0, drizzle_orm_1.desc)(schema_1.financePaymentInstitutionAliases.id))];
                case 1:
                    rows = _b.sent();
                    aliasesByInstitution = new Map();
                    for (_i = 0, rows_2 = rows; _i < rows_2.length; _i++) {
                        row = rows_2[_i];
                        alias = typeof row.aliasName === "string" ? row.aliasName.trim() : "";
                        if (!alias) {
                            continue;
                        }
                        if (!aliasesByInstitution.has(row.paymentInstitutionId)) {
                            aliasesByInstitution.set(row.paymentInstitutionId, []);
                        }
                        (_a = aliasesByInstitution.get(row.paymentInstitutionId)) === null || _a === void 0 ? void 0 : _a.push(alias);
                    }
                    return [2 /*return*/, aliasesByInstitution];
            }
        });
    });
}
function loadPaymentAccountAliasesForAccounts(db, accountIds) {
    return __awaiter(this, void 0, void 0, function () {
        var rows, aliasesByAccount, _i, rows_3, row, alias;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (accountIds.length === 0) {
                        return [2 /*return*/, new Map()];
                    }
                    return [4 /*yield*/, db
                            .select({
                            paymentAccountId: schema_1.financePaymentAccountAliases.paymentAccountId,
                            aliasName: schema_1.financePaymentAccountAliases.aliasName,
                        })
                            .from(schema_1.financePaymentAccountAliases)
                            .where((0, drizzle_orm_1.inArray)(schema_1.financePaymentAccountAliases.paymentAccountId, accountIds))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.financePaymentAccountAliases.updatedAt), (0, drizzle_orm_1.desc)(schema_1.financePaymentAccountAliases.id))];
                case 1:
                    rows = _b.sent();
                    aliasesByAccount = new Map();
                    for (_i = 0, rows_3 = rows; _i < rows_3.length; _i++) {
                        row = rows_3[_i];
                        alias = typeof row.aliasName === "string" ? row.aliasName.trim() : "";
                        if (!alias) {
                            continue;
                        }
                        if (!aliasesByAccount.has(row.paymentAccountId)) {
                            aliasesByAccount.set(row.paymentAccountId, []);
                        }
                        (_a = aliasesByAccount.get(row.paymentAccountId)) === null || _a === void 0 ? void 0 : _a.push(alias);
                    }
                    return [2 /*return*/, aliasesByAccount];
            }
        });
    });
}
function selectPaymentInstitutionByNormalizedName(db, scope, kind, normalizedName) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.financePaymentInstitutions)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.ownerUserId, scope.ownerUserId), (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.kind, kind), (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.normalizedName, normalizedName)))
                        .limit(1)];
                case 1:
                    row = (_a.sent())[0];
                    return [2 /*return*/, row !== null && row !== void 0 ? row : null];
            }
        });
    });
}
function selectPaymentInstitutionByAlias(db, scope, normalizedAlias) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select({
                        id: schema_1.financePaymentInstitutions.id,
                        tenantId: schema_1.financePaymentInstitutions.tenantId,
                        projectId: schema_1.financePaymentInstitutions.projectId,
                        ownerUserId: schema_1.financePaymentInstitutions.ownerUserId,
                        kind: schema_1.financePaymentInstitutions.kind,
                        displayName: schema_1.financePaymentInstitutions.displayName,
                        normalizedName: schema_1.financePaymentInstitutions.normalizedName,
                        usageCount: schema_1.financePaymentInstitutions.usageCount,
                        lastSeenAt: schema_1.financePaymentInstitutions.lastSeenAt,
                        allowedScopes: schema_1.financePaymentInstitutions.allowedScopes,
                        createdAt: schema_1.financePaymentInstitutions.createdAt,
                        updatedAt: schema_1.financePaymentInstitutions.updatedAt,
                    })
                        .from(schema_1.financePaymentInstitutionAliases)
                        .innerJoin(schema_1.financePaymentInstitutions, (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutionAliases.paymentInstitutionId, schema_1.financePaymentInstitutions.id))
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutionAliases.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutionAliases.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutionAliases.ownerUserId, scope.ownerUserId), (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutionAliases.normalizedAlias, normalizedAlias)))
                        .limit(1)];
                case 1:
                    row = (_a.sent())[0];
                    return [2 /*return*/, row !== null && row !== void 0 ? row : null];
            }
        });
    });
}
function selectPaymentAccountByNicknameOrAlias(db, scope, params) {
    return __awaiter(this, void 0, void 0, function () {
        var conditions, searchConditions, aliasExists, filtered;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    conditions = [
                        (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.tenantId, scope.tenantId),
                        (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.projectId, scope.projectId),
                        (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.ownerUserId, scope.ownerUserId),
                    ];
                    if (params.kind) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.kind, params.kind));
                    }
                    if (params.paymentInstitutionId) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.paymentInstitutionId, params.paymentInstitutionId));
                    }
                    searchConditions = [];
                    if (params.normalizedNickname) {
                        searchConditions.push((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.normalizedNickname, params.normalizedNickname));
                    }
                    aliasExists = null;
                    if (params.normalizedAlias) {
                        aliasExists = (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["exists (\n      select 1\n      from finance_payment_account_aliases alias\n      where alias.payment_account_id = ", "\n        and alias.tenant_id = ", "\n        and alias.project_id = ", "\n        and alias.owner_user_id = ", "\n        and alias.normalized_alias = ", "\n    )"], ["exists (\n      select 1\n      from finance_payment_account_aliases alias\n      where alias.payment_account_id = ", "\n        and alias.tenant_id = ", "\n        and alias.project_id = ", "\n        and alias.owner_user_id = ", "\n        and alias.normalized_alias = ", "\n    )"])), schema_1.financePaymentAccounts.id, scope.tenantId, scope.projectId, scope.ownerUserId, params.normalizedAlias);
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.financePaymentAccounts.id,
                            tenantId: schema_1.financePaymentAccounts.tenantId,
                            projectId: schema_1.financePaymentAccounts.projectId,
                            ownerUserId: schema_1.financePaymentAccounts.ownerUserId,
                            paymentInstitutionId: schema_1.financePaymentAccounts.paymentInstitutionId,
                            kind: schema_1.financePaymentAccounts.kind,
                            nickname: schema_1.financePaymentAccounts.nickname,
                            normalizedNickname: schema_1.financePaymentAccounts.normalizedNickname,
                            last4: schema_1.financePaymentAccounts.last4,
                            maskedIdentifier: schema_1.financePaymentAccounts.maskedIdentifier,
                            usageCount: schema_1.financePaymentAccounts.usageCount,
                            lastSeenAt: schema_1.financePaymentAccounts.lastSeenAt,
                            isPrimary: schema_1.financePaymentAccounts.isPrimary,
                            archivedAt: schema_1.financePaymentAccounts.archivedAt,
                            allowedScopes: schema_1.financePaymentAccounts.allowedScopes,
                            createdAt: schema_1.financePaymentAccounts.createdAt,
                            updatedAt: schema_1.financePaymentAccounts.updatedAt,
                            institutionName: schema_1.financePaymentInstitutions.displayName,
                            institutionKind: schema_1.financePaymentInstitutions.kind,
                        })
                            .from(schema_1.financePaymentAccounts)
                            .innerJoin(schema_1.financePaymentInstitutions, (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.paymentInstitutionId, schema_1.financePaymentInstitutions.id))
                            .where(drizzle_orm_1.and.apply(void 0, __spreadArray(__spreadArray(__spreadArray([], conditions, false), (searchConditions.length > 0 ? [drizzle_orm_1.or.apply(void 0, searchConditions)] : []), false), (aliasExists ? [aliasExists] : []), false)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.financePaymentAccounts.isPrimary), (0, drizzle_orm_1.desc)(schema_1.financePaymentAccounts.usageCount), (0, drizzle_orm_1.desc)(schema_1.financePaymentAccounts.lastSeenAt), (0, drizzle_orm_1.desc)(schema_1.financePaymentAccounts.updatedAt), (0, drizzle_orm_1.asc)(schema_1.financePaymentAccounts.nickname), (0, drizzle_orm_1.asc)(schema_1.financePaymentAccounts.id))];
                case 1:
                    filtered = _a.sent();
                    return [2 /*return*/, filtered];
            }
        });
    });
}
function selectPaymentAccountById(db, scope, paymentAccountId) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select({
                        id: schema_1.financePaymentAccounts.id,
                        tenantId: schema_1.financePaymentAccounts.tenantId,
                        projectId: schema_1.financePaymentAccounts.projectId,
                        ownerUserId: schema_1.financePaymentAccounts.ownerUserId,
                        paymentInstitutionId: schema_1.financePaymentAccounts.paymentInstitutionId,
                        kind: schema_1.financePaymentAccounts.kind,
                        nickname: schema_1.financePaymentAccounts.nickname,
                        normalizedNickname: schema_1.financePaymentAccounts.normalizedNickname,
                        last4: schema_1.financePaymentAccounts.last4,
                        maskedIdentifier: schema_1.financePaymentAccounts.maskedIdentifier,
                        usageCount: schema_1.financePaymentAccounts.usageCount,
                        lastSeenAt: schema_1.financePaymentAccounts.lastSeenAt,
                        isPrimary: schema_1.financePaymentAccounts.isPrimary,
                        archivedAt: schema_1.financePaymentAccounts.archivedAt,
                        allowedScopes: schema_1.financePaymentAccounts.allowedScopes,
                        createdAt: schema_1.financePaymentAccounts.createdAt,
                        updatedAt: schema_1.financePaymentAccounts.updatedAt,
                        institutionName: schema_1.financePaymentInstitutions.displayName,
                        institutionKind: schema_1.financePaymentInstitutions.kind,
                    })
                        .from(schema_1.financePaymentAccounts)
                        .innerJoin(schema_1.financePaymentInstitutions, (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.paymentInstitutionId, schema_1.financePaymentInstitutions.id))
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.id, paymentAccountId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.ownerUserId, scope.ownerUserId)))
                        .limit(1)];
                case 1:
                    row = (_a.sent())[0];
                    return [2 /*return*/, row !== null && row !== void 0 ? row : null];
            }
        });
    });
}
function resolvePaymentInstitutionRecord(db, scope, params) {
    return __awaiter(this, void 0, void 0, function () {
        var candidate, kind, normalizedName, existing, _a, updated, aliases, inserted;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    candidate = ((_b = params.displayName) === null || _b === void 0 ? void 0 : _b.trim())
                        ? normalizePaymentInstitutionDisplayName(params.displayName)
                        : null;
                    if (!candidate) {
                        return [2 /*return*/, null];
                    }
                    kind = (_c = params.kind) !== null && _c !== void 0 ? _c : "bank";
                    normalizedName = buildPaymentInstrumentSearchKey(candidate);
                    if (!normalizedName) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, selectPaymentInstitutionByAlias(db, scope, normalizedName)];
                case 1:
                    if (!((_d = _e.sent()) !== null && _d !== void 0)) return [3 /*break*/, 2];
                    _a = _d;
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, selectPaymentInstitutionByNormalizedName(db, scope, kind, normalizedName)];
                case 3:
                    _a = _e.sent();
                    _e.label = 4;
                case 4:
                    existing = _a;
                    if (!existing) return [3 /*break*/, 7];
                    return [4 /*yield*/, db
                            .update(schema_1.financePaymentInstitutions)
                            .set({
                            usageCount: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.financePaymentInstitutions.usageCount),
                            lastSeenAt: new Date(),
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.id, existing.id))
                            .returning()];
                case 5:
                    updated = (_e.sent())[0];
                    return [4 /*yield*/, loadPaymentInstitutionAliases(db, existing.id)];
                case 6:
                    aliases = _e.sent();
                    return [2 /*return*/, mapPaymentInstitutionRow(updated !== null && updated !== void 0 ? updated : existing, aliases)];
                case 7: return [4 /*yield*/, db
                        .insert(schema_1.financePaymentInstitutions)
                        .values({
                        tenantId: scope.tenantId,
                        projectId: scope.projectId,
                        ownerUserId: scope.ownerUserId,
                        kind: kind,
                        displayName: candidate,
                        normalizedName: normalizedName,
                        usageCount: 1,
                        lastSeenAt: new Date(),
                        allowedScopes: scope.allowedScopes,
                    })
                        .returning()];
                case 8:
                    inserted = (_e.sent())[0];
                    if (!inserted) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, db
                            .insert(schema_1.financePaymentInstitutionAliases)
                            .values({
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            paymentInstitutionId: inserted.id,
                            aliasName: candidate,
                            normalizedAlias: normalizedName,
                            allowedScopes: scope.allowedScopes,
                        })
                            .onConflictDoNothing()];
                case 9:
                    _e.sent();
                    return [2 /*return*/, mapPaymentInstitutionRow(inserted, [candidate])];
            }
        });
    });
}
function resolvePaymentAccountRecord(db, scope, params) {
    return __awaiter(this, void 0, void 0, function () {
        var candidateNickname, candidateInstitution, last4, maskedIdentifier, kind, institutionKind, institution, normalizedNickname, normalizedAlias, candidateRows, selected, rows, updated, aliases, resolvedRow;
        var _a, _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    candidateNickname = ((_a = params.nickname) === null || _a === void 0 ? void 0 : _a.trim())
                        ? normalizePaymentAccountNickname(params.nickname)
                        : null;
                    candidateInstitution = ((_b = params.institutionName) === null || _b === void 0 ? void 0 : _b.trim())
                        ? normalizePaymentInstitutionDisplayName(params.institutionName)
                        : null;
                    last4 = normalizePaymentAccountLast4(params.last4);
                    maskedIdentifier = normalizePaymentMaskedIdentifier(params.maskedIdentifier);
                    kind = (_c = params.kind) !== null && _c !== void 0 ? _c : "unknown";
                    institutionKind = (_d = params.institutionKind) !== null && _d !== void 0 ? _d : "bank";
                    if (!candidateNickname && !last4 && !maskedIdentifier && !candidateInstitution) {
                        return [2 /*return*/, null];
                    }
                    institution = null;
                    if (!candidateInstitution) return [3 /*break*/, 2];
                    return [4 /*yield*/, resolvePaymentInstitutionRecord(db, scope, {
                            displayName: candidateInstitution,
                            kind: institutionKind,
                        })];
                case 1:
                    institution = _h.sent();
                    _h.label = 2;
                case 2:
                    normalizedNickname = candidateNickname ? buildPaymentInstrumentSearchKey(candidateNickname) : null;
                    normalizedAlias = normalizedNickname;
                    return [4 /*yield*/, selectPaymentAccountByNicknameOrAlias(db, scope, {
                            kind: kind,
                            paymentInstitutionId: (_e = institution === null || institution === void 0 ? void 0 : institution.id) !== null && _e !== void 0 ? _e : null,
                            normalizedNickname: normalizedNickname,
                            normalizedAlias: normalizedAlias,
                        })];
                case 3:
                    candidateRows = _h.sent();
                    selected = (_f = candidateRows[0]) !== null && _f !== void 0 ? _f : null;
                    if (!(!selected && last4)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.financePaymentAccounts.id,
                            tenantId: schema_1.financePaymentAccounts.tenantId,
                            projectId: schema_1.financePaymentAccounts.projectId,
                            ownerUserId: schema_1.financePaymentAccounts.ownerUserId,
                            paymentInstitutionId: schema_1.financePaymentAccounts.paymentInstitutionId,
                            kind: schema_1.financePaymentAccounts.kind,
                            nickname: schema_1.financePaymentAccounts.nickname,
                            normalizedNickname: schema_1.financePaymentAccounts.normalizedNickname,
                            last4: schema_1.financePaymentAccounts.last4,
                            maskedIdentifier: schema_1.financePaymentAccounts.maskedIdentifier,
                            usageCount: schema_1.financePaymentAccounts.usageCount,
                            lastSeenAt: schema_1.financePaymentAccounts.lastSeenAt,
                            isPrimary: schema_1.financePaymentAccounts.isPrimary,
                            archivedAt: schema_1.financePaymentAccounts.archivedAt,
                            allowedScopes: schema_1.financePaymentAccounts.allowedScopes,
                            createdAt: schema_1.financePaymentAccounts.createdAt,
                            updatedAt: schema_1.financePaymentAccounts.updatedAt,
                            institutionName: schema_1.financePaymentInstitutions.displayName,
                            institutionKind: schema_1.financePaymentInstitutions.kind,
                        })
                            .from(schema_1.financePaymentAccounts)
                            .innerJoin(schema_1.financePaymentInstitutions, (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.paymentInstitutionId, schema_1.financePaymentInstitutions.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.ownerUserId, scope.ownerUserId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.kind, kind), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.last4, last4)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.financePaymentAccounts.isPrimary), (0, drizzle_orm_1.desc)(schema_1.financePaymentAccounts.usageCount), (0, drizzle_orm_1.desc)(schema_1.financePaymentAccounts.lastSeenAt), (0, drizzle_orm_1.asc)(schema_1.financePaymentAccounts.nickname), (0, drizzle_orm_1.asc)(schema_1.financePaymentAccounts.id))];
                case 4:
                    rows = _h.sent();
                    selected = (_g = rows[0]) !== null && _g !== void 0 ? _g : null;
                    _h.label = 5;
                case 5:
                    if (!selected) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.financePaymentAccounts)
                            .set({
                            usageCount: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.financePaymentAccounts.usageCount),
                            lastSeenAt: new Date(),
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.id, selected.id))
                            .returning()];
                case 6:
                    updated = (_h.sent())[0];
                    return [4 /*yield*/, loadPaymentAccountAliases(db, selected.id)];
                case 7:
                    aliases = _h.sent();
                    resolvedRow = updated
                        ? __assign(__assign({}, updated), { institutionName: selected.institutionName, institutionKind: selected.institutionKind }) : selected;
                    return [2 /*return*/, mapPaymentAccountRow(resolvedRow, aliases)];
            }
        });
    });
}
function hydrateStructuredPaymentFields(db_2, scope_1, draft_1) {
    return __awaiter(this, arguments, void 0, function (db, scope, draft, params) {
        var paymentDirection, paymentMethodKind, genericNickname, sourceLabel, destinationLabel, sourceInstrument, _a, _b, destinationInstrument, _c, _d, resolvedSource, resolvedDestination, resolvedAccount;
        var _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23;
        if (params === void 0) { params = {}; }
        return __generator(this, function (_24) {
            switch (_24.label) {
                case 0:
                    paymentDirection = (_e = draft.paymentDirection) !== null && _e !== void 0 ? _e : inferPaymentDirectionFromType(draft.type);
                    paymentMethodKind = (_f = draft.paymentMethodKind) !== null && _f !== void 0 ? _f : inferPaymentMethodKindFromText((_j = (_h = (_g = params.sourceText) !== null && _g !== void 0 ? _g : draft.note) !== null && _h !== void 0 ? _h : draft.counterpartyName) !== null && _j !== void 0 ? _j : "");
                    genericNickname = normalizePaymentAccountNickname((_m = (_l = (_k = draft.paymentAccountNickname) !== null && _k !== void 0 ? _k : draft.paymentSourceLabel) !== null && _l !== void 0 ? _l : draft.paymentDestinationLabel) !== null && _m !== void 0 ? _m : "") || null;
                    sourceLabel = normalizePaymentAccountNickname((_o = draft.paymentSourceLabel) !== null && _o !== void 0 ? _o : (paymentDirection !== "inbound" ? genericNickname !== null && genericNickname !== void 0 ? genericNickname : "" : "")) || null;
                    destinationLabel = normalizePaymentAccountNickname((_p = draft.paymentDestinationLabel) !== null && _p !== void 0 ? _p : (paymentDirection !== "outbound" ? genericNickname !== null && genericNickname !== void 0 ? genericNickname : "" : "")) || null;
                    if (!draft.paymentSourceAccountId) return [3 /*break*/, 2];
                    return [4 /*yield*/, selectPaymentAccountById(db, scope, draft.paymentSourceAccountId)];
                case 1:
                    _a = _24.sent();
                    return [3 /*break*/, 6];
                case 2:
                    if (!(sourceLabel || draft.paymentInstitutionName || draft.paymentAccountLast4)) return [3 /*break*/, 4];
                    return [4 /*yield*/, resolvePaymentAccountRecord(db, scope, {
                            nickname: sourceLabel || genericNickname,
                            last4: (_q = draft.paymentAccountLast4) !== null && _q !== void 0 ? _q : null,
                            maskedIdentifier: (_r = draft.paymentAccountMaskedIdentifier) !== null && _r !== void 0 ? _r : (draft.paymentAccountLast4 ? "\u2022\u2022\u2022\u2022".concat(draft.paymentAccountLast4) : null),
                            institutionName: (_s = draft.paymentInstitutionName) !== null && _s !== void 0 ? _s : null,
                            kind: paymentMethodKind,
                            allowInference: true,
                        })];
                case 3:
                    _b = _24.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _b = null;
                    _24.label = 5;
                case 5:
                    _a = _b;
                    _24.label = 6;
                case 6:
                    sourceInstrument = _a;
                    if (!draft.paymentDestinationAccountId) return [3 /*break*/, 8];
                    return [4 /*yield*/, selectPaymentAccountById(db, scope, draft.paymentDestinationAccountId)];
                case 7:
                    _c = _24.sent();
                    return [3 /*break*/, 12];
                case 8:
                    if (!(destinationLabel || draft.paymentInstitutionName || draft.paymentAccountLast4)) return [3 /*break*/, 10];
                    return [4 /*yield*/, resolvePaymentAccountRecord(db, scope, {
                            nickname: destinationLabel || genericNickname,
                            last4: (_t = draft.paymentAccountLast4) !== null && _t !== void 0 ? _t : null,
                            maskedIdentifier: (_u = draft.paymentAccountMaskedIdentifier) !== null && _u !== void 0 ? _u : (draft.paymentAccountLast4 ? "\u2022\u2022\u2022\u2022".concat(draft.paymentAccountLast4) : null),
                            institutionName: (_v = draft.paymentInstitutionName) !== null && _v !== void 0 ? _v : null,
                            kind: paymentMethodKind,
                            allowInference: true,
                        })];
                case 9:
                    _d = _24.sent();
                    return [3 /*break*/, 11];
                case 10:
                    _d = null;
                    _24.label = 11;
                case 11:
                    _c = _d;
                    _24.label = 12;
                case 12:
                    destinationInstrument = _c;
                    resolvedSource = sourceInstrument && paymentDirection !== "inbound" ? sourceInstrument : null;
                    resolvedDestination = destinationInstrument && paymentDirection !== "outbound" ? destinationInstrument : null;
                    resolvedAccount = (_x = (_w = resolvedSource !== null && resolvedSource !== void 0 ? resolvedSource : resolvedDestination) !== null && _w !== void 0 ? _w : sourceInstrument) !== null && _x !== void 0 ? _x : destinationInstrument;
                    return [2 /*return*/, __assign(__assign({}, draft), { documentRole: (_z = (_y = params.documentRole) !== null && _y !== void 0 ? _y : draft.documentRole) !== null && _z !== void 0 ? _z : null, paymentDirection: paymentDirection, paymentMethodKind: (_0 = resolvedAccount === null || resolvedAccount === void 0 ? void 0 : resolvedAccount.kind) !== null && _0 !== void 0 ? _0 : paymentMethodKind, paymentSourceAccountId: (_2 = (_1 = resolvedSource === null || resolvedSource === void 0 ? void 0 : resolvedSource.id) !== null && _1 !== void 0 ? _1 : draft.paymentSourceAccountId) !== null && _2 !== void 0 ? _2 : null, paymentDestinationAccountId: (_4 = (_3 = resolvedDestination === null || resolvedDestination === void 0 ? void 0 : resolvedDestination.id) !== null && _3 !== void 0 ? _3 : draft.paymentDestinationAccountId) !== null && _4 !== void 0 ? _4 : null, paymentSourceLabel: (_7 = (_6 = (_5 = resolvedSource === null || resolvedSource === void 0 ? void 0 : resolvedSource.nickname) !== null && _5 !== void 0 ? _5 : sourceLabel) !== null && _6 !== void 0 ? _6 : draft.paymentSourceLabel) !== null && _7 !== void 0 ? _7 : null, paymentDestinationLabel: (_10 = (_9 = (_8 = resolvedDestination === null || resolvedDestination === void 0 ? void 0 : resolvedDestination.nickname) !== null && _8 !== void 0 ? _8 : destinationLabel) !== null && _9 !== void 0 ? _9 : draft.paymentDestinationLabel) !== null && _10 !== void 0 ? _10 : null, paymentSourceInstitutionName: (_12 = (_11 = resolvedSource === null || resolvedSource === void 0 ? void 0 : resolvedSource.institutionName) !== null && _11 !== void 0 ? _11 : draft.paymentSourceInstitutionName) !== null && _12 !== void 0 ? _12 : null, paymentDestinationInstitutionName: (_14 = (_13 = resolvedDestination === null || resolvedDestination === void 0 ? void 0 : resolvedDestination.institutionName) !== null && _13 !== void 0 ? _13 : draft.paymentDestinationInstitutionName) !== null && _14 !== void 0 ? _14 : null, paymentInstitutionName: (_16 = (_15 = resolvedAccount === null || resolvedAccount === void 0 ? void 0 : resolvedAccount.institutionName) !== null && _15 !== void 0 ? _15 : draft.paymentInstitutionName) !== null && _16 !== void 0 ? _16 : null, paymentAccountNickname: (_18 = (_17 = resolvedAccount === null || resolvedAccount === void 0 ? void 0 : resolvedAccount.nickname) !== null && _17 !== void 0 ? _17 : draft.paymentAccountNickname) !== null && _18 !== void 0 ? _18 : null, paymentAccountLast4: (_20 = (_19 = resolvedAccount === null || resolvedAccount === void 0 ? void 0 : resolvedAccount.last4) !== null && _19 !== void 0 ? _19 : draft.paymentAccountLast4) !== null && _20 !== void 0 ? _20 : null, paymentAccountMaskedIdentifier: (_22 = (_21 = resolvedAccount === null || resolvedAccount === void 0 ? void 0 : resolvedAccount.maskedIdentifier) !== null && _21 !== void 0 ? _21 : draft.paymentAccountMaskedIdentifier) !== null && _22 !== void 0 ? _22 : null, paymentInstrumentConfidence: Math.max(Number((_23 = draft.paymentInstrumentConfidence) !== null && _23 !== void 0 ? _23 : 0), resolvedAccount ? 0.9 : paymentMethodKind !== "unknown" ? 0.5 : 0.1) })];
            }
        });
    });
}
function selectPaymentInstitutionById(db, scope, paymentInstitutionId) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.financePaymentInstitutions)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.id, paymentInstitutionId), (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.ownerUserId, scope.ownerUserId)))
                        .limit(1)];
                case 1:
                    row = (_a.sent())[0];
                    return [2 /*return*/, row !== null && row !== void 0 ? row : null];
            }
        });
    });
}
function resolvePaymentInstitutionByInput(db, scope, params) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, _a, _b;
        var _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (!params.paymentInstitutionId) return [3 /*break*/, 3];
                    return [4 /*yield*/, selectPaymentInstitutionById(db, scope, params.paymentInstitutionId)];
                case 1:
                    existing = _e.sent();
                    if (!existing) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Payment institution not found" });
                    }
                    _a = mapPaymentInstitutionRow;
                    _b = [existing];
                    return [4 /*yield*/, loadPaymentInstitutionAliases(db, existing.id)];
                case 2: return [2 /*return*/, _a.apply(void 0, _b.concat([_e.sent()]))];
                case 3:
                    if (!((_c = params.paymentInstitutionName) === null || _c === void 0 ? void 0 : _c.trim())) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, resolvePaymentInstitutionRecord(db, scope, {
                            displayName: params.paymentInstitutionName,
                            kind: (_d = params.paymentInstitutionKind) !== null && _d !== void 0 ? _d : "bank",
                        })];
                case 4: return [2 /*return*/, _e.sent()];
            }
        });
    });
}
function listPaymentInstitutions(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, query, normalizedQuery, limit, fetchLimit, conditions, aliasExists, searchCondition, candidateRows, aliasMap, queryKey, filteredRows;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _c.sent();
                    query = normalizeText((_a = input.query) !== null && _a !== void 0 ? _a : "");
                    normalizedQuery = buildPaymentInstrumentSearchKey(query);
                    limit = Math.max(1, Math.min((_b = input.limit) !== null && _b !== void 0 ? _b : 10, 50));
                    fetchLimit = query ? Math.min(Math.max(limit * 5, 25), 100) : limit;
                    conditions = [
                        (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.tenantId, scope.tenantId),
                        (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.projectId, scope.projectId),
                        (0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.ownerUserId, scope.ownerUserId),
                    ];
                    if (input.kind) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financePaymentInstitutions.kind, input.kind));
                    }
                    if (query) {
                        aliasExists = (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["exists (\n      select 1\n      from finance_payment_institution_aliases alias\n      where alias.payment_institution_id = ", "\n        and alias.tenant_id = ", "\n        and alias.project_id = ", "\n        and alias.owner_user_id = ", "\n        and (\n          alias.normalized_alias ilike ", "\n          or alias.alias_name ilike ", "\n        )\n    )"], ["exists (\n      select 1\n      from finance_payment_institution_aliases alias\n      where alias.payment_institution_id = ", "\n        and alias.tenant_id = ", "\n        and alias.project_id = ", "\n        and alias.owner_user_id = ", "\n        and (\n          alias.normalized_alias ilike ", "\n          or alias.alias_name ilike ", "\n        )\n    )"])), schema_1.financePaymentInstitutions.id, scope.tenantId, scope.projectId, scope.ownerUserId, "%".concat(normalizedQuery, "%"), "%".concat(query, "%"));
                        searchCondition = (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.financePaymentInstitutions.displayName, "%".concat(query, "%")), (0, drizzle_orm_1.ilike)(schema_1.financePaymentInstitutions.normalizedName, "%".concat(normalizedQuery, "%")), aliasExists);
                        if (searchCondition) {
                            conditions.push(searchCondition);
                        }
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.financePaymentInstitutions)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.financePaymentInstitutions.usageCount), (0, drizzle_orm_1.desc)(schema_1.financePaymentInstitutions.lastSeenAt), (0, drizzle_orm_1.desc)(schema_1.financePaymentInstitutions.updatedAt), (0, drizzle_orm_1.asc)(schema_1.financePaymentInstitutions.displayName), (0, drizzle_orm_1.asc)(schema_1.financePaymentInstitutions.id))
                            .limit(fetchLimit)];
                case 3:
                    candidateRows = _c.sent();
                    return [4 /*yield*/, loadPaymentInstitutionAliasesForInstitutions(db, candidateRows.map(function (row) { return row.id; }))];
                case 4:
                    aliasMap = _c.sent();
                    queryKey = normalizedQuery;
                    filteredRows = queryKey
                        ? candidateRows.filter(function (row) {
                            var _a;
                            var aliases = (_a = aliasMap.get(row.id)) !== null && _a !== void 0 ? _a : [];
                            var normalizedDisplay = buildPaymentInstrumentSearchKey(row.displayName);
                            return normalizedDisplay.includes(queryKey)
                                || row.normalizedName.includes(queryKey)
                                || aliases.some(function (alias) { return buildPaymentInstrumentSearchKey(alias).includes(queryKey); });
                        })
                        : candidateRows;
                    return [2 /*return*/, filteredRows.slice(0, limit).map(function (row) { var _a; return mapPaymentInstitutionRow(row, (_a = aliasMap.get(row.id)) !== null && _a !== void 0 ? _a : []); })];
            }
        });
    });
}
function listPaymentAccounts(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, query, normalizedQuery, limit, fetchLimit, conditions, aliasExists, searchCondition, candidateRows, aliasMap, queryKey, filteredRows;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _c.sent();
                    query = normalizeText((_a = input.query) !== null && _a !== void 0 ? _a : "");
                    normalizedQuery = buildPaymentInstrumentSearchKey(query);
                    limit = Math.max(1, Math.min((_b = input.limit) !== null && _b !== void 0 ? _b : 10, 50));
                    fetchLimit = query ? Math.min(Math.max(limit * 5, 25), 100) : limit;
                    conditions = [
                        (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.tenantId, scope.tenantId),
                        (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.projectId, scope.projectId),
                        (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.ownerUserId, scope.ownerUserId),
                    ];
                    if (!input.includeArchived) {
                        conditions.push((0, drizzle_orm_1.isNull)(schema_1.financePaymentAccounts.archivedAt));
                    }
                    if (input.kind) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.kind, input.kind));
                    }
                    if (input.paymentInstitutionId) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.paymentInstitutionId, input.paymentInstitutionId));
                    }
                    if (query) {
                        aliasExists = (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["exists (\n      select 1\n      from finance_payment_account_aliases alias\n      where alias.payment_account_id = ", "\n        and alias.tenant_id = ", "\n        and alias.project_id = ", "\n        and alias.owner_user_id = ", "\n        and (\n          alias.normalized_alias ilike ", "\n          or alias.alias_name ilike ", "\n        )\n    )"], ["exists (\n      select 1\n      from finance_payment_account_aliases alias\n      where alias.payment_account_id = ", "\n        and alias.tenant_id = ", "\n        and alias.project_id = ", "\n        and alias.owner_user_id = ", "\n        and (\n          alias.normalized_alias ilike ", "\n          or alias.alias_name ilike ", "\n        )\n    )"])), schema_1.financePaymentAccounts.id, scope.tenantId, scope.projectId, scope.ownerUserId, "%".concat(normalizedQuery, "%"), "%".concat(query, "%"));
                        searchCondition = (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.financePaymentAccounts.nickname, "%".concat(query, "%")), (0, drizzle_orm_1.ilike)(schema_1.financePaymentAccounts.normalizedNickname, "%".concat(normalizedQuery, "%")), (0, drizzle_orm_1.ilike)(schema_1.financePaymentAccounts.last4, "%".concat(normalizedQuery.replace(/\D+/g, ""), "%")), aliasExists);
                        if (searchCondition) {
                            conditions.push(searchCondition);
                        }
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.financePaymentAccounts.id,
                            tenantId: schema_1.financePaymentAccounts.tenantId,
                            projectId: schema_1.financePaymentAccounts.projectId,
                            ownerUserId: schema_1.financePaymentAccounts.ownerUserId,
                            paymentInstitutionId: schema_1.financePaymentAccounts.paymentInstitutionId,
                            kind: schema_1.financePaymentAccounts.kind,
                            nickname: schema_1.financePaymentAccounts.nickname,
                            normalizedNickname: schema_1.financePaymentAccounts.normalizedNickname,
                            last4: schema_1.financePaymentAccounts.last4,
                            maskedIdentifier: schema_1.financePaymentAccounts.maskedIdentifier,
                            usageCount: schema_1.financePaymentAccounts.usageCount,
                            lastSeenAt: schema_1.financePaymentAccounts.lastSeenAt,
                            isPrimary: schema_1.financePaymentAccounts.isPrimary,
                            archivedAt: schema_1.financePaymentAccounts.archivedAt,
                            allowedScopes: schema_1.financePaymentAccounts.allowedScopes,
                            createdAt: schema_1.financePaymentAccounts.createdAt,
                            updatedAt: schema_1.financePaymentAccounts.updatedAt,
                            institutionName: schema_1.financePaymentInstitutions.displayName,
                            institutionKind: schema_1.financePaymentInstitutions.kind,
                        })
                            .from(schema_1.financePaymentAccounts)
                            .innerJoin(schema_1.financePaymentInstitutions, (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.paymentInstitutionId, schema_1.financePaymentInstitutions.id))
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.financePaymentAccounts.isPrimary), (0, drizzle_orm_1.desc)(schema_1.financePaymentAccounts.usageCount), (0, drizzle_orm_1.desc)(schema_1.financePaymentAccounts.lastSeenAt), (0, drizzle_orm_1.desc)(schema_1.financePaymentAccounts.updatedAt), (0, drizzle_orm_1.asc)(schema_1.financePaymentAccounts.nickname), (0, drizzle_orm_1.asc)(schema_1.financePaymentAccounts.id))
                            .limit(fetchLimit)];
                case 3:
                    candidateRows = _c.sent();
                    return [4 /*yield*/, loadPaymentAccountAliasesForAccounts(db, candidateRows.map(function (row) { return row.id; }))];
                case 4:
                    aliasMap = _c.sent();
                    queryKey = normalizedQuery;
                    filteredRows = queryKey
                        ? candidateRows.filter(function (row) {
                            var _a, _b;
                            var aliases = (_a = aliasMap.get(row.id)) !== null && _a !== void 0 ? _a : [];
                            var normalizedDisplay = buildPaymentInstrumentSearchKey(row.nickname);
                            var last4Match = row.last4 ? row.last4.includes(queryKey.replace(/\D+/g, "")) : false;
                            return normalizedDisplay.includes(queryKey)
                                || buildPaymentInstrumentSearchKey(row.institutionName).includes(queryKey)
                                || ((_b = row.maskedIdentifier) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes(queryKey)) === true
                                || last4Match
                                || aliases.some(function (alias) { return buildPaymentInstrumentSearchKey(alias).includes(queryKey); });
                        })
                        : candidateRows;
                    return [2 /*return*/, filteredRows.slice(0, limit).map(function (row) { var _a; return mapPaymentAccountSuggestion(row, (_a = aliasMap.get(row.id)) !== null && _a !== void 0 ? _a : []); })];
            }
        });
    });
}
function upsertPaymentInstitution(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, displayName, kind, aliasCandidates, resolved, _i, aliasCandidates_1, alias, normalizedAlias, refreshed, _a, _b;
        var _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _e.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _e.sent();
                    displayName = normalizePaymentInstitutionDisplayName(input.displayName);
                    if (!displayName) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Payment institution name cannot be empty" });
                    }
                    kind = (_c = input.kind) !== null && _c !== void 0 ? _c : "bank";
                    aliasCandidates = Array.from(new Set(__spreadArray([
                        displayName
                    ], ((_d = input.aliases) !== null && _d !== void 0 ? _d : []).map(function (alias) { return normalizePaymentInstitutionDisplayName(alias); }).filter(Boolean), true)));
                    return [4 /*yield*/, resolvePaymentInstitutionRecord(db, scope, {
                            displayName: displayName,
                            kind: kind,
                        })];
                case 3:
                    resolved = _e.sent();
                    if (!resolved) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create or resolve payment institution" });
                    }
                    _i = 0, aliasCandidates_1 = aliasCandidates;
                    _e.label = 4;
                case 4:
                    if (!(_i < aliasCandidates_1.length)) return [3 /*break*/, 7];
                    alias = aliasCandidates_1[_i];
                    normalizedAlias = buildPaymentInstrumentSearchKey(alias);
                    if (!normalizedAlias) {
                        return [3 /*break*/, 6];
                    }
                    return [4 /*yield*/, db
                            .insert(schema_1.financePaymentInstitutionAliases)
                            .values({
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            paymentInstitutionId: resolved.id,
                            aliasName: alias,
                            normalizedAlias: normalizedAlias,
                            allowedScopes: scope.allowedScopes,
                        })
                            .onConflictDoNothing()];
                case 5:
                    _e.sent();
                    _e.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7: return [4 /*yield*/, selectPaymentInstitutionById(db, scope, resolved.id)];
                case 8:
                    refreshed = _e.sent();
                    _a = mapPaymentInstitutionRow;
                    _b = [refreshed !== null && refreshed !== void 0 ? refreshed : {
                            id: resolved.id,
                            tenantId: resolved.tenantId,
                            projectId: resolved.projectId,
                            ownerUserId: resolved.ownerUserId,
                            kind: resolved.kind,
                            displayName: resolved.displayName,
                            normalizedName: resolved.normalizedName,
                            usageCount: resolved.usageCount,
                            lastSeenAt: resolved.lastSeenAt ? new Date(resolved.lastSeenAt) : null,
                            allowedScopes: resolved.allowedScopes,
                            createdAt: resolved.createdAt,
                            updatedAt: resolved.updatedAt,
                        }];
                    return [4 /*yield*/, loadPaymentInstitutionAliases(db, resolved.id)];
                case 9: return [2 /*return*/, _a.apply(void 0, _b.concat([_e.sent()]))];
            }
        });
    });
}
function upsertPaymentAccount(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, nickname, institution, last4, maskedIdentifier, kind, aliasCandidates, existingRows, existing, byLast4, updated, _i, aliasCandidates_2, alias, normalizedAlias, aliases, resolvedRow, inserted, _a, aliasCandidates_3, alias, normalizedAlias, refreshed, _b, _c;
        var _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        return __generator(this, function (_q) {
            switch (_q.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _q.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _q.sent();
                    nickname = normalizePaymentAccountNickname(input.nickname);
                    if (!nickname) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Payment account nickname cannot be empty" });
                    }
                    return [4 /*yield*/, resolvePaymentInstitutionByInput(db, scope, {
                            paymentInstitutionId: (_d = input.paymentInstitutionId) !== null && _d !== void 0 ? _d : null,
                            paymentInstitutionName: (_e = input.paymentInstitutionName) !== null && _e !== void 0 ? _e : null,
                            paymentInstitutionKind: (_f = input.paymentInstitutionKind) !== null && _f !== void 0 ? _f : null,
                        })];
                case 3:
                    institution = _q.sent();
                    if (!institution) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Payment institution is required" });
                    }
                    last4 = normalizePaymentAccountLast4(input.last4);
                    maskedIdentifier = normalizePaymentMaskedIdentifier(input.maskedIdentifier);
                    kind = input.kind;
                    aliasCandidates = Array.from(new Set(__spreadArray([
                        nickname
                    ], ((_g = input.aliases) !== null && _g !== void 0 ? _g : []).map(function (alias) { return normalizePaymentAccountNickname(alias); }).filter(Boolean), true)));
                    return [4 /*yield*/, selectPaymentAccountByNicknameOrAlias(db, scope, {
                            kind: kind,
                            paymentInstitutionId: institution.id,
                            normalizedNickname: buildPaymentInstrumentSearchKey(nickname),
                            normalizedAlias: buildPaymentInstrumentSearchKey(nickname),
                        })];
                case 4:
                    existingRows = _q.sent();
                    existing = (_h = existingRows[0]) !== null && _h !== void 0 ? _h : null;
                    if (!(!existing && last4)) return [3 /*break*/, 6];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.financePaymentAccounts.id,
                            tenantId: schema_1.financePaymentAccounts.tenantId,
                            projectId: schema_1.financePaymentAccounts.projectId,
                            ownerUserId: schema_1.financePaymentAccounts.ownerUserId,
                            paymentInstitutionId: schema_1.financePaymentAccounts.paymentInstitutionId,
                            kind: schema_1.financePaymentAccounts.kind,
                            nickname: schema_1.financePaymentAccounts.nickname,
                            normalizedNickname: schema_1.financePaymentAccounts.normalizedNickname,
                            last4: schema_1.financePaymentAccounts.last4,
                            maskedIdentifier: schema_1.financePaymentAccounts.maskedIdentifier,
                            usageCount: schema_1.financePaymentAccounts.usageCount,
                            lastSeenAt: schema_1.financePaymentAccounts.lastSeenAt,
                            isPrimary: schema_1.financePaymentAccounts.isPrimary,
                            archivedAt: schema_1.financePaymentAccounts.archivedAt,
                            allowedScopes: schema_1.financePaymentAccounts.allowedScopes,
                            createdAt: schema_1.financePaymentAccounts.createdAt,
                            updatedAt: schema_1.financePaymentAccounts.updatedAt,
                            institutionName: schema_1.financePaymentInstitutions.displayName,
                            institutionKind: schema_1.financePaymentInstitutions.kind,
                        })
                            .from(schema_1.financePaymentAccounts)
                            .innerJoin(schema_1.financePaymentInstitutions, (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.paymentInstitutionId, schema_1.financePaymentInstitutions.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.ownerUserId, scope.ownerUserId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.paymentInstitutionId, institution.id), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.kind, kind), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.last4, last4)))
                            .limit(1)];
                case 5:
                    byLast4 = (_q.sent())[0];
                    existing = byLast4 !== null && byLast4 !== void 0 ? byLast4 : null;
                    _q.label = 6;
                case 6:
                    if (!existing) return [3 /*break*/, 16];
                    return [4 /*yield*/, db
                            .update(schema_1.financePaymentAccounts)
                            .set({
                            nickname: nickname,
                            normalizedNickname: buildPaymentInstrumentSearchKey(nickname),
                            last4: last4,
                            maskedIdentifier: maskedIdentifier,
                            isPrimary: (_j = input.isPrimary) !== null && _j !== void 0 ? _j : existing.isPrimary,
                            archivedAt: (_k = input.archivedAt) !== null && _k !== void 0 ? _k : existing.archivedAt,
                            usageCount: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.financePaymentAccounts.usageCount),
                            lastSeenAt: new Date(),
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.id, existing.id))
                            .returning()];
                case 7:
                    updated = (_q.sent())[0];
                    _i = 0, aliasCandidates_2 = aliasCandidates;
                    _q.label = 8;
                case 8:
                    if (!(_i < aliasCandidates_2.length)) return [3 /*break*/, 11];
                    alias = aliasCandidates_2[_i];
                    normalizedAlias = buildPaymentInstrumentSearchKey(alias);
                    if (!normalizedAlias) {
                        return [3 /*break*/, 10];
                    }
                    return [4 /*yield*/, db
                            .insert(schema_1.financePaymentAccountAliases)
                            .values({
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            paymentAccountId: existing.id,
                            aliasName: alias,
                            normalizedAlias: normalizedAlias,
                            allowedScopes: scope.allowedScopes,
                        })
                            .onConflictDoNothing()];
                case 9:
                    _q.sent();
                    _q.label = 10;
                case 10:
                    _i++;
                    return [3 /*break*/, 8];
                case 11:
                    if (!input.isPrimary) return [3 /*break*/, 14];
                    return [4 /*yield*/, db
                            .update(schema_1.financePaymentAccounts)
                            .set({
                            isPrimary: false,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.ownerUserId, scope.ownerUserId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.paymentInstitutionId, institution.id), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.kind, kind), (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["", " <> ", ""], ["", " <> ", ""])), schema_1.financePaymentAccounts.id, existing.id)))];
                case 12:
                    _q.sent();
                    return [4 /*yield*/, db
                            .update(schema_1.financePaymentAccounts)
                            .set({
                            isPrimary: true,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.id, existing.id))];
                case 13:
                    _q.sent();
                    _q.label = 14;
                case 14: return [4 /*yield*/, loadPaymentAccountAliases(db, existing.id)];
                case 15:
                    aliases = _q.sent();
                    resolvedRow = updated
                        ? __assign(__assign({}, updated), { institutionName: existing.institutionName, institutionKind: existing.institutionKind }) : __assign(__assign({}, existing), { nickname: nickname, normalizedNickname: buildPaymentInstrumentSearchKey(nickname), last4: last4, maskedIdentifier: maskedIdentifier, archivedAt: (_l = input.archivedAt) !== null && _l !== void 0 ? _l : existing.archivedAt, isPrimary: (_m = input.isPrimary) !== null && _m !== void 0 ? _m : existing.isPrimary });
                    return [2 /*return*/, mapPaymentAccountRow(resolvedRow, aliases)];
                case 16: return [4 /*yield*/, db
                        .insert(schema_1.financePaymentAccounts)
                        .values({
                        tenantId: scope.tenantId,
                        projectId: scope.projectId,
                        ownerUserId: scope.ownerUserId,
                        paymentInstitutionId: institution.id,
                        kind: kind,
                        nickname: nickname,
                        normalizedNickname: buildPaymentInstrumentSearchKey(nickname),
                        last4: last4,
                        maskedIdentifier: maskedIdentifier,
                        usageCount: 1,
                        lastSeenAt: new Date(),
                        isPrimary: (_o = input.isPrimary) !== null && _o !== void 0 ? _o : false,
                        archivedAt: (_p = input.archivedAt) !== null && _p !== void 0 ? _p : null,
                        allowedScopes: scope.allowedScopes,
                    })
                        .returning()];
                case 17:
                    inserted = (_q.sent())[0];
                    if (!inserted) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create payment account" });
                    }
                    _a = 0, aliasCandidates_3 = aliasCandidates;
                    _q.label = 18;
                case 18:
                    if (!(_a < aliasCandidates_3.length)) return [3 /*break*/, 21];
                    alias = aliasCandidates_3[_a];
                    normalizedAlias = buildPaymentInstrumentSearchKey(alias);
                    if (!normalizedAlias) {
                        return [3 /*break*/, 20];
                    }
                    return [4 /*yield*/, db
                            .insert(schema_1.financePaymentAccountAliases)
                            .values({
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            paymentAccountId: inserted.id,
                            aliasName: alias,
                            normalizedAlias: normalizedAlias,
                            allowedScopes: scope.allowedScopes,
                        })
                            .onConflictDoNothing()];
                case 19:
                    _q.sent();
                    _q.label = 20;
                case 20:
                    _a++;
                    return [3 /*break*/, 18];
                case 21:
                    if (!input.isPrimary) return [3 /*break*/, 24];
                    return [4 /*yield*/, db
                            .update(schema_1.financePaymentAccounts)
                            .set({
                            isPrimary: false,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.ownerUserId, scope.ownerUserId), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.paymentInstitutionId, institution.id), (0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.kind, kind), (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["", " <> ", ""], ["", " <> ", ""])), schema_1.financePaymentAccounts.id, inserted.id)))];
                case 22:
                    _q.sent();
                    return [4 /*yield*/, db
                            .update(schema_1.financePaymentAccounts)
                            .set({
                            isPrimary: true,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.id, inserted.id))];
                case 23:
                    _q.sent();
                    _q.label = 24;
                case 24: return [4 /*yield*/, selectPaymentAccountById(db, scope, inserted.id)];
                case 25:
                    refreshed = _q.sent();
                    _b = mapPaymentAccountRow;
                    _c = [refreshed !== null && refreshed !== void 0 ? refreshed : __assign(__assign({}, inserted), { institutionName: institution.displayName, institutionKind: institution.kind })];
                    return [4 /*yield*/, loadPaymentAccountAliases(db, inserted.id)];
                case 26: return [2 /*return*/, _b.apply(void 0, _c.concat([_q.sent()]))];
            }
        });
    });
}
function archivePaymentAccount(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, existing, updated, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _c.sent();
                    return [4 /*yield*/, selectPaymentAccountById(db, scope, input.paymentAccountId)];
                case 3:
                    existing = _c.sent();
                    if (!existing) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Payment account not found" });
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.financePaymentAccounts)
                            .set({
                            archivedAt: new Date(),
                            isPrimary: false,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.financePaymentAccounts.id, existing.id))
                            .returning()];
                case 4:
                    updated = (_c.sent())[0];
                    _a = mapPaymentAccountRow;
                    _b = [updated
                            ? __assign(__assign({}, updated), { institutionName: existing.institutionName, institutionKind: existing.institutionKind }) : existing];
                    return [4 /*yield*/, loadPaymentAccountAliases(db, existing.id)];
                case 5: return [2 /*return*/, _a.apply(void 0, _b.concat([_c.sent()]))];
            }
        });
    });
}
function listCounterparties(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, query, normalizedQuery, limit, fetchLimit, conditions, aliasExists, searchCondition, candidateRows, aliasMap, queryKey, filteredRows;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _c.sent();
                    query = normalizeText((_a = input.query) !== null && _a !== void 0 ? _a : "");
                    normalizedQuery = buildCounterpartySearchKey(query);
                    limit = Math.max(1, Math.min((_b = input.limit) !== null && _b !== void 0 ? _b : 10, 50));
                    fetchLimit = query ? Math.min(Math.max(limit * 5, 25), 100) : limit;
                    conditions = [
                        (0, drizzle_orm_1.eq)(schema_1.financeCounterparties.tenantId, scope.tenantId),
                        (0, drizzle_orm_1.eq)(schema_1.financeCounterparties.projectId, scope.projectId),
                        (0, drizzle_orm_1.eq)(schema_1.financeCounterparties.ownerUserId, scope.ownerUserId),
                    ];
                    if (query) {
                        aliasExists = (0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["exists (\n      select 1\n      from finance_counterparty_aliases alias\n      where alias.counterparty_id = ", "\n        and alias.tenant_id = ", "\n        and alias.project_id = ", "\n        and alias.owner_user_id = ", "\n        and (\n          alias.normalized_alias ilike ", "\n          or alias.alias_name ilike ", "\n        )\n    )"], ["exists (\n      select 1\n      from finance_counterparty_aliases alias\n      where alias.counterparty_id = ", "\n        and alias.tenant_id = ", "\n        and alias.project_id = ", "\n        and alias.owner_user_id = ", "\n        and (\n          alias.normalized_alias ilike ", "\n          or alias.alias_name ilike ", "\n        )\n    )"])), schema_1.financeCounterparties.id, scope.tenantId, scope.projectId, scope.ownerUserId, "%".concat(normalizedQuery, "%"), "%".concat(query, "%"));
                        searchCondition = (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.financeCounterparties.displayName, "%".concat(query, "%")), (0, drizzle_orm_1.ilike)(schema_1.financeCounterparties.normalizedName, "%".concat(normalizedQuery, "%")), aliasExists);
                        if (searchCondition) {
                            conditions.push(searchCondition);
                        }
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.financeCounterparties)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.financeCounterparties.usageCount), (0, drizzle_orm_1.desc)(schema_1.financeCounterparties.lastSeenAt), (0, drizzle_orm_1.desc)(schema_1.financeCounterparties.updatedAt), (0, drizzle_orm_1.asc)(schema_1.financeCounterparties.displayName), (0, drizzle_orm_1.asc)(schema_1.financeCounterparties.id))
                            .limit(fetchLimit)];
                case 3:
                    candidateRows = _c.sent();
                    return [4 /*yield*/, loadCounterpartyAliasesForCounterparties(db, candidateRows.map(function (row) { return row.id; }))];
                case 4:
                    aliasMap = _c.sent();
                    queryKey = normalizedQuery;
                    filteredRows = queryKey
                        ? candidateRows.filter(function (row) {
                            var _a;
                            var aliases = (_a = aliasMap.get(row.id)) !== null && _a !== void 0 ? _a : [];
                            var normalizedDisplay = buildCounterpartySearchKey(row.displayName);
                            return normalizedDisplay.includes(queryKey)
                                || row.normalizedName.includes(queryKey)
                                || aliases.some(function (alias) { return buildCounterpartySearchKey(alias).includes(queryKey); });
                        })
                        : candidateRows;
                    return [2 /*return*/, filteredRows
                            .slice(0, limit)
                            .map(function (row) { var _a; return mapCounterpartySuggestion(row, (_a = aliasMap.get(row.id)) !== null && _a !== void 0 ? _a : []); })];
            }
        });
    });
}
function insertDraftWithIdempotency(db, scope, draft) {
    return __awaiter(this, void 0, void 0, function () {
        var inserted, error_1, existing;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 5]);
                    return [4 /*yield*/, db
                            .insert(schema_1.financeDrafts)
                            .values(draft)
                            .returning()];
                case 1:
                    inserted = (_b.sent())[0];
                    if (!inserted) {
                        throw new Error("Draft insert returned no rows");
                    }
                    return [2 /*return*/, mapDraftRow(inserted)];
                case 2:
                    error_1 = _b.sent();
                    if (!((error_1 === null || error_1 === void 0 ? void 0 : error_1.code) === "23505")) return [3 /*break*/, 4];
                    return [4 /*yield*/, selectExistingDraft(db, scope, {
                            idempotencyKey: draft.idempotencyKey,
                            sourceHash: (_a = draft.sourceHash) !== null && _a !== void 0 ? _a : null,
                        })];
                case 3:
                    existing = _b.sent();
                    if (existing) {
                        return [2 /*return*/, existing];
                    }
                    _b.label = 4;
                case 4: throw error_1;
                case 5: return [2 /*return*/];
            }
        });
    });
}
function insertRecurringRuleWithIdempotency(db, scope, rule) {
    return __awaiter(this, void 0, void 0, function () {
        var inserted, error_2, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 5]);
                    return [4 /*yield*/, db
                            .insert(schema_1.financeRecurringRules)
                            .values(rule)
                            .returning()];
                case 1:
                    inserted = (_a.sent())[0];
                    if (!inserted) {
                        throw new Error("Recurring rule insert returned no rows");
                    }
                    return [2 /*return*/, inserted];
                case 2:
                    error_2 = _a.sent();
                    if (!((error_2 === null || error_2 === void 0 ? void 0 : error_2.code) === "23505")) return [3 /*break*/, 4];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.financeRecurringRules)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.idempotencyKey, rule.idempotencyKey), (0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.ownerUserId, scope.ownerUserId)))
                            .limit(1)];
                case 3:
                    existing = (_a.sent())[0];
                    if (existing) {
                        return [2 /*return*/, existing];
                    }
                    _a.label = 4;
                case 4: throw error_2;
                case 5: return [2 /*return*/];
            }
        });
    });
}
function buildListRange(limit, offset) {
    return {
        limit: limit !== null && limit !== void 0 ? limit : 10,
        offset: offset !== null && offset !== void 0 ? offset : 0,
    };
}
function createTransactionFromDraft(db, scope, draft, options) {
    return __awaiter(this, void 0, void 0, function () {
        var transactionIdempotency, existingTransaction, draftPayload, resolvedCounterparty, counterpartyId, counterpartyName, paymentMethodKind, paymentDirection, paymentInstrumentConfidence, insertedTransaction, role;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
        return __generator(this, function (_z) {
            switch (_z.label) {
                case 0:
                    transactionIdempotency = (_a = options.idempotencyKey) !== null && _a !== void 0 ? _a : "finance-confirm:".concat(draft.id);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.financeTransactions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeTransactions.confirmedFromDraftId, draft.id), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.ownerUserId, scope.ownerUserId)))
                            .limit(1)];
                case 1:
                    existingTransaction = (_z.sent())[0];
                    if (existingTransaction) {
                        return [2 /*return*/, existingTransaction];
                    }
                    draftPayload = materializeDraftPayload(draft);
                    resolvedCounterparty = null;
                    if (!!draftPayload.counterpartyId) return [3 /*break*/, 3];
                    return [4 /*yield*/, resolveCounterpartyRecord(db, scope, {
                            counterpartyName: (_c = (_b = draftPayload.counterpartyName) !== null && _b !== void 0 ? _b : draftPayload.merchantName) !== null && _c !== void 0 ? _c : null,
                            sourceText: (_d = draftPayload.note) !== null && _d !== void 0 ? _d : null,
                            typeHint: draft.type,
                            allowInference: false,
                        })];
                case 2:
                    resolvedCounterparty = _z.sent();
                    _z.label = 3;
                case 3:
                    counterpartyId = (_f = (_e = draftPayload.counterpartyId) !== null && _e !== void 0 ? _e : resolvedCounterparty === null || resolvedCounterparty === void 0 ? void 0 : resolvedCounterparty.id) !== null && _f !== void 0 ? _f : null;
                    counterpartyName = (_j = (_h = (_g = resolvedCounterparty === null || resolvedCounterparty === void 0 ? void 0 : resolvedCounterparty.displayName) !== null && _g !== void 0 ? _g : draftPayload.counterpartyName) !== null && _h !== void 0 ? _h : draftPayload.merchantName) !== null && _j !== void 0 ? _j : null;
                    paymentMethodKind = (_k = draftPayload.paymentMethodKind) !== null && _k !== void 0 ? _k : "unknown";
                    paymentDirection = (_l = draftPayload.paymentDirection) !== null && _l !== void 0 ? _l : inferPaymentDirectionFromType(draft.type);
                    paymentInstrumentConfidence = toFinanceConfidenceValue((_m = draftPayload.paymentInstrumentConfidence) !== null && _m !== void 0 ? _m : null);
                    return [4 /*yield*/, db
                            .insert(schema_1.financeTransactions)
                            .values({
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            type: draft.type,
                            status: "confirmed",
                            source: draft.source,
                            amountMinor: draft.amountMinor,
                            currency: draft.currency,
                            occurredAt: new Date(draft.occurredAt),
                            categoryCode: draft.categoryCode,
                            counterpartyId: counterpartyId,
                            counterpartyName: counterpartyName,
                            merchantName: (_o = counterpartyName !== null && counterpartyName !== void 0 ? counterpartyName : draft.merchantName) !== null && _o !== void 0 ? _o : null,
                            note: (_p = draft.note) !== null && _p !== void 0 ? _p : null,
                            paymentSourceAccountId: (_q = draftPayload.paymentSourceAccountId) !== null && _q !== void 0 ? _q : null,
                            paymentDestinationAccountId: (_r = draftPayload.paymentDestinationAccountId) !== null && _r !== void 0 ? _r : null,
                            paymentMethodKind: paymentMethodKind,
                            paymentDirection: paymentDirection,
                            paymentInstrumentConfidence: paymentInstrumentConfidence,
                            confidence: (_s = draft.confidence) !== null && _s !== void 0 ? _s : null,
                            idempotencyKey: transactionIdempotency,
                            sourceHash: (_t = draft.sourceHash) !== null && _t !== void 0 ? _t : null,
                            confirmedFromDraftId: draft.id,
                            recurringRuleId: (_u = draft.recurringRuleId) !== null && _u !== void 0 ? _u : null,
                            sourceMessageId: (_v = draft.sourceMessageId) !== null && _v !== void 0 ? _v : null,
                            sourceLibraryItemId: (_w = draft.sourceLibraryItemId) !== null && _w !== void 0 ? _w : null,
                            confirmedAt: (_x = options.confirmedAt) !== null && _x !== void 0 ? _x : new Date(),
                            confirmedByUserId: options.confirmUserId,
                            allowedScopes: draft.allowedScopes,
                        })
                            .returning()];
                case 4:
                    insertedTransaction = (_z.sent())[0];
                    if (!insertedTransaction) {
                        throw new Error("Transaction insert returned no rows");
                    }
                    if (!draft.sourceLibraryItemId) return [3 /*break*/, 6];
                    role = draftPayload.documentRole
                        ? finance_1.financeDocumentRoleSchema.parse(draftPayload.documentRole)
                        : draft.source === "ocr_document"
                            ? "receipt"
                            : "supporting";
                    return [4 /*yield*/, db
                            .insert(schema_1.financeTransactionDocuments)
                            .values({
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            transactionId: insertedTransaction.id,
                            libraryItemId: draft.sourceLibraryItemId,
                            sourceExtractionId: typeof draftPayload.documentExtractionId === "number"
                                ? draftPayload.documentExtractionId
                                : null,
                            role: role,
                            note: (_y = draft.note) !== null && _y !== void 0 ? _y : null,
                            allowedScopes: draft.allowedScopes,
                        })
                            .onConflictDoNothing()];
                case 5:
                    _z.sent();
                    _z.label = 6;
                case 6: return [4 /*yield*/, db
                        .update(schema_1.financeDrafts)
                        .set({
                        status: "confirmed",
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.financeDrafts.id, draft.id))];
                case 7:
                    _z.sent();
                    return [2 /*return*/, insertedTransaction];
            }
        });
    });
}
function parseTextToDraft(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conversation, scope, normalizedText, normalizedCategoryHint, parsedOccurredAt, resolvedOccurredAt, sourceMessageId, sourceHash, normalizedTypeHint, idempotencyKey, existing, structuredData, usedFallback, structured, error_3, resolvedCounterparty, draftPayload, draftCategoryCode, draft;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33, _34, _35, _36, _37, _38, _39, _40, _41, _42, _43, _44, _45, _46, _47, _48, _49, _50, _51, _52, _53, _54, _55, _56, _57;
        return __generator(this, function (_58) {
            switch (_58.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _58.sent();
                    ensureDb(db);
                    return [4 /*yield*/, (0, chatService_1.getConversationById)(input.conversationId, input.userId)];
                case 2:
                    conversation = _58.sent();
                    if (!conversation) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
                    }
                    scope = buildScopeFromConversation(conversation, input.userId, input.tenantId);
                    normalizedText = normalizeText(input.text);
                    if (!normalizedText) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Finance text cannot be empty" });
                    }
                    normalizedCategoryHint = normalizeText((_a = input.categoryHint) !== null && _a !== void 0 ? _a : "");
                    parsedOccurredAt = input.occurredAt ? new Date(input.occurredAt) : null;
                    resolvedOccurredAt = parsedOccurredAt && Number.isFinite(parsedOccurredAt.getTime())
                        ? parsedOccurredAt.toISOString()
                        : null;
                    sourceMessageId = (_b = input.sourceMessageId) !== null && _b !== void 0 ? _b : null;
                    sourceHash = computeBaseSourceHash([
                        scope.tenantId,
                        scope.projectId,
                        scope.ownerUserId,
                        "chat_text",
                        normalizedText,
                        resolvedOccurredAt !== null && resolvedOccurredAt !== void 0 ? resolvedOccurredAt : "",
                    ]);
                    normalizedTypeHint = input.typeHint && input.typeHint !== "transfer"
                        ? input.typeHint
                        : (_c = input.typeHint) !== null && _c !== void 0 ? _c : null;
                    idempotencyKey = (_d = input.idempotencyKey) !== null && _d !== void 0 ? _d : toIdempotencyKey("finance-draft-text", [
                        scope.tenantId,
                        scope.projectId,
                        scope.ownerUserId,
                        sourceMessageId !== null && sourceMessageId !== void 0 ? sourceMessageId : sourceHash,
                        sourceHash,
                        resolvedOccurredAt !== null && resolvedOccurredAt !== void 0 ? resolvedOccurredAt : "",
                    ]);
                    return [4 /*yield*/, selectExistingDraft(db, scope, {
                            idempotencyKey: idempotencyKey,
                            sourceHash: sourceHash,
                        })];
                case 3:
                    existing = _58.sent();
                    if (existing) {
                        return [2 /*return*/, existing];
                    }
                    usedFallback = false;
                    _58.label = 4;
                case 4:
                    _58.trys.push([4, 7, , 9]);
                    return [4 /*yield*/, (0, callLLMStructured_1.callLLMStructured)({
                            systemPrompt: [
                                "You extract a single finance transaction draft from user text.",
                                "Do not change the tenant, project, or owner.",
                                resolvedOccurredAt
                                    ? "The user has already selected the transaction timestamp. Use it unless the text explicitly conflicts: ".concat(resolvedOccurredAt, ".")
                                    : "If the text includes a clear date or time, use it. Otherwise infer the best timestamp from the current context.",
                                normalizedTypeHint
                                    ? "The user provided a type hint. Prefer it when the text is ambiguous: ".concat(normalizedTypeHint, ".")
                                    : "Infer the transaction type from context. If the text is clearly about income, expense, or transfer, choose the closest type.",
                                normalizedCategoryHint
                                    ? "A user-provided category hint is available. Prefer it when the text is ambiguous: ".concat(normalizedCategoryHint, ".")
                                    : "Use the most specific categoryCode that matches the text. If the category is unclear, choose a useful custom categoryCode and set needsClarification when needed.",
                                input.paymentSourceAccountId || input.paymentDestinationAccountId || input.paymentAccountNickname || input.paymentInstitutionName
                                    ? "The user already selected a payment account/card. Preserve the selected payment instrument fields when they are provided."
                                    : "If the text mentions a bank account or card used to pay or receive money, fill payment fields with the canonical account nickname, institution name, and last4 when visible.",
                                "When a transfer slip shows different banks for sender and receiver, keep paymentSourceInstitutionName and paymentDestinationInstitutionName separate instead of collapsing them into one institution field.",
                                "If the text looks like a transfer slip, set documentRole to transfer_slip and preserve both source and destination payment hints when available.",
                                "If the text mentions who was paid or who paid the user, set counterpartyName to that person or organization.",
                                "If a merchant or business name is visible, use that as counterpartyName / merchantName instead of inventing a new label.",
                                "Return only valid JSON matching the schema.",
                                "Use missingFields and needsClarification when the user text does not provide enough detail.",
                            ].join("\n"),
                            userMessage: JSON.stringify({
                                tenantId: scope.tenantId,
                                projectId: scope.projectId,
                                personal: scope.personal,
                                text: normalizedText,
                                occurredAt: resolvedOccurredAt,
                                typeHint: normalizedTypeHint,
                                categoryHint: normalizedCategoryHint || null,
                                sourceMessageId: sourceMessageId,
                                paymentMethodKind: (_e = input.paymentMethodKind) !== null && _e !== void 0 ? _e : null,
                                paymentDirection: (_f = input.paymentDirection) !== null && _f !== void 0 ? _f : null,
                                paymentSourceAccountId: (_g = input.paymentSourceAccountId) !== null && _g !== void 0 ? _g : null,
                                paymentDestinationAccountId: (_h = input.paymentDestinationAccountId) !== null && _h !== void 0 ? _h : null,
                                paymentSourceLabel: (_j = input.paymentSourceLabel) !== null && _j !== void 0 ? _j : null,
                                paymentDestinationLabel: (_k = input.paymentDestinationLabel) !== null && _k !== void 0 ? _k : null,
                                paymentSourceInstitutionName: (_l = input.paymentSourceInstitutionName) !== null && _l !== void 0 ? _l : null,
                                paymentDestinationInstitutionName: (_m = input.paymentDestinationInstitutionName) !== null && _m !== void 0 ? _m : null,
                                paymentInstitutionName: (_o = input.paymentInstitutionName) !== null && _o !== void 0 ? _o : null,
                                paymentAccountNickname: (_p = input.paymentAccountNickname) !== null && _p !== void 0 ? _p : null,
                                paymentAccountLast4: (_q = input.paymentAccountLast4) !== null && _q !== void 0 ? _q : null,
                                paymentAccountMaskedIdentifier: (_r = input.paymentAccountMaskedIdentifier) !== null && _r !== void 0 ? _r : null,
                                paymentInstrumentConfidence: (_s = input.paymentInstrumentConfidence) !== null && _s !== void 0 ? _s : null,
                            }),
                            zodSchema: finance_1.financeStructuredDraftSchema,
                            userId: input.userId,
                            tenantId: scope.tenantId,
                            maxRetries: 0,
                            billingDescription: "finance_text_to_draft",
                            billingMetadata: {
                                domain: "finance",
                                source: "chat_text",
                                conversationId: input.conversationId,
                            },
                            model: input.model,
                        })];
                case 5:
                    structured = _58.sent();
                    structuredData = structured.data;
                    if (resolvedOccurredAt) {
                        structuredData = __assign(__assign({}, structuredData), { occurredAt: resolvedOccurredAt });
                    }
                    return [4 /*yield*/, hydrateStructuredPaymentFields(db, scope, __assign(__assign({}, structuredData), { paymentMethodKind: (_u = (_t = input.paymentMethodKind) !== null && _t !== void 0 ? _t : structuredData.paymentMethodKind) !== null && _u !== void 0 ? _u : null, paymentDirection: (_w = (_v = input.paymentDirection) !== null && _v !== void 0 ? _v : structuredData.paymentDirection) !== null && _w !== void 0 ? _w : null, paymentSourceAccountId: (_y = (_x = input.paymentSourceAccountId) !== null && _x !== void 0 ? _x : structuredData.paymentSourceAccountId) !== null && _y !== void 0 ? _y : null, paymentDestinationAccountId: (_0 = (_z = input.paymentDestinationAccountId) !== null && _z !== void 0 ? _z : structuredData.paymentDestinationAccountId) !== null && _0 !== void 0 ? _0 : null, paymentSourceLabel: (_2 = (_1 = input.paymentSourceLabel) !== null && _1 !== void 0 ? _1 : structuredData.paymentSourceLabel) !== null && _2 !== void 0 ? _2 : null, paymentDestinationLabel: (_4 = (_3 = input.paymentDestinationLabel) !== null && _3 !== void 0 ? _3 : structuredData.paymentDestinationLabel) !== null && _4 !== void 0 ? _4 : null, paymentSourceInstitutionName: (_6 = (_5 = input.paymentSourceInstitutionName) !== null && _5 !== void 0 ? _5 : structuredData.paymentSourceInstitutionName) !== null && _6 !== void 0 ? _6 : null, paymentDestinationInstitutionName: (_8 = (_7 = input.paymentDestinationInstitutionName) !== null && _7 !== void 0 ? _7 : structuredData.paymentDestinationInstitutionName) !== null && _8 !== void 0 ? _8 : null, paymentInstitutionName: (_10 = (_9 = input.paymentInstitutionName) !== null && _9 !== void 0 ? _9 : structuredData.paymentInstitutionName) !== null && _10 !== void 0 ? _10 : null, paymentAccountNickname: (_12 = (_11 = input.paymentAccountNickname) !== null && _11 !== void 0 ? _11 : structuredData.paymentAccountNickname) !== null && _12 !== void 0 ? _12 : null, paymentAccountLast4: (_14 = (_13 = input.paymentAccountLast4) !== null && _13 !== void 0 ? _13 : structuredData.paymentAccountLast4) !== null && _14 !== void 0 ? _14 : null, paymentAccountMaskedIdentifier: (_16 = (_15 = input.paymentAccountMaskedIdentifier) !== null && _15 !== void 0 ? _15 : structuredData.paymentAccountMaskedIdentifier) !== null && _16 !== void 0 ? _16 : null, paymentInstrumentConfidence: (_18 = (_17 = input.paymentInstrumentConfidence) !== null && _17 !== void 0 ? _17 : structuredData.paymentInstrumentConfidence) !== null && _18 !== void 0 ? _18 : null }), {
                            sourceText: normalizedText,
                            documentRole: inferDocumentRoleFromText(normalizedText),
                        })];
                case 6:
                    structuredData = _58.sent();
                    return [3 /*break*/, 9];
                case 7:
                    error_3 = _58.sent();
                    usedFallback = true;
                    structuredData = buildFinanceStructuredDraftFromText({
                        text: normalizedText,
                        typeHint: normalizedTypeHint,
                        categoryHint: normalizedCategoryHint || null,
                        counterpartyHint: (_19 = input.counterpartyName) !== null && _19 !== void 0 ? _19 : null,
                        occurredAt: resolvedOccurredAt,
                        captureIntent: null,
                    });
                    return [4 /*yield*/, hydrateStructuredPaymentFields(db, scope, __assign(__assign({}, structuredData), { paymentMethodKind: (_21 = (_20 = input.paymentMethodKind) !== null && _20 !== void 0 ? _20 : structuredData.paymentMethodKind) !== null && _21 !== void 0 ? _21 : null, paymentDirection: (_23 = (_22 = input.paymentDirection) !== null && _22 !== void 0 ? _22 : structuredData.paymentDirection) !== null && _23 !== void 0 ? _23 : null, paymentSourceAccountId: (_25 = (_24 = input.paymentSourceAccountId) !== null && _24 !== void 0 ? _24 : structuredData.paymentSourceAccountId) !== null && _25 !== void 0 ? _25 : null, paymentDestinationAccountId: (_27 = (_26 = input.paymentDestinationAccountId) !== null && _26 !== void 0 ? _26 : structuredData.paymentDestinationAccountId) !== null && _27 !== void 0 ? _27 : null, paymentSourceLabel: (_29 = (_28 = input.paymentSourceLabel) !== null && _28 !== void 0 ? _28 : structuredData.paymentSourceLabel) !== null && _29 !== void 0 ? _29 : null, paymentDestinationLabel: (_31 = (_30 = input.paymentDestinationLabel) !== null && _30 !== void 0 ? _30 : structuredData.paymentDestinationLabel) !== null && _31 !== void 0 ? _31 : null, paymentSourceInstitutionName: (_33 = (_32 = input.paymentSourceInstitutionName) !== null && _32 !== void 0 ? _32 : structuredData.paymentSourceInstitutionName) !== null && _33 !== void 0 ? _33 : null, paymentDestinationInstitutionName: (_35 = (_34 = input.paymentDestinationInstitutionName) !== null && _34 !== void 0 ? _34 : structuredData.paymentDestinationInstitutionName) !== null && _35 !== void 0 ? _35 : null, paymentInstitutionName: (_37 = (_36 = input.paymentInstitutionName) !== null && _36 !== void 0 ? _36 : structuredData.paymentInstitutionName) !== null && _37 !== void 0 ? _37 : null, paymentAccountNickname: (_39 = (_38 = input.paymentAccountNickname) !== null && _38 !== void 0 ? _38 : structuredData.paymentAccountNickname) !== null && _39 !== void 0 ? _39 : null, paymentAccountLast4: (_41 = (_40 = input.paymentAccountLast4) !== null && _40 !== void 0 ? _40 : structuredData.paymentAccountLast4) !== null && _41 !== void 0 ? _41 : null, paymentAccountMaskedIdentifier: (_43 = (_42 = input.paymentAccountMaskedIdentifier) !== null && _42 !== void 0 ? _42 : structuredData.paymentAccountMaskedIdentifier) !== null && _43 !== void 0 ? _43 : null, paymentInstrumentConfidence: (_45 = (_44 = input.paymentInstrumentConfidence) !== null && _44 !== void 0 ? _44 : structuredData.paymentInstrumentConfidence) !== null && _45 !== void 0 ? _45 : null }), {
                            sourceText: normalizedText,
                            documentRole: inferDocumentRoleFromText(normalizedText),
                        })];
                case 8:
                    structuredData = _58.sent();
                    auditLogger_1.auditLogger.log({
                        eventType: "orchestration_fallback",
                        userId: input.userId,
                        tenantId: scope.tenantId,
                        metadata: {
                            domain: "finance",
                            source: "chat_text",
                            conversationId: input.conversationId,
                            reason: error_3 instanceof Error ? error_3.message : "structured_llm_failed",
                        },
                    });
                    return [3 /*break*/, 9];
                case 9: return [4 /*yield*/, resolveCounterpartyRecord(db, scope, {
                        counterpartyName: (_48 = (_47 = (_46 = input.counterpartyName) !== null && _46 !== void 0 ? _46 : structuredData.counterpartyName) !== null && _47 !== void 0 ? _47 : structuredData.merchantName) !== null && _48 !== void 0 ? _48 : null,
                        sourceText: normalizedText,
                        typeHint: structuredData.type,
                        allowInference: true,
                    })];
                case 10:
                    resolvedCounterparty = _58.sent();
                    if (resolvedCounterparty) {
                        structuredData = __assign(__assign({}, structuredData), { counterpartyName: resolvedCounterparty.displayName, merchantName: resolvedCounterparty.displayName });
                    }
                    structuredData = __assign(__assign({}, structuredData), { missingFields: normalizeStructuredDraftMissingFields(structuredData) });
                    draftPayload = buildDraftClarificationPayload(structuredData, {
                        sourceKind: "chat_text",
                        sourceMessageId: sourceMessageId,
                        sourceHash: sourceHash,
                    });
                    draftCategoryCode = normalizedCategoryHint || structuredData.categoryCode;
                    return [4 /*yield*/, insertDraftWithIdempotency(db, scope, {
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            type: structuredData.type,
                            status: "draft",
                            source: "chat_text",
                            idempotencyKey: idempotencyKey,
                            sourceHash: sourceHash,
                            payloadJson: __assign(__assign({}, draftPayload), { categoryCode: draftCategoryCode, counterpartyName: (_50 = (_49 = structuredData.counterpartyName) !== null && _49 !== void 0 ? _49 : structuredData.merchantName) !== null && _50 !== void 0 ? _50 : null, counterpartyId: (_52 = (_51 = resolvedCounterparty === null || resolvedCounterparty === void 0 ? void 0 : resolvedCounterparty.id) !== null && _51 !== void 0 ? _51 : draftPayload.counterpartyId) !== null && _52 !== void 0 ? _52 : null, merchantName: (_55 = (_54 = (_53 = resolvedCounterparty === null || resolvedCounterparty === void 0 ? void 0 : resolvedCounterparty.displayName) !== null && _53 !== void 0 ? _53 : structuredData.merchantName) !== null && _54 !== void 0 ? _54 : structuredData.counterpartyName) !== null && _55 !== void 0 ? _55 : null, version: 1 }),
                            missingFields: (_56 = structuredData.missingFields) !== null && _56 !== void 0 ? _56 : [],
                            confidence: toFinanceConfidenceValue(structuredData.confidence),
                            needsClarification: structuredData.needsClarification,
                            clarificationPrompt: buildClarificationPrompt((_57 = structuredData.missingFields) !== null && _57 !== void 0 ? _57 : []),
                            sourceMessageId: sourceMessageId,
                            sourceLibraryItemId: null,
                            recurringRuleId: null,
                            expiresAt: new Date(Date.now() + 30 * 86400000),
                            allowedScopes: scope.allowedScopes,
                        })];
                case 11:
                    draft = _58.sent();
                    auditLogger_1.auditLogger.log({
                        eventType: "finance_draft_created",
                        userId: input.userId,
                        tenantId: scope.tenantId,
                        metadata: {
                            conversationId: input.conversationId,
                            source: "chat_text",
                            draftId: draft.id,
                            needsClarification: draft.needsClarification,
                            usedFallback: usedFallback,
                        },
                    });
                    return [2 /*return*/, draft];
            }
        });
    });
}
function parseDocumentToDraft(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, extraction, scope, existingDraft, extracted, hydratedExtracted, normalizedHydratedExtracted, resolvedCounterparty, normalizedCounterpartyName, draftPayload, sourceLibraryItem, draft;
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        return __generator(this, function (_s) {
            switch (_s.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _s.sent();
                    ensureDb(db);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.documentExtractions)
                            .where((0, drizzle_orm_1.eq)(schema_1.documentExtractions.id, input.documentExtractionId))
                            .limit(1)];
                case 2:
                    extraction = (_s.sent())[0];
                    if (!extraction) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Document extraction not found" });
                    }
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: (_a = input.tenantId) !== null && _a !== void 0 ? _a : extraction.tenantId,
                        })];
                case 3:
                    scope = _s.sent();
                    if (extraction.tenantId !== scope.tenantId
                        || extraction.projectId !== scope.projectId
                        || extraction.ownerUserId !== scope.ownerUserId) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Document extraction is outside the active finance scope",
                        });
                    }
                    if (!extraction.financeDraftId) return [3 /*break*/, 5];
                    return [4 /*yield*/, selectExistingDraft(db, scope, {
                            idempotencyKey: "finance-draft-doc:".concat(extraction.id),
                            draftId: extraction.financeDraftId,
                            sourceHash: (_b = extraction.sourceHash) !== null && _b !== void 0 ? _b : extraction.fileHash,
                        })];
                case 4:
                    existingDraft = _s.sent();
                    if (existingDraft) {
                        return [2 /*return*/, existingDraft];
                    }
                    _s.label = 5;
                case 5:
                    extracted = finance_1.financeStructuredDraftSchema.parse(__assign(__assign({}, extraction.extractedJson), { sourceMessageId: (_c = extraction.sourceMessageId) !== null && _c !== void 0 ? _c : null, sourceLibraryItemId: extraction.libraryItemId }));
                    return [4 /*yield*/, hydrateStructuredPaymentFields(db, scope, extracted, {
                            sourceText: extraction.ocrText,
                            documentRole: normalizeDocumentRole(typeof ((_d = extraction.extractedJson) === null || _d === void 0 ? void 0 : _d.documentRole) === "string"
                                ? extraction.extractedJson.documentRole
                                : typeof ((_e = extraction.ocrJson) === null || _e === void 0 ? void 0 : _e.document_role) === "string"
                                    ? extraction.ocrJson.document_role
                                    : typeof ((_f = extraction.ocrJson) === null || _f === void 0 ? void 0 : _f.documentRole) === "string"
                                        ? extraction.ocrJson.documentRole
                                        : null),
                        })];
                case 6:
                    hydratedExtracted = _s.sent();
                    return [4 /*yield*/, resolveCounterpartyRecord(db, scope, {
                            counterpartyName: (_j = (_h = (_g = input.counterpartyName) !== null && _g !== void 0 ? _g : hydratedExtracted.counterpartyName) !== null && _h !== void 0 ? _h : hydratedExtracted.merchantName) !== null && _j !== void 0 ? _j : null,
                            sourceText: extraction.ocrText,
                            typeHint: hydratedExtracted.type,
                            allowInference: true,
                        })];
                case 7:
                    resolvedCounterparty = _s.sent();
                    normalizedCounterpartyName = (_k = resolvedCounterparty === null || resolvedCounterparty === void 0 ? void 0 : resolvedCounterparty.displayName) !== null && _k !== void 0 ? _k : (normalizeCounterpartyDisplayName((_p = (_o = (_m = (_l = input.counterpartyName) !== null && _l !== void 0 ? _l : hydratedExtracted.counterpartyName) !== null && _m !== void 0 ? _m : hydratedExtracted.merchantName) !== null && _o !== void 0 ? _o : inferCounterpartyCandidateFromText(extraction.ocrText, hydratedExtracted.type)) !== null && _p !== void 0 ? _p : "") || null);
                    normalizedHydratedExtracted = __assign(__assign({}, hydratedExtracted), { missingFields: normalizeStructuredDraftMissingFields(hydratedExtracted) });
                    draftPayload = buildDraftClarificationPayload(normalizedHydratedExtracted, {
                        sourceKind: "ocr_document",
                        sourceMessageId: (_q = extraction.sourceMessageId) !== null && _q !== void 0 ? _q : null,
                        sourceLibraryItemId: extraction.libraryItemId,
                        sourceHash: (_r = extraction.sourceHash) !== null && _r !== void 0 ? _r : extraction.fileHash,
                        documentExtractionId: extraction.id,
                    });
                    return [4 /*yield*/, (0, libraryService_1.getLibraryItemById)(extraction.libraryItemId, {
                            userId: input.userId,
                            tenantId: scope.tenantId,
                            role: null,
                            privateVaultUnlocked: false,
                        }, db)];
                case 8:
                    sourceLibraryItem = _s.sent();
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var created;
                            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
                            return __generator(this, function (_k) {
                                switch (_k.label) {
                                    case 0: return [4 /*yield*/, insertDraftWithIdempotency(tx, scope, {
                                            tenantId: scope.tenantId,
                                            projectId: scope.projectId,
                                            ownerUserId: scope.ownerUserId,
                                            type: extracted.type,
                                            status: "draft",
                                            source: "ocr_document",
                                            idempotencyKey: (_a = input.idempotencyKey) !== null && _a !== void 0 ? _a : "finance-draft-doc:".concat(extraction.id),
                                            sourceHash: (_b = extraction.sourceHash) !== null && _b !== void 0 ? _b : extraction.fileHash,
                                            payloadJson: __assign(__assign({}, draftPayload), { version: 1, counterpartyName: normalizedCounterpartyName, counterpartyId: (_d = (_c = resolvedCounterparty === null || resolvedCounterparty === void 0 ? void 0 : resolvedCounterparty.id) !== null && _c !== void 0 ? _c : draftPayload.counterpartyId) !== null && _d !== void 0 ? _d : null, merchantName: normalizedCounterpartyName, sourceUrl: (_e = sourceLibraryItem === null || sourceLibraryItem === void 0 ? void 0 : sourceLibraryItem.sourceUrl) !== null && _e !== void 0 ? _e : null, sourceFileName: (_f = sourceLibraryItem === null || sourceLibraryItem === void 0 ? void 0 : sourceLibraryItem.title) !== null && _f !== void 0 ? _f : null }),
                                            missingFields: (_g = normalizedHydratedExtracted.missingFields) !== null && _g !== void 0 ? _g : [],
                                            confidence: toFinanceConfidenceValue(normalizedHydratedExtracted.confidence),
                                            needsClarification: normalizedHydratedExtracted.needsClarification,
                                            clarificationPrompt: buildClarificationPrompt((_h = normalizedHydratedExtracted.missingFields) !== null && _h !== void 0 ? _h : []),
                                            sourceMessageId: (_j = extraction.sourceMessageId) !== null && _j !== void 0 ? _j : null,
                                            sourceLibraryItemId: extraction.libraryItemId,
                                            recurringRuleId: null,
                                            expiresAt: new Date(Date.now() + 30 * 86400000),
                                            allowedScopes: scope.allowedScopes,
                                        })];
                                    case 1:
                                        created = _k.sent();
                                        return [4 /*yield*/, tx
                                                .update(schema_1.documentExtractions)
                                                .set({
                                                financeDraftId: created.id,
                                                updatedAt: new Date(),
                                            })
                                                .where((0, drizzle_orm_1.eq)(schema_1.documentExtractions.id, extraction.id))];
                                    case 2:
                                        _k.sent();
                                        return [2 /*return*/, created];
                                }
                            });
                        }); })];
                case 9:
                    draft = _s.sent();
                    auditLogger_1.auditLogger.log({
                        eventType: "finance_draft_created",
                        userId: input.userId,
                        tenantId: scope.tenantId,
                        metadata: {
                            conversationId: input.conversationId,
                            source: "ocr_document",
                            draftId: draft.id,
                            documentExtractionId: extraction.id,
                        },
                    });
                    return [2 /*return*/, draft];
            }
        });
    });
}
function updateDraft(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, draft, patch, nextVersion, mergedDraftForResolution, hydratedDraft, resolvedCounterparty, _a, canonicalCounterpartyName, nextPayload, updated;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2;
        return __generator(this, function (_3) {
            switch (_3.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _3.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _3.sent();
                    return [4 /*yield*/, ensureDraftOwnership(db, scope, input.draftId)];
                case 3:
                    draft = _3.sent();
                    if (draft.status !== "draft") {
                        throw new server_1.TRPCError({ code: "CONFLICT", message: "Draft is no longer editable" });
                    }
                    if (draft.version !== input.expectedVersion) {
                        throw new server_1.TRPCError({
                            code: "CONFLICT",
                            message: "Draft version mismatch (expected ".concat(input.expectedVersion, ", found ").concat(draft.version, ")"),
                        });
                    }
                    patch = draftPatchSchema.parse(input.patch);
                    nextVersion = draft.version + 1;
                    mergedDraftForResolution = finance_1.financeStructuredDraftSchema.parse(__assign(__assign(__assign({}, materializeDraftPayload(draft)), patch), { type: (_b = patch.type) !== null && _b !== void 0 ? _b : draft.type, confidence: toFinanceConfidenceNumber((_c = patch.confidence) !== null && _c !== void 0 ? _c : draft.confidence), needsClarification: (_d = patch.needsClarification) !== null && _d !== void 0 ? _d : draft.needsClarification, missingFields: (_e = patch.missingFields) !== null && _e !== void 0 ? _e : draft.missingFields, sourceMessageId: draft.sourceMessageId, sourceLibraryItemId: draft.sourceLibraryItemId, recurringRuleId: draft.recurringRuleId }));
                    return [4 /*yield*/, hydrateStructuredPaymentFields(db, scope, mergedDraftForResolution, {
                            sourceText: (_g = (_f = patch.note) !== null && _f !== void 0 ? _f : draft.note) !== null && _g !== void 0 ? _g : null,
                            documentRole: (_h = mergedDraftForResolution.documentRole) !== null && _h !== void 0 ? _h : null,
                        })];
                case 4:
                    hydratedDraft = _3.sent();
                    if (!(patch.counterpartyName || patch.merchantName)) return [3 /*break*/, 6];
                    return [4 /*yield*/, resolveCounterpartyRecord(db, scope, {
                            counterpartyName: (_k = (_j = patch.counterpartyName) !== null && _j !== void 0 ? _j : patch.merchantName) !== null && _k !== void 0 ? _k : null,
                            sourceText: (_m = (_l = patch.note) !== null && _l !== void 0 ? _l : draft.note) !== null && _m !== void 0 ? _m : null,
                            typeHint: hydratedDraft.type,
                            allowInference: false,
                        })];
                case 5:
                    _a = _3.sent();
                    return [3 /*break*/, 7];
                case 6:
                    _a = null;
                    _3.label = 7;
                case 7:
                    resolvedCounterparty = _a;
                    canonicalCounterpartyName = (_s = (_q = (_p = (_o = resolvedCounterparty === null || resolvedCounterparty === void 0 ? void 0 : resolvedCounterparty.displayName) !== null && _o !== void 0 ? _o : (typeof patch.counterpartyName === "string" ? normalizeCounterpartyDisplayName(patch.counterpartyName) : null)) !== null && _p !== void 0 ? _p : (typeof patch.merchantName === "string" ? normalizeCounterpartyDisplayName(patch.merchantName) : null)) !== null && _q !== void 0 ? _q : readOptionalString(((_r = draft.payloadJson) !== null && _r !== void 0 ? _r : {})["counterpartyName"])) !== null && _s !== void 0 ? _s : readOptionalString(((_t = draft.payloadJson) !== null && _t !== void 0 ? _t : {})["merchantName"]);
                    nextPayload = __assign(__assign(__assign(__assign({}, ((_u = draft.payloadJson) !== null && _u !== void 0 ? _u : {})), hydratedDraft), patch), { counterpartyId: (_x = (_v = resolvedCounterparty === null || resolvedCounterparty === void 0 ? void 0 : resolvedCounterparty.id) !== null && _v !== void 0 ? _v : readOptionalPositiveInt(((_w = draft.payloadJson) !== null && _w !== void 0 ? _w : {}).counterpartyId)) !== null && _x !== void 0 ? _x : null, counterpartyName: canonicalCounterpartyName, merchantName: (_y = canonicalCounterpartyName !== null && canonicalCounterpartyName !== void 0 ? canonicalCounterpartyName : patch.merchantName) !== null && _y !== void 0 ? _y : draft.merchantName, version: nextVersion });
                    return [4 /*yield*/, db
                            .update(schema_1.financeDrafts)
                            .set({
                            type: (_z = patch.type) !== null && _z !== void 0 ? _z : draft.type,
                            confidence: toFinanceConfidenceValue((_0 = patch.confidence) !== null && _0 !== void 0 ? _0 : draft.confidence),
                            missingFields: (_1 = patch.missingFields) !== null && _1 !== void 0 ? _1 : draft.missingFields,
                            needsClarification: (_2 = patch.needsClarification) !== null && _2 !== void 0 ? _2 : draft.needsClarification,
                            clarificationPrompt: patch.clarificationPrompt === undefined ? draft.clarificationPrompt : patch.clarificationPrompt,
                            payloadJson: nextPayload,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeDrafts.id, draft.id), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeDrafts.ownerUserId, scope.ownerUserId)))
                            .returning()];
                case 8:
                    updated = (_3.sent())[0];
                    if (!updated) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update draft" });
                    }
                    return [2 /*return*/, mapDraftRow(updated)];
            }
        });
    });
}
function confirmDraft(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _a.sent();
                    return [2 /*return*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var draft, existingTransaction, transaction, error_4, existing;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, ensureDraftOwnership(tx, scope, input.draftId)];
                                    case 1:
                                        draft = _a.sent();
                                        return [4 /*yield*/, selectExistingConfirmedTransaction(tx, scope, draft.id)];
                                    case 2:
                                        existingTransaction = _a.sent();
                                        if (existingTransaction) {
                                            return [2 /*return*/, existingTransaction];
                                        }
                                        _a.label = 3;
                                    case 3:
                                        _a.trys.push([3, 5, , 8]);
                                        return [4 /*yield*/, createTransactionFromDraft(tx, scope, draft, {
                                                confirmUserId: input.userId,
                                            })];
                                    case 4:
                                        transaction = _a.sent();
                                        auditLogger_1.auditLogger.log({
                                            eventType: "finance_draft_confirmed",
                                            userId: input.userId,
                                            tenantId: scope.tenantId,
                                            metadata: {
                                                conversationId: input.conversationId,
                                                draftId: draft.id,
                                                transactionId: transaction.id,
                                            },
                                        });
                                        return [2 /*return*/, transaction];
                                    case 5:
                                        error_4 = _a.sent();
                                        if (!((error_4 === null || error_4 === void 0 ? void 0 : error_4.code) === "23505")) return [3 /*break*/, 7];
                                        return [4 /*yield*/, selectExistingConfirmedTransaction(tx, scope, draft.id)];
                                    case 6:
                                        existing = _a.sent();
                                        if (existing) {
                                            return [2 /*return*/, existing];
                                        }
                                        _a.label = 7;
                                    case 7: throw error_4;
                                    case 8: return [2 /*return*/];
                                }
                            });
                        }); })];
            }
        });
    });
}
function voidTransaction(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, transaction, updated;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _c.sent();
                    return [4 /*yield*/, ensureTransactionOwnership(db, scope, input.transactionId)];
                case 3:
                    transaction = _c.sent();
                    if (transaction.status === "voided" || transaction.voidedAt) {
                        return [2 /*return*/, mapTransactionRow(transaction)];
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.financeTransactions)
                            .set({
                            status: "voided",
                            voidedAt: new Date(),
                            voidedByUserId: input.userId,
                            voidReason: (_a = input.reason) !== null && _a !== void 0 ? _a : "Voided by user",
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeTransactions.id, transaction.id), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.ownerUserId, scope.ownerUserId)))
                            .returning()];
                case 4:
                    updated = (_c.sent())[0];
                    if (!updated) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to void transaction" });
                    }
                    auditLogger_1.auditLogger.log({
                        eventType: "finance_transaction_voided",
                        userId: input.userId,
                        tenantId: scope.tenantId,
                        metadata: {
                            conversationId: input.conversationId,
                            transactionId: updated.id,
                            reason: (_b = input.reason) !== null && _b !== void 0 ? _b : null,
                        },
                    });
                    return [2 /*return*/, updated];
            }
        });
    });
}
function listTransactions(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, filters, conditions, paymentAccountCondition, counterpartyCondition, merchantCondition;
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _j.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _j.sent();
                    filters = transactionListFiltersSchema.parse({
                        status: (_a = input.status) !== null && _a !== void 0 ? _a : "confirmed",
                        type: (_b = input.type) !== null && _b !== void 0 ? _b : undefined,
                        categoryCode: input.categoryCode,
                        counterparty: input.counterparty,
                        merchant: input.merchant,
                        paymentMethodKind: (_c = input.paymentMethodKind) !== null && _c !== void 0 ? _c : undefined,
                        paymentDirection: (_d = input.paymentDirection) !== null && _d !== void 0 ? _d : undefined,
                        paymentAccountId: (_e = input.paymentAccountId) !== null && _e !== void 0 ? _e : undefined,
                        paymentInstitutionId: (_f = input.paymentInstitutionId) !== null && _f !== void 0 ? _f : undefined,
                        fromDate: input.fromDate,
                        toDate: input.toDate,
                        limit: (_g = input.limit) !== null && _g !== void 0 ? _g : 50,
                        offset: (_h = input.offset) !== null && _h !== void 0 ? _h : 0,
                    });
                    if (filters.fromDate && filters.toDate && filters.toDate.getTime() < filters.fromDate.getTime()) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "toDate must be after fromDate" });
                    }
                    conditions = [
                        (0, drizzle_orm_1.eq)(schema_1.financeTransactions.tenantId, scope.tenantId),
                        (0, drizzle_orm_1.eq)(schema_1.financeTransactions.projectId, scope.projectId),
                        (0, drizzle_orm_1.eq)(schema_1.financeTransactions.ownerUserId, scope.ownerUserId),
                    ];
                    if (filters.status) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financeTransactions.status, filters.status));
                    }
                    if (filters.type) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financeTransactions.type, filters.type));
                    }
                    if (filters.categoryCode) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financeTransactions.categoryCode, filters.categoryCode));
                    }
                    if (filters.paymentMethodKind) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financeTransactions.paymentMethodKind, filters.paymentMethodKind));
                    }
                    if (filters.paymentDirection) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financeTransactions.paymentDirection, filters.paymentDirection));
                    }
                    if (filters.paymentAccountId) {
                        paymentAccountCondition = (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.financeTransactions.paymentSourceAccountId, filters.paymentAccountId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.paymentDestinationAccountId, filters.paymentAccountId));
                        if (paymentAccountCondition) {
                            conditions.push(paymentAccountCondition);
                        }
                    }
                    if (filters.paymentInstitutionId) {
                        conditions.push((0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["(\n      exists (\n        select 1\n        from finance_payment_accounts payment_account\n        where payment_account.id = ", "\n          and payment_account.payment_institution_id = ", "\n      )\n      or exists (\n        select 1\n        from finance_payment_accounts payment_account\n        where payment_account.id = ", "\n          and payment_account.payment_institution_id = ", "\n      )\n    )"], ["(\n      exists (\n        select 1\n        from finance_payment_accounts payment_account\n        where payment_account.id = ", "\n          and payment_account.payment_institution_id = ", "\n      )\n      or exists (\n        select 1\n        from finance_payment_accounts payment_account\n        where payment_account.id = ", "\n          and payment_account.payment_institution_id = ", "\n      )\n    )"])), schema_1.financeTransactions.paymentSourceAccountId, filters.paymentInstitutionId, schema_1.financeTransactions.paymentDestinationAccountId, filters.paymentInstitutionId));
                    }
                    if (filters.counterparty) {
                        counterpartyCondition = (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.financeTransactions.counterpartyName, "%".concat(filters.counterparty, "%")), (0, drizzle_orm_1.ilike)(schema_1.financeTransactions.merchantName, "%".concat(filters.counterparty, "%")));
                        if (counterpartyCondition) {
                            conditions.push(counterpartyCondition);
                        }
                    }
                    else if (filters.merchant) {
                        merchantCondition = (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.financeTransactions.merchantName, "%".concat(filters.merchant, "%")), (0, drizzle_orm_1.ilike)(schema_1.financeTransactions.counterpartyName, "%".concat(filters.merchant, "%")));
                        if (merchantCondition) {
                            conditions.push(merchantCondition);
                        }
                    }
                    if (filters.fromDate) {
                        conditions.push((0, drizzle_orm_1.gte)(schema_1.financeTransactions.occurredAt, filters.fromDate));
                    }
                    if (filters.toDate) {
                        conditions.push((0, drizzle_orm_1.lt)(schema_1.financeTransactions.occurredAt, filters.toDate));
                    }
                    return [2 /*return*/, db
                            .select()
                            .from(schema_1.financeTransactions)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.financeTransactions.occurredAt), (0, drizzle_orm_1.desc)(schema_1.financeTransactions.id))
                            .limit(filters.limit)
                            .offset(filters.offset)];
            }
        });
    });
}
function listDrafts(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, filters, conditions, rows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _b.sent();
                    filters = __assign(__assign({}, buildListRange(input.limit, input.offset)), { status: (_a = input.status) !== null && _a !== void 0 ? _a : "draft" });
                    conditions = [
                        (0, drizzle_orm_1.eq)(schema_1.financeDrafts.tenantId, scope.tenantId),
                        (0, drizzle_orm_1.eq)(schema_1.financeDrafts.projectId, scope.projectId),
                        (0, drizzle_orm_1.eq)(schema_1.financeDrafts.ownerUserId, scope.ownerUserId),
                    ];
                    if (filters.status) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financeDrafts.status, finance_1.financeDraftStatusSchema.parse(filters.status)));
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.financeDrafts)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.financeDrafts.createdAt))
                            .limit(filters.limit)
                            .offset(filters.offset)];
                case 3:
                    rows = _b.sent();
                    return [2 /*return*/, rows.map(mapDraftRow)];
            }
        });
    });
}
function listRecurringRules(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, filters, conditions, rows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _b.sent();
                    filters = __assign(__assign({}, buildListRange(input.limit, input.offset)), { status: (_a = input.status) !== null && _a !== void 0 ? _a : null });
                    conditions = [
                        (0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.tenantId, scope.tenantId),
                        (0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.projectId, scope.projectId),
                        (0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.ownerUserId, scope.ownerUserId),
                    ];
                    if (filters.status) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.status, finance_1.financeRecurringRuleStatusSchema.parse(filters.status)));
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.financeRecurringRules)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.financeRecurringRules.updatedAt), (0, drizzle_orm_1.desc)(schema_1.financeRecurringRules.id))
                            .limit(filters.limit)
                            .offset(filters.offset)];
                case 3:
                    rows = _b.sent();
                    return [2 /*return*/, rows];
            }
        });
    });
}
function aggregateSummary(scope, referenceDate, granularity) {
    return __awaiter(this, void 0, void 0, function () {
        var db, rangeStart, rangeEnd, row, incomeMinor, expenseMinor, transferMinor, summary;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    ensureDb(db);
                    rangeStart = granularity === "day"
                        ? startOfDayInTimeZone(referenceDate, "Asia/Bangkok")
                        : startOfMonthInTimeZone(referenceDate, "Asia/Bangkok");
                    rangeEnd = granularity === "day"
                        ? new Date(rangeStart.getTime() + 86400000)
                        : startOfNextMonthInTimeZone(referenceDate, "Asia/Bangkok");
                    return [4 /*yield*/, db
                            .select({
                            incomeMinor: (0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["coalesce(sum(case when ", " = 'income' then ", " else 0 end), 0)::int"], ["coalesce(sum(case when ", " = 'income' then ", " else 0 end), 0)::int"])), schema_1.financeTransactions.type, schema_1.financeTransactions.amountMinor),
                            expenseMinor: (0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["coalesce(sum(case when ", " = 'expense' then ", " else 0 end), 0)::int"], ["coalesce(sum(case when ", " = 'expense' then ", " else 0 end), 0)::int"])), schema_1.financeTransactions.type, schema_1.financeTransactions.amountMinor),
                            transferMinor: (0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["coalesce(sum(case when ", " = 'transfer' then ", " else 0 end), 0)::int"], ["coalesce(sum(case when ", " = 'transfer' then ", " else 0 end), 0)::int"])), schema_1.financeTransactions.type, schema_1.financeTransactions.amountMinor),
                        })
                            .from(schema_1.financeTransactions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeTransactions.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.ownerUserId, scope.ownerUserId), (0, drizzle_orm_1.eq)(schema_1.financeTransactions.status, "confirmed"), (0, drizzle_orm_1.isNull)(schema_1.financeTransactions.voidedAt), (0, drizzle_orm_1.gte)(schema_1.financeTransactions.occurredAt, rangeStart), (0, drizzle_orm_1.lt)(schema_1.financeTransactions.occurredAt, rangeEnd)))];
                case 2:
                    row = (_d.sent())[0];
                    incomeMinor = Number((_a = row === null || row === void 0 ? void 0 : row.incomeMinor) !== null && _a !== void 0 ? _a : 0);
                    expenseMinor = Number((_b = row === null || row === void 0 ? void 0 : row.expenseMinor) !== null && _b !== void 0 ? _b : 0);
                    transferMinor = Number((_c = row === null || row === void 0 ? void 0 : row.transferMinor) !== null && _c !== void 0 ? _c : 0);
                    summary = buildSummaryRow({
                        tenantId: scope.tenantId,
                        projectId: scope.projectId,
                        timezone: "Asia/Bangkok",
                        rangeStart: rangeStart.toISOString(),
                        rangeEnd: rangeEnd.toISOString(),
                        incomeMinor: incomeMinor,
                        expenseMinor: expenseMinor,
                        transferMinor: transferMinor,
                        balanceMinor: incomeMinor - expenseMinor,
                    }, granularity);
                    return [2 /*return*/, summary];
            }
        });
    });
}
function getDailySummary(input) {
    return __awaiter(this, void 0, void 0, function () {
        var scope;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, resolveScopeFromConversation({
                        conversationId: input.conversationId,
                        userId: input.userId,
                        tenantId: input.tenantId,
                    })];
                case 1:
                    scope = _b.sent();
                    return [4 /*yield*/, aggregateSummary(scope, (_a = input.referenceDate) !== null && _a !== void 0 ? _a : new Date(), "day")];
                case 2: return [2 /*return*/, _b.sent()];
            }
        });
    });
}
function getMonthlySummary(input) {
    return __awaiter(this, void 0, void 0, function () {
        var scope;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, resolveScopeFromConversation({
                        conversationId: input.conversationId,
                        userId: input.userId,
                        tenantId: input.tenantId,
                    })];
                case 1:
                    scope = _b.sent();
                    return [4 /*yield*/, aggregateSummary(scope, (_a = input.referenceDate) !== null && _a !== void 0 ? _a : new Date(), "month")];
                case 2: return [2 /*return*/, _b.sent()];
            }
        });
    });
}
function createRecurringRule(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, schedule, timezone, startDate, endDate, nextRunAt, scheduleHash, resolvedCounterparty, canonicalCounterpartyName, idempotencyKey;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
        return __generator(this, function (_y) {
            switch (_y.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _y.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _y.sent();
                    schedule = normalizeRecurringSchedule(input.rrule);
                    timezone = ((_a = input.timezone) === null || _a === void 0 ? void 0 : _a.trim()) || "Asia/Bangkok";
                    startDate = (_b = input.startDate) !== null && _b !== void 0 ? _b : new Date();
                    endDate = (_c = input.endDate) !== null && _c !== void 0 ? _c : null;
                    nextRunAt = computeNextRecurringRunAt(schedule, startDate, timezone, new Date());
                    if (!nextRunAt) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Could not compute the next recurring run" });
                    }
                    if (endDate && nextRunAt.getTime() > endDate.getTime()) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Recurring schedule ends before the first run" });
                    }
                    scheduleHash = sha256(JSON.stringify(schedule));
                    return [4 /*yield*/, resolveCounterpartyRecord(db, scope, {
                            counterpartyName: (_e = (_d = input.counterpartyName) !== null && _d !== void 0 ? _d : input.merchantName) !== null && _e !== void 0 ? _e : null,
                            sourceText: (_f = input.note) !== null && _f !== void 0 ? _f : null,
                            typeHint: input.type,
                            allowInference: false,
                        })];
                case 3:
                    resolvedCounterparty = _y.sent();
                    canonicalCounterpartyName = (_j = (_h = (_g = resolvedCounterparty === null || resolvedCounterparty === void 0 ? void 0 : resolvedCounterparty.displayName) !== null && _g !== void 0 ? _g : (input.counterpartyName ? normalizeCounterpartyDisplayName(input.counterpartyName) : null)) !== null && _h !== void 0 ? _h : (input.merchantName ? normalizeCounterpartyDisplayName(input.merchantName) : null)) !== null && _j !== void 0 ? _j : null;
                    idempotencyKey = (_k = input.idempotencyKey) !== null && _k !== void 0 ? _k : toIdempotencyKey("finance-recurring", [
                        scope.tenantId,
                        scope.projectId,
                        scope.ownerUserId,
                        scheduleHash,
                        input.type,
                        input.amountMinor,
                        (_l = input.currency) !== null && _l !== void 0 ? _l : "THB",
                        input.categoryCode,
                        (_m = canonicalCounterpartyName !== null && canonicalCounterpartyName !== void 0 ? canonicalCounterpartyName : input.merchantName) !== null && _m !== void 0 ? _m : "",
                        (_o = input.note) !== null && _o !== void 0 ? _o : "",
                        (_p = input.sourceMessageId) !== null && _p !== void 0 ? _p : "",
                        (_q = input.sourceLibraryItemId) !== null && _q !== void 0 ? _q : "",
                    ]);
                    return [4 /*yield*/, insertRecurringRuleWithIdempotency(db, scope, {
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            type: input.type,
                            amountMinor: input.amountMinor,
                            currency: (_r = input.currency) !== null && _r !== void 0 ? _r : "THB",
                            categoryCode: input.categoryCode,
                            counterpartyId: (_s = resolvedCounterparty === null || resolvedCounterparty === void 0 ? void 0 : resolvedCounterparty.id) !== null && _s !== void 0 ? _s : null,
                            counterpartyName: canonicalCounterpartyName,
                            merchantName: (_t = canonicalCounterpartyName !== null && canonicalCounterpartyName !== void 0 ? canonicalCounterpartyName : input.merchantName) !== null && _t !== void 0 ? _t : null,
                            note: (_u = input.note) !== null && _u !== void 0 ? _u : null,
                            rrule: JSON.stringify(schedule),
                            timezone: timezone,
                            startDate: startDate,
                            endDate: endDate,
                            nextRunAt: nextRunAt,
                            lastRunAt: null,
                            runCount: 0,
                            autoConfirm: (_v = input.autoConfirm) !== null && _v !== void 0 ? _v : false,
                            status: "active",
                            idempotencyKey: idempotencyKey,
                            sourceHash: scheduleHash,
                            sourceMessageId: (_w = input.sourceMessageId) !== null && _w !== void 0 ? _w : null,
                            sourceLibraryItemId: (_x = input.sourceLibraryItemId) !== null && _x !== void 0 ? _x : null,
                            allowedScopes: scope.allowedScopes,
                        })];
                case 4: return [2 /*return*/, _y.sent()];
            }
        });
    });
}
function pauseRecurringRule(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, rule, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _a.sent();
                    return [4 /*yield*/, ensureRecurringRuleOwnership(db, scope, input.recurringRuleId)];
                case 3:
                    rule = _a.sent();
                    if (rule.status === "paused") {
                        return [2 /*return*/, rule];
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.financeRecurringRules)
                            .set({
                            status: "paused",
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.id, rule.id))
                            .returning()];
                case 4:
                    updated = (_a.sent())[0];
                    if (!updated) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to pause recurring rule" });
                    }
                    return [2 /*return*/, updated];
            }
        });
    });
}
function resumeRecurringRule(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, rule, schedule, nextRunAt, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _a.sent();
                    return [4 /*yield*/, ensureRecurringRuleOwnership(db, scope, input.recurringRuleId)];
                case 3:
                    rule = _a.sent();
                    if (rule.status === "active") {
                        return [2 /*return*/, rule];
                    }
                    schedule = normalizeRecurringSchedule(rule.rrule);
                    nextRunAt = computeNextRecurringRunAt(schedule, rule.startDate, rule.timezone, new Date());
                    if (!nextRunAt) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Could not compute the next recurring run" });
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.financeRecurringRules)
                            .set({
                            status: "active",
                            nextRunAt: nextRunAt,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.id, rule.id))
                            .returning()];
                case 4:
                    updated = (_a.sent())[0];
                    if (!updated) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to resume recurring rule" });
                    }
                    return [2 /*return*/, updated];
            }
        });
    });
}
function listLinkedDocuments(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, scope, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    ensureDb(db);
                    return [4 /*yield*/, resolveScopeFromConversation({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: input.tenantId,
                        })];
                case 2:
                    scope = _a.sent();
                    return [4 /*yield*/, ensureTransactionOwnership(db, scope, input.transactionId)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.financeTransactionDocuments.id,
                            transactionId: schema_1.financeTransactionDocuments.transactionId,
                            libraryItemId: schema_1.financeTransactionDocuments.libraryItemId,
                            sourceExtractionId: schema_1.financeTransactionDocuments.sourceExtractionId,
                            role: schema_1.financeTransactionDocuments.role,
                            note: schema_1.financeTransactionDocuments.note,
                            createdAt: schema_1.financeTransactionDocuments.createdAt,
                            updatedAt: schema_1.financeTransactionDocuments.updatedAt,
                            libraryItemIdFromJoin: schema_1.libraryItems.id,
                            libraryTitle: schema_1.libraryItems.title,
                            librarySource: schema_1.libraryItems.source,
                            libraryMetadata: schema_1.libraryItems.metadata,
                            libraryProjectId: schema_1.libraryItems.projectId,
                            extractionId: schema_1.documentExtractions.id,
                            extractionOcrProvider: schema_1.documentExtractions.ocrProvider,
                            extractionMimeType: schema_1.documentExtractions.mimeType,
                            extractionFileHash: schema_1.documentExtractions.fileHash,
                            extractionPageCount: schema_1.documentExtractions.pageCount,
                        })
                            .from(schema_1.financeTransactionDocuments)
                            .leftJoin(schema_1.libraryItems, (0, drizzle_orm_1.eq)(schema_1.financeTransactionDocuments.libraryItemId, schema_1.libraryItems.id))
                            .leftJoin(schema_1.documentExtractions, (0, drizzle_orm_1.eq)(schema_1.financeTransactionDocuments.sourceExtractionId, schema_1.documentExtractions.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeTransactionDocuments.tenantId, scope.tenantId), (0, drizzle_orm_1.eq)(schema_1.financeTransactionDocuments.projectId, scope.projectId), (0, drizzle_orm_1.eq)(schema_1.financeTransactionDocuments.ownerUserId, scope.ownerUserId), (0, drizzle_orm_1.eq)(schema_1.financeTransactionDocuments.transactionId, input.transactionId)))
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.financeTransactionDocuments.createdAt))];
                case 4:
                    rows = _a.sent();
                    return [2 /*return*/, rows.map(function (row) {
                            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                            return ({
                                id: row.id,
                                transactionId: row.transactionId,
                                libraryItemId: row.libraryItemId,
                                role: finance_1.financeDocumentRoleSchema.parse(row.role),
                                note: (_a = row.note) !== null && _a !== void 0 ? _a : null,
                                sourceExtractionId: (_b = row.sourceExtractionId) !== null && _b !== void 0 ? _b : null,
                                createdAt: row.createdAt,
                                updatedAt: row.updatedAt,
                                libraryItem: row.libraryItemIdFromJoin
                                    ? {
                                        id: row.libraryItemIdFromJoin,
                                        title: (_c = row.libraryTitle) !== null && _c !== void 0 ? _c : "",
                                        source: (_d = row.librarySource) !== null && _d !== void 0 ? _d : "",
                                        metadata: ((_e = row.libraryMetadata) !== null && _e !== void 0 ? _e : {}),
                                        projectId: (_f = row.libraryProjectId) !== null && _f !== void 0 ? _f : null,
                                    }
                                    : null,
                                extraction: row.extractionId
                                    ? {
                                        id: row.extractionId,
                                        ocrProvider: (_g = row.extractionOcrProvider) !== null && _g !== void 0 ? _g : "",
                                        mimeType: (_h = row.extractionMimeType) !== null && _h !== void 0 ? _h : "",
                                        fileHash: (_j = row.extractionFileHash) !== null && _j !== void 0 ? _j : "",
                                        pageCount: (_k = row.extractionPageCount) !== null && _k !== void 0 ? _k : 1,
                                    }
                                    : null,
                            });
                        })];
            }
        });
    });
}
function createRecurringDraftFromRule(tx, scope, rule, runAt) {
    return __awaiter(this, void 0, void 0, function () {
        var draftPayload;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    draftPayload = buildDraftClarificationPayload({
                        type: rule.type,
                        amountMinor: rule.amountMinor,
                        currency: rule.currency,
                        occurredAt: runAt.toISOString(),
                        categoryCode: rule.categoryCode,
                        counterpartyName: (_a = rule.counterpartyName) !== null && _a !== void 0 ? _a : rule.merchantName,
                        merchantName: (_b = rule.counterpartyName) !== null && _b !== void 0 ? _b : rule.merchantName,
                        note: rule.note,
                        confidence: 1,
                        needsClarification: false,
                        missingFields: [],
                        sourceMessageId: (_c = rule.sourceMessageId) !== null && _c !== void 0 ? _c : null,
                        sourceLibraryItemId: (_d = rule.sourceLibraryItemId) !== null && _d !== void 0 ? _d : null,
                        recurringRuleId: rule.id,
                    }, {
                        sourceKind: "recurring_rule",
                        sourceMessageId: (_e = rule.sourceMessageId) !== null && _e !== void 0 ? _e : null,
                        sourceLibraryItemId: (_f = rule.sourceLibraryItemId) !== null && _f !== void 0 ? _f : null,
                        recurringRuleId: rule.id,
                        sourceHash: (_g = rule.sourceHash) !== null && _g !== void 0 ? _g : null,
                    });
                    return [4 /*yield*/, insertDraftWithIdempotency(tx, scope, {
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            type: rule.type,
                            status: "draft",
                            source: "recurring_rule",
                            idempotencyKey: "finance-recurring-draft:".concat(rule.id, ":").concat(rule.runCount + 1),
                            sourceHash: (_h = rule.sourceHash) !== null && _h !== void 0 ? _h : null,
                            payloadJson: __assign(__assign({}, draftPayload), { version: 1 }),
                            missingFields: [],
                            confidence: toFinanceConfidenceValue(1),
                            needsClarification: false,
                            clarificationPrompt: null,
                            sourceMessageId: (_j = rule.sourceMessageId) !== null && _j !== void 0 ? _j : null,
                            sourceLibraryItemId: (_k = rule.sourceLibraryItemId) !== null && _k !== void 0 ? _k : null,
                            recurringRuleId: rule.id,
                            expiresAt: new Date(Date.now() + 30 * 86400000),
                            allowedScopes: scope.allowedScopes,
                        })];
                case 1: return [2 /*return*/, _l.sent()];
            }
        });
    });
}
function runDueRecurringRules() {
    return __awaiter(this, arguments, void 0, function (now) {
        var db, dueRules, draftsCreated, transactionsCreated, errors, _loop_1, _i, dueRules_1, rule;
        var _this = this;
        var _a;
        if (now === void 0) { now = new Date(); }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    ensureDb(db);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.financeRecurringRules)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.status, "active"), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.financeRecurringRules.nextRunAt), (0, drizzle_orm_1.lt)(schema_1.financeRecurringRules.nextRunAt, now), (0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.nextRunAt, now))))
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.financeRecurringRules.nextRunAt), (0, drizzle_orm_1.asc)(schema_1.financeRecurringRules.id))
                            .limit(100)];
                case 2:
                    dueRules = _b.sent();
                    draftsCreated = 0;
                    transactionsCreated = 0;
                    errors = 0;
                    _loop_1 = function (rule) {
                        var scope, createdDraft_1, createdTransaction_1, error_5;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    scope = {
                                        tenantId: rule.tenantId,
                                        ownerUserId: rule.ownerUserId,
                                        projectId: rule.projectId,
                                        conversationId: 0,
                                        personal: (0, chatService_1.isPersonalProjectId)(rule.projectId),
                                        allowedScopes: ((_a = rule.allowedScopes) === null || _a === void 0 ? void 0 : _a.length) > 0 ? rule.allowedScopes : [personalScopeToken(rule.ownerUserId)],
                                    };
                                    _c.label = 1;
                                case 1:
                                    _c.trys.push([1, 3, , 4]);
                                    createdDraft_1 = null;
                                    createdTransaction_1 = null;
                                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                            var schedule, runAt, nextRunAt;
                                            var _a;
                                            return __generator(this, function (_b) {
                                                switch (_b.label) {
                                                    case 0:
                                                        schedule = normalizeRecurringSchedule(rule.rrule);
                                                        runAt = (_a = rule.nextRunAt) !== null && _a !== void 0 ? _a : now;
                                                        return [4 /*yield*/, createRecurringDraftFromRule(tx, scope, rule, runAt)];
                                                    case 1:
                                                        createdDraft_1 = _b.sent();
                                                        if (!rule.autoConfirm) return [3 /*break*/, 3];
                                                        return [4 /*yield*/, createTransactionFromDraft(tx, scope, createdDraft_1, {
                                                                confirmUserId: rule.ownerUserId,
                                                                confirmedAt: runAt,
                                                            })];
                                                    case 2:
                                                        createdTransaction_1 = _b.sent();
                                                        _b.label = 3;
                                                    case 3:
                                                        nextRunAt = computeNextRecurringRunAt(schedule, rule.startDate, rule.timezone, new Date(runAt.getTime() + 1000));
                                                        return [4 /*yield*/, tx
                                                                .update(schema_1.financeRecurringRules)
                                                                .set({
                                                                lastRunAt: runAt,
                                                                nextRunAt: nextRunAt,
                                                                runCount: rule.runCount + 1,
                                                                status: nextRunAt ? "active" : "ended",
                                                                updatedAt: new Date(),
                                                            })
                                                                .where((0, drizzle_orm_1.eq)(schema_1.financeRecurringRules.id, rule.id))];
                                                    case 4:
                                                        _b.sent();
                                                        return [2 /*return*/];
                                                }
                                            });
                                        }); })];
                                case 2:
                                    _c.sent();
                                    if (createdDraft_1) {
                                        draftsCreated += 1;
                                    }
                                    if (createdTransaction_1) {
                                        transactionsCreated += 1;
                                    }
                                    return [3 /*break*/, 4];
                                case 3:
                                    error_5 = _c.sent();
                                    errors += 1;
                                    auditLogger_1.auditLogger.log({
                                        eventType: "finance_recurring_rule_failed",
                                        userId: rule.ownerUserId,
                                        tenantId: rule.tenantId,
                                        metadata: {
                                            recurringRuleId: rule.id,
                                            error: error_5 instanceof Error ? error_5.message : String(error_5),
                                        },
                                    });
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, dueRules_1 = dueRules;
                    _b.label = 3;
                case 3:
                    if (!(_i < dueRules_1.length)) return [3 /*break*/, 6];
                    rule = dueRules_1[_i];
                    return [5 /*yield**/, _loop_1(rule)];
                case 4:
                    _b.sent();
                    _b.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/, {
                        scannedCount: dueRules.length,
                        draftsCreated: draftsCreated,
                        transactionsCreated: transactionsCreated,
                        errors: errors,
                    }];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14;
