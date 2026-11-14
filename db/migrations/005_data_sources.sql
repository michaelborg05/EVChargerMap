-- One row per data source, written by each ingest step. Drives the map's
-- attribution footer (OSM's ODbL and the CC-BY licences require it) and
-- shows how fresh each source is.
CREATE TABLE data_sources (
  source_id     text PRIMARY KEY,     -- osm, nsw, ..., ocm, nominatim, supercharge_info
  name          text,
  attribution   text NOT NULL,
  licence       text,
  licence_url   text,
  homepage      text,
  record_count  integer,
  error         text,                 -- last ingest error for this source, if any
  fetched_at    timestamptz,          -- newest fetch for this source
  loaded_at     timestamptz NOT NULL DEFAULT now()
);
