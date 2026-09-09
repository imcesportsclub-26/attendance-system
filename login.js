import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const form = document.getElementById("loginForm");
const button = document.getElementById("loginButton");
const message = document.getElementById("loginMessage");

const ready = SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
const supabase = ready ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function showMessage(text, type = "info") {
  message.className = `message ${type}`;
  message.textContent = text;
}

if (!ready) showMessage("Setup required: add Supabase URL and anon key in config.js.", "error");

if (supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const { data: allowed } = await supabase.rpc("is_super_admin");
    if (allowed) window.location.replace("admin.html");
    else await supabase.auth.signOut();
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!supabase) return;
  button.disabled = true;
  button.classList.add("loading");
  showMessage("Signing in…", "info");

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  button.disabled = false;
  button.classList.remove("loading");
  if (error) {
    showMessage("Login failed. Check your email and password.", "error");
    return;
  }

  const { data: allowed, error: roleError } = await supabase.rpc("is_super_admin");
  if (roleError || !allowed) {
    await supabase.auth.signOut();
    showMessage("Access denied. This account is not the Super Admin.", "error");
    return;
  }
  window.location.replace("admin.html");
});
