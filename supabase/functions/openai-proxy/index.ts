/* =========================================================================
   RatedWorktops — OpenAI API Proxy (Supabase Edge Function)
   =========================================================================
   Uses OpenAI DALL-E 2 images/edits for AI inpainting.
   Required Supabase secret: OPENAI_API_KEY
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

    // --- 2. Check for OpenAI API Key ---
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: { message: "Server error: OPENAI_API_KEY secret not set in Supabase Dashboard." } }), {
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

    // --- 5. Build FormData for OpenAI ---
    // dall-e-2 is the ONLY official public model for images/edits
    // Requires: OpenAI account with $5+ credit (Tier 1+)
    const formData = new FormData();
    formData.append("model", "dall-e-2");
    formData.append("image", new Blob([imageBytes], { type: "image/png" }), "image.png");
    formData.append("mask", new Blob([maskBytes], { type: "image/png" }), "mask.png");
    formData.append("prompt", body.prompt);
    formData.append("n", "1");
    formData.append("size", "1024x1024");

    // --- 6. Call OpenAI images/edits ---
    console.log("Sending request to OpenAI images/edits (dall-e-2 default)...");
    const openAIResponse = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`
        // Do NOT set Content-Type — Deno sets multipart boundary automatically
      },
      body: formData
    });

    const resData = await openAIResponse.json();
    console.log("OpenAI response status:", openAIResponse.status);

    if (!openAIResponse.ok) {
      const errMsg = resData?.error?.message ?? JSON.stringify(resData);
      console.error("OpenAI error:", errMsg);
      return new Response(JSON.stringify({ error: { message: "OpenAI Error: " + errMsg } }), {
        status: openAIResponse.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // gpt-image-1 returns b64_json — convert to a data URL so frontend gets { data: [{ url: "..." }] }
    if (resData.data && resData.data.length > 0) {
      const item = resData.data[0];
      if (item.b64_json && !item.url) {
        resData.data[0] = { url: `data:image/png;base64,${item.b64_json}` };
      }
    }

    return new Response(JSON.stringify(resData), {
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
