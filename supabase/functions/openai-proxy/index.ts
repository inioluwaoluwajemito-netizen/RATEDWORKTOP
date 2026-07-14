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

    // 2. Retrieve the Replicate API Key from Deno secrets
    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_TOKEN) {
      return new Response(JSON.stringify({ error: { message: "Server configuration error: REPLICATE_API_TOKEN secret is not set in Supabase." } }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json', 
          'Access-Control-Allow-Origin': '*' 
        }
      });
    }

    // 3. Parse JSON from frontend (contains image and mask as base64 URIs, and prompt)
    const bodyJson = await req.json();

    // 4. Forward request to Replicate API (using Prefer: wait for synchronous response)
    const replicatePayload = {
      version: "95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3",
      input: {
        prompt: bodyJson.prompt,
        image: bodyJson.image,
        mask: bodyJson.mask,
        num_outputs: 1
      }
    };

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait'
      },
      body: JSON.stringify(replicatePayload)
    });

    const resData = await response.json();
    
    // Map Replicate's response to match the OpenAI format the frontend expects: { data: [{ url: "..." }] }
    let mappedOutput = { data: [] };
    if (resData.status === "succeeded" && resData.output && resData.output.length > 0) {
      mappedOutput.data.push({ url: resData.output[0] });
    } else if (resData.error) {
      mappedOutput.error = { message: resData.error };
    } else {
      mappedOutput.error = { message: `Replicate API Error: ${resData.status} - ${resData.detail || resData.title || JSON.stringify(resData)}` };
    }

    return new Response(JSON.stringify(mappedOutput), {
      status: response.status === 201 || response.status === 200 ? 200 : response.status,
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
