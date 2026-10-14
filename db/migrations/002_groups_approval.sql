-- Anmeldungsgruppen (Familien) und Bestätigung durch Organisatoren.
--
-- Eine "registration" ist eine Anmeldung über den Einladungslink: ein persönlicher
-- Bearbeitungslink, gemeinsamer Kontakt/Kommentar, eine oder mehrere Personen.
-- Die Bestätigung erfolgt pro Person (participants.approval), damit z. B. eine später
-- hinzugefügte Person erneut bestätigt werden kann, ohne die übrigen auszublenden.

CREATE TABLE registrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  edit_token_hash  text NOT NULL UNIQUE,
  contact          text CHECK (char_length(contact) <= 200),
  comment          text CHECK (char_length(comment) <= 2000),
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registrations_trip_idx ON registrations(trip_id);

-- Bestehende Anmeldungen: je Person eine eigene Gruppe (gleiche ID, Token bleibt gültig)
INSERT INTO registrations (id, trip_id, edit_token_hash, contact, comment, created_at, updated_at)
SELECT id, trip_id, edit_token_hash, contact, comment, created_at, updated_at FROM participants;

ALTER TABLE participants ADD COLUMN registration_id uuid REFERENCES registrations(id) ON DELETE CASCADE;
UPDATE participants SET registration_id = id;
ALTER TABLE participants ALTER COLUMN registration_id SET NOT NULL;
CREATE INDEX participants_registration_idx ON participants(registration_id);

ALTER TABLE participants ADD COLUMN position integer NOT NULL DEFAULT 0;

-- Bestehende Personen gelten als bestätigt; neue Anmeldungen warten je nach Reiseeinstellung
ALTER TABLE participants ADD COLUMN approval text NOT NULL DEFAULT 'approved'
  CHECK (approval IN ('pending','approved','rejected'));
ALTER TABLE participants ALTER COLUMN approval SET DEFAULT 'pending';

ALTER TABLE participants DROP COLUMN edit_token_hash;
ALTER TABLE participants DROP COLUMN contact;
ALTER TABLE participants DROP COLUMN comment;

ALTER TABLE trips ADD COLUMN require_approval boolean NOT NULL DEFAULT true;
