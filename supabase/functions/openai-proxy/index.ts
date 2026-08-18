/* =========================================================================
   RatedWorktops — Image Inpainting & Edit Proxy (Supabase Edge Function)
   =========================================================================
   Supports both Fal.ai (Flux / SDXL Inpainting) and OpenAI (v1/images/edits)
   to perform photorealistic image-to-image kitchen worktop and splashback replacement.
   Secrets: FAL_KEY or OPENAI_API_KEY
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

    // ── 2. Parse request body & fetch API Keys from Supabase ──────────
    const body = await req.json();

    let FAL_KEY = Deno.env.get("FAL_KEY") || Deno.env.get("FAL_AI_KEY") || Deno.env.get("FAL_API_KEY");
    let OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || 
                         Deno.env.get("Open ai aki key") || 
                         Deno.env.get("Open AI API Key") || 
                         Deno.env.get("OpenAI API Key") || 
                         Deno.env.get("OPENAI_KEY");

    // Fallback: If not in env, check Supabase public.settings table
    try {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
      );
      const { data: settings } = await supabaseAdmin.from('settings').select('*').eq('id', 1).maybeSingle();
      if (settings) {
        if (!FAL_KEY) FAL_KEY = settings.fal_key || settings.data?.fal_key || settings.data?.falKey;
        if (!OPENAI_API_KEY) OPENAI_API_KEY = settings.openai_api_key || settings.data?.openai_api_key || settings.data?.openaiApiKey;
      }
    } catch (e) {
      console.warn("[AI Proxy] Could not read keys from settings table:", e);
    }

    if (!FAL_KEY && !OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: { message: "No AI provider key found. Please set FAL_KEY or OPENAI_API_KEY in Supabase Edge Function Secrets or Settings table." } }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    if (!body.image || !body.prompt) {
      return new Response(JSON.stringify({ error: { message: "Missing required fields: image and prompt." } }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    if (!body.mask) {
      return new Response(JSON.stringify({ error: { message: "Missing required field: mask. An inpainting mask is required." } }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[AI Proxy] User: ${userId} | prompt len: ${body.prompt?.length} | image len: ${body.image?.length}`);

    // ── 3. Route to FAL.AI if FAL_KEY is present ──────────────────────────────
    if (FAL_KEY) {
      console.log("[AI Proxy] Routing inpainting to Fal.ai (Gemini 2.5 Flash Image Edit)...");

      try {
        const imageUrls = [body.image];
        if (body.stone_image_url && !body.stone_image_url.startsWith('linear-gradient')) {
          imageUrls.push(body.stone_image_url);
        } else if (body.stoneImageUrl && !body.stoneImageUrl.startsWith('linear-gradient')) {
          imageUrls.push(body.stoneImageUrl);
        }

        const editPrompt = (imageUrls.length > 1)
          ? `Modify the kitchen image: replace the countertop worktop and splashback surface with the exact stone material, texture, pattern, and color shown in the second reference stone image. Match the lighting, perspective, and shadows of the kitchen. Keep all cabinets, walls, appliances, sink, windows, flooring, and background intact.`
          : body.prompt;

        const falRes = await fetch("https://fal.run/fal-ai/gemini-25-flash-image/edit", {
          method: "POST",
          headers: {
            "Authorization": `Key ${FAL_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            prompt: editPrompt,
            image_urls: imageUrls
          })
        });

        const falData = await falRes.json().catch(() => ({}));
        console.log("[AI Proxy] Fal.ai Response Status:", falRes.status);

        if (falRes.ok) {
          const imageUrl = falData.images?.[0]?.url || falData.image?.url;
          if (imageUrl) {
            console.log("[AI Proxy] ✅ Fal.ai Gemini 2.5 Flash Image Edit succeeded!");
            return new Response(JSON.stringify({ data: [{ url: imageUrl }] }), {
              status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            });
          }
        }

        console.warn("[AI Proxy] Fal.ai Gemini notice:", falData?.detail || falData?.message || falData);

        // Fallback to fast-sdxl inpainting if needed
        const sdxlRes = await fetch("https://fal.run/fal-ai/fast-sdxl/inpaint", {
          method: "POST",
          headers: {
            "Authorization": `Key ${FAL_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            image_url: body.image,
            mask_url: body.mask,
            prompt: body.prompt,
            strength: 0.92,
            num_inference_steps: 30
          })
        });

        const sdxlData = await sdxlRes.json().catch(() => ({}));
        if (sdxlRes.ok) {
          const imageUrl = sdxlData.images?.[0]?.url || sdxlData.image?.url;
          if (imageUrl) {
            console.log("[AI Proxy] ✅ Fal.ai SDXL Inpainting succeeded!");
            return new Response(JSON.stringify({ data: [{ url: imageUrl }] }), {
              status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            });
          }
        }

        if (!OPENAI_API_KEY) {
          const errDetail = falData?.detail || sdxlData?.detail || falData?.message || "Fal.ai inpainting failed.";
          return new Response(JSON.stringify({ error: { message: `Fal.ai Error: ${typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail)}` } }), {
            status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        }
      } catch (falErr: any) {
        console.error("[AI Proxy] Fal.ai exception:", falErr);
        if (!OPENAI_API_KEY) {
          return new Response(JSON.stringify({ error: { message: `Fal.ai network error: ${falErr.message}` } }), {
            status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // ── 4. Fallback or Primary to OpenAI v1/images/edits ───────────────────────
    if (OPENAI_API_KEY) {
      console.log("[AI Proxy] Routing inpainting to OpenAI (v1/images/edits)...");

      const formData = new FormData();
      formData.append('image', dataURItoBlob(body.image), 'image.png');
      formData.append('mask', dataURItoBlob(body.mask), 'mask.png');
      formData.append('model', 'gpt-image-1');
      formData.append('prompt', body.prompt);
      formData.append('n', '1');
      formData.append('size', '1024x1024');
      formData.append('quality', 'high');

      const openAiRes = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
        body: formData
      });

      const resData = await openAiRes.json().catch(() => ({}));
      if (!openAiRes.ok) {
        const errMsg = resData?.error?.message || JSON.stringify(resData);
        return new Response(JSON.stringify({ error: { message: "OpenAI Inpainting Error: " + errMsg } }), {
          status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      const imageUrl = resData.data?.[0]?.url || (resData.data?.[0]?.b64_json ? `data:image/png;base64,${resData.data[0].b64_json}` : null);
      if (!imageUrl) {
        return new Response(JSON.stringify({ error: { message: "OpenAI returned no image data from inpainting." } }), {
          status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ data: [{ url: imageUrl }] }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: { message: "No active AI provider configured." } }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("[AI Proxy] Unhandled error:", err);
    return new Response(JSON.stringify({ error: { message: String(err?.message ?? err) } }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
