/* =========================================================================
   RatedWorktops — Fal.ai Image-to-Image Proxy (Supabase Edge Function)
   =========================================================================
   Accepts the original kitchen photo + a stone description prompt and
   calls Fal.ai flux/dev/image-to-image to generate a brand-new render.
   Required Supabase secret: FAL_KEY
   ========================================================================= */

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-ignore - Deno is available in Supabase Edge Functions
declare const Deno: any;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // ── 1. Authenticate the user ─────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: { message: "Missing Authorization header" } }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: { message: "Unauthorized: " + (authError?.message ?? "invalid token") } }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // ── 2. Check for Fal.ai API Key ──────────────────────────────────────────
    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!FAL_KEY) {
      return new Response(JSON.stringify({ error: { message: "Server error: FAL_KEY secret not configured in Supabase Dashboard." } }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // ── 3. Parse the request body ────────────────────────────────────────────
    const body = await req.json();
    if (!body.image || !body.prompt) {
      return new Response(JSON.stringify({ error: { message: "Missing required fields: image and prompt." } }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const mode = body.mode || 'image-to-image';
    console.log(`[Proxy] mode=${mode}, prompt length=${body.prompt?.length}, image length=${body.image?.length}`);

    // ── 4. Call Fal.ai flux/dev/image-to-image ───────────────────────────────
    // This model takes the kitchen photo as reference and generates a completely
    // new photorealistic image with the selected stone material applied.
    console.log("[Proxy] Calling fal-ai/flux/dev/image-to-image ...");

    const falPayload: any = {
      image_url: body.image,
      prompt: body.prompt,
      strength: 0.80,          // 0.80 = good balance: keeps room structure, changes materials
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: false
    };

    const falResponse = await fetch("https://fal.run/fal-ai/flux/dev/image-to-image", {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(falPayload)
    });

    const resData = await falResponse.json();
    console.log("[Proxy] Fal.ai response status:", falResponse.status);
    console.log("[Proxy] Fal.ai response keys:", Object.keys(resData));

    if (!falResponse.ok) {
      const errMsg = resData?.detail ?? resData?.message ?? JSON.stringify(resData);
      console.error("[Proxy] Fal.ai error:", errMsg);
      return new Response(JSON.stringify({ error: { message: "Fal.ai Error: " + errMsg } }), {
        status: falResponse.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // Fal.ai flux returns: { images: [{ url, content_type }], timings, seed }
    const imageUrl = resData.images?.[0]?.url || "";
    console.log("[Proxy] Generated image URL:", imageUrl.substring(0, 100));

    if (!imageUrl) {
      console.error("[Proxy] No image URL in Fal.ai response:", JSON.stringify(resData));
      return new Response(JSON.stringify({ error: { message: "Fal.ai returned no image. Please try again." } }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // ── 5. Return image URL in OpenAI-compatible format ──────────────────────
    const mappedResponse = {
      data: [{ url: imageUrl }]
    };

    return new Response(JSON.stringify(mappedResponse), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("[Proxy] Unhandled error:", err);
    return new Response(JSON.stringify({ error: { message: String(err?.message ?? err) } }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
