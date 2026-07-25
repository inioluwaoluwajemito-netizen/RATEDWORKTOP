/* =========================================================================
   RatedWorktops — Fal.ai Inpainting Proxy with Mask & Color Precision (Supabase Edge Function)
   =========================================================================
   Accepts kitchen image + inpainting mask + stone prompt.
   Calls Fal.ai fast-sdxl/inpainting to replace ONLY the white mask area
   (countertop and splashback) with the exact selected stone color material.
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

// Safe Uint8Array to Base64 conversion avoiding RangeError / stack overflow
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // ── 1. Authenticate user ──────────────────────────────────────────────────
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

    // ── 2. Check for FAL_KEY secret ──────────────────────────────────────────
    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!FAL_KEY) {
      return new Response(JSON.stringify({ error: { message: "Server error: FAL_KEY secret not set in Supabase Dashboard." } }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // ── 3. Parse request body (image, mask, prompt) ───────────────────────────
    const body = await req.json();
    if (!body.image || !body.prompt) {
      return new Response(JSON.stringify({ error: { message: "Missing required fields: image and prompt." } }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Inpaint Proxy] User: ${user.id} | prompt len: ${body.prompt?.length} | image len: ${body.image?.length} | mask len: ${body.mask?.length || 0}`);

    // ── 4. Build payload for Fal.ai fast-sdxl/inpainting ─────────────────────
    const falPayload: any = {
      image_url: body.image,
      prompt: body.prompt,
      strength: 0.98,
      num_inference_steps: 32,
      guidance_scale: 8.0
    };

    if (body.mask) {
      falPayload.mask_url = body.mask;
    }

    console.log("[Inpaint Proxy] Sending request to fal-ai/fast-sdxl/inpainting ...");

    const falResponse = await fetch("https://fal.run/fal-ai/fast-sdxl/inpainting", {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(falPayload)
    });

    const resData = await falResponse.json();
    console.log("[Inpaint Proxy] Fal.ai status:", falResponse.status);

    if (!falResponse.ok) {
      const errMsg = resData?.detail ?? resData?.message ?? JSON.stringify(resData);
      console.error("[Inpaint Proxy] Fal.ai error:", errMsg);
      return new Response(JSON.stringify({ error: { message: "Fal.ai error: " + errMsg } }), {
        status: falResponse.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const falImageUrl = resData.images?.[0]?.url;
    const falContentType = resData.images?.[0]?.content_type || "image/jpeg";

    if (!falImageUrl) {
      console.error("[Inpaint Proxy] No image URL in Fal.ai response:", JSON.stringify(resData));
      return new Response(JSON.stringify({ error: { message: "Fal.ai inpainting returned no image." } }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    console.log("[Inpaint Proxy] Generated Image URL:", falImageUrl.substring(0, 90));

    // ── 5. Convert generated image to Base64 ──────────────────────────────────
    let finalUrl = falImageUrl;
    try {
      const imgResponse = await fetch(falImageUrl);
      if (imgResponse.ok) {
        const imgBytes = new Uint8Array(await imgResponse.arrayBuffer());
        const imgBase64 = uint8ArrayToBase64(imgBytes);
        finalUrl = `data:${falContentType};base64,${imgBase64}`;
        console.log("[Inpaint Proxy] Converted to base64 successfully, len:", finalUrl.length);
      }
    } catch (b64Err) {
      console.warn("[Inpaint Proxy] Base64 conversion skipped, using CDN URL:", b64Err);
    }

    // ── 6. Return response to client ──────────────────────────────────────────
    return new Response(JSON.stringify({ data: [{ url: finalUrl }] }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("[Inpaint Proxy] Unhandled error:", err);
    return new Response(JSON.stringify({ error: { message: String(err?.message ?? err) } }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
