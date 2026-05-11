ALTER TABLE public.actors DROP CONSTRAINT actors_source_check;

ALTER TABLE public.actors ADD CONSTRAINT actors_source_check
  CHECK (source = ANY (ARRAY[
    'search'::text,
    'manual'::text,
    'url_import'::text,
    'file_import'::text,
    'batch_import'::text,
    'api_connector'::text,
    'consultant_approval'::text,
    'consultant_onboarding'::text
  ]));