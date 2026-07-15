-- Normalize existing phone data toward E.164: strip everything except digits
-- and a leading + (all seed/dev data already carries the +48 country code).
UPDATE "users" SET "phone" = regexp_replace("phone", '[^0-9+]', '', 'g');
UPDATE "bookings" SET "customer_phone" = regexp_replace("customer_phone", '[^0-9+]', '', 'g');
