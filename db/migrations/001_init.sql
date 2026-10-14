-- TripSync Grundschema
-- Datumswerte: Typ DATE (Kalendertag ohne Zeitzone). Anreise- und Abreisetag zählen als Anwesenheit.
-- Tokens: Es werden ausschließlich SHA-256-Hashes gespeichert, niemals Klartext-Tokens.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE trips (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  location        text CHECK (char_length(location) <= 120),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  -- Einladungslink (Schreibzugriff: neue Anmeldung) und öffentlicher Lesezugriff sind getrennt
  invite_code     text NOT NULL UNIQUE,
  public_code     text NOT NULL UNIQUE,
  invite_enabled  boolean NOT NULL DEFAULT true,
  public_enabled  boolean NOT NULL DEFAULT false,
  ski_enabled     boolean NOT NULL DEFAULT true,
  ski_categories  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ski_notes       text,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (end_date - start_date <= 120)
);

CREATE TABLE organizers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
CREATE INDEX organizers_trip_idx ON organizers(trip_id);

CREATE TABLE participants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  first_name       text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 60),
  last_name        text NOT NULL DEFAULT '' CHECK (char_length(last_name) <= 60),
  contact          text CHECK (char_length(contact) <= 200),
  comment          text CHECK (char_length(comment) <= 2000),
  org_note         text CHECK (char_length(org_note) <= 2000),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  edit_token_hash  text NOT NULL UNIQUE,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX participants_trip_idx ON participants(trip_id);

-- Aufenthaltszeitraum (1:1 zur Anmeldung; eigene Tabelle für spätere Mehrfachzeiträume)
CREATE TABLE stays (
  participant_id  uuid PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  arrival_date    date,
  arrival_time    time,
  departure_date  date,
  departure_time  time,
  stay_status     text NOT NULL DEFAULT 'confirmed' CHECK (stay_status IN ('confirmed','tentative'))
);

CREATE TABLE ski_requests (
  participant_id   uuid PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  ski_need         text NOT NULL DEFAULT 'unknown' CHECK (ski_need IN ('yes','no','unknown')),
  ski_category     text CHECK (char_length(ski_category) <= 60),
  ski_discount     text CHECK (char_length(ski_discount) <= 200),
  share_public     boolean NOT NULL DEFAULT false
);

CREATE TABLE ski_days (
  participant_id  uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  day             date NOT NULL,
  PRIMARY KEY (participant_id, day)
);

-- Essenspräferenzen; Allergien sind Gesundheitsdaten und werden nur Organisatoren
-- und dem Teilnehmer selbst ausgeliefert.
CREATE TABLE meal_prefs (
  participant_id  uuid PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  meal_mode       text NOT NULL DEFAULT 'unknown' CHECK (meal_mode IN ('all_present','custom','none','unknown')),
  diet            text CHECK (diet IN ('omnivore','vegetarian','vegan','pescetarian','other')),
  food_wishes     text CHECK (char_length(food_wishes) <= 1000),
  allergies       text CHECK (char_length(allergies) <= 1000)
);

CREATE TABLE meal_days (
  participant_id  uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  day             date NOT NULL,
  PRIMARY KEY (participant_id, day)
);

CREATE TABLE recipes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id        uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  base_servings  numeric NOT NULL CHECK (base_servings > 0),
  notes          text CHECK (char_length(notes) <= 4000),
  version        integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recipes_trip_idx ON recipes(trip_id);

CREATE TABLE recipe_ingredients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position   integer NOT NULL DEFAULT 0,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  quantity   numeric CHECK (quantity IS NULL OR quantity >= 0),
  unit       text NOT NULL DEFAULT '' CHECK (char_length(unit) <= 20),
  category   text CHECK (char_length(category) <= 60),
  note       text CHECK (char_length(note) <= 200)
);
CREATE INDEX recipe_ingredients_recipe_idx ON recipe_ingredients(recipe_id);

CREATE TABLE meals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id            uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day                date NOT NULL,
  meal_type          text NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  dish               text NOT NULL CHECK (char_length(dish) BETWEEN 1 AND 120),
  recipe_id          uuid REFERENCES recipes(id) ON DELETE SET NULL,
  servings_override  integer CHECK (servings_override IS NULL OR servings_override >= 0),
  kitchen_team       text CHECK (char_length(kitchen_team) <= 120),
  note               text CHECK (char_length(note) <= 1000),
  version            integer NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meals_trip_idx ON meals(trip_id, day);

-- Bestätigte Zutaten-Zuordnungen (alias -> kanonischer Name), beide normalisiert
CREATE TABLE ingredient_aliases (
  trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  alias       text NOT NULL,
  canonical   text NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, alias),
  CHECK (alias <> canonical)
);

-- Manuelle Einkaufsposten
CREATE TABLE shopping_items (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id   uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name      text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  quantity  numeric CHECK (quantity IS NULL OR quantity >= 0),
  unit      text NOT NULL DEFAULT '' CHECK (char_length(unit) <= 20),
  category  text CHECK (char_length(category) <= 60),
  team      text CHECK (char_length(team) <= 80),
  checked   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shopping_items_trip_idx ON shopping_items(trip_id);

-- Zustand (abgehakt / Team) der automatisch berechneten Posten, über stabilen Schlüssel
CREATE TABLE shopping_state (
  trip_id   uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_key  text NOT NULL,
  checked   boolean NOT NULL DEFAULT false,
  team      text CHECK (char_length(team) <= 80),
  PRIMARY KEY (trip_id, item_key)
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_type  text NOT NULL CHECK (actor_type IN ('organizer','participant','system')),
  actor_id    uuid,
  actor_label text,
  entity      text NOT NULL,
  entity_id   text,
  action      text NOT NULL,
  changes     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_trip_idx ON audit_log(trip_id, created_at DESC);
