// Espace praticienne : agenda protégé par mot de passe.
// Utilise URL_RESERVATION défini dans script.js. Le mot de passe est vérifié par le programme Google,
// il n'est jamais enregistré dans le site.

(function () {
  const CLE = "agenda-jeton";
  const $ = (id) => document.getElementById(id);
  let jeton = lire();
  let lundi = lundiDe(new Date());
  let donnees = null;

  function lire() { try { return localStorage.getItem(CLE); } catch { return null; } }
  function ecrire(v) { try { v ? localStorage.setItem(CLE, v) : localStorage.removeItem(CLE); } catch { /* navigation privée */ } }
  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function lundiDe(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function msg(t, err) { $("msg").textContent = t || ""; $("msg").className = err ? "msg err" : "msg"; }

  async function api(action, params) {
    const body = new URLSearchParams(Object.assign({ action, jeton: jeton || "" }, params || {}));
    const res = await fetch(URL_RESERVATION, { method: "POST", body });
    const json = await res.json();
    if (!json.ok) {
      if (json.reconnexion) afficherConnexion(json.erreur);
      throw new Error(json.erreur || "Une erreur est survenue.");
    }
    return json;
  }

  // ----- Connexion
  function afficherConnexion(texte) {
    jeton = null;
    ecrire(null);
    $("ecran-agenda").hidden = true;
    $("deconnexion").hidden = true;
    $("lien-secours").hidden = true;
    $("ecran-connexion").hidden = false;
    $("msg-connexion").textContent = texte || "";
    $("motdepasse").value = "";
    $("motdepasse").focus();
  }

  function afficherAgenda() {
    $("ecran-connexion").hidden = true;
    $("ecran-agenda").hidden = false;
    $("deconnexion").hidden = false;
    charger();
  }

  $("form-connexion").addEventListener("submit", async (e) => {
    e.preventDefault();
    const bouton = e.target.querySelector("button");
    bouton.disabled = true;
    $("msg-connexion").textContent = "Connexion…";
    try {
      const json = await api("connexion", { motdepasse: $("motdepasse").value });
      jeton = json.jeton;
      ecrire(jeton);
      $("motdepasse").value = "";
      afficherAgenda();
    } catch (err) {
      $("msg-connexion").textContent = err.message;
    } finally {
      bouton.disabled = false;
    }
  });

  $("deconnexion").addEventListener("click", async () => {
    try { await api("deconnexion"); } catch { /* déjà expirée */ }
    afficherConnexion("Vous êtes déconnectée.");
  });

  // ----- Agenda
  async function charger() {
    msg("Chargement…");
    try {
      afficher(await api("agenda", { lundi: iso(lundi) }));
      msg("");
    } catch (err) {
      msg(err.message, true);
    }
  }

  async function action(texte, nom, params) {
    msg(texte);
    try {
      await api(nom, params);
      await charger();
    } catch (err) {
      msg(err.message, true);
    }
  }

  function carte(j, ji, c, type, i) {
    const ref = `data-ji="${ji}" data-type="${type}" data-i="${i}"`;
    const actif = !j.passe;
    if (c.etat === "rdv") {
      const det = [c.consultation, c.format].filter(Boolean).join(" · ");
      return `<div class="creneau creneau--rdv"><span class="creneau__h">${esc(c.heure)}</span><span class="creneau__etat">Rendez-vous</span>
        <strong>${esc(c.nom)}</strong>
        ${c.telephone ? `<div class="creneau__det"><a href="tel:${esc(c.telephone.replace(/\s/g, ""))}">${esc(c.telephone)}</a></div>` : ""}
        ${det ? `<div class="creneau__det">${esc(det)}</div>` : ""}
        ${c.adresse ? `<div class="creneau__det">Séjour : ${esc(c.adresse)}</div>` : ""}
        ${c.message ? `<div class="creneau__det">« ${esc(c.message)} »</div>` : ""}
        ${actif ? `<div class="actions-c"><button data-act="annuler" ${ref}>Annuler le RDV</button></div>` : ""}</div>`;
    }
    if (c.etat === "bloque") {
      return `<div class="creneau creneau--bloque"><span class="creneau__h">${esc(c.heure)}</span><span class="creneau__etat">Bloqué</span>
        ${actif ? `<div class="actions-c"><button data-act="debloquer" ${ref}>Débloquer</button></div>` : ""}</div>`;
    }
    if (j.journee) {
      return `<div class="creneau creneau--bloque"><span class="creneau__h">${esc(c.heure)}</span><span class="creneau__etat">Journée bloquée</span></div>`;
    }
    return `<div class="creneau"><span class="creneau__h">${esc(c.heure)}</span><span class="creneau__etat">Libre</span>
      ${actif ? `<div class="actions-c"><button class="plein" data-act="ajouter" ${ref}>+ Rendez-vous</button><button data-act="bloquer" ${ref}>Bloquer</button></div>` : ""}</div>`;
  }

  function afficher(d) {
    donnees = d;
    $("titre").textContent = d.titre;
    $("compte").textContent = `${d.nbRdv} rendez-vous cette semaine`;
    if (d.secours) {
      $("lien-secours").href = d.secours;
      $("lien-secours").hidden = false;
    }
    $("semaine").innerHTML = d.jours.map((j, ji) => {
      const classes = `jour${j.passe ? " jour--passe" : ""}${j.aujourdhui ? " jour--auj" : ""}${j.ferme ? " jour--ferme" : ""}`;
      const badge = j.special ? '<span class="badge">Horaires modifiés</span>' : "";
      if (j.ferme) {
        return `<section class="${classes}">
          <div class="jour__tete"><h2>${esc(j.label)}</h2>${badge}</div>
          <p class="jour__ferme">Fermé</p>
          ${j.passe ? "" : `<button class="ouvrir-jour" data-act="horairesJour" data-ji="${ji}">+ Ouvrir ce jour</button>`}
        </section>`;
      }
      let liens = "";
      if (!j.passe) {
        liens = `<div class="jour__liens"><button class="lien" data-act="horairesJour" data-ji="${ji}">Horaires de ce jour</button>` +
          (j.journee && j.journee.etat === "bloque"
            ? `<button class="lien" data-act="debloquer" data-ji="${ji}" data-type="j" data-i="0">Débloquer la journée</button>`
            : `<button class="lien" data-act="bloquerJour" data-ji="${ji}">Bloquer la journée</button>`) + "</div>";
      }
      return `<section class="${classes}">
        <div class="jour__tete"><h2>${esc(j.label)}</h2>${badge}</div>
        ${liens}
        ${j.journee ? '<div class="journee">Journée bloquée (congés, absence…)</div>' : ""}
        ${j.creneaux.map((c, i) => carte(j, ji, c, "c", i)).join("")}
        ${j.autres.map((c, i) => carte(j, ji, c, "a", i)).join("")}
      </section>`;
    }).join("");
  }

  function element(ji, type, i) {
    const j = donnees.jours[ji];
    return type === "j" ? j.journee : type === "a" ? j.autres[i] : j.creneaux[i];
  }

  // ----- Fenêtres de confirmation
  function ouvrir(html) { $("boite").innerHTML = html; $("fond").classList.add("ouvert"); }
  function fermer() { $("fond").classList.remove("ouvert"); }
  $("fond").addEventListener("click", (e) => { if (e.target.id === "fond" || e.target.dataset.fermer !== undefined) fermer(); });

  $("semaine").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const ji = Number(b.dataset.ji), type = b.dataset.type, i = Number(b.dataset.i);
    const j = donnees.jours[ji];
    const c = type ? element(ji, type, i) : null;

    if (b.dataset.act === "bloquer") action("Blocage…", "bloquer", { date: j.date, heure: c.heure });
    if (b.dataset.act === "debloquer") action("Déblocage…", "supprimer", { id: c.id, date: j.date });

    if (b.dataset.act === "horairesJour") {
      editeurs.jour = j.horaires.slice();
      ouvrir(`<h2>Horaires du ${esc(j.label)}</h2>
        <p>${j.special ? "Ce jour a des horaires particuliers." : "Ce jour suit vos horaires habituels."} Les changements ne concernent <strong>que cette date</strong>.</p>
        ${editeur("jour")}
        <div class="boite__fin">${j.special ? '<button id="reinit">Revenir aux horaires habituels</button>' : ""}<button data-fermer>Retour</button><button class="ok" id="valider">Enregistrer pour ce jour</button></div>`);
      $("valider").onclick = () => { fermer(); action("Enregistrement des horaires…", "enregistrerJour", { date: j.date, horaires: JSON.stringify(editeurs.jour) }); };
      if ($("reinit")) $("reinit").onclick = () => { fermer(); action("Retour aux horaires habituels…", "reinitialiserJour", { date: j.date }); };
    }

    if (b.dataset.act === "bloquerJour") {
      ouvrir(`<h2>Bloquer la journée</h2><p>Plus aucun créneau ne sera proposé sur le site le ${esc(j.label)}. Les rendez-vous déjà pris sont conservés.</p>
        <div class="boite__fin"><button data-fermer>Retour</button><button class="ok" id="valider">Bloquer</button></div>`);
      $("valider").onclick = () => { fermer(); action("Blocage…", "bloquerJournee", { date: j.date }); };
    }

    if (b.dataset.act === "ajouter") {
      ouvrir(`<h2>Ajouter un rendez-vous</h2><p>${esc(j.label)} à ${esc(c.heure)}</p>
        <label>Nom du client<input type="text" id="a-nom"></label>
        <label>Téléphone<input type="tel" id="a-tel"></label>
        <label>Consultation<select id="a-cons"><option>Première consultation · 1 h 30</option><option>Suivi · 1 h</option></select></label>
        <label>Format<select id="a-format"><option>En cabinet</option><option>Sur mon lieu de cure</option><option>Par téléphone</option><option>En visio WhatsApp</option></select></label>
        <div class="boite__fin"><button data-fermer>Retour</button><button class="ok" id="valider">Enregistrer</button></div>`);
      $("a-nom").focus();
      $("valider").onclick = () => {
        const nom = $("a-nom").value.trim();
        if (!nom) return $("a-nom").focus();
        const params = { date: j.date, heure: c.heure, nom, telephone: $("a-tel").value, consultation: $("a-cons").value, format: $("a-format").value };
        fermer();
        action("Enregistrement…", "ajouter", params);
      };
    }

    if (b.dataset.act === "annuler") {
      const mail = c.email && c.email.includes("@");
      ouvrir(`<h2>Annuler le rendez-vous</h2><p>${esc(c.nom)}, ${esc(j.label)} à ${esc(c.heure)}. Le créneau redeviendra libre sur le site.</p>
        ${mail ? `<label class="case"><input type="checkbox" id="prevenir" checked> Prévenir le client par e-mail (${esc(c.email)})</label>` : "<p>Pas d'e-mail enregistré : pensez à prévenir le client par téléphone.</p>"}
        <div class="boite__fin"><button data-fermer>Retour</button><button class="danger" id="valider">Annuler le RDV</button></div>`);
      $("valider").onclick = () => {
        const prevenir = $("prevenir") && $("prevenir").checked ? "1" : "0";
        fermer();
        action("Annulation…", "annuler", { id: c.id, date: j.date, prevenir });
      };
    }
  });

  // ----- Éditeur d'horaires (étiquettes ✕, ajout, remplissage automatique)
  const editeurs = {};
  const minutes = (h) => { const [a, b] = h.split("h").map(Number); return a * 60 + b; };
  const versHeure = (v) => { const [h, m] = v.split(":"); return `${Number(h)}h${m}`; };
  const versChamp = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const trier = (l) => [...new Set(l)].sort((a, b) => minutes(a) - minutes(b));

  function editeur(id) {
    const liste = editeurs[id];
    const suivant = liste.length ? Math.min(minutes(liste[liste.length - 1]) + 90, 23 * 60) : 9 * 60;
    return `<div class="ed" data-ed="${id}">
      <div class="ed__chips">${liste.length
        ? liste.map((h) => `<span class="chip">${h}<button type="button" data-ed-act="retirer" data-h="${h}" aria-label="Retirer ${h}">✕</button></span>`).join("")
        : '<span class="ed__ferme">Fermé : aucun créneau</span>'}</div>
      <div class="ed__ajout">
        <input type="time" step="900" value="${versChamp(suivant)}" aria-label="Heure à ajouter">
        <button type="button" data-ed-act="ajouter">+ Ajouter</button>
        ${liste.length ? '<button type="button" class="ed__vider" data-ed-act="vider">Fermer ce jour</button>' : ""}
      </div>
      <details class="ed__auto"><summary>Remplir automatiquement</summary>
        <div class="ed__grille">
          <label>Premier RDV<input type="time" data-auto="debut" value="09:00"></label>
          <label>Fin du dernier RDV<input type="time" data-auto="fin" value="18:30"></label>
          <label>Pause de<input type="time" data-auto="pdeb" value="12:00"></label>
          <label>à<input type="time" data-auto="pfin" value="14:00"></label>
          <label>Durée<select data-auto="duree"><option value="90">1 h 30</option><option value="60">1 h</option></select></label>
        </div>
        <button type="button" data-ed-act="remplir">Remplir cette journée</button>
      </details>
    </div>`;
  }

  function remplir(ed) {
    const v = (n) => ed.querySelector(`[data-auto="${n}"]`).value;
    const enMin = (t) => (t ? minutes(versHeure(t)) : null);
    const debut = enMin(v("debut")), fin = enMin(v("fin")), pdeb = enMin(v("pdeb")), pfin = enMin(v("pfin"));
    const duree = Number(v("duree"));
    const liste = [];
    if (debut === null || fin === null) return liste;
    for (let t = debut; t + duree <= fin && liste.length < 24;) {
      if (pdeb !== null && pfin !== null && t < pfin && t + duree > pdeb) { t = Math.max(t, pfin); continue; }
      liste.push(`${Math.floor(t / 60)}h${pad(t % 60)}`);
      t += duree;
    }
    return liste;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ed-act]");
    if (!b) return;
    const ed = b.closest("[data-ed]");
    const id = ed.dataset.ed;
    let liste = editeurs[id];
    if (b.dataset.edAct === "retirer") liste = liste.filter((h) => h !== b.dataset.h);
    if (b.dataset.edAct === "vider") liste = [];
    if (b.dataset.edAct === "ajouter") {
      const champ = ed.querySelector(".ed__ajout input");
      if (!champ.value) return champ.focus();
      liste = trier(liste.concat(versHeure(champ.value)));
    }
    if (b.dataset.edAct === "remplir") {
      liste = remplir(ed);
      if (!liste.length) return;
    }
    editeurs[id] = liste;
    ed.outerHTML = editeur(id);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".ed__ajout input")) {
      e.preventDefault();
      e.target.closest(".ed").querySelector('[data-ed-act="ajouter"]').click();
    }
  });

  const ORDRE = [1, 2, 3, 4, 5, 6, 0];
  const NOMS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const vueAgenda = ["nav-semaine", "legende", "semaine"];

  async function ouvrirHoraires() {
    msg("Chargement des horaires…");
    try {
      const { semaine } = await api("horaires");
      ORDRE.forEach((i) => { editeurs[`s${i}`] = (semaine[i] || []).slice(); });
      $("jours-horaires").innerHTML = ORDRE.map((i) => `<div class="hj"><h3>${NOMS[i]}</h3>${editeur(`s${i}`)}</div>`).join("");
      vueAgenda.forEach((id) => { $(id).hidden = true; });
      $("btn-horaires").hidden = true;
      $("ecran-horaires").hidden = false;
      $("titre").textContent = "Mes horaires habituels";
      $("compte").textContent = "Les créneaux proposés chaque semaine sur le site";
      msg("");
      window.scrollTo(0, 0);
    } catch (err) {
      msg(err.message, true);
    }
  }

  function fermerHoraires() {
    $("ecran-horaires").hidden = true;
    vueAgenda.forEach((id) => { $(id).hidden = false; });
    $("btn-horaires").hidden = false;
    return charger();
  }

  $("btn-horaires").addEventListener("click", ouvrirHoraires);
  $("horaires-annuler").addEventListener("click", fermerHoraires);
  $("horaires-enregistrer").addEventListener("click", async () => {
    const semaine = {};
    ORDRE.forEach((i) => { semaine[i] = editeurs[`s${i}`]; });
    msg("Enregistrement…");
    try {
      await api("enregistrerSemaine", { semaine: JSON.stringify(semaine) });
      await fermerHoraires();
      msg("Vos horaires habituels sont enregistrés : le site propose désormais ces créneaux.");
    } catch (err) {
      msg(err.message, true);
    }
  });

  document.querySelectorAll("[data-semaine]").forEach((b) => b.addEventListener("click", () => {
    const n = Number(b.dataset.semaine);
    if (n === 0) lundi = lundiDe(new Date());
    else lundi.setDate(lundi.getDate() + 7 * n);
    charger();
  }));

  // Démarrage : session déjà ouverte ou écran de connexion
  if (!URL_RESERVATION) afficherConnexion("La réservation en ligne n'est pas encore installée.");
  else if (jeton) afficherAgenda();
  else afficherConnexion();
})();
