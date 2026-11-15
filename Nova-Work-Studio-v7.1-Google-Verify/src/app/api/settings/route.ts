import { NextResponse } from "next/server";
import { getSettings, ensureSettings, getAiConfig } from "@/lib/server";

export const dynamic = "force-dynamic";

// Public-safe subset only — NEVER any secret key. AI keys stay server-side;
// clients only learn whether the central AI service is configured.
export async function GET() {
  await ensureSettings();
  const s = await getSettings();
  const ai = await getAiConfig();
  return NextResponse.json({
    settings: {
      price_monthly_pkr: s.price_monthly_pkr, price_yearly_pkr: s.price_yearly_pkr,
      price_monthly_usd: s.price_monthly_usd, price_yearly_usd: s.price_yearly_usd,
      jazzcash_number: s.jazzcash_number, jazzcash_title: s.jazzcash_title,
      easypaisa_number: s.easypaisa_number, easypaisa_title: s.easypaisa_title,
      gumroad_permalink: s.gumroad_permalink, support_whatsapp: s.support_whatsapp,
      limit_guest_chat: s.limit_guest_chat, limit_free_chat: s.limit_free_chat,
      limit_free_prompts: s.limit_free_prompts, limit_free_images: s.limit_free_images,
      limit_free_whatsapp: s.limit_free_whatsapp, limit_free_sheet: s.limit_free_sheet,
      limit_free_projects: s.limit_free_projects, limit_free_databases: s.limit_free_databases,
      cloud_url: s.cloud_url, has_cloud: !!(s.cloud_url),
      ai_configured: !!ai.chat.key, ai_image_configured: !!ai.image.key,
    },
  });
}
