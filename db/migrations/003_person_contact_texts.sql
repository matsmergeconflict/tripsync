-- Pflichtangaben pro Person (Handy, E-Mail, Geburtstag) und anpassbare Texte im Anmeldeformular.
ALTER TABLE participants ADD COLUMN phone text CHECK (char_length(phone) <= 40);
ALTER TABLE participants ADD COLUMN email text CHECK (char_length(email) <= 200);
ALTER TABLE participants ADD COLUMN birth_date date;
ALTER TABLE trips ADD COLUMN form_texts jsonb NOT NULL DEFAULT '{}'::jsonb;
