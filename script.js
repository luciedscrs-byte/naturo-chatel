// ===== Réglages à modifier =====

// Adresse de l'application Google (Apps Script) qui gère les réservations.
// Voir le guide « reservation-google/A LIRE - installation.md ».
// Tant qu'elle est vide, le formulaire ouvre la messagerie du visiteur avec la demande déjà remplie.
const URL_RESERVATION = "https://script.google.com/macros/s/AKfycbye-OOl9Kv-CW7De0os4knkaHWUywqgBrN198Av8aWEmMypscq7T62aj6kva0UMusJQ/exec";

// Jours de consultation : 0 = dimanche, 1 = lundi … 6 = samedi (du lundi au vendredi)
const JOURS_CONSULTATION = [1, 2, 3, 4, 5];

// Créneaux de 1 h 30, de 9h à 17h (dernier rendez-vous), sans rendez-vous entre 12h et 14h
// (doivent correspondre aux réglages du programme Google)
const HORAIRES = ["9h00", "10h30", "14h00", "15h30", "17h00"];

// Réservation possible jusqu'à 3 mois à l'avance
const DELAI_MAX_JOURS = 90;

const EMAIL = "nclbd@sfr.fr";

// ===== Ne pas modifier en dessous =====

const NOMS_JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const iso = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");

const form = document.querySelector("#rdv");
if (form) {
  const blocRdv = form.querySelector(".form__rdv");
  const message = form.querySelector("textarea[name=message]");
  const bouton = form.querySelector("button[type=submit]");
  const format = form.querySelector("#format");
  const sejour = form.querySelector(".form__sejour");
  const champSejour = sejour.querySelector("input");
  const date = form.querySelector("#date");
  const heure = form.querySelector("#heure");
  const retour = form.querySelector(".form__msg");

  // Dates possibles : de demain à 3 mois
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const max = new Date();
  max.setDate(max.getDate() + DELAI_MAX_JOURS);
  date.min = iso(demain);
  date.max = iso(max);

  const remplirHeures = (liste, vide) => {
    heure.innerHTML = liste.length
      ? '<option value="">Choisir</option>' + liste.map((h) => `<option>${h}</option>`).join("")
      : `<option value="">${vide}</option>`;
    heure.disabled = !liste.length;
  };
  remplirHeures([], "Choisir d'abord une date");

  // Créneaux libres de la date choisie
  const chargerCreneaux = async () => {
    const jour = new Date(date.value + "T12:00").getDay();
    const ok = !date.value || JOURS_CONSULTATION.includes(jour);
    const jours = JOURS_CONSULTATION.map((j) => NOMS_JOURS[j]).join(", ");
    date.setCustomValidity(ok ? "" : `Les consultations ont lieu les jours suivants : ${jours}.`);
    if (!date.value || !ok) {
      if (!ok) date.reportValidity();
      remplirHeures([], "Choisir d'abord une date");
      return;
    }
    if (!URL_RESERVATION) {
      remplirHeures(HORAIRES);
      return;
    }
    remplirHeures([], "Chargement des créneaux…");
    try {
      const res = await fetch(`${URL_RESERVATION}?date=${date.value}`);
      const json = await res.json();
      remplirHeures(json.disponibles || [], "Complet ce jour-là, choisissez une autre date");
    } catch {
      remplirHeures(HORAIRES);
    }
  };
  date.addEventListener("change", chargerCreneaux);

  // « Réserver un créneau » ou « Poser une question »
  const majSejour = () => {
    const curiste = !blocRdv.hidden && format.value === "Sur mon lieu de cure";
    sejour.hidden = !curiste;
    champSejour.required = curiste;
  };
  const majMode = () => {
    const rdv = form.querySelector("input[name=demande]:checked").value === "Rendez-vous";
    blocRdv.hidden = !rdv;
    date.required = rdv;
    heure.required = rdv;
    message.required = !rdv;
    bouton.textContent = rdv ? "Réserver ce créneau" : "Envoyer ma question";
    majSejour();
  };
  form.querySelectorAll("input[name=demande]").forEach((r) => r.addEventListener("change", majMode));
  format.addEventListener("change", majSejour);
  majMode();

  // Envoi
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const rdv = data.get("demande") === "Rendez-vous";
    retour.textContent = "";

    // Sans programme Google : messagerie du visiteur
    if (!URL_RESERVATION) {
      const lignes = [];
      for (const [cle, valeur] of data) if (valeur && cle !== "botcheck") lignes.push(`${cle} : ${valeur}`);
      const sujet = rdv ? `Demande de RDV – ${data.get("nom")} – ${data.get("date")} ${data.get("heure")}` : `Question – ${data.get("nom")}`;
      window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(lignes.join("\n"))}`;
      return;
    }

    bouton.disabled = true;
    try {
      let json;
      try {
        const res = await fetch(URL_RESERVATION, { method: "POST", body: new URLSearchParams(data) });
        json = await res.json();
      } catch (err) {
        // Réponse perdue : si le créneau est désormais pris, la réservation a bien été enregistrée
        if (!rdv) throw err;
        const verif = await (await fetch(`${URL_RESERVATION}?date=${data.get("date")}`)).json();
        if ((verif.disponibles || []).includes(data.get("heure"))) throw err;
        const [a, m, j] = data.get("date").split("-").map(Number);
        const jour = new Date(a, m - 1, j).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        json = { ok: true, jour, heure: data.get("heure"), confirmationEnvoyee: false };
      }
      if (!json.ok) {
        retour.textContent = json.erreur || "La réservation n'a pas abouti. Merci de réessayer.";
        if (json.pris) await chargerCreneaux();
        return;
      }
      form.reset();
      majMode();
      remplirHeures([], "Choisir d'abord une date");
      retour.textContent = rdv
        ? `C'est réservé ! Votre rendez-vous du ${json.jour} à ${json.heure} est confirmé.` +
          (json.confirmationEnvoyee ? " Un e-mail de confirmation vous a été envoyé." : "") +
          " À bientôt !"
        : "Merci ! Votre question est bien envoyée. Je vous réponds rapidement.";
    } catch {
      retour.textContent = `L'envoi n'a pas fonctionné. Vous pouvez m'appeler au 06 10 24 45 34 ou m'écrire à ${EMAIL}.`;
    } finally {
      bouton.disabled = false;
    }
  });
}

// Sur mobile, recentre l'onglet de la page en cours dans la barre d'onglets
const tabs = document.querySelector(".tabs");
const actif = tabs && tabs.querySelector('[aria-current="page"]');
if (actif && tabs.scrollWidth > tabs.clientWidth) {
  tabs.scrollLeft = actif.offsetLeft - (tabs.clientWidth - actif.offsetWidth) / 2;
}
