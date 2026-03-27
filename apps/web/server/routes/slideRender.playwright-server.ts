import express from "express";
import { createSlideRenderRouter } from "./slideRender";
import { signBearerToken } from "../_core/tokens";

const DECK_ID = 7;
const SLIDE_INDEX = 2;

function makeSlide(index: number) {
  return {
    id: 100 + index,
    deckId: DECK_ID,
    orderIndex: index,
    title: `Slide ${index}`,
    slideContent: {
      elements: [
        { id: `el-${index}`, type: "text", content: `Hello slide ${index}` },
      ],
    },
    audioTrack: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeRepresentativeSlide() {
  return {
    ...makeSlide(SLIDE_INDEX),
    slideContent: {
      canvas: { width: 960, height: 1200 },
      background: { type: "color", value: "#f4f7f2" },
      elements: [
        {
          id: "title-block",
          type: "text",
          x: 72,
          y: 84,
          width: 720,
          height: 116,
          text: "พัฒนาการเด็กหนึ่งขวบกับการฝึกเดิน",
          color: "#1f4d41",
          fontSize: 52,
          fontWeight: "700",
          lineHeight: 1.08,
          textAlign: "left",
        },
        {
          id: "body-block",
          type: "text",
          x: 72,
          y: 224,
          width: 732,
          height: 286,
          text: "• จับมือเดินได้ไม่เกร็ง\n• ชอบยืนเกาะโต๊ะ\n• เริ่มก้าวเองเป็นช่วงสั้น ๆ",
          color: "#557a70",
          fontSize: 28,
          fontWeight: "600",
          lineHeight: 1.28,
          textAlign: "left",
        },
        {
          id: "hero-visual",
          type: "image",
          x: 72,
          y: 548,
          width: 816,
          height: 508,
          svgContent:
            "<svg viewBox='0 0 816 508' xmlns='http://www.w3.org/2000/svg'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#fce7c3'/><stop offset='100%' stop-color='#d6b58a'/></linearGradient></defs><rect width='816' height='508' rx='28' fill='url(#g)' /><circle cx='612' cy='146' r='88' fill='#f3d8b3' opacity='0.95'/><rect x='146' y='242' width='466' height='122' rx='20' fill='#fff7ed' opacity='0.92'/></svg>",
          svgColor: "#f59e0b",
          mediaShape: "rounded",
          mediaCornerRadius: 28,
        },
      ],
    },
    audioTrack: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeFakeDb() {
  const slides = [makeSlide(0), makeSlide(1), makeRepresentativeSlide(), makeSlide(3)];
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(slides),
  };
  return chain;
}

async function main() {
  const app = express();
  const token = signBearerToken(
    {
      sub: "internal-render",
      scopes: ["internal:slide-render"],
      deckId: DECK_ID,
      slideIndex: SLIDE_INDEX,
    } as any,
    "5m",
  );

  app.use("/internal", createSlideRenderRouter({ getDb: async () => makeFakeDb() }));

  const server = app.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to start slide render test server");
    }
    console.log(`SLIDE_RENDER_PORT=${address.port}`);
    console.log(`SLIDE_RENDER_TOKEN=${token}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
