/* =========================================================================
   RatedWorktops — OpenAI API Proxy (Supabase Edge Function)
   =========================================================================
   Uses OpenAI DALL-E 2 images/edits for AI inpainting.
   Required Supabase secret: OPENAI_API_KEY
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

serve(async (req: Request) => {
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

    // --- 2. Check for Fal.ai API Key ---
    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!FAL_KEY) {
      return new Response(JSON.stringify({ error: { message: "Server error: FAL_KEY secret not set in Supabase Dashboard." } }), {
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

    // --- 4. Call Fal.ai inpainting ---
    console.log("Sending request to Fal.ai (fast-sdxl/inpainting)...");
    const falResponse = await fetch("https://fal.run/fal-ai/fast-sdxl/inpainting", {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_url: body.image,
        mask_url: body.mask,
        prompt: body.prompt
      })
    });

    const resData = await falResponse.json();
    console.log("Fal.ai response status:", falResponse.status);

    if (!falResponse.ok) {
      const errMsg = resData?.detail ?? JSON.stringify(resData);
      console.error("Fal.ai error:", errMsg);
      return new Response(JSON.stringify({ error: { message: "Fal.ai Error: " + errMsg } }), {
        status: falResponse.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // --- 5. Map Fal.ai response back to OpenAI structure for frontend compatibility ---
    const mappedResponse = {
      data: [
        {
          url: resData.images?.[0]?.url || ""
        }
      ]
    };

    return new Response(JSON.stringify(mappedResponse), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("Proxy catch error:", err);
    return new Response(JSON.stringify({ error: { message: String(err?.message ?? err) } }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
