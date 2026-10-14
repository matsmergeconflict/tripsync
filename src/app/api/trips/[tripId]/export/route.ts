import type { NextRequest } from "next/server";
import { pool } from "@/lib/server/db";
import { handle, HttpError, requireOrganizer } from "@/lib/server/http";
import { getTrip, listAliases, listMeals, listParticipants, listRecipes, listShoppingItems, listShoppingState } from "@/lib/server/repo";
import { toCsv } from "@/lib/csv";
import { computeDayStats, computeSkiSummary, findIssues, ISSUE_LABELS, NO_CATEGORY } from "@/lib/stats";
import { buildShoppingList, mealServings } from "@/lib/plan";
import { DIET_LABELS, MEAL_TYPE_LABELS, type SkiCategory } from "@/lib/types";
import { formatQuantity } from "@/lib/units";

const STAY = { confirmed: "bestätigt", tentative: "unklar" } as const;
const SKI = { yes: "ja", no: "nein", unknown: "unklar" } as const;
const MEAL = { all_present: "an allen Anwesenheitstagen", custom: "einzelne Tage", none: "nein", unknown: "unklar" } as const;

/**
 * CSV-Exporte. Persönliche Links/Tokens sind in keinem Export enthalten (sie werden nur gehasht gespeichert).
 * Gesundheitsangaben (Allergien) erscheinen ausschließlich im ausdrücklich benannten Küchen-Export.
 */
export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/export">) => {
  const { tripId } = await ctx.params;
  await requireOrganizer(req, tripId);
  const type = req.nextUrl.searchParams.get("type") ?? "participants";
  const db = pool();
  const trip = await getTrip(db, tripId);
  if (!trip) throw new HttpError(404, "Reise nicht gefunden");
  const participants = await listParticipants(db, tripId);
  const active = participants.filter((p) => p.status === "active");
  const catName = (id: string | null) =>
    id === null || id === NO_CATEGORY ? "ohne Kategorie" : (trip.ski_categories as SkiCategory[]).find((c) => c.id === id)?.name ?? id;
  let csv: string;
  let name: string;

  switch (type) {
    case "participants": {
      csv = toCsv(
        ["Vorname", "Nachname", "Status", "Anreise", "Ankunftszeit", "Abreise", "Abfahrtszeit", "Angaben", "Skipass", "Skitage", "Passkategorie", "Essen", "Ernährung", "Kontakt", "Offene Punkte"],
        participants.map((p) => [
          p.first_name,
          p.last_name,
          p.status === "active" ? "angemeldet" : "zurückgezogen",
          p.arrival_date,
          p.arrival_time,
          p.departure_date,
          p.departure_time,
          STAY[p.stay_status],
          SKI[p.ski_need],
          p.ski_days,
          p.ski_category ? catName(p.ski_category) : "",
          MEAL[p.meal_mode],
          p.diet ? DIET_LABELS[p.diet] : "",
          p.contact,
          findIssues(p, trip).map((i) => ISSUE_LABELS[i]),
        ])
      );
      name = "teilnehmer";
      break;
    }
    case "days": {
      const stats = computeDayStats(participants, trip.start_date, trip.end_date);
      csv = toCsv(
        ["Datum", "Anwesend", "davon unbestätigt", "Anreisen", "Abreisen", "Übernachtungen", "Skipässe", "Essen", "Essen unklar"],
        stats.map((s) => [s.day, s.present, s.presentTentative, s.arrivals, s.departures, s.overnight, s.skiPasses, s.mealParticipants, s.mealUnknown])
      );
      name = "tagesuebersicht";
      break;
    }
    case "ski": {
      const sum = computeSkiSummary(participants, trip.start_date, trip.end_date);
      const cats = [...new Set(sum.perDay.flatMap((d) => Object.keys(d.byCategory)))];
      csv = toCsv(
        ["Datum", "Skipässe gesamt", "davon unbestätigt", ...cats.map(catName)],
        sum.perDay.map((d) => [d.day, d.total, d.tentative, ...cats.map((c) => d.byCategory[c] ?? 0)])
      );
      csv += toCsv(
        ["Vorname", "Nachname", "Skipass", "Kategorie", "Ermäßigung", "Skitage", "Anzahl Tage"],
        active.filter((p) => p.ski_need !== "no").map((p) => [p.first_name, p.last_name, SKI[p.ski_need], catName(p.ski_category), p.ski_discount, p.ski_days, p.ski_days.length])
      ).replace("﻿", "\r\n");
      name = "skipaesse";
      break;
    }
    case "kitchen": {
      // Enthält Gesundheitsangaben – nur für die Küchenplanung bestimmt.
      csv = toCsv(
        ["Vorname", "Nachname", "Essen", "Essenstage", "Ernährung", "Wünsche", "Allergien/Unverträglichkeiten (vertraulich)"],
        active
          .filter((p) => p.meal_mode !== "none")
          .map((p) => [p.first_name, p.last_name, MEAL[p.meal_mode], p.meal_mode === "custom" ? p.meal_days : "", p.diet ? DIET_LABELS[p.diet] : "", p.food_wishes, p.allergies])
      );
      name = "kueche-vertraulich";
      break;
    }
    case "meals": {
      const stats = new Map(computeDayStats(participants, trip.start_date, trip.end_date).map((s) => [s.day, s]));
      const meals = await listMeals(db, tripId);
      const recipes = new Map((await listRecipes(db, tripId)).map((r) => [r.id, r.name]));
      csv = toCsv(
        ["Datum", "Mahlzeit", "Gericht", "Rezept", "Portionen", "berechnet", "Küchenteam", "Notiz"],
        meals.map((m) => {
          const s = mealServings(m, stats);
          return [m.day, MEAL_TYPE_LABELS[m.meal_type], m.dish, m.recipe_id ? recipes.get(m.recipe_id) : "", s.effective, s.derived, m.kitchen_team, m.note];
        })
      );
      name = "essensplan";
      break;
    }
    case "shopping": {
      const [meals, recipes, aliases, items, state] = await Promise.all([
        listMeals(db, tripId),
        listRecipes(db, tripId),
        listAliases(db, tripId),
        listShoppingItems(db, tripId),
        listShoppingState(db, tripId),
      ]);
      const rows = buildShoppingList({ trip, participants, meals, recipes, aliases, shopping: { items, state } });
      csv = toCsv(
        ["Erledigt", "Warengruppe", "Artikel", "Menge", "Einheit", "Team/Geschäft", "Hinweis", "Für"],
        rows.map((r) => [
          r.checked ? "x" : "",
          r.category,
          r.name,
          r.quantity === null ? "" : formatQuantity(r.quantity),
          r.quantity === null ? "nach Bedarf" : r.unit,
          r.team,
          [r.unitConflict ? "zusätzlich in anderer Einheit" : "", r.hasUnquantified ? "teilweise ohne Mengenangabe" : ""].filter(Boolean).join(", "),
          r.manual ? "manuell" : [...new Set(r.sources.map((s) => s.dish))].join(", "),
        ])
      );
      name = "einkaufsliste";
      break;
    }
    default:
      throw new HttpError(400, "Unbekannter Export");
  }

  const safeTrip = trip.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "reise";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(`${safeTrip}-${name}.csv`)}"; filename*=UTF-8''${encodeURIComponent(`${safeTrip}-${name}.csv`)}`,
      "Cache-Control": "no-store",
    },
  });
});
