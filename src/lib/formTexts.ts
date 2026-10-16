/**
 * Texte im Anmeldeformular. Organisatoren können jeden Text in den Einstellungen überschreiben;
 * leere Felder fallen auf diese Standardtexte zurück.
 */
export const FORM_TEXT_DEFAULTS = {
  persons_title: "Personen",
  persons_intro: "Du kannst mehrere Personen auf einmal anmelden, z. B. deine Familie. Alle bekommen einen gemeinsamen Link zum Ändern.",
  stay_title: "Aufenthalt",
  stay_intro: "Tippe auf euren Anreisetag und dann auf euren Abreisetag.",
  stay_differs: "Reist ihr unterschiedlich an?",
  ski_title: "Skipass",
  ski_intro:
    "Wähle den ersten und den letzten Skitag. Bei 6-in-8-Tage-Pässen bitte ebenfalls den ersten und den letzten Skitag angeben. Am Anreisetag der Gruppe gibt es noch keinen Skipass.",
  ski_question: "Braucht ihr Skipässe?",
  ski_differs: "Gilt das nicht für alle? Hier für einzelne Personen anpassen (z. B. fährt nicht Ski oder an anderen Tagen):",
  food_title: "Essen",
  food_intro: "Alle, die vor Ort sind, werden für die gemeinsamen Mahlzeiten eingeplant. Bitte gib pro Person die Ernährungsweise an.",
  vegan_hint: "Hinweis: Vegan wird nicht extra gekocht – die Angabe hilft uns aber bei der Planung.",
  review_title: "Prüfen",
  review_intro: "Bitte prüfe die Angaben, bevor du die Anmeldung absendest.",
} as const;

export type FormTextKey = keyof typeof FORM_TEXT_DEFAULTS;
export const FORM_TEXT_KEYS = Object.keys(FORM_TEXT_DEFAULTS) as FormTextKey[];

export const FORM_TEXT_LABELS: Record<FormTextKey, string> = {
  persons_title: "Schritt 1 – Überschrift",
  persons_intro: "Schritt 1 – Einleitung",
  stay_title: "Schritt 2 – Überschrift",
  stay_intro: "Schritt 2 – Einleitung",
  stay_differs: "Schritt 2 – Frage nach abweichender An-/Abreise",
  ski_title: "Schritt 3 – Überschrift",
  ski_intro: "Schritt 3 – Einleitung / Hinweis (z. B. 6-in-8-Tage-Pässe)",
  ski_question: "Schritt 3 – Frage nach Skipässen",
  ski_differs: "Schritt 3 – Hinweis für einzelne Personen",
  food_title: "Schritt 4 – Überschrift",
  food_intro: "Schritt 4 – Einleitung",
  vegan_hint: "Schritt 4 – Hinweis bei „Vegan“",
  review_title: "Schritt 5 – Überschrift",
  review_intro: "Schritt 5 – Einleitung",
};

export function formTexts(custom: Partial<Record<string, string>> | null | undefined): Record<FormTextKey, string> {
  const out = { ...FORM_TEXT_DEFAULTS } as Record<FormTextKey, string>;
  for (const k of FORM_TEXT_KEYS) {
    const v = custom?.[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}
