import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStorytellingHandoff,
  buildVideoBriefFromProduct,
  normalizeProductBrief,
  sanitizeCaptureForLocalAI,
} from "./localAi";
import { inferProductReferenceCategory } from "./productReferenceCategories";
import type { ProductCapturePayload } from "./types";

const coffeeMachineTitle = "SKG เครื่องชงกาแฟพร้อมเครื่องบดในตัว SK-1222 ก้านชง 58 มม. กำลังไฟ 1550W รับประกัน 1 ปี";

test("classifies coffee machines as appliances despite coffee breadcrumb terms", () => {
  assert.equal(inferProductReferenceCategory({
    title: coffeeMachineTitle,
    categoryPath: ["Household Appliances", "Kitchen Appliances", "Coffee & Tea Machines & Accessories"],
  }), "electrical_appliance");
});

test("story templates follow captured product category, not broad AI wording", async () => {
  const capture = {
    platform: "tiktok_shop",
    sourceUrl: "https://shop.tiktok.com/th/pdp/1733706471759513171",
    pageType: "product",
    externalProductId: "1733706471759513171",
    externalShopId: null,
    pageTitle: coffeeMachineTitle,
    productName: coffeeMachineTitle,
    priceCurrentText: "฿5,790",
    priceOriginalText: null,
    discountText: null,
    ratingScoreText: "4.8",
    reviewCountText: "78",
    soldCountText: "573",
    shopName: "SKG Online Shopping",
    isMall: null,
    categoryText: "Coffee & Tea Machines & Accessories",
    categoryPath: ["Household Appliances", "Kitchen Appliances", "Coffee & Tea Machines & Accessories"],
    productCategory: "food_beverage",
    descriptionText: "เครื่องชงกาแฟพร้อมเครื่องบดในตัว กำลังไฟ 1550W รับประกัน 1 ปี",
    specificationText: "ก้านชง 58 มม.",
    imageCandidates: [],
    rawDomText: coffeeMachineTitle,
    htmlBlocks: [],
  } as ProductCapturePayload;
  const source = await sanitizeCaptureForLocalAI(capture);
  const brief = normalizeProductBrief({
    schemaVersion: "1.0",
    productName: coffeeMachineTitle,
    productCategory: "food_beverage",
    category: "Coffee & Tea Machines & Accessories",
    shortSummary: "เครื่องชงกาแฟพร้อมเครื่องบดในตัว สำหรับชงกาแฟที่บ้าน",
    keySellingPoints: ["เครื่องบดกาแฟในตัว", "ก้านชง 58 มม.", "กำลังไฟ 1550W"],
    targetAudiences: ["ผู้ชงกาแฟที่บ้าน"],
    buyerPainPoints: ["พื้นที่จำกัดและอยากได้เครื่องชงที่รวมอุปกรณ์ไว้ในเครื่องเดียว"],
    buyerObjections: ["กังวลเรื่องการใช้งานและสเปก"],
    trustSignals: ["รับประกัน 1 ปี", "คะแนน 4.8 จาก 78 รีวิว"],
    contentAngles: ["เดโมชงกาแฟและบดเมล็ดในเครื่องเดียว"],
    suggestedHooks: ["ชงกาแฟที่บ้านได้ครบในเครื่องเดียว"],
    suggestedCTAs: ["ดูรายละเอียดสินค้า"],
    confidence: 0.8,
    evidenceIds: [],
  }, source);

  assert.equal(source.product.productCategory, "electrical_appliance");
  assert.equal(brief.productCategory, "electrical_appliance");

  const handoff = buildStorytellingHandoff(brief, buildVideoBriefFromProduct(brief, source), source);
  const storyText = JSON.stringify(handoff.storyOptions);
  assert.doesNotMatch(storyText, /ตะกร้าผ้า|ตะกร้าพับเก็บ|ห้องซักผ้า|สกินแคร์|วอลเปเปอร์/i);
  assert.match(storyText, /เครื่องชงกาแฟ|บดกาแฟ|1550W/);
});
