/* =========================================================================
   RatedWorktops — AI Surface Segmenter (Supabase Edge Function)
   =========================================================================
   This script runs in a Deno-based Supabase Edge Function to proxy calls
   to Hugging Face. This secures your HF_TOKEN secret on the server so that
   no one can inspect your website code and steal your token.
   
   To deploy this function:
   1. Install Supabase CLI: https://supabase.com/docs/guides/cli
   2. Run in terminal: supabase functions new ai-segmenter
   3. Copy this code into the generated index.ts or index.js file.
   4. Set your Hugging Face token in Supabase:
      supabase secrets set HF_TOKEN=your_token_here
   5. Deploy the function:
      supabase functions deploy ai-segmenter
   ========================================================================= */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  // Handle CORS Preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const hfToken = Deno.env.get("HF_TOKEN");
    if (!hfToken) {
      return new Response(JSON.stringify({ error: "HF_TOKEN environment secret not configured on Supabase" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const body = await req.blob();

    // Query Hugging Face Segformer model
    const response = await fetch("https://api-inference.huggingface.co/models/nvidia/segformer-b5-finetuned-ade-640-640", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${hfToken}`,
        "Content-Type": body.type || "image/jpeg"
      },
      body: body
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Hugging Face returned error: ${errText}` }), {
        status: response.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
