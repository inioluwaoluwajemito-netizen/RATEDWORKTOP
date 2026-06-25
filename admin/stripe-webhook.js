/* =========================================================================
   RatedWorktops — Stripe Webhook Handler (Supabase Edge Function)
   =========================================================================
   This script runs in a Deno-based Supabase Edge Function.
   To deploy this function:
   1. Install Supabase CLI: https://supabase.com/docs/guides/cli
   2. Run: supabase functions new stripe-webhook
   3. Copy this code into the generated index.ts / index.js file.
   4. Set your Stripe Webhook Secret and Supabase Service Role key in your dashboard.
   ========================================================================= */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

// Initialize Stripe Client
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

// Initialize Supabase Client with Admin/Service Role key to bypass Row Level Security
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  try {
    const body = await req.text();
    let event;

    // Verify webhook authenticity
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      console.error(`Webhook signature verification failed:`, err.message);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    console.log(`Processing Stripe Webhook Event: ${event.type}`);

    // Handle checkout session completion
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // client_reference_id contains the Supabase User ID passed during redirect
      const userId = session.client_reference_id;
      const customerEmail = session.customer_details?.email || session.prefilled_email;

      if (!userId) {
        console.error("Missing client_reference_id (Supabase User ID) in Stripe session metadata.");
        return new Response("Missing client_reference_id", { status: 400 });
      }

      // Determine credits to add based on the price/product purchased
      // In production, map your Stripe Price IDs to your packages
      let creditsToAdd = 100; // Default Monthly Pro package credits
      let billingPeriod = "monthly";

      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      const firstItemPriceId = lineItems.data[0]?.price?.id;

      // Example Price ID mapping (Replace with your actual price IDs from Stripe Dashboard)
      if (firstItemPriceId === "price_annual_pro_id") {
        creditsToAdd = 1500;
        billingPeriod = "annual";
      }

      console.log(`Crediting User ID: ${userId} with ${creditsToAdd} credits for a ${billingPeriod} subscription.`);

      // 1. Fetch the user's current profile credit balance
      const { data: profile, error: fetchErr } = await supabaseAdmin
        .from("profiles")
        .select("credits")
        .eq("id", userId)
        .single();

      if (fetchErr) {
        console.error(`Error fetching profile for User ID ${userId}:`, fetchErr.message);
        return new Response(`Database Error: ${fetchErr.message}`, { status: 500 });
      }

      // 2. Perform the credit increment & update plan
      const currentCredits = profile?.credits || 0;
      const { error: updateErr } = await supabaseAdmin
        .from("profiles")
        .update({
          plan: "Pro",
          billing_period: billingPeriod,
          credits: currentCredits + creditsToAdd
        })
        .eq("id", userId);

      if (updateErr) {
        console.error(`Error updating profile for User ID ${userId}:`, updateErr.message);
        return new Response(`Database Update Error: ${updateErr.message}`, { status: 500 });
      }

      console.log(`Successfully updated profile for User ID: ${userId}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`Internal server error in webhook handler:`, err.message);
    return new Response(`Internal Webhook Error: ${err.message}`, { status: 500 });
  }
});
