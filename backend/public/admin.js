/* ============================================================
   Einstiegspunkt: Anmeldung, zweiter Faktor, dann der Editor
   ============================================================ */

import { api, setUnauthorizedHandler } from "./js/api.js";
import { startEditor } from "./js/editor.js";
import { $, clear, copyText, el, toast } from "./js/ui.js";

const views = {
  auth: () => $("#authView"),
  app: () => $("#appView"),
};

function show(which) {
  views.auth().hidden = which !== "auth";
  views.app().hidden = which !== "app";
}

/** Innerhalb der Anmeldekarte zwischen den Schritten wechseln. */
function step(name) {
  for (const [id, key] of [
    ["loginForm", "login"],
    ["mfaForm", "mfa"],
    ["mfaSetup", "setup"],
    ["recoveryView", "codes"],
  ]) {
    $(`#${id}`).hidden = key !== name;
  }
  const focus = { login: "#loginEmail", mfa: "#mfaCode", setup: "#setupCode" }[name];
  if (focus) setTimeout(() => $(focus)?.focus(), 50);
}

function hint(selector, message, ok = false) {
  const node = $(selector);
  node.textContent = message || "";
  node.classList.toggle("ok", Boolean(ok));
}

/* ============================================================
   Ablauf
   ============================================================ */

async function boot() {
  setUnauthorizedHandler(() => {
    // Sitzung abgelaufen: zurueck zur Anmeldung, ohne Datenverlust zu behaupten.
    show("auth");
    step("login");
    hint("#loginHint", "Die Sitzung ist abgelaufen. Bitte erneut anmelden.");
  });

  let session;
  try {
    session = await api.session();
  } catch {
    session = { authenticated: false };
  }

  if (!session.authenticated) {
    const setup = await api.setupStatus().catch(() => ({ needsSetup: false }));
    if (setup.needsSetup && setup.setupEnabled) return showFirstRunNotice();
    show("auth");
    return step("login");
  }

  if (session.mfaSetupRequired) {
    show("auth");
    return startMfaSetup();
  }
  if (!session.mfaDone) {
    show("auth");
    return step("mfa");
  }

  await enterApp(session.user);
}

async function enterApp(user) {
  show("app");
  try {
    await startEditor(user);
  } catch (err) {
    // Kein eigener Präfix: die Meldung aus dem Backend ist bereits vollständig.
    toast(err.message, "error");
  }
}

/** Hinweis, solange noch kein Konto existiert. */
function showFirstRunNotice() {
  show("auth");
  step("login");
  const card = $(".auth-card");
  clear(card).append(
    el("h1", { class: "auth-title", text: "Ersteinrichtung" }),
    el("p", { class: "auth-sub", text: "Es gibt noch kein Konto." }),
    el("p", {
      class: "auth-note",
      text: "Das erste Konto wird einmalig über die Kommandozeile angelegt – dafür wird der Einrichtungsschlüssel gebraucht, der nur dort vorliegt. Die Anleitung dazu steht in backend/README.md.",
    }),
    el("p", { class: "secret", text: "npm run setup" })
  );
}

/* ---------- Schritt 1: E-Mail und Passwort ---------- */

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = $("#loginForm button[type=submit]");
  button.disabled = true;
  hint("#loginHint", "");

  try {
    const res = await api.login($("#loginEmail").value.trim(), $("#loginPassword").value);
    $("#loginPassword").value = "";
    if (res.mfaSetupRequired) return startMfaSetup();
    if (res.mfaRequired) return step("mfa");
    await enterApp(res.user);
  } catch (err) {
    hint("#loginHint", err.message);
  } finally {
    button.disabled = false;
  }
});

/* ---------- Schritt 2: Code pruefen ---------- */

$("#useRecovery").addEventListener("click", () => {
  const box = $("#recoveryField");
  box.hidden = !box.hidden;
  if (!box.hidden) $("#recoveryCode").focus();
});

$("#mfaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  hint("#mfaHint", "");

  const code = $("#mfaCode").value.trim();
  const recoveryCode = $("#recoveryField").hidden ? "" : $("#recoveryCode").value.trim();
  if (!code && !recoveryCode) return hint("#mfaHint", "Bitte einen Code eingeben.");

  try {
    const res = await api.verifyMfa(recoveryCode ? { recoveryCode } : { code });
    if (typeof res.recoveryCodesLeft === "number" && res.recoveryCodesLeft <= 2) {
      toast(`Nur noch ${res.recoveryCodesLeft} Wiederherstellungscodes übrig – bitte im Menü neue erzeugen.`, "error");
    }
    const session = await api.session();
    await enterApp(session.user);
  } catch (err) {
    hint("#mfaHint", err.message);
    $("#mfaCode").value = "";
    $("#mfaCode").focus();
  }
});

/* Sechs Ziffern getippt? Dann direkt absenden. */
$("#mfaCode").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  if (e.target.value.length === 6) $("#mfaForm").requestSubmit();
});
$("#setupCode").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
});

/* ---------- Schritt 2b: zweiten Faktor einrichten ---------- */

async function startMfaSetup() {
  step("setup");
  hint("#setupHint", "");

  try {
    const { secret, uri } = await api.startMfaSetup();
    $("#secretText").textContent = secret.replace(/(.{4})/g, "$1 ").trim();
    drawQr(uri);
  } catch (err) {
    hint("#setupHint", err.message);
  }
}

function drawQr(uri) {
  const target = clear($("#qrTarget"));
  try {
    // qrcode-generator: Typnummer 0 = automatisch passende Größe wählen.
    const qr = window.qrcode(0, "M");
    qr.addData(uri);
    qr.make();
    target.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 0, scalable: false });
  } catch {
    target.append(
      el("p", { class: "auth-note", text: "Der QR-Code konnte nicht erzeugt werden – bitte das Geheimnis unten von Hand eingeben." })
    );
  }
}

$("#activateMfa").addEventListener("click", async () => {
  const code = $("#setupCode").value.trim();
  if (code.length !== 6) return hint("#setupHint", "Bitte den 6-stelligen Code aus der App eingeben.");

  $("#activateMfa").disabled = true;
  try {
    const res = await api.activateMfa(code);
    showCodes(res.recoveryCodes);
  } catch (err) {
    hint("#setupHint", err.message);
  } finally {
    $("#activateMfa").disabled = false;
  }
});

/* ---------- Schritt 3: Wiederherstellungscodes ---------- */

function showCodes(codes) {
  step("codes");
  clear($("#codeList")).append(...codes.map((c) => el("li", { text: c })));

  $("#copyCodes").onclick = async () => {
    const ok = await copyText(codes.join("\n"));
    toast(
      ok ? "Codes kopiert." : "Kopieren hat nicht geklappt – bitte abschreiben oder drucken.",
      ok ? "ok" : "error"
    );
  };
  $("#printCodes").onclick = () => window.print();

  $("#codesSaved").onchange = (e) => ($("#codesDone").disabled = !e.target.checked);
  $("#codesDone").onclick = async () => {
    const session = await api.session();
    await enterApp(session.user);
  };
}

boot();
