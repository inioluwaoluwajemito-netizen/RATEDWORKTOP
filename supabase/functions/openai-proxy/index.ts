/* =========================================================================
   RatedWorktops — OpenAI Image Inpainting & Edit Proxy (Supabase Edge Function)
   =========================================================================
   Uses OpenAI API (v1/images/edits and v1/images/generations) to perform
   photorealistic image-to-image kitchen worktop and splashback replacement.
   Required Supabase secret: OPENAI_API_KEY
   ========================================================================= */

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

// @ts-ignore
declare const Deno: any;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Helper: Convert Data URI to Blob for FormData upload
function dataURItoBlob(dataURI: string): Blob {
  const parts = dataURI.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // ── 1. Authenticate request ────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    const apiKeyHeader = req.headers.get('apikey');

    let isAuthenticated = false;
    let userId = "guest";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
          isAuthenticated = true;
          userId = user.id;
        }
      } catch (e) {}
    }

    // Fallback: allow requests with valid apikey or anon key for guest/trial users
    if (!isAuthenticated) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      if (apiKeyHeader === anonKey || (authHeader && authHeader.includes(anonKey)) || !authHeader) {
        isAuthenticated = true;
        userId = "anon-user";
      }
    }

    // ── 2. Parse request body & fetch OPENAI_API_KEY from Supabase ──────────
    const body = await req.json();
    let OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || 
                         Deno.env.get("Open ai aki key") || 
                         Deno.env.get("Open AI API Key") || 
                         Deno.env.get("OpenAI API Key") || 
                         Deno.env.get("OPENAI_KEY");

    // Fallback: If not set in Edge Function secrets, fetch from Supabase public.settings table
    if (!OPENAI_API_KEY) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
        );
        const { data: settings } = await supabaseAdmin.from('settings').select('*').eq('id', 1).maybeSingle();
        if (settings) {
          OPENAI_API_KEY = settings.openai_api_key || settings.data?.openai_api_key || settings.data?.openaiApiKey;
        }
      } catch (e) {
        console.warn("[OpenAI Proxy] Could not read key from settings table:", e);
      }
    }

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: { message: "OpenAI API Key not found in Supabase. Please ensure your secret is named OPENAI_API_KEY in Supabase Edge Function Secrets." } }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    if (!body.image || !body.prompt) {
      return new Response(JSON.stringify({ error: { message: "Missing required fields: image and prompt." } }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[OpenAI Proxy] User: ${userId} | prompt len: ${body.prompt?.length} | image len: ${body.image?.length}`);

    // ── 3. Build OpenAI Image Edit request (v1/images/edits) ──────────────────
    const formData = new FormData();
    const imageBlob = dataURItoBlob(body.image);
    formData.append('image', imageBlob, 'image.png');

    if (body.mask) {
      const maskBlob = dataURItoBlob(body.mask);
      formData.append('mask', maskBlob, 'mask.png');
    }

    formData.append('model', 'gpt-image-1');
    formData.append('prompt', body.prompt);
    formData.append('n', '1');
    formData.append('size', '1024x1024');
    formData.append('quality', 'high');

    console.log("[OpenAI Proxy] Sending request to OpenAI v1/images/edits ...");

    let openAiRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    let resData = await openAiRes.json().catch(() => ({}));
    console.log("[OpenAI Proxy] OpenAI Response Status:", openAiRes.status);

    // ── 4. Fallback to GPT Image Generation if Image Edit is unavailable ────────
    if (!openAiRes.ok) {
      console.warn("[OpenAI Proxy] v1/images/edits failed, falling back to gpt-image-1 generation:", JSON.stringify(resData));
      const dallePayload = {
        model: "gpt-image-1",
        prompt: body.prompt,
        n: 1,
        size: "1024x1024",
        quality: "high"
      };

      openAiRes = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(dallePayload)
      });
      resData = await openAiRes.json().catch(() => ({}));
      console.log("[OpenAI Proxy] GPT Image Fallback Status:", openAiRes.status);
    }

    if (!openAiRes.ok) {
      const errMsg = resData?.error?.message || JSON.stringify(resData);
      console.error("[OpenAI Proxy] OpenAI API Error:", errMsg);
      return new Response(JSON.stringify({ error: { message: "OpenAI Error: " + errMsg } }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const imageUrl = resData.data?.[0]?.url || (resData.data?.[0]?.b64_json ? `data:image/png;base64,${resData.data[0].b64_json}` : null);
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: { message: "OpenAI returned no image data." } }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    console.log("[OpenAI Proxy] OpenAI Inpainting generated successfully");

    return new Response(JSON.stringify({ data: [{ url: imageUrl }] }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("[OpenAI Proxy] Unhandled error:", err);
    return new Response(JSON.stringify({ error: { message: String(err?.message ?? err) } }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
