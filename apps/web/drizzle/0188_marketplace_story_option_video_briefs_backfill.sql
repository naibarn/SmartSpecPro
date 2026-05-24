CREATE TABLE IF NOT EXISTS "marketplace_capture_story_options_backup_0188" AS
SELECT *
FROM "marketplace_capture_insights"
WHERE false;

INSERT INTO "marketplace_capture_story_options_backup_0188"
SELECT insight.*
FROM "marketplace_capture_insights" insight
WHERE insight."insightType" = 'storytelling_handoff'
  AND (
    jsonb_array_length(COALESCE(insight."payloadJson"->'storyOptions', '[]'::jsonb)) <> 4
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(insight."payloadJson"->'storyOptions', '[]'::jsonb)) option
      WHERE option->>'id' IN (
        'story_option:problem_solution',
        'story_option:objection_trust',
        'story_option:quick_demo',
        'story_option:use_case_moment'
      )
        AND NOT (option ? 'videoBrief')
    )
  );

CREATE OR REPLACE FUNCTION marketplace_story_option_video_brief_0188(option_json jsonb, product_name text, cta_text text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  option_id text := COALESCE(option_json->>'id', '');
  option_title text := COALESCE(option_json->>'title', 'Story option');
  audience text := COALESCE(option_json->>'audience', 'ผู้ซื้อที่กำลังเปรียบเทียบสินค้า');
  need text := COALESCE(option_json->>'customerNeed', 'ต้องการเข้าใจประโยชน์ของสินค้า');
  problem text := COALESCE(option_json->>'problemToSolve', need);
  use_case text := COALESCE(option_json->>'useCase', need);
  angle text := COALESCE(option_json->>'angle', product_name);
  hook text := COALESCE(option_json->>'hook', product_name);
  outline jsonb := COALESCE(option_json->'storyboardOutline', '[]'::jsonb);
  first_line text := COALESCE(outline->>0, problem);
  second_line text := COALESCE(outline->>1, angle);
  third_line text := COALESCE(outline->>2, use_case);
  shot1_title text := 'เปิดด้วยปัญหาที่ลูกค้ากำลังเจอ';
  shot2_title text := 'โชว์สินค้าเป็นทางออก';
  shot3_title text := 'ผลลัพธ์หลังใช้และ CTA';
  shot1_prompt text := 'Vertical video 9:16, realistic product lifestyle video, soft natural light, clean composition, no text on screen, no subtitles. Show the customer everyday problem in a real home or lifestyle context before the product appears. Keep product identity faithful to selected product images.';
  shot2_prompt text := 'Vertical video 9:16, realistic product demo, soft natural light, clean composition, no text on screen, no subtitles. Hands introduce the product naturally and connect the product benefit to the problem. Keep product identity faithful to selected product images.';
  shot3_prompt text := 'Vertical video 9:16, realistic product lifestyle video, clean satisfying result, no text on screen, no subtitles. Show the after state, practical usage context, and final product beauty shot. Keep product identity faithful to selected product images.';
  shot1_voice text := 'พูดเป็นภาษาไทยว่า “' || left(regexp_replace(first_line, '[“”"]', '', 'g'), 240) || '”';
  shot2_voice text := 'พูดเป็นภาษาไทยว่า “' || left(regexp_replace(second_line, '[“”"]', '', 'g'), 240) || '”';
  shot3_voice text := 'พูดเป็นภาษาไทยว่า “' || left(regexp_replace(third_line || ' สนใจดูรายละเอียดสินค้าเพิ่มเติมได้เลย', '[“”"]', '', 'g'), 240) || '”';
BEGIN
  IF option_id = 'story_option:objection_trust' THEN
    shot1_title := 'ลูกค้าลังเลก่อนซื้อ';
    shot2_title := 'ตอบข้อกังวลด้วยหลักฐาน';
    shot3_title := 'สรุปความมั่นใจก่อนตัดสินใจ';
    shot1_prompt := 'Vertical video 9:16, realistic online shopping scene, cozy home setting, no text on screen, no subtitles. Show a customer comparing product details, photos, reviews, or size choices with a thoughtful expression.';
    shot2_prompt := 'Vertical video 9:16, realistic close-up product detail and trust proof scene, no text on screen, no subtitles. Show product details, material, usage proof, review signal, or rating context without overclaiming.';
    shot3_prompt := 'Vertical video 9:16, realistic home lifestyle scene, clean trustworthy product shot, no text on screen, no subtitles. Show the product being used with confidence and end on a clear product shot.';
    shot1_voice := 'พูดเป็นภาษาไทยว่า “ก่อนซื้อ หลายคนอาจกังวลเรื่อง ' || left(regexp_replace(problem, '[“”"]', '', 'g'), 190) || '”';
    shot2_voice := 'พูดเป็นภาษาไทยว่า “ให้มั่นใจขึ้นด้วยข้อมูลที่ตรวจได้จากหน้าสินค้า เช่น ' || left(regexp_replace(angle, '[“”"]', '', 'g'), 170) || '”';
    shot3_voice := 'พูดเป็นภาษาไทยว่า “' || left(regexp_replace(product_name || ' เหมาะกับคนที่อยากมั่นใจก่อนซื้อ และควรตรวจรายละเอียดให้ตรงกับการใช้งานของตัวเอง', '[“”"]', '', 'g'), 240) || '”';
  ELSIF option_id = 'story_option:quick_demo' THEN
    shot1_title := 'เริ่มเดโมให้เห็นว่าใช้งานง่าย';
    shot2_title := 'รวมประโยชน์หลักแบบเร็ว';
    shot3_title := 'จบด้วยภาพใช้งานจริงและ CTA';
    shot1_prompt := 'Vertical video 9:16, fast satisfying product demo, clean home or lifestyle setup, no text on screen, no subtitles. Show the product being prepared or used immediately with natural hand movement.';
    shot2_prompt := 'Vertical video 9:16, fast-cut montage of product benefits and practical uses, no text on screen, no subtitles. Show multiple benefits with clear product interaction and no misleading claims.';
    shot3_prompt := 'Vertical video 9:16, smooth final demo shot, product in real usage context, no text on screen, no subtitles. Show the result after use and end with a clear product beauty shot.';
    shot1_voice := 'พูดเป็นภาษาไทยว่า “' || left(regexp_replace(product_name || ' ใช้งานง่าย เริ่มจาก ' || first_line, '[“”"]', '', 'g'), 240) || '”';
    shot2_voice := 'พูดเป็นภาษาไทยว่า “จุดที่น่าสนใจคือ ' || left(regexp_replace(second_line, '[“”"]', '', 'g'), 200) || '”';
    shot3_voice := 'พูดเป็นภาษาไทยว่า “ถ้าต้องการตัวช่วยที่ใช้งานง่ายและเห็นประโยชน์เร็ว ลองดู ' || left(regexp_replace(product_name, '[“”"]', '', 'g'), 120) || ' ได้เลย”';
  ELSIF option_id = 'story_option:use_case_moment' THEN
    shot1_title := 'สถานการณ์ใช้งานที่หนึ่ง';
    shot2_title := 'สถานการณ์ใช้งานที่สอง';
    shot3_title := 'สรุปว่าเหมาะกับใคร';
    shot1_prompt := 'Vertical video 9:16, realistic lifestyle context, no text on screen, no subtitles. Show where and when the customer would use the product in a practical daily-life situation.';
    shot2_prompt := 'Vertical video 9:16, second practical lifestyle context from another angle or room, no text on screen, no subtitles. Show a different use case so this story is clearly distinct.';
    shot3_prompt := 'Vertical video 9:16, montage of realistic use cases, final product hero shot in a clean environment, no text on screen, no subtitles. Summarize fit for the audience through visuals.';
    shot1_voice := 'พูดเป็นภาษาไทยว่า “' || left(regexp_replace(product_name || ' ใช้ได้ในสถานการณ์แบบนี้: ' || first_line, '[“”"]', '', 'g'), 240) || '”';
    shot2_voice := 'พูดเป็นภาษาไทยว่า “อีกมุมที่ใช้ได้คือ ' || left(regexp_replace(second_line, '[“”"]', '', 'g'), 200) || '”';
    shot3_voice := 'พูดเป็นภาษาไทยว่า “โดยรวมแล้วเหมาะกับ ' || left(regexp_replace(audience || ' และคนที่ต้องการ ' || need, '[“”"]', '', 'g'), 200) || '”';
  END IF;

  RETURN jsonb_build_object(
    'schemaVersion', '1.0',
    'durationSec', 30,
    'aspectRatio', '9:16',
    'language', 'th',
    'structureLabel', '30 วินาที | 3 Shot | Shot ละ 10 วินาที',
    'noOnScreenText', true,
    'shots', jsonb_build_array(
      jsonb_build_object(
        'order', 1,
        'startSec', 0,
        'endSec', 10,
        'title', shot1_title,
        'videoPrompt', shot1_prompt,
        'subShots', jsonb_build_array(
          left('เห็นสถานการณ์หรือปัญหา: ' || first_line, 480),
          'ลูกค้าเริ่มสนใจหรือแสดงสีหน้าว่าปัญหานี้เกี่ยวข้องกับตัวเอง',
          'Close-up รายละเอียดของปัญหาหรือบริบทให้ดูสมจริง'
        ),
        'thaiVoiceover', shot1_voice
      ),
      jsonb_build_object(
        'order', 2,
        'startSec', 10,
        'endSec', 20,
        'title', shot2_title,
        'videoPrompt', shot2_prompt,
        'subShots', jsonb_build_array(
          left('หยิบหรือวางสินค้าเข้ามาในเฟรม: ' || product_name, 480),
          left('โชว์จุดเด่นหรือหลักฐานสำคัญ: ' || second_line, 480),
          'เชื่อมประโยชน์สินค้าเข้ากับปัญหาหรือข้อกังวลให้เห็นในภาพ'
        ),
        'thaiVoiceover', shot2_voice
      ),
      jsonb_build_object(
        'order', 3,
        'startSec', 20,
        'endSec', 30,
        'title', shot3_title,
        'videoPrompt', shot3_prompt,
        'subShots', jsonb_build_array(
          left('โชว์บริบทใช้งานจริง: ' || use_case, 480),
          'ให้เห็นผลลัพธ์หลังใช้หรือเหตุผลที่ทำให้ตัดสินใจง่ายขึ้น',
          left('ปิดด้วยภาพสินค้าและจังหวะชวน ' || cta_text, 480)
        ),
        'thaiVoiceover', shot3_voice
      )
    )
  );
END;
$$;

WITH normalized AS (
  SELECT
    insight.id,
    COALESCE(insight."payloadJson"->>'productName', 'สินค้านี้') AS product_name,
    COALESCE(insight."payloadJson"->'videoBrief'->>'cta', 'ดูรายละเอียดสินค้า') AS cta_text,
    jsonb_agg(
      CASE
        WHEN option.option_json ? 'videoBrief' THEN option.option_json
        ELSE option.option_json || jsonb_build_object(
          'videoBrief',
          marketplace_story_option_video_brief_0188(
            option.option_json,
            COALESCE(insight."payloadJson"->>'productName', 'สินค้านี้'),
            COALESCE(insight."payloadJson"->'videoBrief'->>'cta', 'ดูรายละเอียดสินค้า')
          )
        )
      END
      ORDER BY option.option_order
    ) AS story_options
  FROM "marketplace_capture_insights" insight
  CROSS JOIN LATERAL (
    SELECT
      value AS option_json,
      CASE value->>'id'
        WHEN 'story_option:problem_solution' THEN 1
        WHEN 'story_option:objection_trust' THEN 2
        WHEN 'story_option:quick_demo' THEN 3
        WHEN 'story_option:use_case_moment' THEN 4
        ELSE 99
      END AS option_order
    FROM jsonb_array_elements(COALESCE(insight."payloadJson"->'storyOptions', '[]'::jsonb))
    WHERE value->>'id' IN (
      'story_option:problem_solution',
      'story_option:objection_trust',
      'story_option:quick_demo',
      'story_option:use_case_moment'
    )
  ) option
  WHERE insight."insightType" = 'storytelling_handoff'
  GROUP BY insight.id, insight."payloadJson"
)
UPDATE "marketplace_capture_insights" insight
SET
  "payloadJson" = jsonb_set(
    jsonb_set(
      insight."payloadJson",
      '{storyOptions}',
      normalized.story_options,
      true
    ),
    '{__syncMetadata,storyOptionVideoBriefCount}',
    to_jsonb(jsonb_array_length(normalized.story_options)),
    true
  ),
  "updatedAt" = now()
FROM normalized
WHERE insight.id = normalized.id
  AND (
    jsonb_array_length(COALESCE(insight."payloadJson"->'storyOptions', '[]'::jsonb)) <> 4
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(insight."payloadJson"->'storyOptions', '[]'::jsonb)) existing_option
      WHERE existing_option->>'id' IN (
        'story_option:problem_solution',
        'story_option:objection_trust',
        'story_option:quick_demo',
        'story_option:use_case_moment'
      )
        AND NOT (existing_option ? 'videoBrief')
    )
  );

DROP FUNCTION marketplace_story_option_video_brief_0188(jsonb, text, text);
