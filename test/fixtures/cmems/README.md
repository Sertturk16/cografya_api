# CMEMS fixtures

`getfeatureinfo-400-time-out-of-range.xml` — a REAL recorded provider response
(2026-08-02): WMTS `GetFeatureInfo` with a deliberately out-of-extent `time=` answers
**HTTP 400 + `text/xml; charset=utf-8`** with an OWS `ExceptionReport` whose message prints
the dataset's valid time range. This is byte-for-byte what a RETIRED dataset id produces on
every call — the marine M4 self-heal trigger — and `cmems-client.spec.ts` uses it to pin the
guard order: the status/content-type checks classify this reply as `client_error` BEFORE any
body parse, so the JSON parser never sees XML.

Re-recorded by `pnpm db:import:marine-cmems --phase=probe` (the artifact records the
request/response evidence; this file carries the body for the unit suite).
