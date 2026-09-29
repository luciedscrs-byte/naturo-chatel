// Déverrouillage des pages protégées (AES-256-CBC, clé PBKDF2-SHA256)
(function () {
  var CLE = "verrou-cle";
  var donnees = JSON.parse(document.getElementById("verrou-data").textContent);
  var form = document.getElementById("verrou-form");
  var msg = document.getElementById("verrou-msg");

  function hexVersOctets(h) { var o = new Uint8Array(h.length / 2); for (var i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
  function octetsVersHex(b) { return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join(""); }
  function base64VersOctets(s) { var bin = atob(s), o = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }

  async function deriver(mdp) {
    var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(mdp), "PBKDF2", false, ["deriveBits"]);
    return crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexVersOctets(donnees.sel), iterations: donnees.iterations, hash: "SHA-256" }, base, 256);
  }

  async function dechiffrer(cleBrute) {
    var cle = await crypto.subtle.importKey("raw", cleBrute, "AES-CBC", false, ["decrypt"]);
    var clair = await crypto.subtle.decrypt({ name: "AES-CBC", iv: hexVersOctets(donnees.iv) }, cle, base64VersOctets(donnees.contenu));
    var html = new TextDecoder().decode(clair);
    if (html.indexOf("<!DOCTYPE html>") !== 0) throw new Error("clé incorrecte");
    return html;
  }

  // Attendre la fin du chargement de la page de verrouillage avant de la remplacer
  function pageChargee() {
    return new Promise(function (ok) {
      if (document.readyState === "complete") ok();
      else window.addEventListener("load", function () { ok(); }, { once: true });
    });
  }

  async function afficher(html) {
    await pageChargee();
    document.open();
    document.write(html);
    document.close();
    var titre = html.match(/<title>([^<]*)<\/title>/);
    if (titre) document.title = new DOMParser().parseFromString(titre[1], "text/html").documentElement.textContent;
    if (location.hash) setTimeout(function () { var el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }, 60);
  }

  async function cleMemorisee() {
    var h = null;
    try { h = sessionStorage.getItem(CLE); } catch (e) { /* stockage indisponible */ }
    if (!h) return false;
    try { await afficher(await dechiffrer(hexVersOctets(h))); return true; }
    catch (e) { try { sessionStorage.removeItem(CLE); } catch (x) { /* rien */ } return false; }
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    msg.textContent = "Vérification…";
    try {
      var brute = await deriver(document.getElementById("verrou-mdp").value);
      var html = await dechiffrer(brute);
      try { sessionStorage.setItem(CLE, octetsVersHex(brute)); } catch (x) { /* rien */ }
      await afficher(html);
    } catch (err) {
      msg.textContent = "Mot de passe incorrect.";
      document.getElementById("verrou-mdp").select();
    }
  });

  cleMemorisee().then(function (ok) {
    if (!ok) { document.body.className = "verrou--pret"; document.getElementById("verrou-mdp").focus(); }
  });
})();
