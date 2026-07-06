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

    // 2. Retrieve the master OpenAI API Key from Deno secrets
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

    // 3. Parse the incoming multipart form data (contains: image, mask, prompt, model, size)
    const body = await req.formData();

    // 4. Forward request to OpenAI API using our master key
    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: body
    });

    const resData = await response.json();
    return new Response(JSON.stringify(resData), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    console.error("OpenAI Proxy Error:", err);
    return new Response(JSON.stringify({ error: { message: err.message } }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      }
    });
  }
});
