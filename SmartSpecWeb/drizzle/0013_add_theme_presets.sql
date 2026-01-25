-- Create theme_presets table for pre-built theme options
-- Domain admins can select from these presets to quickly style their tenant

CREATE TABLE IF NOT EXISTS theme_presets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE,
  "displayName" VARCHAR(255) NOT NULL,
  description TEXT,
  "previewImageUrl" VARCHAR(512),
  "themeConfig" JSONB NOT NULL,
  "isActive" BOOLEAN DEFAULT true NOT NULL,
  "isDefault" BOOLEAN DEFAULT false NOT NULL,
  "sortOrder" INTEGER DEFAULT 0 NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index for faster active preset queries
CREATE INDEX IF NOT EXISTS idx_theme_presets_active ON theme_presets("isActive");
CREATE INDEX IF NOT EXISTS idx_theme_presets_sort ON theme_presets("sortOrder");

-- Insert default theme presets
INSERT INTO theme_presets (name, "displayName", description, "themeConfig", "isDefault", "sortOrder") VALUES
(
  'default',
  'Default Blue',
  'Clean modern design with professional blue tones',
  '{"primaryColor":"#3b82f6","secondaryColor":"#6366f1","accentColor":"#8b5cf6","backgroundColor":"#ffffff","textColor":"#111827","layout":"modern","headerStyle":"solid","footerStyle":"minimal","buttonStyle":"rounded","cardStyle":"elevated"}',
  true,
  0
),
(
  'dark-professional',
  'Dark Professional',
  'Sleek dark theme for a professional look',
  '{"primaryColor":"#3b82f6","secondaryColor":"#8b5cf6","accentColor":"#06b6d4","backgroundColor":"#111827","textColor":"#f9fafb","layout":"modern","headerStyle":"blur","footerStyle":"minimal","buttonStyle":"rounded","cardStyle":"elevated"}',
  false,
  1
),
(
  'ocean-breeze',
  'Ocean Breeze',
  'Cool blue and cyan tones inspired by the sea',
  '{"primaryColor":"#0ea5e9","secondaryColor":"#06b6d4","accentColor":"#22d3d1","backgroundColor":"#f0f9ff","textColor":"#0c4a6e","layout":"modern","headerStyle":"transparent","footerStyle":"detailed","buttonStyle":"pill","cardStyle":"flat"}',
  false,
  2
),
(
  'sunset-warm',
  'Sunset Warm',
  'Warm inviting colors with orange and red tones',
  '{"primaryColor":"#f97316","secondaryColor":"#ef4444","accentColor":"#fbbf24","backgroundColor":"#fffbeb","textColor":"#7c2d12","layout":"creative","headerStyle":"solid","footerStyle":"detailed","buttonStyle":"rounded","cardStyle":"outlined"}',
  false,
  3
),
(
  'minimal-gray',
  'Minimal Gray',
  'Clean minimal design with neutral gray tones',
  '{"primaryColor":"#374151","secondaryColor":"#6b7280","accentColor":"#9ca3af","backgroundColor":"#ffffff","textColor":"#111827","layout":"minimal","headerStyle":"transparent","footerStyle":"hidden","buttonStyle":"square","cardStyle":"flat"}',
  false,
  4
),
(
  'forest-green',
  'Forest Green',
  'Natural earthy tones with green accents',
  '{"primaryColor":"#059669","secondaryColor":"#10b981","accentColor":"#34d399","backgroundColor":"#f0fdf4","textColor":"#064e3b","layout":"modern","headerStyle":"solid","footerStyle":"minimal","buttonStyle":"rounded","cardStyle":"elevated"}',
  false,
  5
),
(
  'royal-purple',
  'Royal Purple',
  'Elegant purple theme with a luxurious feel',
  '{"primaryColor":"#7c3aed","secondaryColor":"#8b5cf6","accentColor":"#a78bfa","backgroundColor":"#faf5ff","textColor":"#4c1d95","layout":"creative","headerStyle":"blur","footerStyle":"detailed","buttonStyle":"pill","cardStyle":"elevated"}',
  false,
  6
),
(
  'coral-pink',
  'Coral Pink',
  'Vibrant and playful coral and pink tones',
  '{"primaryColor":"#ec4899","secondaryColor":"#f472b6","accentColor":"#fb7185","backgroundColor":"#fdf2f8","textColor":"#831843","layout":"creative","headerStyle":"transparent","footerStyle":"minimal","buttonStyle":"rounded","cardStyle":"outlined"}',
  false,
  7
);
