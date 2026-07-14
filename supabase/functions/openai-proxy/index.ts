/* =========================================================================
   RatedWorktops — OpenAI API Proxy (Supabase Edge Function)
   =========================================================================
   This script runs in a Deno-based Supabase Edge Function.
   To deploy this function:
   1. Install Supabase CLI: https://supabase.com/docs/guides/cli
   2. Run: supabase functions new openai-proxy
   3. Copy this code into the generated index.ts / index.js file.
   4. Set your OpenAI API Key in your dashboard secrets:
      supabase secrets set OPENAI_API_KEY=sk-proj-...
   ========================================================================= */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Helper function to convert base64 data URI to a binary Blob
function base64ToBlob(base64Uri: string): Blob {
  const parts = base64Uri.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
}

serve(async (req) => {
  // Handle CORS Preflight requests for cross-origin requests from the web app
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: { message: "Missing Authorization header" } }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json', 
          'Access-Control-Allow-Origin': '*' 
        }
      });
    }

    // 1. Initialize Supabase Client with the user's authorization header to verify their token
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Retrieve auth user to confirm the token is valid and active
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: { message: "Unauthorized token: " + (authError?.message || "") } }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json', 
          'Access-Control-Allow-Origin': '*' 
        }
      });
    }

    // 2. Retrieve the OpenAI API Key from Deno secrets
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: { message: "Server configuration error: OPENAI_API_KEY secret is not set in Supabase." } }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json', 
          'Access-Control-Allow-Origin': '*' 
        }
      });
    }

    // 3. Parse JSON from frontend (contains image and mask as base64 URIs, and prompt)
    const bodyJson = await req.json();

    if (!bodyJson.image || !bodyJson.mask || !bodyJson.prompt) {
       return new Response(JSON.stringify({ error: { message: "Missing required fields: image, mask, or prompt." } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 4. Convert Base64 images to Blobs
    const imageBlob = base64ToBlob(bodyJson.image);
    const maskBlob = base64ToBlob(bodyJson.mask);

    // 5. Construct FormData for OpenAI API
    const formData = new FormData();
    formData.append("image", imageBlob, "image.png");
    formData.append("mask", maskBlob, "mask.png");
    formData.append("prompt", bodyJson.prompt);
    formData.append("n", "1");
    formData.append("size", "1024x1024");

    // 6. Forward request to OpenAI API
    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
        // Do NOT set Content-Type header here; fetch will automatically set it to multipart/form-data with the correct boundary
      },
      body: formData
    });

    const resData = await response.json();
    
    // Return the response back to the frontend
    return new Response(JSON.stringify(resData), {
      status: response.status === 200 ? 200 : response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    console.error("Proxy Error:", err);
    return new Response(JSON.stringify({ error: { message: err.message } }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      }
    });
  }
});
