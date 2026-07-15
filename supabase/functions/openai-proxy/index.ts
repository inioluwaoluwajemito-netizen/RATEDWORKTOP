/* =========================================================================
   RatedWorktops — AI Proxy (Supabase Edge Function)
   =========================================================================
   Uses Stability AI (v2beta inpainting) for photorealistic kitchen edits.
   Required Supabase secret: STABILITY_API_KEY
   ========================================================================= */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Helper: convert a base64 data URI string to a Uint8Array
function base64ToUint8Array(base64Uri: string): { bytes: Uint8Array; mimeType: string } {
  const [meta, data] = base64Uri.split(';base64,');
  const mimeType = meta.split(':')[1] || 'image/png';
  const binaryString = atob(data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return { bytes, mimeType };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // --- 1. Authenticate the user ---
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

    // --- 2. Check for Stability API Key ---
    const STABILITY_API_KEY = Deno.env.get("STABILITY_API_KEY");
    if (!STABILITY_API_KEY) {
      return new Response(JSON.stringify({ error: { message: "Server error: STABILITY_API_KEY secret not set in Supabase Dashboard." } }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // --- 3. Parse the request body ---
    const body = await req.json();
    if (!body.image || !body.mask || !body.prompt) {
      return new Response(JSON.stringify({ error: { message: "Missing required fields: image, mask, or prompt." } }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // --- 4. Decode base64 images to binary ---
    const { bytes: imageBytes, mimeType: imageMime } = base64ToUint8Array(body.image);
    const { bytes: maskBytes } = base64ToUint8Array(body.mask);

    // --- 5. Build FormData for Stability AI ---
    const formData = new FormData();
    formData.append("image", new Blob([imageBytes], { type: "image/png" }), "image.png");
    formData.append("mask", new Blob([maskBytes], { type: "image/png" }), "mask.png");
    formData.append("prompt", body.prompt);
    formData.append("output_format", "png");

    // --- 6. Call Stability AI v2beta inpainting ---
    console.log("Sending request to Stability AI inpainting...");
    const stabilityResponse = await fetch("https://api.stability.ai/v2beta/stable-image/edit/inpainting", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STABILITY_API_KEY}`,
        "Accept": "application/json"
      },
      body: formData
    });

    const resData = await stabilityResponse.json();
    console.log("Stability AI response status:", stabilityResponse.status);

    if (!stabilityResponse.ok) {
      const errMsg = resData?.errors?.[0] ?? resData?.message ?? JSON.stringify(resData);
      console.error("Stability AI error:", errMsg);
      return new Response(JSON.stringify({ error: { message: "AI Error: " + errMsg } }), {
        status: stabilityResponse.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // --- 7. Map back to OpenAI format for frontend compatibility ---
    // Stability AI returns: { "image": "base64..." }
    // Frontend expects: { data: [{ url: "data:image/png;base64,..." }] }
    let finalBase64 = resData.image || "";
    const openAIFormat = {
      data: [
        { url: `data:image/png;base64,${finalBase64}` }
      ]
    };

    return new Response(JSON.stringify(openAIFormat), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error("Proxy catch error:", err);
    return new Response(JSON.stringify({ error: { message: String(err?.message ?? err) } }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
