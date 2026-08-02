/* =========================================================================
   RatedWorktops — Nano Banana (Gemini Flash) Fal.ai Image Edit Proxy
   (Supabase Edge Function)
   =========================================================================
   Uses fal-ai/nano-banana/edit (Gemini Flash Image Editor) via Fal.ai API key
   to perform high-precision photorealistic image-to-image kitchen worktop
   replacement.
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

    // ── 3. Parse request body ─────────────────────────────────────────────────
    const body = await req.json();
    if (!body.image || !body.prompt) {
      return new Response(JSON.stringify({ error: { message: "Missing required fields: image and prompt." } }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Nano Banana Proxy] User: ${user.id} | prompt len: ${body.prompt?.length} | image len: ${body.image?.length} | stone_image: ${body.stone_image ? 'yes' : 'no'}`);

    // ── 4. Call fal-ai/nano-banana/edit Endpoint ──────────────────────────────
    // Build image_urls array: kitchen photo + stone texture reference (if provided)
    const imageUrls = [body.image];
    let enhancedPrompt = body.prompt;
    if (body.stone_image) {
      imageUrls.push(body.stone_image);
      // Enhance the prompt to explicitly reference the stone texture image
      enhancedPrompt = `${body.prompt} CRITICAL: The second reference image shows the exact stone texture slab that MUST be applied. Match its exact color, pattern, veining, and surface finish precisely on both the worktop and splashback surfaces. The worktop and splashback must look identical to the reference stone slab.`;
      console.log("[Nano Banana Proxy] Stone reference image included in image_urls");
    }

    const falPayload: any = {
      prompt: enhancedPrompt,
      image_urls: imageUrls,
      num_images: 1,
      aspect_ratio: "auto",
      output_format: "png",
      safety_tolerance: "4"
    };

    console.log("[Nano Banana Proxy] Sending request to fal-ai/nano-banana/edit ...");

    let falResponse = await fetch("https://fal.run/fal-ai/nano-banana/edit", {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(falPayload)
    });

    let resData = await falResponse.json();
    console.log("[Nano Banana Proxy] Nano Banana status:", falResponse.status);

    // Fallback to fast-sdxl/inpainting if nano-banana returns error
    if (!falResponse.ok) {
      console.warn("[Nano Banana Proxy] Nano Banana failed, falling back to fast-sdxl/inpainting:", JSON.stringify(resData));
      const fallbackPayload: any = {
        image_url: body.image,
        prompt: body.prompt,
        strength: 0.90,
        num_inference_steps: 35,
        guidance_scale: 7.5
      };
      if (body.mask) fallbackPayload.mask_url = body.mask;

      falResponse = await fetch("https://fal.run/fal-ai/fast-sdxl/inpainting", {
        method: "POST",
        headers: {
          "Authorization": `Key ${FAL_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(fallbackPayload)
      });
      resData = await falResponse.json();
      console.log("[Nano Banana Proxy] Fallback status:", falResponse.status);
    }

    if (!falResponse.ok) {
      const errMsg = resData?.detail ?? resData?.message ?? JSON.stringify(resData);
      console.error("[Nano Banana Proxy] Fal.ai error:", errMsg);
      return new Response(JSON.stringify({ error: { message: "Fal.ai error: " + errMsg } }), {
        status: falResponse.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const falImageUrl = resData.images?.[0]?.url || resData.image?.url;
    const falContentType = resData.images?.[0]?.content_type || "image/png";

    if (!falImageUrl) {
      console.error("[Nano Banana Proxy] No image URL in response:", JSON.stringify(resData));
      return new Response(JSON.stringify({ error: { message: "Fal.ai returned no image." } }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    console.log("[Nano Banana Proxy] Generated Image URL:", falImageUrl.substring(0, 90));

    // ── 5. Convert generated image to Base64 ──────────────────────────────────
    let finalUrl = falImageUrl;
    try {
      const imgResponse = await fetch(falImageUrl);
      if (imgResponse.ok) {
        const imgBytes = new Uint8Array(await imgResponse.arrayBuffer());
        const imgBase64 = uint8ArrayToBase64(imgBytes);
        finalUrl = `data:${falContentType};base64,${imgBase64}`;
        console.log("[Nano Banana Proxy] Converted to base64 successfully, len:", finalUrl.length);
      }
    } catch (b64Err) {
      console.warn("[Nano Banana Proxy] Base64 conversion skipped, using CDN URL:", b64Err);
    }

    // ── 6. Return response to client ──────────────────────────────────────────
    return new Response(JSON.stringify({ data: [{ url: finalUrl }] }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("[Nano Banana Proxy] Unhandled error:", err);
    return new Response(JSON.stringify({ error: { message: String(err?.message ?? err) } }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
