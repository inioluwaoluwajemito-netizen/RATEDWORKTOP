/* =========================================================================
   RatedWorktops — Fal.ai Image-to-Image Proxy (Supabase Edge Function)
   =========================================================================
   Accepts the original kitchen photo + stone description prompt.
   Calls Fal.ai flux/dev/image-to-image, fetches the resulting image bytes,
   and returns the image AS BASE64 so the frontend has zero CORS issues.
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

    console.log(`[Proxy] User: ${user.id} | prompt length: ${body.prompt?.length} | image length: ${body.image?.length}`);

    // ── 4. Call Fal.ai flux/dev/image-to-image ───────────────────────────────
    console.log("[Proxy] Calling fal-ai/flux/dev/image-to-image...");

    const falPayload = {
      image_url: body.image,
      prompt: body.prompt,
      strength: 0.80,           // 0.80 = keeps room layout, replaces materials
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: false,
      output_format: "jpeg"
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
    console.log("[Proxy] Fal.ai status:", falResponse.status, "| keys:", Object.keys(resData).join(','));

    if (!falResponse.ok) {
      const errMsg = resData?.detail ?? resData?.message ?? JSON.stringify(resData);
      console.error("[Proxy] Fal.ai error:", errMsg);
      return new Response(JSON.stringify({ error: { message: "Fal.ai error: " + errMsg } }), {
        status: falResponse.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // Fal.ai returns: { images: [{ url, content_type, width, height }], ... }
    const falImageUrl = resData.images?.[0]?.url;
    const falContentType = resData.images?.[0]?.content_type || "image/jpeg";

    if (!falImageUrl) {
      console.error("[Proxy] No image URL in Fal.ai response:", JSON.stringify(resData));
      return new Response(JSON.stringify({ error: { message: "Fal.ai returned no image. Please try again." } }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    console.log("[Proxy] Fal.ai image URL:", falImageUrl.substring(0, 100));

    // ── 5. Fetch the image bytes and return as base64 ────────────────────────
    // This avoids ALL CORS issues on the frontend — we return the raw image
    // data, not just a URL to a third-party CDN that blocks cross-origin requests.
    console.log("[Proxy] Fetching image bytes to convert to base64...");
    const imgResponse = await fetch(falImageUrl);
    if (!imgResponse.ok) {
      console.error("[Proxy] Failed to fetch generated image:", imgResponse.status);
      // Fallback: return the URL anyway and let frontend try directly
      return new Response(JSON.stringify({ data: [{ url: falImageUrl }] }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const imgBytes = await imgResponse.arrayBuffer();
    const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgBytes)));
    const dataUri = `data:${falContentType};base64,${imgBase64}`;

    console.log("[Proxy] Base64 data URI length:", dataUri.length, "| Returning to client.");

    // ── 6. Return in OpenAI-compatible format with base64 data URI ───────────
    return new Response(JSON.stringify({ data: [{ url: dataUri }] }), {
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
